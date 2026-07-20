import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyMaterialFamily, summarizeMaterialFamilies } from '../src/features/ai-assistant/pdm-ontology.js';

test('classifies explicit metal from the material field', () => {
  assert.deepEqual(classifyMaterialFamily({ materialZh: 'Q195' }), {
    family: 'metal',
    confidence: 'explicit',
    evidence: 'Q195',
  });
  assert.equal(classifyMaterialFamily({ materialZh: 'stainless steel' }).family, 'metal');
  assert.equal(classifyMaterialFamily({ materialZh: 'nhôm' }).family, 'metal');
});

test('infers metal hardware from a name only when material is absent', () => {
  assert.deepEqual(classifyMaterialFamily({ nameZh: 'M6x22内六角螺丝', materialZh: '' }), {
    family: 'metal',
    confidence: 'inferred',
    evidence: 'M6x22内六角螺丝',
  });
});

test('explicit non-metal material overrides a metal-sounding name', () => {
  const result = classifyMaterialFamily({ nameZh: '280mm布抽条', materialZh: 'PP&GF40' });
  assert.equal(result.family, 'polymer');
  assert.equal(result.confidence, 'explicit');
});

test('hardware-pack attribute alone does not prove physical metal', () => {
  assert.deepEqual(classifyMaterialFamily({ attributeZh: '五金包' }), {
    family: 'unknown',
    confidence: 'unknown',
    evidence: '',
  });
});

test('reports conflicting explicit material evidence as unknown', () => {
  const result = classifyMaterialFamily({ materialZh: 'steel + PP plastic' });
  assert.equal(result.family, 'unknown');
  assert.equal(result.confidence, 'conflict');
});

test('summarizes family and confidence without dropping unknown rows', () => {
  const summary = summarizeMaterialFamilies([
    { materialZh: 'Q195' },
    { nameZh: '螺丝' },
    { materialZh: 'PP' },
    { attributeZh: '五金包' },
  ]);

  assert.deepEqual(summary, {
    metal: { total: 2, explicit: 1, inferred: 1 },
    polymer: { total: 1, explicit: 1, inferred: 0 },
    woodComposite: { total: 0, explicit: 0, inferred: 0 },
    textile: { total: 0, explicit: 0, inferred: 0 },
    packaging: { total: 0, explicit: 0, inferred: 0 },
    unknown: { total: 1, explicit: 0, inferred: 0 },
  });
  assert.equal(Object.isFrozen(summary), true);
});
