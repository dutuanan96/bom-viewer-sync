import assert from 'node:assert/strict';
import test from 'node:test';
import { auditPePackaging } from '../scripts/audit-pe-packaging.mjs';

function material(code, name, materialName = 'Q195') {
  return {
    id: code,
    code,
    name: { zh: name },
    attr: { zh: name === 'PE袋' ? '包材' : '零件' },
    material: { zh: materialName },
  };
}

test('PE packaging audit distinguishes supplier packaging, incorrect color and missing coverage', () => {
  const payload = {
    materialDb: {
      materials: {
        rod: material('RODBH', '拉杆'),
        foot: material('FOOTBH', '底脚'),
        whiteFrame: material('FRAMEWH', '横杆'),
        blackFrame: material('FRAMEBH', '横杆'),
        missing: material('MISSINGBH', '横杆'),
        bag: material('PE100X60', 'PE袋', 'PE'),
      },
    },
    bom: {
      P1: {
        color_info: {
          白色: {
            materials: [
              { mat_code: 'RODBH', name_zh: '拉杆', qty: '2' },
              { mat_code: 'FOOTBH', name_zh: '底脚', qty: '2' },
              { mat_code: 'FRAMEWH', name_zh: '横杆', qty: '1' },
              { mat_code: 'MISSINGBH', name_zh: '横杆', qty: '1' },
              { mat_code: 'PE100X60', name_zh: 'PE袋', qty: '1', remark: '包装对象：FRAMEBH×1；规格：1098×15×290\n规则：FRAMEBH×1；用袋：1袋' },
            ],
          },
        },
      },
    },
  };

  const result = auditPePackaging(payload);

  assert.equal(result.supplierProvided.length, 2);
  assert.equal(result.wrongColorCode.length, 1);
  assert.equal(result.wrongColorCode[0].referencedCode, 'FRAMEBH');
  assert.equal(result.unreferenced.length, 1);
  assert.equal(result.unreferenced[0].code, 'MISSINGBH');
  assert.equal(result.outOfVariantTargets.length, 1);
  assert.equal(result.unknownTargets.length, 0);
});
