// src/features/ai-assistant/pdm-equivalence.js
// BOM equivalence matching and cross-product data-quality warning engine.

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00d7*]/g, 'x')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function compactText(value) {
  return normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

function extractDimensions(specification) {
  const matches = normalizeText(specification).match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

function sameDimensions(left, right) {
  return left.length > 0 && left.length === right.length &&
    left.every((value, index) => Math.abs(value - right[index]) < 0.01);
}

function extractPosition(name) {
  const normalized = normalizeText(name);
  if (/left|左/.test(normalized)) return 'left';
  if (/right|右/.test(normalized)) return 'right';
  if (/front|前/.test(normalized)) return 'front';
  if (/rear|back|后/.test(normalized)) return 'rear';
  if (/top|上|顶/.test(normalized)) return 'top';
  if (/bottom|下|底/.test(normalized)) return 'bottom';
  return 'unspecified';
}

function coreName(name) {
  return normalizeText(name)
    .replace(/^lgs\d{3,4}(?:(?:_|-)(?:lgs)?\d{3,4})*[-_]?/i, '')
    .replace(/[\s_-]+/g, '')
    .trim();
}

function isProductSpecificPrintedItem(name) {
  const normalized = normalizeText(name);
  if (/说明书|组装说明|安装说明|\bmanual\b|\binstruction\b/i.test(normalized)) {
    return true;
  }
  if (/(?:外箱|内盒|彩盒|纸箱)/i.test(normalized)) {
    if (/护角|纸卡|纸板|蜂窝/i.test(normalized)) {
      return false;
    }
    return true;
  }
  return false;
}

function assetLocator(asset) {
  return normalizeText(asset?.sourceUrl || asset?.previewUrl || asset?.url || asset?.path || '');
}

function collectItemAssets(item, snapshot, productId) {
  const payload = snapshot?.payload || snapshot || {};
  const assets = [];
  const material = payload?.materialDb?.materials?.[item.materialId];
  if (material) {
    assets.push(...(material.drawings || []), ...(material.models3d || []));
  }

  const materialCode = compactText(item.matCode);
  if (!productId || !materialCode) return assets;

  for (const collectionName of ['drawings', 'models3d']) {
    const bucket = payload?.[collectionName]?.[productId] || {};
    for (const [key, value] of Object.entries(bucket)) {
      const keyCode = compactText(String(key).split('|')[0]);
      if (keyCode !== materialCode) continue;
      if (Array.isArray(value)) assets.push(...value);
      else if (value && typeof value === 'object') assets.push(value);
    }
  }
  return assets;
}

function compareAssets(item1, item2, snapshot, productId1, productId2) {
  const assets1 = collectItemAssets(item1, snapshot, productId1);
  const assets2 = collectItemAssets(item2, snapshot, productId2);
  const locators1 = new Set(assets1.map(assetLocator).filter(Boolean));
  const locators2 = new Set(assets2.map(assetLocator).filter(Boolean));
  const names1 = new Set(assets1.map(asset => compactText(asset?.matched_name || asset?.matchedName || asset?.name)).filter(Boolean));
  const names2 = new Set(assets2.map(asset => compactText(asset?.matched_name || asset?.matchedName || asset?.name)).filter(Boolean));
  return {
    sameLocator: [...locators1].some(locator => locators2.has(locator)),
    sameName: [...names1].some(name => names2.has(name)),
  };
}

/**
 * Evaluate whether two non-identical BOM rows are evidence-backed equivalents.
 */
export function evaluateEquivalence(item1, item2, snapshot = {}, context = {}) {
  const materialId1 = normalizeText(item1.materialId);
  const materialId2 = normalizeText(item2.materialId);
  const code1 = normalizeText(item1.matCode);
  const code2 = normalizeText(item2.matCode);
  const componentCode1 = normalizeText(item1.componentCode);
  const componentCode2 = normalizeText(item2.componentCode);
  const name1 = item1.nameZh || item1.nameVi || '';
  const name2 = item2.nameZh || item2.nameVi || '';
  const spec1 = item1.spec || item1.specZh || '';
  const spec2 = item2.spec || item2.specZh || '';
  const dimensions1 = extractDimensions(spec1);
  const dimensions2 = extractDimensions(spec2);
  const position1 = extractPosition(name1);
  const position2 = extractPosition(name2);
  const reasons = [];
  const conflicts = [];
  let score = 0;

  if ((materialId1 && materialId1 === materialId2) || (code1 && code1 === code2)) {
    return {
      isExact: true,
      isProbable: false,
      confidence: 'exact',
      score: 100,
      reasons: ['exact_material_identity'],
      conflicts: [],
    };
  }

  if (isProductSpecificPrintedItem(name1) || isProductSpecificPrintedItem(name2)) {
    return {
      isExact: false,
      isProbable: false,
      confidence: 'none',
      score: 0,
      reasons: [],
      conflicts: ['product_specific_printed_item'],
    };
  }

  if (componentCode1 && componentCode1 === componentCode2) {
    score += 1;
    reasons.push('matching_component_code');
  }

  if (sameDimensions(dimensions1, dimensions2)) {
    score += 2;
    reasons.push('matching_dimensions');
  } else if (dimensions1.length > 0 && dimensions2.length > 0) {
    conflicts.push('dimension_mismatch');
  }

  const normalizedCoreName1 = coreName(name1);
  const normalizedCoreName2 = coreName(name2);
  if (normalizedCoreName1 && normalizedCoreName1 === normalizedCoreName2) {
    score += 3;
    reasons.push('matching_core_name');
  }

  if (position1 !== 'unspecified' && position2 !== 'unspecified' && position1 !== position2) {
    conflicts.push('position_conflict');
  }

  const material1 = normalizeText(item1.materialZh);
  const material2 = normalizeText(item2.materialZh);
  if (material1 && material1 === material2) {
    score += 1;
    reasons.push('matching_material');
  }

  const assetMatch = compareAssets(
    item1,
    item2,
    snapshot,
    context.productId1,
    context.productId2,
  );
  if (assetMatch.sameLocator) {
    score += 6;
    reasons.push('identical_asset_locator');
  } else if (assetMatch.sameName) {
    score += 4;
    reasons.push('matching_asset_name');
  }

  if ((item1.hasChildren || item2.hasChildren) && !assetMatch.sameLocator) {
    conflicts.push('assembly_composition_unverified');
  }

  const isProbable = score >= 5 && conflicts.length === 0;
  return {
    isExact: false,
    isProbable,
    confidence: isProbable ? (score >= 8 ? 'high' : 'medium') : 'none',
    score,
    reasons,
    conflicts,
  };
}

/**
 * Report only cross-product candidates that have strong relationship evidence
 * but conflicting BOM attributes. This avoids unrelated within-BOM comparisons.
 */
export function detectDataQualityWarnings(rows1 = [], rows2 = [], snapshot = {}, context = {}) {
  const warnings = [];
  const seen = new Set();

  for (const item1 of rows1) {
    for (const item2 of rows2) {
      const evaluation = evaluateEquivalence(item1, item2, snapshot, context);
      const hasAssetRelationship = evaluation.reasons.includes('identical_asset_locator') ||
        evaluation.reasons.includes('matching_asset_name');
      if (evaluation.conflicts.length === 0 || !hasAssetRelationship) continue;
      const key = `${item1.materialId || item1.matCode}|${item2.materialId || item2.matCode}|${evaluation.conflicts.join('|')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      warnings.push({
        type: 'cross_product_equivalence_conflict',
        product1: context.productId1 || 'Product 1',
        product2: context.productId2 || 'Product 2',
        item1: item1.nameZh || item1.nameVi || item1.matCode,
        item2: item2.nameZh || item2.nameVi || item2.matCode,
        conflicts: evaluation.conflicts,
        reasons: evaluation.reasons,
        message: `${item1.nameZh || item1.matCode} and ${item2.nameZh || item2.matCode} have relationship evidence but conflicting BOM attributes.`,
      });
      if (warnings.length >= 100) return warnings;
    }
  }

  return warnings;
}
