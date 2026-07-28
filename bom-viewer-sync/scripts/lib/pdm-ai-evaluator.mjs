const SCORE_WEIGHTS = Object.freeze({
  product: 15,
  material: 15,
  quantity: 20,
  ambiguity: 15,
  hallucination: 15,
  context: 10,
  bilingual: 10,
});

const NO_DATA_PATTERNS = [
  /kh[oô]ng c[oó] (?:dữ liệu|thông tin)/iu,
  /chưa c[oó] (?:dữ liệu|thông tin)/iu,
  /kh[oô]ng (?:chứa|lưu|bao gồm) (?:dữ liệu|thông tin)/iu,
  /kh[oô]ng c[oó]/iu,
  /kh[oô]ng (?:tìm|xác định|cung cấp)/iu,
  /没有(?:数据|信息)/u,
  /没有(?:存储|包含|提供)/u,
  /没有/u,
  /不包含/u,
  /不在.{0,24}(?:记录|BOM)/u,
  /未(?:找到|提供|记录)/u,
  /无法(?:确定|查询)/u,
  /不是.{0,24}(?:库存|存量)/u,
  /而非.{0,24}(?:库存|存量)/u,
  /不(?:提供|包含).{0,24}(?:库存|存量)/u,
  /không phải.{0,30}(?:tồn kho|hàng tồn)/iu,
  /\bnot (?:available|found|provided)\b/iu,
  /\bnot (?:current )?inventory\b/iu,
];

function normalized(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function flattenExpectedValue(value) {
  if (Array.isArray(value)) return value.flatMap(flattenExpectedValue);
  if (value === null || value === undefined || typeof value === 'boolean') return [];
  return [String(value)];
}

function containsValue(haystack, value) {
  return normalized(haystack).includes(normalized(value));
}

function fieldsPresent(haystack, fact, fieldNames) {
  const missing = [];
  for (const fieldName of fieldNames) {
    if (['not_found', 'needs_confirmation'].includes(fieldName)) continue;
    const values = flattenExpectedValue(fact[fieldName]);
    if (values.length > 0 && !values.every(value => containsValue(haystack, value))) {
      missing.push(fieldName);
    }
  }
  return missing;
}

function hasNoDataDisclosure(answer) {
  return NO_DATA_PATTERNS.some(pattern => pattern.test(String(answer || '')));
}

function applicableFields(testCase, fact, names) {
  return testCase.assertFields.some(fieldName => names.includes(fieldName) && fact[fieldName] !== undefined);
}

export function evaluatePdmCase({ testCase, fact, answer = '', evidence = null, contextual = false }) {
  const evidenceText = evidence ? JSON.stringify(evidence) : '';
  const retrievalHaystack = `${answer}\n${evidenceText}`;
  const missingFields = fieldsPresent(retrievalHaystack, fact, testCase.assertFields);
  const forbiddenValues = fact.forbidden_values || [];
  const forbiddenFound = forbiddenValues.filter(value => containsValue(answer, value));
  const expectsNoData = fact.not_found === true;
  const noDataDisclosed = !expectsNoData || hasNoDataDisclosure(answer);
  const needsConfirmation = fact.needs_confirmation === true;
  const confirmationDisclosed = !needsConfirmation || noDataDisclosed || /确认|澄清|请问|xác nhận|làm rõ|ý bạn/iu.test(answer);

  const productRelevant = applicableFields(testCase, fact, ['product_code', 'product_codes', 'sku', 'colors', 'width_mm', 'widths_mm', 'difference_mm']);
  const materialRelevant = applicableFields(testCase, fact, ['material_code', 'material_id', 'specification', 'suggested_specification', 'bom_level']);
  const quantityRelevant = applicableFields(testCase, fact, ['quantity_raw', 'quantity_normal', 'quantity_spare', 'suggested_quantity_raw']);
  const productMissing = missingFields.filter(field => ['product_code', 'product_codes', 'sku', 'colors', 'width_mm', 'widths_mm', 'difference_mm'].includes(field));
  const materialMissing = missingFields.filter(field => ['material_code', 'material_id', 'specification', 'suggested_specification', 'bom_level'].includes(field));
  const quantityMissing = missingFields.filter(field => ['quantity_raw', 'quantity_normal', 'quantity_spare', 'suggested_quantity_raw'].includes(field));

  const criteria = {
    product: !productRelevant || productMissing.length === 0,
    material: !materialRelevant || materialMissing.length === 0,
    quantity: !quantityRelevant || quantityMissing.length === 0,
    ambiguity: noDataDisclosed && confirmationDisclosed,
    hallucination: forbiddenFound.length === 0 && noDataDisclosed,
    context: !contextual || missingFields.length === 0,
    bilingual: true,
  };
  const score = Object.entries(SCORE_WEIGHTS)
    .reduce((total, [name, weight]) => total + (criteria[name] ? weight : 0), 0);

  return {
    score,
    result: score >= 95 ? 'pass' : 'fail',
    criteria,
    missingFields,
    forbiddenFound,
    noDataDisclosed,
    confirmationDisclosed,
  };
}

export function compareBilingualPair(left, right) {
  const leftFact = left?.fact || {};
  const rightFact = right?.fact || {};
  const fields = [
    'product_code',
    'product_codes',
    'color',
    'colors',
    'sku',
    'material_code',
    'material_id',
    'specification',
    'quantity_raw',
    'quantity_normal',
    'quantity_spare',
    'bom_level',
    'not_found',
    'needs_confirmation',
  ];
  const mismatches = fields.filter(field => (
    leftFact[field] !== undefined
    && rightFact[field] !== undefined
    && JSON.stringify(leftFact[field]) !== JSON.stringify(rightFact[field])
  ));
  return {
    consistent: mismatches.length === 0
      && left?.evaluation?.missingFields.length === 0
      && right?.evaluation?.missingFields.length === 0,
    mismatches,
  };
}

export function summarizePdmEvaluation(results, bilingualResults = []) {
  const completed = results.length;
  const averageScore = completed
    ? Number((results.reduce((sum, result) => sum + result.evaluation.score, 0) / completed).toFixed(2))
    : 0;
  const criticalFailures = results.filter(result => (
    result.evaluation.forbiddenFound.length > 0
    || result.evaluation.criteria.product === false
    || result.evaluation.criteria.quantity === false
    || result.evaluation.criteria.hallucination === false
  ));
  return {
    completed,
    passed: results.filter(result => result.evaluation.result === 'pass').length,
    failed: results.filter(result => result.evaluation.result !== 'pass').length,
    averageScore,
    criticalFailureCount: criticalFailures.length,
    criticalFailureIds: criticalFailures.map(result => result.testCase.id),
    bilingualPairs: bilingualResults.length,
    bilingualConsistent: bilingualResults.filter(result => result.consistent).length,
  };
}

export { SCORE_WEIGHTS };
