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
  for (const name of ['commonCount', 'probableCommonCount', 'dataQualityWarningCount', 'onlyProduct1Count', 'onlyProduct2Count', 'quantityOrUnitDifferenceCount', 'similarityScore']) {
    if (!Number.isFinite(result.summary[name])) throw invalid(`summary ${name} is missing`);
  }
  requireObject(result.summary.commonByAttribute, 'attribute coverage');
  requireObject(result.summary.commonByMaterialFamily, 'material family coverage');
  requireBoundedArrays(result, ['common', 'probableCommon', 'dataQualityWarnings', 'onlyProduct1', 'onlyProduct2', 'quantityOrUnitDifferences'], MAX_COMPARISON_RESULTS);
  if (typeof result.truncated !== 'boolean') throw invalid('comparison truncation status is required');
  if (!Array.isArray(result.evidence) || result.evidence.length !== 2) throw invalid('two product evidence records are required');
  if (result.evidence[0]?.recordId !== expected[0] || result.evidence[1]?.recordId !== expected[1]) {
    throw invalid('evidence product identity does not match the route');
  }
  return [
    `Explain the exact comparison scope for ${expected[0]} and ${expected[1]}.`,
    'Use tiered matching: exact materialId identity, evidence-backed probable equivalence, and unresolved data conflicts.',
    'Distinguish exact common, probable common, and suspicious records requiring verification.',
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

function verifyRevisionComparison(route, result) {
  const productId = route.entities?.productIds?.[0];
  const revisions = route.entities?.revisions || [];
  if (!productId || result.productId !== productId) throw invalid('revision comparison product identity does not match the route');
  if (revisions.length !== 2 || result.revision1?.revision !== revisions[0] || result.revision2?.revision !== revisions[1]) {
    throw invalid('revision comparison scope does not match the route');
  }
  requireObject(result.summary, 'revision comparison summary');
  requireBoundedArrays(result, ['added', 'removed', 'modified'], MAX_COMPARISON_RESULTS);
  if (!Array.isArray(result.evidence) || result.evidence.length !== 2) throw invalid('two revision evidence records are required');
  return `State the exact ${productId} revision scope, change counts, change reasons, and truncation status.`;
}

function verifyPdmSearch(result) {
  requireBoundedArrays(result, ['products', 'materials', 'revisions'], 50);
  if (!result.evidence || typeof result.evidence !== 'object') throw invalid('PDM search evidence is required');
  if (typeof result.truncated !== 'boolean') throw invalid('PDM search truncation status is required');
  if (result.matchMode === 'scoped-candidates') {
    return 'Reason over the bounded bilingual candidates. Answer only if one interpretation is clearly supported and label it as semantic inference; otherwise ask one concise clarification within the exact product scope. Never dump candidate rows.';
  }
  if (result.matchMode === 'scoped-empty') {
    return 'State that the scoped product has no searchable BOM data and ask the user to confirm product, color, or revision.';
  }
  if (result.matchMode === 'mapping-miss') {
    return 'Disclose that the confirmed phrase mapping does not exist in the current product BOM and ask the user to confirm the component, product, or revision.';
  }
  return 'Explain which normalized PDM entities matched, their BOM usage scope, and whether results are truncated.';
}

export function verifyGrounding({ route, toolCall, toolResult } = {}) {
  if (route?.confidence !== 'deterministic') return Object.freeze({ valid: true, requirements: '' });
  if (!toolCall?.name || toolCall.name !== route.preferredTool) throw invalid('preferred tool does not match the executed tool');
  if (toolResult === null || toolResult === undefined) throw invalid('tool result is missing');

  let requirements = 'Use only the trusted local PDM result and disclose its exact scope.';
  if (toolCall.name === 'compare_boms') requirements = verifyComparison(route, toolResult);
  else if (toolCall.name === 'compare_revisions') requirements = verifyRevisionComparison(route, toolResult);
  else if (toolCall.name === 'get_revision_history') requirements = verifyRevision(route, toolResult);
  else if (toolCall.name === 'get_bom') requirements = verifyBom(route, toolResult);
  else if (toolCall.name === 'search_pdm') requirements = verifyPdmSearch(toolResult);
  else if (toolCall.name === 'analyze_pdm') {
    requireObject(toolResult, 'tool result');
    if (!Array.isArray(toolResult.results) || toolResult.results.length > 50) throw invalid('catalog analysis results are missing or not bounded');
    if (typeof toolResult.truncated !== 'boolean') throw invalid('catalog analysis truncation status is required');
    if (toolResult.needsClarification && !toolResult.clarificationText) throw invalid('catalog analysis clarification text is required');
    if (!toolResult.evidence || typeof toolResult.evidence !== 'object') throw invalid('catalog analysis evidence is required');
    requirements = 'State the interpretation, exact scope, count mode, assumptions, and truncation status. If needsClarification is true, ask the clarification prompt.';
  }
  else if (toolCall.name === 'list_recent_changes') {
    requireBoundedArrays(toolResult, ['changes'], 50);
    if (!toolResult.evidence || typeof toolResult.evidence !== 'object') throw invalid('recent change evidence is required');
    requirements = 'State the date range represented by the returned change records and whether results are truncated.';
  }
  else if (toolCall.name === 'search_products') {
    if (!Array.isArray(toolResult) || toolResult.length > 50) throw invalid('product search results are missing or not bounded');
    requirements = 'State that product search results are bounded and use only returned canonical product codes.';
  } else {
    requireObject(toolResult, 'tool result');
  }

  return Object.freeze({ valid: true, requirements });
}
