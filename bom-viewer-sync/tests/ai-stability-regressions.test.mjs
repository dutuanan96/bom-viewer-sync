import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { routePdmIntent } from '../src/features/ai-assistant/intent-router.js';
import { detectProductShorthand, parseDimensions } from '../src/features/ai-assistant/pdm-terminology.js';
import { PdmKnowledge } from '../src/features/ai-assistant/pdm-knowledge.js';

const READ_TOOLS = [
  'get_product',
  'get_bom',
  'compare_boms',
  'search_pdm',
  'analyze_pdm',
];

function loadCanonicalSnapshot() {
  const manifest = JSON.parse(readFileSync(resolve('data/manifest.json'), 'utf8'));
  const materialData = JSON.parse(readFileSync(resolve('data/materials.json'), 'utf8'));
  const bom = Object.fromEntries(manifest.products.map(productCode => [
    productCode,
    JSON.parse(readFileSync(resolve(`data/products/${productCode}.json`), 'utf8')),
  ]));
  return {
    sourceMetadata: { commitSha: 'a'.repeat(40) },
    payload: {
      bom,
      productRevisions: manifest.productRevisions || {},
      ...materialData,
    },
  };
}

const snapshot = loadCanonicalSnapshot();

test('stability: unique product shorthand routes directly without confirmation', () => {
  const route = routePdmIntent({
    query: '723那个柜子有几个颜色？中文和越南文都告诉我一下。',
    availableTools: READ_TOOLS,
  });

  assert.equal(route.preferredTool, 'get_product');
  assert.deepEqual(route.entities.productIds, ['LGS723']);
});

test('stability: referential follow-ups retain the active product and shorthand comparisons retain both', () => {
  const colorFollowUp = routePdmIntent({
    query: '它有几个颜色？',
    conversationContext: { productIds: ['LGS723'] },
    availableTools: READ_TOOLS,
  });
  const comparisonFollowUp = routePdmIntent({
    query: '和723比一下。',
    conversationContext: { productIds: ['LGS733'] },
    availableTools: READ_TOOLS,
  });
  const bareComparison = routePdmIntent({
    query: '723和733哪个比较宽？',
    availableTools: READ_TOOLS,
  });

  assert.equal(colorFollowUp.preferredTool, 'get_product');
  assert.deepEqual(colorFollowUp.entities.productIds, ['LGS723']);
  assert.equal(comparisonFollowUp.preferredTool, 'compare_boms');
  assert.deepEqual(comparisonFollowUp.entities.productIds, ['LGS733', 'LGS723']);
  assert.equal(bareComparison.preferredTool, 'compare_boms');
  assert.deepEqual(bareComparison.entities.productIds, ['LGS723', 'LGS733']);
});

test('stability: natural Vietnamese comparisons and product-scoped component questions use BOM tools', () => {
  const availableTools = [
    'analyze_pdm',
    'compare_boms',
    'get_bom',
    'get_product',
    'search_pdm',
  ].map(name => ({ function: { name } }));
  const comparison = routePdmIntent({
    query: '723 với 733 cái nào rộng hơn, hơn mấy ly?',
    availableTools,
  });
  assert.equal(comparison.preferredTool, 'compare_boms');
  assert.deepEqual(comparison.entities.productIds, ['LGS723', 'LGS733']);

  for (const query of [
    'Cái tủ 733 bảy ngăn ấy, con M6x22 có bao nhiêu con?',
    'Tủ 723 có mấy cái tay nắm?',
    'Túi phụ kiện của 733 có bao nhiêu chân nhựa số 10?',
    '733五金包里的10-底脚数量是多少？',
    '723的ốc lục giác dài M6x22 có bao nhiêu？',
  ]) {
    const route = routePdmIntent({ query, availableTools });
    assert.equal(route.preferredTool, 'get_bom', `query=${query}`);
    assert.equal(route.entities.productIds.length, 1, `query=${query}`);
  }
});

test('stability: a width value is not interpreted as an LGS product shorthand', () => {
  assert.equal(detectProductShorthand('那个987宽的是哪个产品？'), null);
  assert.deepEqual(parseDimensions('那个987宽的是哪个产品？')[0], {
    raw: '987宽',
    numbers: [987],
    type: '1d',
    axis: 'width',
    axisConfidence: 'explicit',
  });

  const route = routePdmIntent({
    query: '那个987宽的是哪个产品？',
    availableTools: READ_TOOLS,
  });
  assert.equal(route.preferredTool, 'analyze_pdm');
  assert.deepEqual(route.entities.productIds, []);
});

test('stability: catalog attributes find the five-drawer and seven-drawer products', () => {
  const knowledge = new PdmKnowledge(snapshot);
  const fiveDrawer = knowledge.analyzePdm({
    query: '有没有一个产品是两列、五个抽屉的？型号是什么？',
  });
  const sevenDrawer = knowledge.analyzePdm({
    query: '帮我找一个三列、七个抽屉、带灯和电的产品。',
  });
  const width = knowledge.analyzePdm({
    query: '那个987宽的是哪个产品？',
  });
  const fiveDrawerScrew = knowledge.analyzePdm({
    query: '五抽柜用多少颗M6×22？',
  });

  assert.deepEqual(fiveDrawer.results.map(item => item.productCode), ['LGS723']);
  assert.deepEqual(sevenDrawer.results.map(item => item.productCode), ['LGS733']);
  assert.deepEqual(width.results.map(item => item.productCode), ['LGS723']);
  assert.equal(width.results[0].variants[0].size, '300Dx987Wx671Hmm');
  assert.deepEqual(fiveDrawerScrew.results.map(item => item.productCode), ['LGS723']);
  assert.equal(fiveDrawerScrew.results[0].matchingMaterials[0].matCode, 'NLPLS6022BZ');
  assert.equal(fiveDrawerScrew.results[0].matchingMaterials[0].qty, '30+2');
});

test('stability: product details expose bilingual colors, SKUs, and sizes', () => {
  const product = new PdmKnowledge(snapshot).getProduct({ productId: 'LGS723' });

  assert.deepEqual(product.colors, ['复古色', '白色', '黑色', '山纹黑']);
  assert.equal(product.variants.length, 4);
  assert.ok(product.variants.every(variant => variant.colorVi && variant.sku && variant.size));
});

test('stability: BOM comparison preserves normal and spare quantity semantics', () => {
  const comparison = new PdmKnowledge(snapshot).compareBoms({
    productId1: 'LGS723',
    color1: '复古色',
    productId2: 'LGS733',
    color2: '复古色',
  });
  const screw = comparison.quantityOrUnitDifferences.find(item => item.matCode === 'NLPLS6022BZ');

  assert.ok(screw);
  assert.equal(screw.product1.quantityText, '30+2');
  assert.equal(screw.product1.normalQuantity, 30);
  assert.equal(screw.product1.spareQuantity, 2);
  assert.equal(screw.product2.quantityText, '39+2');
  assert.equal(screw.product2.normalQuantity, 39);
  assert.equal(screw.product2.spareQuantity, 2);
});
