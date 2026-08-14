import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildBomTreeRows, groupMaterialChildRows } from '../src/domain/relationships.js';
import {
  createMaterialDatabase,
  filterMaterials,
  materialWhereUsed,
  updateMaterialRecord,
} from '../src/domain/materials.js';
import { createPdmNavigation, createSidebarIndex, resolveBomRows } from '../src/domain/bom.js';
import {
  createProductRevision,
  payloadForProductRevision,
  productRevisionOptions,
} from '../src/domain/revisions.js';
import * as revisionDomain from '../src/domain/revisions.js';
import { coreUtils } from '../src/application.js';
import { loadDataPayload } from './helpers/load-data.mjs';

const { normalizePayload } = coreUtils;

function legacySharedMaterialPayload(productCodes, drawingForProduct) {
  const material = {
    stt: '1',
    mat_code: 'MAT001',
    comp_code: 'COMP001',
    name_zh: 'Panel',
    name_vi: 'Panel',
    attr_zh: 'component',
    attr_vi: 'component',
    qty: '1',
  };
  return {
    bom: Object.fromEntries(productCodes.map((productCode) => [
      productCode,
      {
        colors: ['black'],
        color_info: {
          black: {
            materials: [material],
          },
        },
      },
    ])),
    drawings: Object.fromEntries(productCodes.map((productCode, index) => [
      productCode,
      {
        'mat001|panel': drawingForProduct(productCode, index),
      },
    ])),
  };
}

test('legacy conversion does not accumulate one shared material PDF per product', () => {
  const productCodes = Array.from({ length: 20 }, (_, index) => `LGS${String(index + 1).padStart(3, '0')}`);
  const payload = legacySharedMaterialPayload(productCodes, (productCode) => [{
    name: `${productCode}-panel.pdf`,
    url: `https://example.test/${productCode}-panel.pdf`,
  }]);
  payload.models3d = Object.fromEntries(productCodes.map((productCode) => [
    productCode,
    {
      'mat001|panel': [{
        name: `${productCode}-panel.glb`,
        path: `models3d/${productCode}-panel.glb`,
      }],
    },
  ]));

  const database = createMaterialDatabase(payload);
  const [material] = Object.values(database.materials);

  assert.equal(database.bomEntries.length, 20);
  assert.equal(material.drawings.length, 1);
  assert.equal(material.drawings[0].name, 'LGS001-panel.pdf');
  assert.equal(material.models3d.length, 1);
  assert.equal(material.models3d[0].name, 'LGS001-panel.glb');
});

test('legacy conversion seeds a material asset from the first product that has one', () => {
  const payload = legacySharedMaterialPayload(['LGS001', 'LGS002'], (productCode) => (
    productCode === 'LGS001'
      ? []
      : [{ name: 'shared-panel.pdf', url: 'https://example.test/shared-panel.pdf' }]
  ));

  const database = createMaterialDatabase(payload);
  const [material] = Object.values(database.materials);

  assert.equal(material.drawings.length, 1);
  assert.equal(material.drawings[0].name, 'shared-panel.pdf');
});

test('shared MaterialID edits update every resolved BOM row', () => {
  const payload = normalizePayload(loadDataPayload());
  const original = resolveBomRows(payload, 'LGS101', '\u590d\u53e4\u8272')
    .find((row) => row.mat_code === 'LGS101DB101KD');
  updateMaterialRecord(payload, original._materialId, {
    name: { zh: 'Test top panel', vi: 'Test top panel' },
  });
  const rows = resolveBomRows(payload, 'LGS111', '\u590d\u53e4\u8272');
  assert.equal(rows.find((row) => row._materialId === original._materialId).name_zh, 'Test top panel');
});

test('BOM tree expands recursive material parents', () => {
  const payload = {
    materialDb: {
      materials: {
        parent: { id: 'parent', code: 'PARENT', name: { zh: 'Parent' } },
        child: { id: 'child', code: 'CHILD', name: { zh: 'Child' } },
        leaf: { id: 'leaf', code: 'LEAF', name: { zh: 'Leaf' } },
      },
      bomEntries: [
        { id: 'p', parentType: 'product', productCode: 'P1', color: 'black', materialId: 'parent', qty: '2', order: 1 },
        { id: 'c', parentType: 'material', parentId: 'parent', productCode: 'P1', color: 'black', materialId: 'child', childMaterialId: 'child', qty: '1', order: 1 },
        { id: 'l', parentType: 'material', parentId: 'child', productCode: 'P1', color: 'black', materialId: 'leaf', childMaterialId: 'leaf', qty: '3+1', order: 1 },
      ],
    },
  };
  assert.deepEqual(buildBomTreeRows(payload, 'P1', 'black').map((row) => row._level), [1, 2, 3]);
  assert.deepEqual(buildBomTreeRows(payload, 'P1', 'black').map((row) => row._effectiveQty), ['2', '2', '6+2']);
  assert.deepEqual(buildBomTreeRows(payload, 'P1', 'black').map((row) => row.qty), ['2', '1', '3+1']);
});

test('where-used remains a pure domain query', () => {
  const payload = normalizePayload(loadDataPayload());
  const material = Object.values(payload.materialDb.materials).find((item) => item.code === 'LGS101WJBBH');
  const result = materialWhereUsed(payload, material.id);
  assert.ok(result.productEntries.some((entry) => entry.productCode === 'LGS101'));
  assert.ok(result.childEntries.length > 0);
});

test('material search accepts a legacy drawing alias without changing the canonical material name', () => {
  const materials = [{
    code: 'BC350282187KD',
    name: { zh: 'LGS布抽35x28.2x18.7', vi: '' },
    spec: { zh: '350x282x187mm', vi: '' },
    attr: { zh: '零件', vi: '' },
    drawings: [{ name: 'LGS布抽28x35x18.7.pdf', matched_name: 'LGS布抽35x28x18.7' }],
  }];

  const result = filterMaterials({
    materials,
    attr: 'all',
    query: 'LGS布抽35x28x18.7',
    sortCol: 'attr',
    sortAsc: true,
    lang: 'zh',
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].name.zh, 'LGS布抽35x28.2x18.7');
});

test('BOM row remarks remain product-entry metadata', () => {
  const payload = {
    materialDb: {
      materials: { mat1: { id: 'mat1', code: 'MAT-1', name: { zh: 'Material' } } },
      bomEntries: [{ id: 'entry-1', parentType: 'product', productCode: 'P1', color: 'black', materialId: 'mat1', qty: '1', remark: 'Pack two per bag' }],
    },
  };
  const [row] = resolveBomRows(payload, 'P1', 'black');

  assert.equal(row.remark, 'Pack two per bag');
});

test('where-used retains references from immutable product revisions', () => {
  const payload = {
    materialDb: {
      materials: { current: { id: 'current', code: 'M1' } },
      bomEntries: [],
    },
    productRevisions: {
      P1: {
        revisions: [{
          revision: 'V3',
          snapshot: {
            materialDb: {
              materials: { snapshot: { id: 'snapshot', code: 'M1' } },
              bomEntries: [{ parentType: 'product', materialId: 'snapshot' }],
            },
          },
        }],
      },
    },
  };

  assert.deepEqual(materialWhereUsed(payload, 'current').revisionEntries, [{ productCode: 'P1', revision: 'V3' }]);
});

test('where-used resolves product usage through a material parent without a duplicate product row', () => {
  const payload = {
    materialDb: {
      materials: {
        pack: { id: 'pack', code: 'P1WJBBH', name: { zh: 'P1五金包' } },
        child: { id: 'child', code: 'SCREW', attr: { zh: '五金包' } },
      },
      bomEntries: [
        { id: 'pack-entry', parentType: 'product', productCode: 'P1', color: 'black', materialId: 'pack' },
        { id: 'child-entry', parentType: 'material', parentId: 'pack', productCode: 'P1', color: 'black', materialId: 'child', childMaterialId: 'child' },
      ],
    },
    productRevisions: {
      P1: { currentRevision: 'V2', effectiveRevision: 'V2', revisions: [] },
    },
  };

  const usage = materialWhereUsed(payload, 'child');
  assert.deepEqual(usage.productEntries.map((entry) => ({
    productCode: entry.productCode,
    color: entry.color,
    usageType: entry.usageType,
    viaMaterialId: entry.viaMaterialId,
  })), [{ productCode: 'P1', color: 'black', usageType: 'indirect', viaMaterialId: 'pack' }]);
  assert.deepEqual(usage.usageEntries.map((entry) => ({
    productCode: entry.productCode,
    revision: entry.revision,
    status: entry.status,
    usageType: entry.usageType,
  })), [{ productCode: 'P1', revision: 'V2', status: 'effective', usageType: 'indirect' }]);
});

test('where-used reports historical indirect usage from a revision snapshot', () => {
  const payload = {
    materialDb: {
      materials: { child: { id: 'child', code: 'SCREW' } },
      bomEntries: [],
    },
    productRevisions: {
      P1: {
        currentRevision: 'V2',
        effectiveRevision: 'V2',
        revisions: [{
          revision: 'V1',
          snapshot: {
            materialDb: {
              materials: {
                oldPack: { id: 'oldPack', code: 'P1WJBBH' },
                oldChild: { id: 'oldChild', code: 'SCREW' },
              },
              bomEntries: [
                { parentType: 'product', productCode: 'P1', color: 'black', materialId: 'oldPack' },
                { parentType: 'material', parentId: 'oldPack', productCode: 'P1', color: 'black', materialId: 'oldChild', childMaterialId: 'oldChild' },
              ],
            },
          },
        }],
      },
    },
  };

  const usage = materialWhereUsed(payload, 'child');
  assert.deepEqual(usage.revisionEntries, [{ productCode: 'P1', revision: 'V1' }]);
  assert.deepEqual(usage.usageEntries.map((entry) => ({
    productCode: entry.productCode,
    revision: entry.revision,
    status: entry.status,
    usageType: entry.usageType,
  })), [{ productCode: 'P1', revision: 'V1', status: 'historical', usageType: 'indirect' }]);
});

test('legacy normalization collapses flat hardware duplicates into one parent-child path', () => {
  const hardwareChild = {
    stt: '1',
    mat_code: 'SCREW',
    name_zh: '螺丝',
    attr_zh: '五金包',
    qty: '2',
  };
  const payload = normalizePayload({
    bom: {
      LGS001: {
        colors: ['black'],
        color_info: {
          black: {
            materials: [{
              stt: '0',
              mat_code: 'LGS001WJBBH',
              name_zh: 'LGS001五金包',
              attr_zh: '零件',
              qty: '1',
              materials: [hardwareChild],
            }, hardwareChild],
          },
        },
      },
    },
  });
  const child = Object.values(payload.materialDb.materials).find((material) => material.code === 'SCREW');
  const pack = Object.values(payload.materialDb.materials).find((material) => material.code === 'LGS001WJBBH');
  const directEntries = payload.materialDb.bomEntries.filter((entry) => entry.parentType === 'product');
  const childEntries = payload.materialDb.bomEntries.filter((entry) => entry.parentType === 'material');

  assert.deepEqual(directEntries.map((entry) => entry.materialId), [pack.id]);
  assert.equal(childEntries.length, 1);
  assert.equal(childEntries[0].parentId, pack.id);
  assert.equal(childEntries[0].childMaterialId, child.id);
});

test('BOM navigation normalizes legacy payloads at the domain seam', () => {
  const legacyPayload = {
    bom: {
      P1: {
        colors: ['black'],
        color_info: {
          black: {
            name_zh: 'Product one',
            name_vi: 'Product one',
            materials: [{
              stt: '1',
              mat_code: 'MAT001',
              comp_code: 'COMP001',
              name_zh: 'Panel',
              name_vi: 'Panel',
              attr_zh: 'component',
              attr_vi: 'component',
              qty: '1',
            }],
          },
        },
      },
    },
  };
  const normalizedPayload = normalizePayload(legacyPayload);
  const options = { lang: 'zh', query: '' };

  const legacyIndex = createSidebarIndex(legacyPayload, options);
  assert.deepEqual(legacyIndex, createSidebarIndex(normalizedPayload, options));
  assert.equal(legacyIndex.products.length, 1);
  assert.equal(legacyIndex.products[0].id, 'P1');
  assert.equal(legacyIndex.parentMaterials.length, 1);
  assert.equal(legacyIndex.childMaterials.length, 0);

  const labels = { bom: 'Products', materials: 'Materials', structure: 'Structure' };
  const legacyNavigation = createPdmNavigation(legacyPayload, labels);
  assert.deepEqual(legacyNavigation, createPdmNavigation(normalizedPayload, labels));
  assert.deepEqual(
    Object.fromEntries(legacyNavigation.map(({ id, count }) => [id, count])),
    { bom: 1, materials: 1, structure: 0 },
  );
  assert.deepEqual(legacyNavigation.map(({ label }) => label), Object.values(labels));
});

test('material relationship scopes use the translated shared label supplied by the caller', () => {
  const payload = {
    materialDb: {
      materials: { child: { id: 'child', code: 'CHILD' } },
      bomEntries: [{ id: 'entry', parentType: 'material', parentId: 'parent', childMaterialId: 'child' }],
    },
  };

  const rows = groupMaterialChildRows(payload, 'parent', 'Shared scope');

  assert.deepEqual(rows[0].scopes, ['Shared scope']);
});

test('materials domain does not import BOM or relationship modules', () => {
  const source = readFileSync(new URL('../src/domain/materials.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"]\.\/(?:bom|relationships)\.js['"]/);
});

test('creating a product revision preserves the previous BOM as an immutable snapshot', () => {
  const payload = normalizePayload({
    bom: {
      P1: {
        code: 'P1',
        colors: ['black'],
        color_info: { black: { size: '100mm', materials: [] } },
      },
    },
    materialDb: {
      version: 1,
      materials: {
        parent: { id: 'parent', code: 'PARENT', spec: { zh: '100mm' } },
        child: { id: 'child', code: 'CHILD', spec: { zh: '10mm' } },
      },
      bomEntries: [
        { id: 'p', parentType: 'product', productCode: 'P1', color: 'black', materialId: 'parent', qty: '1' },
        { id: 'c', parentType: 'material', parentId: 'parent', productCode: 'P1', color: 'black', childMaterialId: 'child', materialId: 'child', qty: '2' },
      ],
    },
    productRevisions: {
      P1: { currentRevision: 'V4', revisions: [] },
    },
  });

  createProductRevision(payload, 'P1', 'V4.1', {
    createdAt: '2026-07-13T00:00:00.000Z',
    changeReason: 'Reduce product height by 10mm',
  });
  payload.bom.P1.color_info.black.size = '90mm';
  payload.materialDb.materials.parent.spec.zh = '90mm';
  payload.materialDb.bomEntries.find((entry) => entry.id === 'p').qty = '3';

  const previous = payloadForProductRevision(payload, 'P1', 'V4');
  const current = payloadForProductRevision(payload, 'P1', 'V4.1');

  assert.equal(previous.bom.P1.color_info.black.size, '100mm');
  assert.equal(previous.materialDb.materials.parent.spec.zh, '100mm');
  assert.equal(previous.materialDb.bomEntries.find((entry) => entry.id === 'p').qty, '1');
  assert.equal(current.bom.P1.color_info.black.size, '90mm');
  assert.equal(current.materialDb.bomEntries.find((entry) => entry.id === 'p').qty, '3');
  assert.deepEqual(productRevisionOptions(payload, 'P1').map((item) => item.revision), ['V4.1', 'V4']);
  assert.equal(payload.productRevisions.P1.currentRevisionInfo.changeReason, 'Reduce product height by 10mm');
});

test('product revisions preserve the legacy A.1 fallback and reject duplicate revision codes', () => {
  const payload = normalizePayload({
    version: 9,
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });

  assert.deepEqual(productRevisionOptions(payload, 'P1').map((item) => item.revision), ['A.1']);
  createProductRevision(payload, 'P1', 'V2');
  assert.throws(() => createProductRevision(payload, 'P1', 'A.1'), /REVISION_EXISTS/);
  assert.throws(() => createProductRevision(payload, 'P1', 'V2'), /REVISION_EXISTS/);
});

test('legacy products preserve manual-derived versions until a revision registry exists', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    manuals: { P1: [{ name: 'P1-S-A4-manual-V4.pdf' }] },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });

  assert.deepEqual(productRevisionOptions(payload, 'P1').map((item) => item.revision), ['V4']);

  createProductRevision(payload, 'P1', 'V4.1');

  assert.deepEqual(productRevisionOptions(payload, 'P1').map((item) => item.revision), ['V4.1', 'V4']);
  assert.equal(payload.productRevisions.P1.revisions[0].snapshot.product.revision, 'V4');
});

test('legacy released revision is both current and effective', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    manuals: { P1: [{ name: 'P1-S-A4-manual-V3.pdf' }] },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });

  const [revision] = productRevisionOptions(payload, 'P1');

  assert.equal(revisionDomain.effectiveProductRevision?.(payload, 'P1'), 'V3');
  assert.equal(revision.revision, 'V3');
  assert.equal(revision.workflowState, 'released');
  assert.equal(revision.effective, true);
});

test('the first revision can initialize an existing product at its real current revision', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });

  createProductRevision(payload, 'P1', 'V4.1', { currentRevision: 'V4' });

  assert.deepEqual(productRevisionOptions(payload, 'P1').map((item) => item.revision), ['V4.1', 'V4']);
  assert.equal(payload.productRevisions.P1.revisions[0].snapshot.product.revision, 'V4');
});

test('a new product revision starts as draft and records its source transition', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    manuals: { P1: [{ name: 'P1-S-A4-manual-V3.pdf' }] },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });

  createProductRevision(payload, 'P1', 'V3.1', {
    createdAt: '2026-07-13T01:02:03.000Z',
    changeReason: 'Reduce height by 10mm',
  });

  const [current, previous] = productRevisionOptions(payload, 'P1');
  assert.deepEqual(current, {
    revision: 'V3.1',
    current: true,
    effective: false,
    sourceRevision: 'V3',
    createdAt: '2026-07-13T01:02:03.000Z',
    changeReason: 'Reduce height by 10mm',
    workflowState: 'draft',
  });
  assert.equal(previous.revision, 'V3');
  assert.equal(previous.workflowState, 'released');
  assert.equal(previous.effective, true);
  assert.equal(payload.productRevisions.P1.effectiveRevision, 'V3');
  assert.deepEqual(payload.productRevisions.P1.effectivityEvents, []);
});

test('releasing the current draft moves effectivity and records the transition', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    manuals: { P1: [{ name: 'P1-S-A4-manual-V3.pdf' }] },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });
  createProductRevision(payload, 'P1', 'V3.1', {
    createdAt: '2026-07-13T01:02:03.000Z',
    changeReason: 'Reduce height by 10mm',
  });

  revisionDomain.releaseProductRevision?.(payload, 'P1', 'V3.1', {
    eventId: 'effectivity_release_v3_1',
    occurredAt: '2026-07-13T02:03:04.000Z',
    reason: 'Approved for production',
  });

  const [current, previous] = productRevisionOptions(payload, 'P1');
  assert.equal(current.workflowState, 'released');
  assert.equal(current.effective, true);
  assert.equal(previous.workflowState, 'released');
  assert.equal(previous.effective, false);
  assert.equal(payload.productRevisions.P1.effectiveRevision, 'V3.1');
  assert.deepEqual(payload.productRevisions.P1.effectivityEvents, [{
    id: 'effectivity_release_v3_1',
    action: 'release',
    revision: 'V3.1',
    previousRevision: 'V3',
    occurredAt: '2026-07-13T02:03:04.000Z',
    reason: 'Approved for production',
  }]);
});

test('withdrawing the current release restores the previous effective revision', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    manuals: { P1: [{ name: 'P1-S-A4-manual-V3.pdf' }] },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });
  createProductRevision(payload, 'P1', 'V3.1', {
    createdAt: '2026-07-13T01:02:03.000Z',
    changeReason: 'Reduce height by 10mm',
  });
  revisionDomain.releaseProductRevision(payload, 'P1', 'V3.1', {
    eventId: 'effectivity_release_v3_1',
    occurredAt: '2026-07-13T02:03:04.000Z',
    reason: 'Approved for production',
  });

  revisionDomain.withdrawProductRevision(payload, 'P1', 'V3.1', {
    eventId: 'effectivity_withdraw_v3_1',
    occurredAt: '2026-07-13T03:04:05.000Z',
    reason: 'Correction required',
  });

  const [current, previous] = productRevisionOptions(payload, 'P1');
  assert.equal(current.workflowState, 'draft');
  assert.equal(current.effective, false);
  assert.equal(previous.revision, 'V3');
  assert.equal(previous.effective, true);
  assert.deepEqual(payload.productRevisions.P1.effectivityEvents.at(-1), {
    id: 'effectivity_withdraw_v3_1',
    action: 'withdraw',
    revision: 'V3.1',
    previousRevision: 'V3.1',
    occurredAt: '2026-07-13T03:04:05.000Z',
    reason: 'Correction required',
  });
});

test('withdrawing a legacy initial release records an explicit no-effective state', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', revision: 'V1', colors: [], color_info: {} } },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });

  revisionDomain.withdrawProductRevision(payload, 'P1', 'V1', {
    eventId: 'effectivity_withdraw_v1',
    occurredAt: '2026-07-13T03:04:05.000Z',
    reason: 'Correction required',
  });

  const [current] = productRevisionOptions(payload, 'P1');
  assert.equal(current.workflowState, 'draft');
  assert.equal(current.effective, false);
  assert.equal(payload.productRevisions.P1.effectiveRevision, '');
  assert.equal(
    revisionDomain.normalizeProductRevisionRegistry(payload).P1.effectiveRevision,
    '',
  );
});

test('invalid withdrawal is atomic', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', revision: 'V1', colors: [], color_info: {} } },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });
  const before = structuredClone(payload);

  assert.throws(
    () => revisionDomain.withdrawProductRevision(payload, 'P1', 'V1', { reason: '  ' }),
    /WITHDRAW_REASON_REQUIRED/,
  );
  assert.deepEqual(payload, before);
});

test('invalid release transitions are atomic', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    manuals: { P1: [{ name: 'P1-S-A4-manual-V3.pdf' }] },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });
  createProductRevision(payload, 'P1', 'V3.1', {
    createdAt: '2026-07-13T01:02:03.000Z',
    changeReason: 'Reduce height by 10mm',
  });
  const before = structuredClone(payload.productRevisions.P1);

  assert.throws(
    () => revisionDomain.releaseProductRevision(payload, 'P1', 'V3.1', { reason: '  ' }),
    /RELEASE_REASON_REQUIRED/,
  );
  assert.deepEqual(payload.productRevisions.P1, before);
  assert.throws(
    () => revisionDomain.releaseProductRevision(payload, 'P1', 'V3', { reason: 'Rollback' }),
    /REVISION_NOT_CURRENT/,
  );
  assert.deepEqual(payload.productRevisions.P1, before);

  revisionDomain.releaseProductRevision(payload, 'P1', 'V3.1', {
    eventId: 'effectivity_release_v3_1',
    occurredAt: '2026-07-13T02:03:04.000Z',
    reason: 'Approved for production',
  });
  const released = structuredClone(payload.productRevisions.P1);
  assert.throws(
    () => revisionDomain.releaseProductRevision(payload, 'P1', 'V3.1', { reason: 'Release again' }),
    /REVISION_NOT_DRAFT/,
  );
  assert.deepEqual(payload.productRevisions.P1, released);
});

test('old revision records migrate their transition metadata to the current revision', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', revision: 'V3.1', colors: [], color_info: {} } },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
    productRevisions: {
      P1: {
        currentRevision: 'V3.1',
        revisions: [{
          revision: 'V3',
          createdAt: '2026-07-13T01:02:03.000Z',
          changeReason: 'Reduce height by 10mm',
          snapshot: {
            product: { code: 'P1', revision: 'V3', colors: [], color_info: {} },
            materialDb: { version: 1, materials: {}, bomEntries: [] },
          },
        }],
      },
    },
  });

  const [current] = productRevisionOptions(payload, 'P1');
  assert.equal(current.sourceRevision, 'V3');
  assert.equal(current.createdAt, '2026-07-13T01:02:03.000Z');
  assert.equal(current.changeReason, 'Reduce height by 10mm');
  assert.equal(current.workflowState, 'draft');
});

test('effectivity inference skips historical revisions without a product snapshot', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', revision: 'V4', colors: [], color_info: {} } },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
    productRevisions: {
      P1: {
        currentRevision: 'V4',
        currentRevisionInfo: { sourceRevision: 'V3', workflowState: 'draft' },
        revisions: [
          { revision: 'V2', workflowState: 'released' },
          {
            revision: 'V3',
            workflowState: 'released',
            snapshot: {
              product: { code: 'P1', revision: 'V3', colors: [], color_info: {} },
              materialDb: { version: 1, materials: {}, bomEntries: [] },
            },
          },
        ],
      },
    },
  });

  assert.equal(revisionDomain.effectiveProductRevision(payload, 'P1'), 'V3');
  assert.equal(payloadForProductRevision(payload, 'P1', 'V2'), payload);
});
