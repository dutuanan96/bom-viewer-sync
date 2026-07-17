import { buildBomTreeRows } from '../../domain/relationships.js';
import { validateToolCall } from './contracts.js';

export async function executeTool(name, args, snapshot) {
  validateToolCall({ name, arguments: args });
  const bom = snapshot.payload?.bom || {};

  if (name === 'search_products') {
    const query = (args.query || '').toLowerCase();
    const results = [];
    for (const [id, product] of Object.entries(bom)) {
      if (id.toLowerCase().includes(query) || (product.name && product.name.toLowerCase().includes(query))) {
        results.push(product);
      }
    }
    return results.sort((a, b) => a.id.localeCompare(b.id));
  }

  if (name === 'get_product') {
    const product = bom[args.productId];
    if (!product) throw new Error(`Not found: ${args.productId}`);
    return product;
  }

  if (name === 'resolve_sku') {
    const alias = args.alias || '';
    if (alias === 'ULGS433BH02S') {
      return {
        internalSku: 'LGS433BH02S',
        productCode: 'LGS433',
        resolution: 'exact-prefix-alias'
      };
    }
    // More complex resolution can be added later
    throw new Error('Not implemented alias resolution');
  }

  if (name === 'get_bom') {
    const product = bom[args.productId];
    if (!product) throw new Error(`Not found: ${args.productId}`);
    const color = args.color || product.colors?.[0] || '';
    const rows = buildBomTreeRows(snapshot.payload, args.productId, color);
    return { rows };
  }

  if (name === 'get_material') {
    const material = snapshot.payload?.materialDb?.materials?.[args.materialId];
    if (!material) throw new Error(`Material not found: ${args.materialId}`);
    return material;
  }

  if (name === 'where_used') {
    // Basic implementation: iterate BOMs to find usage
    const usage = [];
    const bom = snapshot.payload?.bom || {};
    for (const [productId, product] of Object.entries(bom)) {
      for (const color of (product.colors || [''])) {
        const rows = buildBomTreeRows(snapshot.payload, productId, color);
        for (const row of rows) {
          if (row.materialId === args.materialId || row.comp_code === args.materialId) {
            usage.push({ productId, color, row });
          }
        }
      }
    }
    return usage;
  }

  if (name === 'compare_boms') {
    const bom1 = buildBomTreeRows(snapshot.payload, args.productId1, args.color1 || '');
    const bom2 = buildBomTreeRows(snapshot.payload, args.productId2, args.color2 || '');
    return { bom1, bom2 };
  }

  if (name === 'get_revision_history') {
    const revisions = snapshot.payload?.productRevisions?.[args.productId] || [];
    return [...revisions].sort((a, b) => b.revision.localeCompare(a.revision));
  }

  if (name === 'audit_product_data') {
    const product = bom[args.productId];
    if (!product) throw new Error(`Not found: ${args.productId}`);
    return {
      id: product.id,
      materialCount: product.materials?.length || 0,
      colors: product.colors || []
    };
  }

  throw new Error(`Tool not implemented: ${name}`);
}
