const STATUS = Object.freeze({
  CONFIRMED: 'CONFIRMED_COMMON',
  LIKELY: 'LIKELY_COMMON_NEEDS_CONFIRMATION',
  NOT_COMMON: 'NOT_COMMON',
  INSUFFICIENT: 'INSUFFICIENT_EVIDENCE',
});

const SINGLE_STATUS = Object.freeze({
  SUCCESS: 'SUCCESS',
  SUCCESS_WITH_WARNINGS: 'SUCCESS_WITH_WARNINGS',
  PARTIALLY_READABLE: 'PARTIALLY_READABLE',
  INSUFFICIENT: 'INSUFFICIENT_EVIDENCE',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  MULTIPLE_DOCUMENTS_FOUND: 'MULTIPLE_DOCUMENTS_FOUND',
  REVISION_CONFLICT: 'REVISION_CONFLICT',
});

const SINGLE_SOURCE_TYPES = new Set([
  'drawing_text',
  'drawing_geometry',
  'bom_metadata',
  'inference',
]);

const CHECKS = Object.freeze([
  'geometry',
  'dimensions',
  'holes',
  'material',
  'surface_finish',
  'tolerance',
  'welding',
  'orientation',
  'revision',
]);

const CRITICAL_DIFFERENCE_CHECKS = new Set([
  'geometry',
  'dimensions',
  'holes',
  'welding',
  'orientation',
  'tolerance',
]);

function text(value, maxLength = 1000) {
  return String(value ?? '').normalize('NFKC').trim().slice(0, maxLength);
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[×*]/g, 'x').replace(/\s+/g, '');
}

function compact(value) {
  return normalized(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function productIdsFromQuery(query) {
  const value = text(query, 2000).toUpperCase();
  const matches = [...value.matchAll(/\bLGS(\d{3,4})\b/g)].map(match => `LGS${match[1]}`);
  for (const match of value.matchAll(/\bLGS(\d{3,4})\s*(?:\/|&|AND|,)\s*(\d{3,4})\b/g)) {
    matches.push(`LGS${match[1]}`, `LGS${match[2]}`);
  }
  return [...new Set(matches)].slice(0, 4);
}

function orientationOf(name) {
  const value = normalized(name);
  if (/(?:前|trước|front)/u.test(value)) return 'front';
  if (/(?:后|sau|rear|back)/u.test(value)) return 'rear';
  return 'unspecified';
}

function corePartName(name) {
  return normalized(name)
    .replace(/lgs\d{3,4}(?:(?:_|-)?(?:lgs)?\d{3,4})*/g, '')
    .replace(/(?:前|后|trước|sau|front|rear|back)/gu, '')
    .replace(/(?:thanh|đứng|dọc)/gu, '')
    .replace(/[-_()（）/]/g, '');
}

function exactPartName(name) {
  return compact(name).replace(/^lgs\d{3,4}(?:(?:lgs)?\d{3,4})*/, '');
}

function productRows(payload, productId) {
  const product = payload?.bom?.[productId];
  if (!product || typeof product !== 'object') return [];
  const rows = [];
  for (const [color, info] of Object.entries(product.color_info || {})) {
    for (const row of Array.isArray(info?.materials) ? info.materials : []) {
      rows.push({ ...row, color_ver: row.color_ver || color });
    }
  }
  if (rows.length > 0) return rows;
  for (const [color, value] of Object.entries(product)) {
    if (!Array.isArray(value)) continue;
    value.forEach(row => rows.push({ ...row, color_ver: row.color_ver || color }));
  }
  return rows;
}

function revisionFor(payload, productId) {
  const value = payload?.productRevisions?.[productId] || {};
  return text(value.currentRevision || value.current || value.effectiveRevision || value.effective || '', 80);
}

function partFromRow(row, productId, revision) {
  return {
    product: productId,
    used_by_products: [productId],
    material_code: text(row.mat_code || row.materialCode || row.code, 120),
    component_code: text(row.comp_code || row.componentCode, 80),
    name_zh: text(row.name_zh || row.nameZh, 300),
    name_vi: text(row.name_vi || row.nameVi, 300),
    specification: text(row.spec || row.spec_zh || row.specZh, 300),
    material: text(row.material_zh || row.materialZh || row.material_vi || row.materialVi, 200),
    surface_finish: text(row.color_zh || row.colorZh || row.color_vi || row.colorVi, 200),
    orientation: orientationOf(row.name_zh || row.nameZh || row.name_vi || row.nameVi),
    revision,
  };
}

function mergeParts(parts) {
  const merged = new Map();
  for (const part of parts) {
    const key = normalized(part.material_code);
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, part);
      continue;
    }
    existing.used_by_products = [...new Set([...existing.used_by_products, ...part.used_by_products])];
  }
  return [...merged.values()];
}

export function resolvePartsFromQuery({ query, snapshot } = {}) {
  const payload = snapshot?.payload || snapshot || {};
  const productIds = productIdsFromQuery(query);
  if (productIds.length < 2) {
    return { productIds, parts: [], pairs: [], needsClarification: true, reason: 'product-scope-required' };
  }
  const queryText = compact(query);
  const allParts = [];
  for (const productId of productIds) {
    const revision = revisionFor(payload, productId);
    for (const row of productRows(payload, productId)) {
      const part = partFromRow(row, productId, revision);
      const cores = [
        exactPartName(part.name_zh),
        exactPartName(part.name_vi),
        corePartName(part.name_zh),
        corePartName(part.name_vi),
      ]
        .map(compact)
        .filter(value => value.length >= 2);
      if (cores.some(value => queryText.includes(value))) allParts.push(part);
    }
  }

  const parts = mergeParts(allParts);
  const leftProduct = productIds[0];
  const leftParts = parts.filter(part => part.used_by_products.includes(leftProduct));
  const rightParts = parts.filter(part => !part.used_by_products.includes(leftProduct));
  const pairs = [];
  for (const left of leftParts) {
    const candidates = rightParts
      .filter(right => (
        left.orientation !== 'unspecified'
        && left.orientation === right.orientation
        && normalized(left.specification) === normalized(right.specification)
      ))
      .sort((a, b) => a.material_code.localeCompare(b.material_code));
    if (candidates[0]) {
      pairs.push({
        id: `${left.material_code}__${candidates[0].material_code}`,
        orientation: left.orientation,
        left,
        right: candidates[0],
      });
    }
  }

  return {
    productIds,
    parts,
    pairs: pairs.slice(0, 4),
    needsClarification: pairs.length === 0,
    reason: pairs.length === 0 ? 'drawing-pairs-not-resolved' : '',
  };
}

function drawingBucket(payload, productId) {
  return payload?.drawings?.[productId] || {};
}

function isPdfAsset(asset) {
  return /\.pdf(?:$|[?#])/i.test(asset?.url || '') || /\.pdf$/i.test(asset?.name || '');
}

function directPdfUrl(value) {
  const url = text(value, 2000);
  const match = url.match(/^https:\/\/drive\.google\.com\/file\/d\/([^/]+)\//i);
  return match
    ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(match[1])}`
    : url;
}

export function findPartAssets(part, snapshot) {
  const payload = snapshot?.payload || snapshot || {};
  const products = part?.used_by_products?.length ? part.used_by_products : [part?.product];
  const code = compact(part?.material_code);
  const matches = [];
  for (const productId of products) {
    for (const [key, value] of Object.entries(drawingBucket(payload, productId))) {
      if (compact(String(key).split('|')[0]) !== code) continue;
      const assets = Array.isArray(value) ? value : [value];
      for (const asset of assets.filter(isPdfAsset)) {
        matches.push({
          product: productId,
          name: text(asset?.name, 300),
          path: text(asset?.path, 1000),
          url: text(asset?.url, 2000),
          file_url: directPdfUrl(asset?.url),
          matched_name: text(asset?.matched_name || asset?.matchedName, 300),
        });
      }
    }
  }
  return matches.slice(0, 3);
}

function semanticPartName(value) {
  return normalized(value)
    .replace(/(?:下面|下方)/gu, '底部')
    .replace(/(?:上面|上方)/gu, '顶部')
    .replace(/前面/gu, '前')
    .replace(/后面/gu, '后')
    .replace(/(?:竖管|竖梁|verticalbeam|verticaltube)/gu, '竖杆')
    .replace(/(?:phía dưới|bên dưới)/gu, 'dưới')
    .replace(/(?:phía trước|bên trước)/gu, 'trước')
    .replace(/(?:phía sau|bên sau)/gu, 'sau');
}

function singlePartScore(part, query) {
  const queryText = semanticPartName(query);
  const queryCompact = compact(queryText);
  const names = [part.name_zh, part.name_vi].map(semanticPartName).filter(Boolean);
  const materialCode = compact(part.material_code);
  let score = materialCode && queryCompact.includes(materialCode) ? 100 : 0;
  for (const name of names) {
    const exact = compact(exactPartName(name));
    const core = compact(corePartName(name));
    if (exact && queryCompact.includes(exact)) score = Math.max(score, 80);
    else if (core && core.length >= 2 && queryCompact.includes(core)) score = Math.max(score, 60);
  }

  const queryOrientation = orientationOf(queryText);
  if (queryOrientation !== 'unspecified') {
    score += queryOrientation === part.orientation ? 20 : -50;
  }
  for (const marker of ['底部', '顶部', '中', '横杆', '竖杆', 'dưới', 'trên', 'giữa', 'ngang', 'đứng']) {
    if (queryText.includes(marker) && names.some(name => name.includes(marker))) score += 12;
  }
  return score;
}

export function resolveSinglePartFromQuery({ query, productId, snapshot } = {}) {
  const payload = snapshot?.payload || snapshot || {};
  const explicitProduct = /^LGS\d{3,4}$/i.test(productId || '') ? String(productId).toUpperCase() : '';
  const resolvedProductId = explicitProduct || productIdsFromQuery(query)[0] || '';
  if (!resolvedProductId) {
    return {
      productId: '',
      part: null,
      candidates: [],
      needsClarification: true,
      reason: 'product-scope-required',
    };
  }

  const revision = revisionFor(payload, resolvedProductId);
  const parts = mergeParts(productRows(payload, resolvedProductId)
    .map(row => partFromRow(row, resolvedProductId, revision)));
  const ranked = parts
    .map(part => ({ part, score: singlePartScore(part, query) }))
    .filter(item => item.score >= 20)
    .sort((left, right) => right.score - left.score || left.part.material_code.localeCompare(right.part.material_code));
  const bestScore = ranked[0]?.score || 0;
  const candidates = ranked.filter(item => item.score >= bestScore - 4).slice(0, 5).map(item => item.part);
  const part = candidates.length === 1 ? candidates[0] : null;
  return {
    productId: resolvedProductId,
    part,
    candidates,
    needsClarification: !part,
    reason: candidates.length > 1 ? 'multiple-parts-found' : part ? '' : 'part-not-resolved',
  };
}

function boundedEvidence(values) {
  return (Array.isArray(values) ? values : []).slice(0, 12).map(item => ({
    side: ['left', 'right'].includes(item?.side) ? item.side : '',
    page: Math.max(1, Math.min(999, Number(item?.page) || 1)),
    view: text(item?.view, 120),
    observation: text(item?.observation, 600),
  })).filter(item => item.observation);
}

function boundedSingleEvidence(values) {
  return (Array.isArray(values) ? values : []).slice(0, 12).map(item => ({
    page: Math.max(1, Math.min(999, Number(item?.page) || 1)),
    view: text(item?.view, 120),
    region: text(item?.region, 160),
    observation: text(item?.observation, 600),
  })).filter(item => item.observation);
}

function singleSourceType(value) {
  const sourceType = text(value, 40).toLowerCase();
  return SINGLE_SOURCE_TYPES.has(sourceType) ? sourceType : 'inference';
}

function technicalDatum(value, field = 'value') {
  const rawValue = value?.[field];
  const normalizedValue = field.endsWith('_mm')
    ? rawValue !== null && rawValue !== '' && Number.isFinite(Number(rawValue)) && Number(rawValue) >= 0
      ? Number(rawValue)
      : null
    : text(rawValue, 500) || null;
  return {
    [field]: normalizedValue,
    source_type: singleSourceType(value?.source_type),
    confidence: Math.max(0, Math.min(1, Number(value?.confidence) || 0)),
    evidence: boundedSingleEvidence(value?.evidence),
  };
}

export function validateSingleDrawingAnalysis(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Single drawing analysis must be an object');
  }
  const document = value.document && typeof value.document === 'object' ? value.document : {};
  const dimensions = value.overall_dimensions && typeof value.overall_dimensions === 'object'
    ? value.overall_dimensions
    : {};
  const features = (Array.isArray(value.features) ? value.features : []).slice(0, 50).map(item => ({
    type: text(item?.type, 80),
    quantity: item?.quantity !== null && item?.quantity !== ''
      && Number.isInteger(Number(item?.quantity)) && Number(item.quantity) >= 0
      ? Number(item.quantity)
      : null,
    diameter_mm: item?.diameter_mm !== null && item?.diameter_mm !== ''
      && Number.isFinite(Number(item?.diameter_mm)) && Number(item.diameter_mm) >= 0
      ? Number(item.diameter_mm)
      : null,
    positions: (Array.isArray(item?.positions) ? item.positions : []).slice(0, 20).map(position => text(position, 200)).filter(Boolean),
    details: text(item?.details, 500),
    source_type: singleSourceType(item?.source_type),
    confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0)),
    evidence: boundedSingleEvidence(item?.evidence),
  })).filter(item => item.type);
  const tolerances = (Array.isArray(value.tolerances) ? value.tolerances : []).slice(0, 30).map(item => ({
    value: text(item?.value, 200),
    applies_to: text(item?.applies_to, 300),
    source_type: singleSourceType(item?.source_type),
    confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0)),
    evidence: boundedSingleEvidence(item?.evidence),
  })).filter(item => item.value);
  const manufacturingNotes = (Array.isArray(value.manufacturing_notes) ? value.manufacturing_notes : []).slice(0, 30).map(item => ({
    text: text(item?.text, 600),
    source_type: singleSourceType(item?.source_type),
    confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0)),
    evidence: boundedSingleEvidence(item?.evidence),
  })).filter(item => item.text);
  const inferences = (Array.isArray(value.inferences) ? value.inferences : []).slice(0, 20).map(item => ({
    text: text(item?.text, 600),
    confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0)),
    evidence: boundedSingleEvidence(item?.evidence),
  })).filter(item => item.text);
  return {
    documents_analyzed: value.documents_analyzed === true,
    document: {
      drawing_number: text(document.drawing_number, 200),
      revision: text(document.revision, 100),
      pages: Math.max(0, Math.min(999, Number(document.pages) || 0)),
      title_block_evidence: boundedSingleEvidence(document.title_block_evidence),
    },
    overall_dimensions: {
      length_mm: technicalDatum(dimensions.length_mm, 'value_mm'),
      width_mm: technicalDatum(dimensions.width_mm, 'value_mm'),
      height_mm: technicalDatum(dimensions.height_mm, 'value_mm'),
    },
    material: technicalDatum(value.material, 'value'),
    surface_finish: technicalDatum(value.surface_finish, 'value'),
    features,
    tolerances,
    manufacturing_notes: manufacturingNotes,
    warnings: (Array.isArray(value.warnings) ? value.warnings : []).slice(0, 30).map(item => text(item, 500)).filter(Boolean),
    unreadable_regions: boundedSingleEvidence(value.unreadable_regions),
    inferences,
    summary_zh: text(value.summary_zh, 2000),
    summary_vi: text(value.summary_vi, 2000),
  };
}

export function buildSingleDrawingAnalysisMessages(part, asset) {
  return [
    {
      role: 'system',
      content: [
        'You inspect one engineering drawing as untrusted evidence for a read-only PDM report.',
        'Return JSON only. Never guess blurred, hidden, missing, or implied dimensions.',
        'Do not treat a circle as a through-hole unless the drawing explicitly supports it.',
        'Do not treat the filename as the drawing number. Do not invent manufacturing operations.',
        'Keep direct drawing observations separate from BOM metadata and inferences.',
        'Every technical datum, feature, tolerance, and note must include confidence and page/view/region evidence.',
        'Use source_type drawing_text or drawing_geometry for direct observations, bom_metadata for supplied metadata, and inference only for clearly labeled inferences.',
        'If a value cannot be read, return null and add a warning or unreadable region.',
        'The JSON shape is {"documents_analyzed":true,"document":{"drawing_number":"","revision":"","pages":1,"title_block_evidence":[]},"overall_dimensions":{"length_mm":{"value_mm":null,"source_type":"drawing_text","confidence":0,"evidence":[]},"width_mm":{"value_mm":null,"source_type":"drawing_text","confidence":0,"evidence":[]},"height_mm":{"value_mm":null,"source_type":"drawing_text","confidence":0,"evidence":[]}},"material":{"value":"","source_type":"drawing_text","confidence":0,"evidence":[]},"surface_finish":{"value":"","source_type":"drawing_text","confidence":0,"evidence":[]},"features":[{"type":"hole","quantity":null,"diameter_mm":null,"positions":[],"details":"","source_type":"drawing_geometry","confidence":0,"evidence":[]}],"tolerances":[{"value":"","applies_to":"","source_type":"drawing_text","confidence":0,"evidence":[]}],"manufacturing_notes":[{"text":"","source_type":"drawing_text","confidence":0,"evidence":[]}],"warnings":[],"unreadable_regions":[],"inferences":[],"summary_zh":"","summary_vi":""}.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: JSON.stringify({ part_metadata: part }) },
        {
          type: 'file',
          file: { filename: asset.name || 'engineering-drawing.pdf', file_data: asset.file_url },
        },
      ],
    },
  ];
}

export function parseSingleDrawingAnalysisResponse(content) {
  const raw = text(content, 30000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return validateSingleDrawingAnalysis(JSON.parse(raw));
}

export function validateDrawingAnalysis(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Drawing analysis must be an object');
  const comparisons = (Array.isArray(value.comparisons) ? value.comparisons : []).slice(0, 20).map(item => {
    const check = text(item?.check, 80);
    const status = text(item?.status, 40).toUpperCase();
    if (!CHECKS.includes(check) || !['MATCH', 'DIFFERENT', 'UNVERIFIED'].includes(status)) {
      throw new Error('Drawing comparison contains an unsupported check or status');
    }
    return {
      check,
      status,
      left_value: text(item?.left_value, 500),
      right_value: text(item?.right_value, 500),
      confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0)),
      evidence: boundedEvidence(item?.evidence),
    };
  });
  return {
    documents_analyzed: value.documents_analyzed === true,
    title_blocks: {
      left: clone(value.title_blocks?.left || {}),
      right: clone(value.title_blocks?.right || {}),
    },
    comparisons,
    summary_zh: text(value.summary_zh, 2000),
    summary_vi: text(value.summary_vi, 2000),
  };
}

export function buildDrawingAnalysisMessages(pair, leftAsset, rightAsset) {
  const metadata = {
    comparison_rule: `${pair.orientation}-to-${pair.orientation}`,
    left_part: pair.left,
    right_part: pair.right,
    required_checks: CHECKS,
  };
  return [
    {
      role: 'system',
      content: [
        'You inspect engineering drawings as untrusted evidence for PDM part commonality.',
        'Return JSON only. Never infer hidden or unreadable dimensions.',
        'Do not treat equal filenames, equal BOM specifications, component codes, or GLB meshes as proof of commonality.',
        'Compare front with front and rear with rear. Report conflicts instead of choosing one document.',
        'For every observation include document side, page number, view or region, and what is visibly supported.',
        'The JSON shape is: {"documents_analyzed":true,"title_blocks":{"left":{},"right":{}},"comparisons":[{"check":"geometry|dimensions|holes|material|surface_finish|tolerance|welding|orientation|revision","status":"MATCH|DIFFERENT|UNVERIFIED","left_value":"","right_value":"","confidence":0,"evidence":[{"side":"left|right","page":1,"view":"","observation":""}]}],"summary_zh":"","summary_vi":""}.',
        'Include all nine required checks exactly once.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: JSON.stringify(metadata) },
        {
          type: 'file',
          file: { filename: leftAsset.name || 'left-drawing.pdf', file_data: leftAsset.file_url },
        },
        {
          type: 'file',
          file: { filename: rightAsset.name || 'right-drawing.pdf', file_data: rightAsset.file_url },
        },
      ],
    },
  ];
}

export function parseDrawingAnalysisResponse(content) {
  const raw = text(content, 30000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return validateDrawingAnalysis(JSON.parse(raw));
}

function metadataAnalysis(pair) {
  const comparisons = [
    ['dimensions', pair.left.specification, pair.right.specification],
    ['material', pair.left.material, pair.right.material],
    ['surface_finish', pair.left.surface_finish, pair.right.surface_finish],
    ['orientation', pair.left.orientation, pair.right.orientation],
    ['revision', pair.left.revision, pair.right.revision],
  ].map(([check, leftValue, rightValue]) => ({
    check,
    status: leftValue && rightValue && normalized(leftValue) === normalized(rightValue) ? 'MATCH' : 'UNVERIFIED',
    left_value: leftValue,
    right_value: rightValue,
    confidence: 1,
    evidence: [],
  }));
  for (const check of ['geometry', 'holes', 'tolerance', 'welding']) {
    comparisons.push({
      check,
      status: 'UNVERIFIED',
      left_value: '',
      right_value: '',
      confidence: 0,
      evidence: [],
    });
  }
  return {
    documents_analyzed: false,
    title_blocks: { left: {}, right: {} },
    comparisons,
    summary_zh: '',
    summary_vi: '',
  };
}

export function deriveCommonalityStatus(analysis) {
  const comparisons = analysis?.comparisons || [];
  const different = comparisons.filter(item => item.status === 'DIFFERENT' && item.confidence >= 0.7);
  if (different.some(item => CRITICAL_DIFFERENCE_CHECKS.has(item.check))) return STATUS.NOT_COMMON;
  if (!analysis?.documents_analyzed) return STATUS.INSUFFICIENT;

  const byCheck = new Map(comparisons.map(item => [item.check, item]));
  const dimensionsMatch = byCheck.get('dimensions')?.status === 'MATCH';
  const holesMatch = byCheck.get('holes')?.status === 'MATCH';
  const evidenceCount = comparisons.reduce((count, item) => count + item.evidence.length, 0);
  if (!dimensionsMatch || !holesMatch || evidenceCount < 2) return STATUS.INSUFFICIENT;

  const requiredForConfirmation = ['geometry', 'dimensions', 'holes', 'material', 'surface_finish', 'tolerance', 'orientation', 'revision'];
  if (requiredForConfirmation.every(check => byCheck.get(check)?.status === 'MATCH')) return STATUS.CONFIRMED;
  return STATUS.LIKELY;
}

function sourceMetadata(snapshot) {
  const metadata = snapshot?.sourceMetadata || snapshot?.payload?.sourceMetadata || {};
  return {
    sourceCommit: /^[0-9a-f]{40}$/i.test(metadata.commitSha || '') ? metadata.commitSha : null,
    capturedAt: text(metadata.capturedAt, 80) || new Date().toISOString(),
  };
}

function resultEvidence(pairs, metadata) {
  if (!metadata.sourceCommit) return [];
  const seen = new Set();
  const evidence = [];
  for (const pair of pairs) {
    for (const asset of [pair.left_asset, pair.right_asset]) {
      if (!asset?.url || seen.has(asset.url)) continue;
      seen.add(asset.url);
      evidence.push({
        id: `PDM-DRAWING-${evidence.length + 1}`,
        sourceType: 'pdm-tool',
        sourceRef: asset.url,
        sourceCommit: metadata.sourceCommit,
        sourcePath: asset.path || asset.url,
        capturedAt: metadata.capturedAt,
      });
    }
  }
  return evidence.slice(0, 10);
}

function emptySingleAnalysis(part, asset) {
  return validateSingleDrawingAnalysis({
    documents_analyzed: false,
    document: {
      drawing_number: '',
      revision: '',
      pages: 0,
      title_block_evidence: [],
    },
    overall_dimensions: {},
    material: {
      value: part?.material || '',
      source_type: 'bom_metadata',
      confidence: part?.material ? 1 : 0,
      evidence: [],
    },
    surface_finish: {
      value: part?.surface_finish || '',
      source_type: 'bom_metadata',
      confidence: part?.surface_finish ? 1 : 0,
      evidence: [],
    },
    features: [],
    tolerances: [],
    manufacturing_notes: [],
    warnings: asset ? ['Drawing content has not been analyzed'] : ['Drawing document was not found'],
    unreadable_regions: [],
    inferences: [],
    summary_zh: '',
    summary_vi: '',
  });
}

function singleTechnicalEvidenceCount(analysis) {
  const dimensions = Object.values(analysis?.overall_dimensions || {});
  return [
    ...(analysis?.document?.title_block_evidence || []),
    ...dimensions.flatMap(item => item?.evidence || []),
    ...(analysis?.material?.evidence || []),
    ...(analysis?.surface_finish?.evidence || []),
    ...(analysis?.features || []).flatMap(item => item.evidence || []),
    ...(analysis?.tolerances || []).flatMap(item => item.evidence || []),
    ...(analysis?.manufacturing_notes || []).flatMap(item => item.evidence || []),
  ].length;
}

function deriveSingleDrawingStatus({ resolution, assets, analysis }) {
  if (!resolution?.part) return SINGLE_STATUS.INSUFFICIENT;
  if (assets.length === 0) return SINGLE_STATUS.DOCUMENT_NOT_FOUND;
  if (assets.length > 1) return SINGLE_STATUS.MULTIPLE_DOCUMENTS_FOUND;
  if (!analysis?.documents_analyzed || singleTechnicalEvidenceCount(analysis) === 0) return SINGLE_STATUS.INSUFFICIENT;

  const drawingRevision = normalized(analysis.document?.revision);
  const bomRevision = normalized(resolution.part?.revision);
  if (drawingRevision && bomRevision && drawingRevision !== bomRevision) return SINGLE_STATUS.REVISION_CONFLICT;
  if ((analysis.unreadable_regions || []).length > 0) return SINGLE_STATUS.PARTIALLY_READABLE;

  const technicalItems = [
    ...Object.values(analysis.overall_dimensions || {}),
    analysis.material,
    analysis.surface_finish,
    ...(analysis.features || []),
    ...(analysis.tolerances || []),
    ...(analysis.manufacturing_notes || []),
  ].filter(Boolean);
  if ((analysis.warnings || []).length > 0 || technicalItems.some(item => item.confidence > 0 && item.confidence < 0.7)) {
    return SINGLE_STATUS.SUCCESS_WITH_WARNINGS;
  }
  return SINGLE_STATUS.SUCCESS;
}

function singleResultEvidence(asset, metadata) {
  if (!metadata.sourceCommit || !asset?.url) return [];
  return [{
    id: 'PDM-DRAWING-1',
    sourceType: 'pdm-tool',
    sourceRef: asset.url,
    sourceCommit: metadata.sourceCommit,
    sourcePath: asset.path || asset.url,
    capturedAt: metadata.capturedAt,
  }];
}

export async function runSingleDrawingAnalysis({
  query,
  productId,
  snapshot,
  model,
  analyzeDocument,
} = {}) {
  const resolution = resolveSinglePartFromQuery({ query, productId, snapshot });
  const assets = resolution.part ? findPartAssets(resolution.part, snapshot) : [];
  let analysis = emptySingleAnalysis(resolution.part, assets[0]);
  let analysisError = '';
  if (resolution.part && assets.length === 1 && typeof analyzeDocument === 'function') {
    try {
      analysis = validateSingleDrawingAnalysis(await analyzeDocument(resolution.part, assets[0]));
    } catch (error) {
      analysisError = text(error?.code || error?.message || 'single-drawing-analysis-failed', 200);
    }
  }
  const metadata = sourceMetadata(snapshot);
  return {
    schemaVersion: 1,
    skill: 'engineering-drawing-analysis',
    mode: 'analyze_single',
    status: deriveSingleDrawingStatus({ resolution, assets, analysis }),
    document: {
      product_code: resolution.productId,
      material_code: resolution.part?.material_code || '',
      part_name_zh: resolution.part?.name_zh || '',
      part_name_vi: resolution.part?.name_vi || '',
      drawing_number: analysis.document.drawing_number,
      revision: analysis.document.revision,
      bom_revision: resolution.part?.revision || '',
      file_name: assets.length === 1 ? assets[0].name : '',
      pages: analysis.document.pages,
    },
    overall_dimensions: analysis.overall_dimensions,
    material: analysis.material,
    surface_finish: analysis.surface_finish,
    features: analysis.features,
    tolerances: analysis.tolerances,
    manufacturing_notes: analysis.manufacturing_notes,
    warnings: analysis.warnings,
    unreadable_regions: analysis.unreadable_regions,
    inferences: analysis.inferences,
    summary_zh: analysis.summary_zh,
    summary_vi: analysis.summary_vi,
    candidates: resolution.candidates.map(part => ({
      material_code: part.material_code,
      name_zh: part.name_zh,
      name_vi: part.name_vi,
      orientation: part.orientation,
    })),
    documents: assets.map(asset => ({ name: asset.name, url: asset.url, path: asset.path })),
    unresolved_reason: resolution.reason,
    analysis_error: analysisError,
    analysis_model: model || '',
    engineering_confirmation_required: true,
    evidence: singleResultEvidence(assets.length === 1 ? assets[0] : null, metadata),
    stages: [
      'resolve_part_from_query',
      'find_part_assets',
      'check_document_revision',
      'extract_pdf_content',
      'analyze_drawing_regions',
      'validate_structured_observations',
      'generate_single_drawing_report',
    ],
  };
}

export async function runDrawingCommonalityCheck({
  query,
  snapshot,
  model,
  analyzePair,
} = {}) {
  const resolution = resolvePartsFromQuery({ query, snapshot });
  const analyzedPairs = [];
  for (const pair of resolution.pairs) {
    const leftAsset = findPartAssets(pair.left, snapshot)[0] || null;
    const rightAsset = findPartAssets(pair.right, snapshot)[0] || null;
    let analysis = metadataAnalysis(pair);
    let analysisError = '';
    if (leftAsset && rightAsset && typeof analyzePair === 'function') {
      try {
        analysis = validateDrawingAnalysis(await analyzePair(pair, leftAsset, rightAsset));
      } catch (error) {
        analysisError = text(error?.code || error?.message || 'drawing-analysis-failed', 200);
      }
    }
    analyzedPairs.push({
      ...pair,
      left_asset: leftAsset,
      right_asset: rightAsset,
      analysis,
      status: deriveCommonalityStatus(analysis),
      analysis_error: analysisError,
    });
  }

  const statuses = analyzedPairs.map(pair => pair.status);
  const status = statuses.includes(STATUS.NOT_COMMON)
    ? STATUS.NOT_COMMON
    : statuses.length > 0 && statuses.every(value => value === STATUS.CONFIRMED)
      ? STATUS.CONFIRMED
      : statuses.some(value => value === STATUS.LIKELY || value === STATUS.CONFIRMED)
        ? STATUS.LIKELY
        : STATUS.INSUFFICIENT;
  const metadata = sourceMetadata(snapshot);
  return {
    schemaVersion: 1,
    skill: 'engineering-drawing-commonality-check',
    status,
    summary_zh: analyzedPairs.map(pair => pair.analysis.summary_zh).filter(Boolean).join('\n'),
    summary_vi: analyzedPairs.map(pair => pair.analysis.summary_vi).filter(Boolean).join('\n'),
    pairs: analyzedPairs,
    unresolved_reason: resolution.reason,
    engineering_confirmation_required: true,
    analysis_model: model || '',
    evidence: resultEvidence(analyzedPairs, metadata),
    stages: [
      'resolve_parts_from_query',
      'find_part_assets',
      'extract_pdf_content',
      'analyze_drawing_regions',
      'compare_drawing_requirements',
      'generate_commonality_report',
    ],
  };
}

export {
  CHECKS as DRAWING_COMMONALITY_CHECKS,
  SINGLE_STATUS as SINGLE_DRAWING_STATUS,
  STATUS as DRAWING_COMMONALITY_STATUS,
};
