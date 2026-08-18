import test from 'node:test';
import assert from 'node:assert/strict';
import { BomApplication } from '../src/application.js';
import { legacyRowFromRecord } from '../src/domain/materials.js';

function createTestApp(overrides = {}) {
  return new BomApplication({
    mode: 'viewer',
    config: { owner: 'test', repo: 'test', branch: 'main', shardRoot: 'data' },
    githubData: {},
    ...overrides,
  });
}

test('legacyRowFromRecord forwards unit from material record', () => {
  const record = {
    id: 'mat_test1',
    code: 'LGS033PKXBH',
    name: { zh: '平口箱', vi: 'Thùng phẳng' },
    spec: { zh: '1185*330*115mm', vi: '1185*330*115mm' },
    unit: '个'
  };
  const entry = { id: 'bom_1', stt: '1', comp_code: 'P1', qty: '2' };
  const row = legacyRowFromRecord(record, entry);
  assert.equal(row.unit, '个');
  assert.equal(row.qty, '2');
});

test('application headers contain 单位 at index 8 and 用量 at index 9', () => {
  const app = createTestApp();
  app.state.lang = 'zh';
  const zhHeaders = app.label('headers');
  assert.equal(zhHeaders[8], '单位');
  assert.equal(zhHeaders[9], '用量');
  assert.equal(zhHeaders[10], '2D 图纸');

  app.state.lang = 'vi';
  const viHeaders = app.label('headers');
  assert.equal(viHeaders[8], 'Đơn vị');
  assert.equal(viHeaders[9], 'Định mức');
  assert.equal(viHeaders[10], 'Bản vẽ 2D');
});

test('rowsForExport includes product header block (SPU, SKU, color, size) and unit column', () => {
  const app = createTestApp();
  app.state.lang = 'zh';
  app.state.currentSku = 'LGS033';
  app.state.currentColor = '黑色';
  app.state.payload = {
    bom: {
      LGS033: {
        code: 'LGS033',
        color_info: {
          '黑色': {
            sku: 'LGS033BH02S',
            size: '1185*330*115mm',
            color_ver: '黑色',
            name_zh: 'LGS033斗柜黑色',
            materials: []
          }
        }
      }
    },
    materialDb: {
      materials: {
        mat_1: {
          id: 'mat_1',
          code: 'TEST01',
          name: { zh: '测试物料' },
          spec: { zh: '100x100mm' },
          material: { zh: '木' },
          color: { zh: '黑' },
          attr: { zh: '零件' },
          unit: '块'
        }
      },
      bomEntries: [
        {
          id: 'b1',
          parentType: 'product',
          parentId: 'LGS033',
          productCode: 'LGS033',
          color: '黑色',
          materialId: 'mat_1',
          qty: '5',
          order: 0
        }
      ]
    }
  };

  const rows = app.rowsForExport();
  assert.ok(rows.length >= 5);
  // Header row 0: SPU and SKU
  assert.deepEqual(rows[0], ['SPU', 'LGS033', 'SKU', 'LGS033BH02S']);
  // Header row 1: Product Name
  assert.deepEqual(rows[1], ['产品名称', 'LGS033斗柜黑色']);
  // Header row 2: Size and Color
  assert.deepEqual(rows[2], ['规格', '1185*330*115mm', '颜色', '黑色']);
  // Header row 3: empty spacer
  assert.deepEqual(rows[3], []);
  // Header row 4: BOM Column header
  assert.deepEqual(rows[4], ['层级', '物料编码', '部件编号', '物料名称', '规格型号', '材质', '颜色', '属性', '单位', '用量']);
  // Row 5: data row containing unit and qty
  assert.equal(rows[5][8], '块'); // unit
  assert.equal(rows[5][9], '5');  // qty
});
