import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { PdmKnowledge } from '../src/features/ai-assistant/pdm-knowledge.js';
import {
  compareBilingualPair,
  evaluatePdmCase,
  summarizePdmEvaluation,
} from '../scripts/lib/pdm-ai-evaluator.mjs';

const corpus = JSON.parse(readFileSync(resolve('knowledge/ai/pdm-eval-corpus.json'), 'utf8'));

function loadCanonicalPayload() {
  const manifest = JSON.parse(readFileSync(resolve('data/manifest.json'), 'utf8'));
  const materialData = JSON.parse(readFileSync(resolve('data/materials.json'), 'utf8'));
  const bom = Object.fromEntries(manifest.products.map(productCode => [
    productCode,
    JSON.parse(readFileSync(resolve(`data/products/${productCode}.json`), 'utf8')),
  ]));
  return { bom, ...materialData };
}

test('PDM evaluation corpus has the planned first-stage coverage', () => {
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.smokeIds.length, 25);
  assert.equal(corpus.cases.filter(testCase => testCase.language === 'VI').length, 15);
  assert.equal(corpus.cases.filter(testCase => testCase.language === 'ZH').length, 15);
  assert.equal(corpus.bilingualPairs.length, 10);
  assert.equal(new Set(corpus.cases.map(testCase => testCase.id)).size, corpus.cases.length);

  const knownIds = new Set(corpus.cases.map(testCase => testCase.id));
  corpus.smokeIds.forEach(id => assert.ok(knownIds.has(id), `unknown smoke ID ${id}`));
  corpus.bilingualPairs.forEach(pair => {
    assert.ok(knownIds.has(pair.vi), `unknown VI pair ID ${pair.vi}`);
    assert.ok(knownIds.has(pair.zh), `unknown ZH pair ID ${pair.zh}`);
  });
  corpus.cases.forEach(testCase => {
    assert.ok(corpus.facts[testCase.expectedRef], `unknown fact ${testCase.expectedRef}`);
    assert.ok(testCase.assertFields.length > 0, `missing assertions for ${testCase.id}`);
  });
});

test('source-of-truth quantities match the canonical PDM snapshot', () => {
  const payload = loadCanonicalPayload();
  const knowledge = new PdmKnowledge({
    payload,
    sourceMetadata: {
      commitSha: '5e9dc8289a485401e439a1c09fef79a62d61debf',
      capturedAt: new Date(0).toISOString(),
    },
  });

  for (const [productCode, expectedRef] of [
    ['LGS723', 'lgs723_m6x22'],
    ['LGS733', 'lgs733_m6x22'],
  ]) {
    const result = knowledge.getBom({ productId: productCode, color: payload.bom[productCode].colors[0] });
    const row = result.rows.find(item => item.matCode === corpus.facts[expectedRef].material_code);
    assert.ok(row, `${productCode} M6x22 row is missing`);
    assert.equal(row.qty, corpus.facts[expectedRef].quantity_raw);
    assert.equal(row.level, corpus.facts[expectedRef].bom_level);
  }

  assert.equal(knowledge.getProduct({ productId: 'LGS723' }).variants[0].size, '300Dx987Wx671Hmm');
  assert.equal(knowledge.getProduct({ productId: 'LGS733' }).variants[0].size, '300Dx1138Wx671Hmm');
});

test('focused BOM lookup keeps the matching nested component and its parent', () => {
  const payload = loadCanonicalPayload();
  const knowledge = new PdmKnowledge({
    payload,
    sourceMetadata: { commitSha: '5e9dc8289a485401e439a1c09fef79a62d61debf' },
  });
  const result = knowledge.getBom({
    productId: 'LGS733',
    query: 'Túi phụ kiện của 733 có bao nhiêu chân nhựa số 10?',
  });

  assert.equal(result.focused, true);
  assert.ok(result.rows.length <= 12);
  assert.ok(result.rows.some(row => row.matCode === 'LGS733WJBBH' && row.level === 1));
  assert.ok(result.rows.some(row => row.matCode === 'TZJD629825BH' && row.qty === '6' && row.level === 2));
});

test('evaluator rejects wrong raw quantities even when the arithmetic total matches', () => {
  const testCase = corpus.cases.find(item => item.id === 'VI-005');
  const fact = corpus.facts[testCase.expectedRef];
  const correct = evaluatePdmCase({
    testCase,
    fact,
    answer: 'LGS723 M6x22mm NLPLS6022BZ has 30+2 at BOM level 2.',
  });
  const flattened = evaluatePdmCase({
    testCase,
    fact,
    answer: 'LGS723 M6x22mm NLPLS6022BZ has 32 at BOM level 2.',
  });

  assert.equal(correct.result, 'pass');
  assert.equal(flattened.criteria.quantity, false);
  assert.ok(flattened.score < 95);
});

test('evaluator accepts a grounded correction for a misremembered component', () => {
  const testCase = corpus.cases.find(item => item.id === 'ZH-015');
  const fact = corpus.facts[testCase.expectedRef];
  const evaluation = evaluatePdmCase({
    testCase,
    fact,
    answer: 'LGS723的BOM中没有M6x20。最接近的是M6x22mm，数量30+2，请确认。',
  });
  assert.equal(evaluation.result, 'pass');
  assert.equal(evaluation.confirmationDisclosed, true);
});

test('evaluator detects fabricated unavailable data and summarizes critical failures', () => {
  const testCase = corpus.cases.find(item => item.id === 'VI-013');
  const fact = corpus.facts[testCase.expectedRef];
  const grounded = evaluatePdmCase({
    testCase,
    fact,
    answer: 'PDM hiện không có thông tin giá của LGS723.',
  });
  const fabricated = evaluatePdmCase({
    testCase,
    fact,
    answer: 'LGS723 có giá 2.500.000 đồng.',
  });
  assert.equal(grounded.result, 'pass');
  assert.equal(fabricated.criteria.hallucination, false);

  const result = { testCase, fact, evaluation: fabricated };
  const summary = summarizePdmEvaluation([result]);
  assert.equal(summary.criticalFailureCount, 1);
  assert.deepEqual(summary.criticalFailureIds, ['VI-013']);
});

test('evaluator accepts an explicit distinction between BOM quantity and unavailable inventory', () => {
  const testCase = corpus.cases.find(item => item.id === 'MX-005');
  const evaluation = evaluatePdmCase({
    testCase,
    fact: corpus.facts[testCase.expectedRef],
    answer: 'LGS723 的 PDM 数据是 BOM 用量，而不是当前库存/仓库存量信息。',
  });

  assert.equal(evaluation.noDataDisclosed, true);
  assert.equal(evaluation.criteria.hallucination, true);
  assert.equal(evaluation.result, 'pass');
});

test('bilingual comparison requires both sides to retrieve every asserted field', () => {
  const complete = {
    fact: corpus.facts.lgs723_m6x22,
    evaluation: { missingFields: [] },
  };
  const incomplete = {
    fact: corpus.facts.lgs723_m6x22,
    evaluation: { missingFields: ['quantity_raw'] },
  };
  assert.equal(compareBilingualPair(complete, complete).consistent, true);
  assert.equal(compareBilingualPair(complete, incomplete).consistent, false);
});
