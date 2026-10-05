export function buildWeldedFootPackagingProposal(payload) {
  const materials = Object.values(payload.materialDb.materials);
  const entries = payload.materialDb.bomEntries;
  const find = (code) => {
    const material = materials.find((item) => item.code === code);
    if (!material) throw new Error(`Missing material ${code}.`);
    return material;
  };
  const operations = [];
  const packagingNotes = [];
  for (const [productCode, revision, length, oldBag, newBag, oldQuantity, remainingQuantity, stems] of [
    ['LGS433', 'V5', 1098, 'PE1160X60', 'PE1160X120', '2', 1, ['LGS433XQHL', 'LGS433XHHL']],
    ['LGS434', 'V6', 760, 'PE830X60', 'PE830X120', '4', 3, ['LGS434XQZHL', 'LGS434XHZHL']],
  ]) {
    const record = payload.productRevisions[productCode];
    if (record?.currentRevision !== revision || record.currentRevisionInfo?.workflowState !== 'draft') {
      throw new Error(`Expected ${productCode} ${revision} draft.`);
    }
    for (const stem of stems) for (const suffix of ['WH', 'BH']) {
      const material = find(`${stem}${suffix}`);
      if (material.spec?.zh !== `${length}x15x15mm`) throw new Error(`Unexpected origin specification for ${material.code}.`);
      const footPipe = find('FG1515066013');
      const footCap = find(`M6GS1515${suffix}`);
      for (const [child, quantity] of [[footPipe, 0.007407], [footCap, 1]]) {
        const relation = entries.find((item) => item.parentType === 'material' && item.parentId === material.id
          && (item.childMaterialId || item.materialId) === child.id);
        if (!relation || Number(relation.qty) !== quantity) throw new Error(`Missing welded-foot dependency ${material.code}/${child.code}.`);
      }
      for (const registry of Object.values(payload.productRevisions)) {
        if ((registry.revisions || []).some((revision) => revision.snapshot?.materialDb?.materials?.[material.id])) {
          throw new Error(`Historical material reference: ${material.code}.`);
        }
      }
      operations.push({ operationType: 'update_material', targetId: material.id,
        payload: { patch: { spec: { zh: `${length}x62x15mm`, vi: `${length}x62x15mm` } } } });
    }
    if (materials.some((item) => item.code === newBag)) throw new Error(`Material code collision: ${newBag}.`);
    const predecessor = find(oldBag);
    const newId = `mat_${newBag.toLowerCase()}`;
    if (payload.materialDb.materials[newId]) throw new Error(`Material id collision: ${newId}.`);
    const bagLength = productCode === 'LGS433' ? 1160 : 830;
    operations.push({ operationType: 'create_material', targetId: newId, payload: { material: {
      code: newBag, name: predecessor.name, spec: { zh: `${bagLength}×120mm`, vi: `${bagLength}×120mm` },
      material: predecessor.material, color: predecessor.color, attr: predecessor.attr,
      unit: predecessor.unit, drawings: [], models3d: [],
    } } });
    for (const color of Object.keys(payload.bom[productCode].color_info)) {
      const row = entries.find((item) => item.parentType === 'product'
        && (item.productCode || item.parentId) === productCode && item.color === color && item.materialId === predecessor.id);
      if (!row || String(row.qty) !== oldQuantity) throw new Error(`Unexpected original packaging ${productCode}/${color}.`);
      const suffix = color === '白色' ? 'WH' : 'BH';
      for (const stem of stems) {
        const rail = find(`${stem}${suffix}`);
        const railRow = entries.find((item) => item.parentType === 'product'
          && (item.productCode || item.parentId) === productCode && item.color === color && item.materialId === rail.id);
        if (!railRow || String(railRow.qty) !== '1') throw new Error(`Unexpected welded rail quantity ${productCode}/${color}/${rail.code}.`);
      }
      const remainingRails = productCode === 'LGS433'
        ? [[`LGS433SQHLDEPV5${suffix}`, 2]]
        : [[`LGS334XQYHL${suffix}`, 1], [`LGS334XHYHL${suffix}`, 1],
          [`LGS434SZHLDEP${suffix}`, 2], [`LGS434SYHLDEP${suffix}`, 2], [`LGS434DBHL${suffix}`, 2]];
      for (const [code, quantity] of remainingRails) {
        const rail = find(code);
        const matching = entries.filter((item) => item.parentType === 'product'
          && (item.productCode || item.parentId) === productCode && item.color === color && item.materialId === rail.id);
        if (matching.length !== 1 || Number(matching[0].qty) !== quantity) throw new Error(`Unexpected remaining rail ${productCode}/${color}/${code}.`);
      }
      const oldRemark = `包装对象：${remainingRails.map(([code, qty]) => `${code}×${qty}`).join('、')}\n规则：${productCode === 'LGS433' ? '2件/袋；用袋：1袋' : '2–3件/袋；用袋：3袋；分袋：3+3+2；合计：8件'}`;
      const newRemark = `包装对象：${stems.map((stem) => `${stem}${suffix}×1`).join('、')}\n规则：2件/袋；用袋：1袋；含焊接底脚组件`;
      operations.push({ operationType: 'update_bom_item', targetId: row.id,
        payload: { comp_code: row.comp_code || '', quantity: remainingQuantity, remark: oldRemark } });
      operations.push({ operationType: 'add_bom_item', targetId: productCode,
        payload: { color, comp_code: '', materialId: newId, quantity: 1, remark: newRemark } });
      packagingNotes.push({ productCode, color, oldBag, newBag,
        weldedRails: stems.map((stem) => `${stem}${suffix}`), remainingQuantity,
        remainingPacking: productCode === 'LGS433' ? '2 top rails / 1 bag' : '8 unwelded rails / 3 bags (3+3+2)',
        newPacking: '2 welded rails / 1 bag',
        oldRemark: row.remark || '',
        updatedOldRemark: oldRemark,
        newRemark,
      });
    }
  }
  return { summary: 'ECN welded-foot finished dimensions and PE packaging', operations, packagingNotes };
}
