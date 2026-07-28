import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildDrawingAnalysisMessages,
  buildSingleDrawingAnalysisMessages,
  deriveCommonalityStatus,
  findPartAssets,
  resolvePartsFromQuery,
  resolveSinglePartFromQuery,
  runDrawingCommonalityCheck,
  runSingleDrawingAnalysis,
  validateSingleDrawingAnalysis,
  validateDrawingAnalysis,
} from '../src/features/ai-assistant/engineering-drawing-commonality.js';
import { routePdmIntent } from '../src/features/ai-assistant/intent-router.js';

const COMMIT = 'a'.repeat(40);
const QUERY = '检查 LGS043-S 底部竖杆前后和 LGS723/733 中竖梁前后的图纸能不能共用';

function loadSnapshot() {
  const materials = JSON.parse(readFileSync(new URL('../data/materials.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../data/manifest.json', import.meta.url), 'utf8'));
  const bom = Object.fromEntries(['LGS043', 'LGS723', 'LGS733'].map(productId => [
    productId,
    JSON.parse(readFileSync(new URL(`../data/products/${productId}.json`, import.meta.url), 'utf8')),
  ]));
  return {
    sourceMetadata: { commitSha: COMMIT, capturedAt: '2026-07-27T00:00:00.000Z' },
    payload: { bom, drawings: materials.drawings, productRevisions: manifest.productRevisions },
  };
}

function analysis(overrides = {}) {
  const comparisons = [
    ['geometry', 'MATCH'],
    ['dimensions', 'MATCH'],
    ['holes', 'MATCH'],
    ['material', 'MATCH'],
    ['surface_finish', 'MATCH'],
    ['tolerance', 'UNVERIFIED'],
    ['welding', 'MATCH'],
    ['orientation', 'MATCH'],
    ['revision', 'UNVERIFIED'],
  ].map(([check, status]) => ({
    check,
    status,
    left_value: 'left',
    right_value: 'right',
    confidence: 0.95,
    evidence: status === 'UNVERIFIED' ? [] : [
      { side: 'left', page: 1, view: 'main', observation: `${check} visible` },
    ],
  }));
  return validateDrawingAnalysis({
    documents_analyzed: true,
    title_blocks: { left: {}, right: {} },
    comparisons,
    summary_zh: '需要工程确认。',
    summary_vi: 'Cần kỹ sư xác nhận.',
    ...overrides,
  });
}

function singleAnalysis(overrides = {}) {
  const evidence = [{ page: 1, view: 'main view', region: 'lower right', observation: 'Visible dimension callout' }];
  return validateSingleDrawingAnalysis({
    documents_analyzed: true,
    document: {
      drawing_number: '043-FRONT',
      revision: 'V3',
      pages: 1,
      title_block_evidence: evidence,
    },
    overall_dimensions: {
      length_mm: { value_mm: 198, source_type: 'drawing_text', confidence: 0.98, evidence },
      width_mm: { value_mm: 15, source_type: 'drawing_text', confidence: 0.98, evidence },
      height_mm: { value_mm: 15, source_type: 'drawing_text', confidence: 0.98, evidence },
    },
    material: { value: 'Q195', source_type: 'drawing_text', confidence: 0.95, evidence },
    surface_finish: { value: '', source_type: 'drawing_text', confidence: 0, evidence: [] },
    features: [{
      type: 'hole',
      quantity: 2,
      diameter_mm: null,
      positions: [],
      source_type: 'drawing_geometry',
      confidence: 0.72,
      evidence,
    }],
    tolerances: [],
    manufacturing_notes: [],
    warnings: ['Hole diameter is unreadable'],
    unreadable_regions: [],
    inferences: [],
    summary_zh: '孔径无法确认。',
    summary_vi: 'Không đọc rõ đường kính lỗ.',
    ...overrides,
  });
}

test('single drawing resolver accepts an exact part name and colloquial product shorthand', () => {
  const snapshot = loadSnapshot();
  const exact = resolveSinglePartFromQuery({
    query: '帮我看一下LGS043-S底部前竖杆的图纸。',
    productId: 'LGS043',
    snapshot,
  });
  const colloquial = resolveSinglePartFromQuery({
    query: '分析一下043下面前面那根竖杆。',
    productId: 'LGS043',
    snapshot,
  });

  assert.equal(exact.part?.material_code, 'LGS043XZQSLBH');
  assert.equal(colloquial.part?.material_code, 'LGS043XZQSLBH');
  assert.equal(findPartAssets(exact.part, snapshot)[0].name, 'LGS043-S-底部竖杆前.pdf');
});

test('single drawing messages attach one exact PDF and require structured evidence', () => {
  const snapshot = loadSnapshot();
  const resolution = resolveSinglePartFromQuery({
    query: 'LGS043-S底部竖杆前图纸',
    productId: 'LGS043',
    snapshot,
  });
  const asset = findPartAssets(resolution.part, snapshot)[0];
  const messages = buildSingleDrawingAnalysisMessages(resolution.part, asset);

  assert.match(messages[0].content, /Never guess blurred/i);
  assert.match(messages[0].content, /page\/view\/region evidence/i);
  assert.equal(messages[1].content.filter(item => item.type === 'file').length, 1);
  assert.equal(messages[1].content[1].file.filename, 'LGS043-S-底部竖杆前.pdf');
});

test('single drawing analysis preserves unreadable values as null and derives warnings', async () => {
  const result = await runSingleDrawingAnalysis({
    query: 'LGS043-S底部竖杆前图纸',
    productId: 'LGS043',
    snapshot: loadSnapshot(),
    model: 'xiaomi/mimo-v2.5',
    analyzeDocument: async (_part, _asset) => singleAnalysis({ document: {
      drawing_number: '043-FRONT',
      revision: '',
      pages: 1,
      title_block_evidence: [{ page: 1, view: 'title block', region: 'lower right', observation: 'Drawing number is visible' }],
    } }),
  });

  assert.equal(result.status, 'SUCCESS_WITH_WARNINGS');
  assert.equal(result.features[0].diameter_mm, null);
  assert.equal(result.document.material_code, 'LGS043XZQSLBH');
  assert.equal(result.engineering_confirmation_required, true);
  assert.equal(result.evidence.length, 1);
});

test('single drawing analysis fails closed when no model result is available', async () => {
  const result = await runSingleDrawingAnalysis({
    query: 'LGS043-S底部竖杆前图纸',
    productId: 'LGS043',
    snapshot: loadSnapshot(),
    model: '',
    analyzeDocument: null,
  });

  assert.equal(result.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.features.length, 0);
});

test('single drawing analysis reports missing documents and revision conflicts explicitly', async () => {
  const missingSnapshot = loadSnapshot();
  missingSnapshot.payload.drawings.LGS043 = {};
  const missing = await runSingleDrawingAnalysis({
    query: 'LGS043-S底部竖杆前图纸',
    productId: 'LGS043',
    snapshot: missingSnapshot,
    model: 'xiaomi/mimo-v2.5',
    analyzeDocument: async () => singleAnalysis(),
  });
  assert.equal(missing.status, 'DOCUMENT_NOT_FOUND');

  const conflictSnapshot = loadSnapshot();
  conflictSnapshot.payload.productRevisions.LGS043 = { currentRevision: 'V3' };
  const conflict = await runSingleDrawingAnalysis({
    query: 'LGS043-S底部竖杆前图纸',
    productId: 'LGS043',
    snapshot: conflictSnapshot,
    model: 'xiaomi/mimo-v2.5',
    analyzeDocument: async () => singleAnalysis({ document: {
      drawing_number: '043-FRONT',
      revision: 'V4',
      pages: 1,
      title_block_evidence: [{ page: 1, view: 'title block', region: 'lower right', observation: 'Revision V4 is visible' }],
    } }),
  });
  assert.equal(conflict.status, 'REVISION_CONFLICT');
});

test('acceptance case resolves exact front/front and rear/rear drawing pairs', () => {
  const snapshot = loadSnapshot();
  const resolved = resolvePartsFromQuery({ query: QUERY, snapshot });

  assert.deepEqual(resolved.productIds, ['LGS043', 'LGS723', 'LGS733']);
  assert.deepEqual(resolved.pairs.map(pair => [
    pair.left.material_code,
    pair.right.material_code,
    pair.orientation,
  ]), [
    ['LGS043XZQSLBH', 'LGS723XZQSLBH', 'front'],
    ['LGS043XZHSLBH', 'LGS723XZHSLBH', 'rear'],
  ]);
  assert.equal(findPartAssets(resolved.pairs[0].left, snapshot)[0].name, 'LGS043-S-底部竖杆前.pdf');
  assert.equal(findPartAssets(resolved.pairs[0].right, snapshot)[0].name, 'LGS723_733中竖梁-前.pdf');
});

test('drawing messages attach exact PDFs and explicitly require page/view evidence', () => {
  const snapshot = loadSnapshot();
  const pair = resolvePartsFromQuery({ query: QUERY, snapshot }).pairs[0];
  const leftAsset = findPartAssets(pair.left, snapshot)[0];
  const rightAsset = findPartAssets(pair.right, snapshot)[0];
  const messages = buildDrawingAnalysisMessages(pair, leftAsset, rightAsset);

  assert.match(messages[0].content, /page number, view or region/i);
  assert.equal(messages[1].content[1].type, 'file');
  assert.match(messages[1].content[1].file.file_data, /^https:\/\/drive\.google\.com\/uc\?/);
  assert.match(messages[1].content[2].file.filename, /中竖梁-前\.pdf$/);
});

test('deterministic status cannot be confirmed while tolerance or revision is unverified', () => {
  assert.equal(deriveCommonalityStatus(analysis()), 'LIKELY_COMMON_NEEDS_CONFIRMATION');
  const comparisons = analysis().comparisons.map(item => ({ ...item, status: 'MATCH' }));
  assert.equal(deriveCommonalityStatus(analysis({ comparisons })), 'CONFIRMED_COMMON');
});

test('critical hole difference fails closed as NOT_COMMON', async () => {
  const snapshot = loadSnapshot();
  const result = await runDrawingCommonalityCheck({
    query: QUERY,
    snapshot,
    model: 'xiaomi/mimo-v2.5',
    analyzePair: async () => {
      const next = analysis();
      next.comparisons = next.comparisons.map(item => item.check === 'holes'
        ? { ...item, status: 'DIFFERENT', confidence: 0.98 }
        : item);
      return next;
    },
  });

  assert.equal(result.status, 'NOT_COMMON');
  assert.equal(result.pairs.length, 2);
  assert.equal(result.engineering_confirmation_required, true);
  assert.equal(result.evidence.length, 4);
});

test('missing model analysis returns metadata evidence without claiming commonality', async () => {
  const result = await runDrawingCommonalityCheck({
    query: QUERY,
    snapshot: loadSnapshot(),
    model: '',
    analyzePair: null,
  });

  assert.equal(result.status, 'INSUFFICIENT_EVIDENCE');
  assert.ok(result.pairs.every(pair => pair.analysis.documents_analyzed === false));
  assert.ok(result.pairs.every(pair => pair.analysis.comparisons.find(item => item.check === 'holes').status === 'UNVERIFIED'));
});

test('drawing commonality language routes to the governed drawing skill', () => {
  const route = routePdmIntent({
    query: QUERY,
    availableTools: ['compare_boms', 'check_drawing_commonality'],
  });
  assert.equal(route.intent, 'drawing_commonality');
  assert.equal(route.preferredTool, 'check_drawing_commonality');
  assert.deepEqual(route.entities.productIds, ['LGS043', 'LGS723', 'LGS733']);
});

test('ordinary shared-component questions remain on the BOM comparison route', () => {
  const route = routePdmIntent({
    query: 'LGS723\u548cLGS733\u6709\u54ea\u4e9b\u5171\u7528\u96f6\u4ef6?',
    availableTools: ['compare_boms', 'check_drawing_commonality'],
  });
  assert.equal(route.intent, 'bom_compare');
  assert.equal(route.preferredTool, 'compare_boms');
});

test('one-product drawing language routes to single drawing analysis', () => {
  const route = routePdmIntent({
    query: '帮我看一下LGS043-S底部前竖杆的图纸。',
    availableTools: ['analyze_engineering_drawing', 'check_drawing_commonality'],
  });
  assert.equal(route.intent, 'drawing_analysis');
  assert.equal(route.preferredTool, 'analyze_engineering_drawing');
  assert.deepEqual(route.entities.productIds, ['LGS043']);
});

test('drawing analysis rejects unsupported checks and model-authored status fields are ignored', () => {
  assert.throws(() => validateDrawingAnalysis({
    documents_analyzed: true,
    comparisons: [{ check: 'same_part', status: 'MATCH' }],
  }), /unsupported check/i);
});
