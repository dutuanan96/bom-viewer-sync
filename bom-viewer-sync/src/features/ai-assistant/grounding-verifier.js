const MAX_COMPARISON_RESULTS = 100;

function invalid(message) {
  const error = new Error(`Invalid grounded PDM result: ${message}`);
  error.code = 'AI_GROUNDING_INVALID';
  return error;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${label} is missing`);
}

function requireBoundedArrays(result, names, max) {
  for (const name of names) {
    if (!Array.isArray(result[name])) throw invalid(`${name} must be an array`);
    if (result[name].length > max) throw invalid(`${name} is not bounded`);
  }
}

function verifyComparison(route, result) {
  requireObject(result.product1, 'product1');
  requireObject(result.product2, 'product2');
  requireObject(result.summary, 'summary');
  const expected = route.entities?.productIds || [];
  if (expected.length !== 2 || result.product1.productCode !== expected[0] || result.product2.productCode !== expected[1]) {
    throw invalid('comparison product identity does not match the route');
  }
  for (const name of ['commonCount', 'onlyProduct1Count', 'onlyProduct2Count', 'quantityOrUnitDifferenceCount', 'similarityScore']) {
    if (!Number.isFinite(result.summary[name])) throw invalid(`summary ${name} is missing`);
  }
  requireObject(result.summary.commonByAttribute, 'attribute coverage');
  requireObject(result.summary.commonByMaterialFamily, 'material family coverage');
  requireBoundedArrays(result, ['common', 'onlyProduct1', 'onlyProduct2', 'quantityOrUnitDifferences'], MAX_COMPARISON_RESULTS);
  if (!Array.isArray(result.evidence) || result.evidence.length !== 2) throw invalid('two product evidence records are required');
  if (result.evidence[0]?.recordId !== expected[0] || result.evidence[1]?.recordId !== expected[1]) {
    throw invalid('evidence product identity does not match the route');
  }
  return [
    `Explain the exact comparison scope for ${expected[0]} and ${expected[1]}.`,
    'Treat exact materialId as BOM identity.',
    'Report attribute and physical material-family counts separately.',
    'Disclose explicit, inferred, and unknown material classifications.',
    'State whether any result array is truncated.',
  ].join('\n');
}

function verifyRevision(route, result) {
  const productId = route.entities?.productIds?.[0];
  if (!productId || (result.productCode || result.productId) !== productId) throw invalid('revision product identity does not match the route');
  if (!result.currentRevision || !result.effectiveRevision) throw invalid('current and effective revisions are required');
  if (!result.evidence || typeof result.evidence !== 'object') throw invalid('revision evidence is required');
  return `Explain current and effective revision separately for ${productId}.`;
}

function verifyBom(route, result) {
  const productId = route.entities?.productIds?.[0];
  if (!productId || result.productCode !== productId) throw invalid('BOM product identity does not match the route');
  if (!Array.isArray(result.rows) || result.rows.length > 200) throw invalid('BOM rows are missing or not bounded');
  if (!result.evidence || typeof result.evidence !== 'object') throw invalid('BOM evidence is required');
  return `State the product, color, row count, and truncation status for ${productId}.`;
}

export function verifyGrounding({ route, toolCall, toolResult } = {}) {
  if (route?.confidence !== 'deterministic') return Object.freeze({ valid: true, requirements: '' });
  if (!toolCall?.name || toolCall.name !== route.preferredTool) throw invalid('preferred tool does not match the executed tool');
  if (toolResult === null || toolResult === undefined) throw invalid('tool result is missing');

  let requirements = 'Use only the trusted local PDM result and disclose its exact scope.';
  if (toolCall.name === 'compare_boms') requirements = verifyComparison(route, toolResult);
  else if (toolCall.name === 'get_revision_history') requirements = verifyRevision(route, toolResult);
  else if (toolCall.name === 'get_bom') requirements = verifyBom(route, toolResult);
  else if (toolCall.name === 'search_products') {
    if (!Array.isArray(toolResult) || toolResult.length > 50) throw invalid('product search results are missing or not bounded');
    requirements = 'State that product search results are bounded and use only returned canonical product codes.';
  } else {
    requireObject(toolResult, 'tool result');
  }

  return Object.freeze({ valid: true, requirements });
}
