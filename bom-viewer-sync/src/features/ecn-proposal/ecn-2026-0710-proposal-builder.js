/**
 * Proposal Builder for ECN-2026-0710-LGS Rev 1.4 (Height reduction to 671 mm)
 * Browser-compatible ESM module. No Node.js APIs.
 * Generates valid proposal operations conforming to contracts.js schema.
 * Reuses existing 3D models and 2D drawings from predecessor materials without guessing or hardcoding URLs.
 */

export const CHANGE_REASON = 'ECN-2026-0710-LGS: 高度变更至671mm，侧框647mm，底脚变更为41底脚。';

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function cleanAsset(asset) {
  if (!asset) return null;
  const url = asset.url || asset.previewUrl;
  if (!url) return null;
  const cleaned = {
    name: String(asset.name || 'asset'),
    url: String(url),
  };
  if (asset.previewUrl) cleaned.previewUrl = String(asset.previewUrl);
  if (asset.path) cleaned.path = String(asset.path);
  return cleaned;
}

export const EXACT_2D_DRAWINGS = {
  "LGS043ZKBH647": {
    "name": "LGS043-S-左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs043zkbh647-4704d4b5.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs043zkbh647-4704d4b5.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs043zkbh647-4704d4b5.pdf"
  },
  "LGS043YKBH647": {
    "name": "LGS043-S-右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs043ykbh647-05375de2.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs043ykbh647-05375de2.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs043ykbh647-05375de2.pdf"
  },
  "LGS132ZKBH647": {
    "name": "LGS232_132-S-侧框左.pdf",
    "path": "drawings/catalog/drawing-lgs132zkbh647-ff6261d9.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs132zkbh647-ff6261d9.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs132zkbh647-ff6261d9.pdf"
  },
  "LGS132YKBH647": {
    "name": "LGS232_132-S-侧框右.pdf",
    "path": "drawings/catalog/drawing-lgs132ykbh647-45f568c7.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs132ykbh647-45f568c7.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs132ykbh647-45f568c7.pdf"
  },
  "LGS033ZKBH647": {
    "name": "LGS033左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs033zkbh647-7ed39cf2.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs033zkbh647-7ed39cf2.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs033zkbh647-7ed39cf2.pdf"
  },
  "LGS033YKBH647": {
    "name": "LGS033右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs033ykbh647-ded5d4e7.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs033ykbh647-ded5d4e7.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs033ykbh647-ded5d4e7.pdf"
  },
  "LGS033ZKWH647": {
    "name": "LGS033左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs033zkwh647-7ed39cf2.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs033zkwh647-7ed39cf2.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs033zkwh647-7ed39cf2.pdf"
  },
  "LGS033YKWH647": {
    "name": "LGS033右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs033ykwh647-ded5d4e7.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs033ykwh647-ded5d4e7.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs033ykwh647-ded5d4e7.pdf"
  },
  "LGS133ZKBH647": {
    "name": "LGS133左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs133zkbh647-f5c5947b.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs133zkbh647-f5c5947b.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs133zkbh647-f5c5947b.pdf"
  },
  "LGS133YKBH647": {
    "name": "LGS133右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs133ykbh647-e9e5445a.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs133ykbh647-e9e5445a.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs133ykbh647-e9e5445a.pdf"
  },
  "LGS233ZKBH647": {
    "name": "LGS233左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs233zkbh647-3b3d4fc4.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs233zkbh647-3b3d4fc4.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs233zkbh647-3b3d4fc4.pdf"
  },
  "LGS233YKBH647": {
    "name": "LGS233右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs233ykbh647-9b4d4259.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs233ykbh647-9b4d4259.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs233ykbh647-9b4d4259.pdf"
  },
  "LGS233ZKWH647": {
    "name": "LGS233左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs233zkwh647-3b3d4fc4.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs233zkwh647-3b3d4fc4.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs233zkwh647-3b3d4fc4.pdf"
  },
  "LGS233YKWH647": {
    "name": "LGS233右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs233ykwh647-9b4d4259.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs233ykwh647-9b4d4259.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs233ykwh647-9b4d4259.pdf"
  },
  "LGS333ZKBH647": {
    "name": "LGS333-433左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs333zkbh647-4e4b17b0.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs333zkbh647-4e4b17b0.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs333zkbh647-4e4b17b0.pdf"
  },
  "LGS333YKBH647": {
    "name": "LGS333-433右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs333ykbh647-93ba9266.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs333ykbh647-93ba9266.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs333ykbh647-93ba9266.pdf"
  },
  "LGS333ZKWH647": {
    "name": "LGS333-433左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs333zkwh647-4e4b17b0.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs333zkwh647-4e4b17b0.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs333zkwh647-4e4b17b0.pdf"
  },
  "LGS333YKWH647": {
    "name": "LGS333-433右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs333ykwh647-93ba9266.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs333ykwh647-93ba9266.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs333ykwh647-93ba9266.pdf"
  },
  "LGS334ZKBH647": {
    "name": "LGS334_434左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs334zkbh647-8f50b826.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs334zkbh647-8f50b826.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs334zkbh647-8f50b826.pdf"
  },
  "LGS334YKBH647": {
    "name": "LGS334_434右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs334ykbh647-d6f27cea.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs334ykbh647-d6f27cea.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs334ykbh647-d6f27cea.pdf"
  },
  "LGS434ZKWH647": {
    "name": "LGS334_434左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs434zkwh647-8f50b826.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs434zkwh647-8f50b826.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs434zkwh647-8f50b826.pdf"
  },
  "LGS434YKWH647": {
    "name": "LGS334_434右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs434ykwh647-d6f27cea.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs434ykwh647-d6f27cea.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs434ykwh647-d6f27cea.pdf"
  },
  "LGS723ZKBH647": {
    "name": "LGS723_733左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs723zkbh647-ea6a04ac.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs723zkbh647-ea6a04ac.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs723zkbh647-ea6a04ac.pdf"
  },
  "LGS723YKBH647": {
    "name": "LGS723_733右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs723ykbh647-9bf038bf.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs723ykbh647-9bf038bf.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs723ykbh647-9bf038bf.pdf"
  },
  "LGS723ZKWH647": {
    "name": "LGS723_733左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs723zkwh647-ea6a04ac.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs723zkwh647-ea6a04ac.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs723zkwh647-ea6a04ac.pdf"
  },
  "LGS723YKWH647": {
    "name": "LGS723_733右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs723ykwh647-9bf038bf.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs723ykwh647-9bf038bf.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs723ykwh647-9bf038bf.pdf"
  },
  "LGS833ZKBH647": {
    "name": "LGS833左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs833zkbh647-db7af8d5.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs833zkbh647-db7af8d5.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs833zkbh647-db7af8d5.pdf"
  },
  "LGS833YKBH647": {
    "name": "LGS833右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs833ykbh647-5a0d567a.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs833ykbh647-5a0d567a.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs833ykbh647-5a0d567a.pdf"
  },
  "LGS833ZKWH647": {
    "name": "LGS833左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs833zkwh647-db7af8d5.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs833zkwh647-db7af8d5.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs833zkwh647-db7af8d5.pdf"
  },
  "LGS833YKWH647": {
    "name": "LGS833右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs833ykwh647-5a0d567a.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs833ykwh647-5a0d567a.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs833ykwh647-5a0d567a.pdf"
  },
  "LGS834ZKBH647": {
    "name": "LGS834左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs834zkbh647-b8c46711.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs834zkbh647-b8c46711.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs834zkbh647-b8c46711.pdf"
  },
  "LGS834YKBH647": {
    "name": "LGS834右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs834ykbh647-dcb6f52e.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs834ykbh647-dcb6f52e.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs834ykbh647-dcb6f52e.pdf"
  },
  "LGS834ZKWH647": {
    "name": "LGS834左侧框.pdf",
    "path": "drawings/catalog/drawing-lgs834zkwh647-b8c46711.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs834zkwh647-b8c46711.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs834zkwh647-b8c46711.pdf"
  },
  "LGS834YKWH647": {
    "name": "LGS834右侧框.pdf",
    "path": "drawings/catalog/drawing-lgs834ykwh647-dcb6f52e.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs834ykwh647-dcb6f52e.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-lgs834ykwh647-dcb6f52e.pdf"
  },
  "ZJG150641WH": {
    "name": "41底脚.pdf",
    "path": "drawings/catalog/drawing-zjg150641wh-56ec2a6e.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-zjg150641wh-56ec2a6e.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-zjg150641wh-56ec2a6e.pdf"
  },
  "ZJG15064123BH": {
    "name": "41底脚(螺纹长23mm).pdf",
    "path": "drawings/catalog/drawing-zjg15064123bh-21add5e1.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-zjg15064123bh-21add5e1.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-zjg15064123bh-21add5e1.pdf"
  },
  "ZJG15064123WH": {
    "name": "41底脚(螺纹长23mm).pdf",
    "path": "drawings/catalog/drawing-zjg15064123wh-21add5e1.pdf",
    "url": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-zjg15064123wh-21add5e1.pdf",
    "previewUrl": "https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/drawings/catalog/drawing-zjg15064123wh-21add5e1.pdf"
  }
};

export function buildAllEcnOperations(payload) {
  const operations = [];
  const materials = payload?.materialDb?.materials || {};
  const bomEntries = payload?.materialDb?.bomEntries || [];

  function findMaterialByCode(code) {
    return Object.values(materials).find(m => m.code === code);
  }

  function findEntry(productCode, color, matCode) {
    return bomEntries.find(e => {
      if (e.parentType !== 'product') return false;
      const pid = e.productCode || e.parentId;
      if (pid !== productCode || e.color !== color) return false;
      const mat = materials[e.materialId];
      return mat && mat.code === matCode;
    });
  }

  // 1. Revision creation operations (14 SPUs; LGS032 remains draft V3.1)
  const productRevisionsToCreate = [
    { spu: 'LGS043', revision: 'V3.1' },
    { spu: 'LGS132', revision: 'V3.1' },
    { spu: 'LGS232', revision: 'V3.1' },
    { spu: 'LGS033', revision: 'V4.1' },
    { spu: 'LGS133', revision: 'V4.1' },
    { spu: 'LGS233', revision: 'V4.1' },
    { spu: 'LGS333', revision: 'V4.1' },
    { spu: 'LGS334', revision: 'V4.1' },
    { spu: 'LGS433', revision: 'V4.1' },
    { spu: 'LGS434', revision: 'V5.1' },
    { spu: 'LGS723', revision: 'V4.1' },
    { spu: 'LGS733', revision: 'V4.1' },
    { spu: 'LGS833', revision: 'V4.1' },
    { spu: 'LGS834', revision: 'V4.1' },
  ];

  for (const item of productRevisionsToCreate) {
    const revRecord = payload?.productRevisions?.[item.spu];
    const alreadyCreated = revRecord?.currentRevision === item.revision ||
      (Array.isArray(revRecord?.revisions) && revRecord.revisions.some(r => r?.revision === item.revision));
    if (!alreadyCreated) {
      operations.push({
        operationType: 'create_product_revision',
        targetId: item.spu,
        payload: {
          revision: item.revision,
          changeReason: CHANGE_REASON,
        },
      });
    }
  }

  // 1.1 Update product specification sizes to 671Hmm
  const spuList = ['LGS032', 'LGS033', 'LGS043', 'LGS132', 'LGS133', 'LGS232', 'LGS233', 'LGS333', 'LGS334', 'LGS433', 'LGS434', 'LGS723', 'LGS733', 'LGS833', 'LGS834'];
  for (const spu of spuList) {
    const product = payload?.bom?.[spu];
    if (product && product.color_info) {
      for (const [color, cdata] of Object.entries(product.color_info)) {
        if (cdata.size && (cdata.size.includes('681Hmm') || cdata.size.includes('679Hmm'))) {
          const newSize = cdata.size.replace(/(?:681|679)Hmm/g, '671Hmm');
          operations.push({
            operationType: 'update_product',
            targetId: spu,
            payload: {
              color,
              patch: {
                size: newSize,
              },
            },
          });
        }
      }
    }
  }

  // 2. Raw Material Creation (方管 4816 and 4804)
  const rawPipes = [
    {
      id: 'mat_fg1515064816647',
      code: 'FG1515064816647',
      name: { zh: '方管', vi: 'Sắt hộp' },
      spec: { zh: '15×15×0.6Tmm，长度 4816mm', vi: '15×15×0.6Tmm, dài 4816mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '光亮', vi: 'sáng bóng' },
      attr: { zh: '原材料', vi: 'Nguyên vật liệu' },
      drawings: [],
      models3d: [],
    },
    {
      id: 'mat_fg1515064804647',
      code: 'FG1515064804647',
      name: { zh: '方管', vi: 'Sắt hộp' },
      spec: { zh: '15×15×0.6Tmm，长度 4804mm', vi: '15×15×0.6Tmm, dài 4804mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '光亮', vi: 'sáng bóng' },
      attr: { zh: '原材料', vi: 'Nguyên vật liệu' },
      drawings: [],
      models3d: [],
    },
  ];

  for (const pipe of rawPipes) {
    if (!materials[pipe.id]) {
      const { id, ...materialData } = pipe;
      operations.push({
        operationType: 'create_material',
        targetId: id,
        payload: { material: materialData },
      });
    }
  }

  // 3. Feet Material Creation (inheriting existing assets from predecessors)
  const footMaterials = [
    {
      id: 'mat_zjg150641wh',
      code: 'ZJG150641WH',
      predecessorCode: 'ZJG150654WH',
      name: { zh: '41底脚', vi: 'Chân đế 41' },
      spec: { zh: '57x15x15mm', vi: '57x15x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
    },
    {
      id: 'mat_zjg15064123bh',
      code: 'ZJG15064123BH',
      predecessorCode: 'ZJG15065423BH',
      name: { zh: '41底脚(螺纹长23mm)', vi: '41 chân đế ốc dài' },
      spec: { zh: '67.5x15x15mm', vi: '67.5x15x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
    },
    {
      id: 'mat_zjg15064123wh',
      code: 'ZJG15064123WH',
      predecessorCode: 'ZJG15065423WH',
      name: { zh: '41底脚(螺纹长23mm)', vi: '41 chân đế ốc dài' },
      spec: { zh: '67.5x15x15mm', vi: '67.5x15x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '镀锌', vi: 'mạ kẽm' },
      attr: { zh: '零件', vi: 'linh kiện' },
    },
  ];

  for (const foot of footMaterials) {
    if (!materials[foot.id]) {
      const pred = findMaterialByCode(foot.predecessorCode);
      const inheritedDrawings = (pred?.drawings || []).map(cleanAsset).filter(Boolean);
      const inheritedModels3d = (pred?.models3d || []).map(cleanAsset).filter(Boolean);
      const exactDrawing = EXACT_2D_DRAWINGS[foot.code];
      const drawings = exactDrawing ? [exactDrawing] : inheritedDrawings;
      operations.push({
        operationType: 'create_material',
        targetId: foot.id,
        payload: {
          material: {
            code: foot.code,
            name: foot.name,
            spec: foot.spec,
            material: foot.material,
            color: foot.color,
            attr: foot.attr,
            drawings: drawings,
            models3d: inheritedModels3d,
          },
        },
      });
    } else {
      const currentDrawing = materials[foot.id]?.drawings?.[0];
      const exactDrawing = EXACT_2D_DRAWINGS[foot.code];
      if (exactDrawing && (!currentDrawing || currentDrawing.path !== exactDrawing.path || currentDrawing.url !== exactDrawing.url)) {
        operations.push({
          operationType: 'update_material',
          targetId: foot.id,
          payload: {
            patch: {
              drawings: [exactDrawing],
            },
          },
        });
      }
    }
  }

  // 4. Sub-BOM additions for Feet: Complete 4-component sub-BOM for each foot
  // ZJG150641BH (mat_1c0a8em) already has M6GS1515BH, M6YLM139, NLPLS6018BZ. Add FG1515066013 to complete 4 components.
  const bh41HasPipe = bomEntries.some(e =>
    e.parentId === 'mat_1c0a8em' && e.parentType === 'material' &&
    (materials[e.childMaterialId || e.materialId]?.code === 'FG1515066013')
  );
  if (!bh41HasPipe) {
    operations.push({
      operationType: 'add_material_child',
      targetId: 'mat_1c0a8em',
      payload: { materialId: 'mat_fg1515066013', quantity: 0.006897 },
    });
  }

  // ZJG150641WH: all 4 components (only add if material was just created above)
  if (!materials['mat_zjg150641wh']) {
    operations.push(
      { operationType: 'add_material_child', targetId: 'mat_zjg150641wh', payload: { materialId: 'mat_fg1515066013', quantity: 0.006897 } },
      { operationType: 'add_material_child', targetId: 'mat_zjg150641wh', payload: { materialId: 'mat_m6gs1515wh', quantity: 1 } },
      { operationType: 'add_material_child', targetId: 'mat_zjg150641wh', payload: { materialId: 'mat_m6ylm139', quantity: 1 } },
      { operationType: 'add_material_child', targetId: 'mat_zjg150641wh', payload: { materialId: 'mat_nlpls6018wz', quantity: 1 } }
    );
  }

  // ZJG15064123BH: all 4 components
  if (!materials['mat_zjg15064123bh']) {
    operations.push(
      { operationType: 'add_material_child', targetId: 'mat_zjg15064123bh', payload: { materialId: 'mat_fg1515066013', quantity: 0.006897 } },
      { operationType: 'add_material_child', targetId: 'mat_zjg15064123bh', payload: { materialId: 'mat_m6gs1515bh', quantity: 1 } },
      { operationType: 'add_material_child', targetId: 'mat_zjg15064123bh', payload: { materialId: 'mat_m6ylm139', quantity: 1 } },
      { operationType: 'add_material_child', targetId: 'mat_zjg15064123bh', payload: { materialId: 'mat_einzrx', quantity: 1 } }
    );
  }

  // ZJG15064123WH: all 4 components
  if (!materials['mat_zjg15064123wh']) {
    operations.push(
      { operationType: 'add_material_child', targetId: 'mat_zjg15064123wh', payload: { materialId: 'mat_fg1515066013', quantity: 0.006897 } },
      { operationType: 'add_material_child', targetId: 'mat_zjg15064123wh', payload: { materialId: 'mat_m6gs1515wh', quantity: 1 } },
      { operationType: 'add_material_child', targetId: 'mat_zjg15064123wh', payload: { materialId: 'mat_m6ylm139', quantity: 1 } },
      { operationType: 'add_material_child', targetId: 'mat_zjg15064123wh', payload: { materialId: 'mat_9tyhnt', quantity: 1 } }
    );
  }

  // 5. Side Frame Materials Creation (647 mm)
  const sideFrameDefs = [
    // -8 mm group
    {
      id: 'mat_lgs043zkbh647',
      code: 'LGS043ZKBH647',
      predecessorCode: 'LGS043ZKBH',
      name: { zh: 'LGS043-S-左侧框', vi: 'LGS043-S-khung bên trái' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064816647',
    },
    {
      id: 'mat_lgs043ykbh647',
      code: 'LGS043YKBH647',
      predecessorCode: 'LGS043YKBH',
      name: { zh: 'LGS043-S-右侧框', vi: 'LGS043-S-khung bên phải' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064816647',
    },
    {
      id: 'mat_lgs132zkbh647',
      code: 'LGS132ZKBH647',
      predecessorCode: 'LGS132ZKBH',
      name: { zh: 'LGS132_232-S-侧框左', vi: 'LGS132_232-S-khung bên trái' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064816647',
    },
    {
      id: 'mat_lgs132ykbh647',
      code: 'LGS132YKBH647',
      predecessorCode: 'LGS132YKBH',
      name: { zh: 'LGS132_232-S-侧框右', vi: 'LGS132_232-S-khung bên phải' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064816647',
    },

    // -10 mm group
    {
      id: 'mat_lgs033zkbh647',
      code: 'LGS033ZKBH647',
      predecessorCode: 'LGS033ZKBH',
      name: { zh: 'LGS033左侧框', vi: 'LGS033 khung bên trái' },
      spec: { zh: '647x290x15mm', vi: '647x290x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs033ykbh647',
      code: 'LGS033YKBH647',
      predecessorCode: 'LGS033YKBH',
      name: { zh: 'LGS033右侧框', vi: 'LGS033 khung bên phải' },
      spec: { zh: '647x290x15mm', vi: '647x290x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs033zkwh647',
      code: 'LGS033ZKWH647',
      predecessorCode: 'LGS033ZKWH',
      name: { zh: 'LGS033左侧框', vi: 'LGS033 khung bên trái' },
      spec: { zh: '647x290x15mm', vi: '647x290x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs033ykwh647',
      code: 'LGS033YKWH647',
      predecessorCode: 'LGS033YKWH',
      name: { zh: 'LGS033右侧框', vi: 'LGS033 khung bên phải' },
      spec: { zh: '647x290x15mm', vi: '647x290x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs133zkbh647',
      code: 'LGS133ZKBH647',
      predecessorCode: 'LGS133ZKBH',
      name: { zh: 'LGS133左侧框', vi: 'LGS133 khung bên trái' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs133ykbh647',
      code: 'LGS133YKBH647',
      predecessorCode: 'LGS133YKBH',
      name: { zh: 'LGS133右侧框', vi: 'LGS133 khung bên phải' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs233zkbh647',
      code: 'LGS233ZKBH647',
      predecessorCode: 'LGS233ZKBH',
      name: { zh: 'LGS233左侧框', vi: 'LGS233 khung bên trái' },
      spec: { zh: '647x380x15mm', vi: '647x380x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs233ykbh647',
      code: 'LGS233YKBH647',
      predecessorCode: 'LGS233YKBH',
      name: { zh: 'LGS233右侧框', vi: 'LGS233 khung bên phải' },
      spec: { zh: '647x380x15mm', vi: '647x380x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs233zkwh647',
      code: 'LGS233ZKWH647',
      predecessorCode: 'LGS233ZKWH',
      name: { zh: 'LGS233左侧框', vi: 'LGS233 khung bên trái' },
      spec: { zh: '647x380x15mm', vi: '647x380x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs233ykwh647',
      code: 'LGS233YKWH647',
      predecessorCode: 'LGS233YKWH',
      name: { zh: 'LGS233右侧框', vi: 'LGS233 khung bên phải' },
      spec: { zh: '647x380x15mm', vi: '647x380x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs333zkbh647',
      code: 'LGS333ZKBH647',
      predecessorCode: 'LGS333ZKBH',
      name: { zh: 'LGS333_433左侧框', vi: 'LGS333_433 khung bên trái' },
      spec: { zh: '647x290x15mm', vi: '647x290x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs333ykbh647',
      code: 'LGS333YKBH647',
      predecessorCode: 'LGS333YKBH',
      name: { zh: 'LGS333_433右侧框', vi: 'LGS333_433 khung bên phải' },
      spec: { zh: '647x290x15mm', vi: '647x290x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs333zkwh647',
      code: 'LGS333ZKWH647',
      predecessorCode: 'LGS333ZKWH',
      name: { zh: 'LGS333_433左侧框', vi: 'LGS333_433 khung bên trái' },
      spec: { zh: '647x290x15mm', vi: '647x290x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs333ykwh647',
      code: 'LGS333YKWH647',
      predecessorCode: 'LGS333YKWH',
      name: { zh: 'LGS333_433右侧框', vi: 'LGS333_433 khung bên phải' },
      spec: { zh: '647x290x15mm', vi: '647x290x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs334zkbh647',
      code: 'LGS334ZKBH647',
      predecessorCode: 'LGS334ZKBH',
      name: { zh: 'LGS334_434左侧框', vi: 'LGS334_434 khung bên trái' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs334ykbh647',
      code: 'LGS334YKBH647',
      predecessorCode: 'LGS334YKBH',
      name: { zh: 'LGS334_434右侧框', vi: 'LGS334_434 khung bên phải' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs434zkwh647',
      code: 'LGS434ZKWH647',
      predecessorCode: 'LGS434ZKWH',
      name: { zh: 'LGS334_434左侧框', vi: 'LGS334_434 khung bên trái' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs434ykwh647',
      code: 'LGS434YKWH647',
      predecessorCode: 'LGS434YKWH',
      name: { zh: 'LGS334_434右侧框', vi: 'LGS334_434 khung bên phải' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs723zkbh647',
      code: 'LGS723ZKBH647',
      predecessorCode: 'LGS723ZKBH',
      name: { zh: 'LGS723_733左侧框', vi: 'LGS723_733 khung bên trái' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs723ykbh647',
      code: 'LGS723YKBH647',
      predecessorCode: 'LGS723YKBH',
      name: { zh: 'LGS723_733右侧框', vi: 'LGS723_733 khung bên phải' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs723zkwh647',
      code: 'LGS723ZKWH647',
      predecessorCode: 'LGS723ZKWH',
      name: { zh: 'LGS723_733左侧框', vi: 'LGS723_733 khung bên trái' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs723ykwh647',
      code: 'LGS723YKWH647',
      predecessorCode: 'LGS723YKWH',
      name: { zh: 'LGS723_733右侧框', vi: 'LGS723_733 khung bên phải' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs833zkbh647',
      code: 'LGS833ZKBH647',
      predecessorCode: 'LGS833ZKBH',
      name: { zh: 'LGS833左侧框', vi: 'LGS833 khung bên trái' },
      spec: { zh: '647x290x15mm', vi: '647x290x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs833ykbh647',
      code: 'LGS833YKBH647',
      predecessorCode: 'LGS833YKBH',
      name: { zh: 'LGS833右侧框', vi: 'LGS833 khung bên phải' },
      spec: { zh: '647x290x15mm', vi: '647x290x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs833zkwh647',
      code: 'LGS833ZKWH647',
      predecessorCode: 'LGS833ZKWH',
      name: { zh: 'LGS833左侧框', vi: 'LGS833 khung bên trái' },
      spec: { zh: '647x290x15mm', vi: '647x290x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs833ykwh647',
      code: 'LGS833YKWH647',
      predecessorCode: 'LGS833YKWH',
      name: { zh: 'LGS833右侧框', vi: 'LGS833 khung bên phải' },
      spec: { zh: '647x290x15mm', vi: '647x290x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs834zkbh647',
      code: 'LGS834ZKBH647',
      predecessorCode: 'LGS834ZKBH',
      name: { zh: 'LGS834左侧框', vi: 'LGS834 khung bên trái' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs834ykbh647',
      code: 'LGS834YKBH647',
      predecessorCode: 'LGS834YKBH',
      name: { zh: 'LGS834右侧框', vi: 'LGS834 khung bên phải' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '黑砂纹', vi: 'đen nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs834zkwh647',
      code: 'LGS834ZKWH647',
      predecessorCode: 'LGS834ZKWH',
      name: { zh: 'LGS834左侧框', vi: 'LGS834 khung bên trái' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
    {
      id: 'mat_lgs834ykwh647',
      code: 'LGS834YKWH647',
      predecessorCode: 'LGS834YKWH',
      name: { zh: 'LGS834右侧框', vi: 'LGS834 khung bên phải' },
      spec: { zh: '647x335x15mm', vi: '647x335x15mm' },
      material: { zh: 'Q195', vi: 'Q195' },
      color: { zh: '白砂纹', vi: 'trắng nhám' },
      attr: { zh: '零件', vi: 'linh kiện' },
      pipeId: 'mat_fg1515064804647',
    },
  ];

  for (const frame of sideFrameDefs) {
    if (!materials[frame.id]) {
      const predMat = findMaterialByCode(frame.predecessorCode);
      const inheritedDrawings = (predMat?.drawings || []).map(cleanAsset).filter(Boolean);
      const inheritedModels3d = (predMat?.models3d || []).map(cleanAsset).filter(Boolean);
      const exactDrawing = EXACT_2D_DRAWINGS[frame.code];
      const drawings = exactDrawing ? [exactDrawing] : inheritedDrawings;
      operations.push({
        operationType: 'create_material',
        targetId: frame.id,
        payload: {
          material: {
            code: frame.code,
            name: frame.name,
            spec: frame.spec,
            material: frame.material,
            color: frame.color,
            attr: frame.attr,
            drawings: drawings,
            models3d: inheritedModels3d,
          },
        },
      });

      // Add main pipe (0.333333)
      operations.push({
        operationType: 'add_material_child',
        targetId: frame.id,
        payload: { materialId: frame.pipeId, quantity: 0.333333 },
      });

      // Mirror all non-pipe children from predecessor material
      if (predMat) {
        const predChildren = bomEntries.filter(e => e.parentId === predMat.id && e.parentType === 'material');
        for (const child of predChildren) {
          const childMat = materials[child.childMaterialId || child.materialId];
          // Skip pipe materials that get replaced
          if (childMat && ['FG1515065000', 'FG1515064876', 'FG1515065011'].includes(childMat.code)) {
            continue;
          }
          operations.push({
            operationType: 'add_material_child',
            targetId: frame.id,
            payload: {
              materialId: child.childMaterialId || child.materialId,
              quantity: Number(child.qty),
            },
          });
        }
      }
    } else {
      const currentDrawing = materials[frame.id]?.drawings?.[0];
      const exactDrawing = EXACT_2D_DRAWINGS[frame.code];
      if (exactDrawing && (!currentDrawing || currentDrawing.path !== exactDrawing.path || currentDrawing.url !== exactDrawing.url)) {
        operations.push({
          operationType: 'update_material',
          targetId: frame.id,
          payload: {
            patch: {
              drawings: [exactDrawing],
            },
          },
        });
      }
    }
  }

  // 6. Update LGS032 side frames (already in DB)
  // Fix LGS032 sub-BOM: remove old FG1515064864 child entry, add FG1515064816647 (0.333333)
  const lgs032ZkEntry = bomEntries.find(e => e.parentId === 'mat_fwib1i' && (e.materialId === 'mat_fg1515064864' || e.childMaterialId === 'mat_fg1515064864'));
  if (lgs032ZkEntry) {
    operations.push({
      operationType: 'remove_material_child',
      targetId: lgs032ZkEntry.id,
      payload: {},
    });
  }
  const lgs032ZkHasNew = bomEntries.some(e => e.parentId === 'mat_fwib1i' && (e.materialId === 'mat_fg1515064816647' || e.childMaterialId === 'mat_fg1515064816647'));
  if (!lgs032ZkHasNew) {
    operations.push({
      operationType: 'add_material_child',
      targetId: 'mat_fwib1i',
      payload: { materialId: 'mat_fg1515064816647', quantity: 0.333333 },
    });
  }

  const lgs032YkEntry = bomEntries.find(e => e.parentId === 'mat_pxy79y' && (e.materialId === 'mat_fg1515064864' || e.childMaterialId === 'mat_fg1515064864'));
  if (lgs032YkEntry) {
    operations.push({
      operationType: 'remove_material_child',
      targetId: lgs032YkEntry.id,
      payload: {},
    });
  }
  const lgs032YkHasNew = bomEntries.some(e => e.parentId === 'mat_pxy79y' && (e.materialId === 'mat_fg1515064816647' || e.childMaterialId === 'mat_fg1515064816647'));
  if (!lgs032YkHasNew) {
    operations.push({
      operationType: 'add_material_child',
      targetId: 'mat_pxy79y',
      payload: { materialId: 'mat_fg1515064816647', quantity: 0.333333 },
    });
  }

  // 7. Product BOM item replacements (side frames and feet across 15 SPUs)
  const bomReplacements = [
    // LGS032: foot only (frames already updated in sub-BOM)
    { spu: 'LGS032', color: '复古色', oldCode: 'ZJG150651BH', newId: 'mat_1c0a8em' },
    { spu: 'LGS032', color: '黑色', oldCode: 'ZJG150651BH', newId: 'mat_1c0a8em' },

    // LGS043: side frames only (NO foot replacement - exception)
    { spu: 'LGS043', color: '复古色', oldCode: 'LGS043ZKBH', newId: 'mat_lgs043zkbh647' },
    { spu: 'LGS043', color: '复古色', oldCode: 'LGS043YKBH', newId: 'mat_lgs043ykbh647' },
    { spu: 'LGS043', color: '黑色', oldCode: 'LGS043ZKBH', newId: 'mat_lgs043zkbh647' },
    { spu: 'LGS043', color: '黑色', oldCode: 'LGS043YKBH', newId: 'mat_lgs043ykbh647' },

    // LGS132: frames and foot
    { spu: 'LGS132', color: '黑色', oldCode: 'LGS132ZKBH', newId: 'mat_lgs132zkbh647' },
    { spu: 'LGS132', color: '黑色', oldCode: 'LGS132YKBH', newId: 'mat_lgs132ykbh647' },
    { spu: 'LGS132', color: '黑色', oldCode: 'ZJG150651BH', newId: 'mat_1c0a8em' },

    // LGS232: frames (shared with LGS132) and foot
    { spu: 'LGS232', color: '复古色', oldCode: 'LGS132ZKBH', newId: 'mat_lgs132zkbh647' },
    { spu: 'LGS232', color: '复古色', oldCode: 'LGS132YKBH', newId: 'mat_lgs132ykbh647' },
    { spu: 'LGS232', color: '复古色', oldCode: 'ZJG150651BH', newId: 'mat_1c0a8em' },
    { spu: 'LGS232', color: '黑色', oldCode: 'LGS132ZKBH', newId: 'mat_lgs132zkbh647' },
    { spu: 'LGS232', color: '黑色', oldCode: 'LGS132YKBH', newId: 'mat_lgs132ykbh647' },
    { spu: 'LGS232', color: '黑色', oldCode: 'ZJG150651BH', newId: 'mat_1c0a8em' },

    // LGS033: frames and foot
    { spu: 'LGS033', color: '复古色', oldCode: 'LGS033ZKBH', newId: 'mat_lgs033zkbh647' },
    { spu: 'LGS033', color: '复古色', oldCode: 'LGS033YKBH', newId: 'mat_lgs033ykbh647' },
    { spu: 'LGS033', color: '复古色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },
    { spu: 'LGS033', color: '白色', oldCode: 'LGS033ZKWH', newId: 'mat_lgs033zkwh647' },
    { spu: 'LGS033', color: '白色', oldCode: 'LGS033YKWH', newId: 'mat_lgs033ykwh647' },
    { spu: 'LGS033', color: '白色', oldCode: 'ZJG150654WH', newId: 'mat_zjg150641wh' },

    // LGS133: frames and foot
    { spu: 'LGS133', color: '复古色', oldCode: 'LGS133ZKBH', newId: 'mat_lgs133zkbh647' },
    { spu: 'LGS133', color: '复古色', oldCode: 'LGS133YKBH', newId: 'mat_lgs133ykbh647' },
    { spu: 'LGS133', color: '复古色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },

    // LGS233: frames and foot
    { spu: 'LGS233', color: '复古色', oldCode: 'LGS233ZKBH', newId: 'mat_lgs233zkbh647' },
    { spu: 'LGS233', color: '复古色', oldCode: 'LGS233YKBH', newId: 'mat_lgs233ykbh647' },
    { spu: 'LGS233', color: '复古色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },
    { spu: 'LGS233', color: '白色', oldCode: 'LGS233ZKWH', newId: 'mat_lgs233zkwh647' },
    { spu: 'LGS233', color: '白色', oldCode: 'LGS233YKWH', newId: 'mat_lgs233ykwh647' },
    { spu: 'LGS233', color: '白色', oldCode: 'ZJG150654WH', newId: 'mat_zjg150641wh' },
    { spu: 'LGS233', color: '黑色', oldCode: 'LGS233ZKBH', newId: 'mat_lgs233zkbh647' },
    { spu: 'LGS233', color: '黑色', oldCode: 'LGS233YKBH', newId: 'mat_lgs233ykbh647' },
    { spu: 'LGS233', color: '黑色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },

    // LGS333: frames and foot
    { spu: 'LGS333', color: '复古色', oldCode: 'LGS333ZKBH', newId: 'mat_lgs333zkbh647' },
    { spu: 'LGS333', color: '复古色', oldCode: 'LGS333YKBH', newId: 'mat_lgs333ykbh647' },
    { spu: 'LGS333', color: '复古色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },
    { spu: 'LGS333', color: '白色', oldCode: 'LGS333ZKWH', newId: 'mat_lgs333zkwh647' },
    { spu: 'LGS333', color: '白色', oldCode: 'LGS333YKWH', newId: 'mat_lgs333ykwh647' },
    { spu: 'LGS333', color: '白色', oldCode: 'ZJG150654WH', newId: 'mat_zjg150641wh' },
    { spu: 'LGS333', color: '黑色', oldCode: 'LGS333ZKBH', newId: 'mat_lgs333zkbh647' },
    { spu: 'LGS333', color: '黑色', oldCode: 'LGS333YKBH', newId: 'mat_lgs333ykbh647' },
    { spu: 'LGS333', color: '黑色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },

    // LGS334: frames and foot (ren dài 23mm)
    { spu: 'LGS334', color: '黑色', oldCode: 'LGS334ZKBH', newId: 'mat_lgs334zkbh647' },
    { spu: 'LGS334', color: '黑色', oldCode: 'LGS334YKBH', newId: 'mat_lgs334ykbh647' },
    { spu: 'LGS334', color: '黑色', oldCode: 'ZJG15065423BH', newId: 'mat_zjg15064123bh' },

    // LGS433: frames (shared with LGS333) and foot
    { spu: 'LGS433', color: '复古色', oldCode: 'LGS333ZKBH', newId: 'mat_lgs333zkbh647' },
    { spu: 'LGS433', color: '复古色', oldCode: 'LGS333YKBH', newId: 'mat_lgs333ykbh647' },
    { spu: 'LGS433', color: '复古色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },
    { spu: 'LGS433', color: '白色', oldCode: 'LGS333ZKWH', newId: 'mat_lgs333zkwh647' },
    { spu: 'LGS433', color: '白色', oldCode: 'LGS333YKWH', newId: 'mat_lgs333ykwh647' },
    { spu: 'LGS433', color: '白色', oldCode: 'ZJG150654WH', newId: 'mat_zjg150641wh' },
    { spu: 'LGS433', color: '黑色', oldCode: 'LGS333ZKBH', newId: 'mat_lgs333zkbh647' },
    { spu: 'LGS433', color: '黑色', oldCode: 'LGS333YKBH', newId: 'mat_lgs333ykbh647' },
    { spu: 'LGS433', color: '黑色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },

    // LGS434: frames (black uses LGS334, white has dedicated) and foot (ren dài 23mm)
    { spu: 'LGS434', color: '白色', oldCode: 'LGS434ZKWH', newId: 'mat_lgs434zkwh647' },
    { spu: 'LGS434', color: '白色', oldCode: 'LGS434YKWH', newId: 'mat_lgs434ykwh647' },
    { spu: 'LGS434', color: '白色', oldCode: 'ZJG15065423WH', newId: 'mat_zjg15064123wh' },
    { spu: 'LGS434', color: '黑色', oldCode: 'LGS334ZKBH', newId: 'mat_lgs334zkbh647' },
    { spu: 'LGS434', color: '黑色', oldCode: 'LGS334YKBH', newId: 'mat_lgs334ykbh647' },
    { spu: 'LGS434', color: '黑色', oldCode: 'ZJG15065423BH', newId: 'mat_zjg15064123bh' },

    // LGS723: side frames only (NO foot replacement - exception)
    { spu: 'LGS723', color: '复古色', oldCode: 'LGS723ZKBH', newId: 'mat_lgs723zkbh647' },
    { spu: 'LGS723', color: '复古色', oldCode: 'LGS723YKBH', newId: 'mat_lgs723ykbh647' },
    { spu: 'LGS723', color: '白色', oldCode: 'LGS723ZKWH', newId: 'mat_lgs723zkwh647' },
    { spu: 'LGS723', color: '白色', oldCode: 'LGS723YKWH', newId: 'mat_lgs723ykwh647' },
    { spu: 'LGS723', color: '黑色', oldCode: 'LGS723ZKBH', newId: 'mat_lgs723zkbh647' },
    { spu: 'LGS723', color: '黑色', oldCode: 'LGS723YKBH', newId: 'mat_lgs723ykbh647' },

    // LGS733: frames (shared with LGS723) and foot
    { spu: 'LGS733', color: '复古色', oldCode: 'LGS723ZKBH', newId: 'mat_lgs723zkbh647' },
    { spu: 'LGS733', color: '复古色', oldCode: 'LGS723YKBH', newId: 'mat_lgs723ykbh647' },
    { spu: 'LGS733', color: '复古色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },
    { spu: 'LGS733', color: '白色', oldCode: 'LGS723ZKWH', newId: 'mat_lgs723zkwh647' },
    { spu: 'LGS733', color: '白色', oldCode: 'LGS723YKWH', newId: 'mat_lgs723ykwh647' },
    { spu: 'LGS733', color: '白色', oldCode: 'ZJG150654WH', newId: 'mat_zjg150641wh' },
    { spu: 'LGS733', color: '黑色', oldCode: 'LGS723ZKBH', newId: 'mat_lgs723zkbh647' },
    { spu: 'LGS733', color: '黑色', oldCode: 'LGS723YKBH', newId: 'mat_lgs723ykbh647' },
    { spu: 'LGS733', color: '黑色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },

    // LGS833: frames and foot
    { spu: 'LGS833', color: '复古色', oldCode: 'LGS833ZKBH', newId: 'mat_lgs833zkbh647' },
    { spu: 'LGS833', color: '复古色', oldCode: 'LGS833YKBH', newId: 'mat_lgs833ykbh647' },
    { spu: 'LGS833', color: '复古色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },
    { spu: 'LGS833', color: '白色', oldCode: 'LGS833ZKWH', newId: 'mat_lgs833zkwh647' },
    { spu: 'LGS833', color: '白色', oldCode: 'LGS833YKWH', newId: 'mat_lgs833ykwh647' },
    { spu: 'LGS833', color: '白色', oldCode: 'ZJG150654WH', newId: 'mat_zjg150641wh' },
    { spu: 'LGS833', color: '黑色', oldCode: 'LGS833ZKBH', newId: 'mat_lgs833zkbh647' },
    { spu: 'LGS833', color: '黑色', oldCode: 'LGS833YKBH', newId: 'mat_lgs833ykbh647' },
    { spu: 'LGS833', color: '黑色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },

    // LGS834: frames and foot
    { spu: 'LGS834', color: '白色', oldCode: 'LGS834ZKWH', newId: 'mat_lgs834zkwh647' },
    { spu: 'LGS834', color: '白色', oldCode: 'LGS834YKWH', newId: 'mat_lgs834ykwh647' },
    { spu: 'LGS834', color: '白色', oldCode: 'ZJG150654WH', newId: 'mat_zjg150641wh' },
    { spu: 'LGS834', color: '黑色', oldCode: 'LGS834ZKBH', newId: 'mat_lgs834zkbh647' },
    { spu: 'LGS834', color: '黑色', oldCode: 'LGS834YKBH', newId: 'mat_lgs834ykbh647' },
    { spu: 'LGS834', color: '黑色', oldCode: 'ZJG150654BH', newId: 'mat_1c0a8em' },
  ];

  for (const rep of bomReplacements) {
    const entry = findEntry(rep.spu, rep.color, rep.oldCode);
    if (entry) {
      operations.push({
        operationType: 'replace_bom_item',
        targetId: entry.id,
        payload: { materialId: rep.newId },
      });
    }
  }

  return operations;
}

export function buildEcnProposalBatches(payload, maxBatchSize = 40) {
  const allOps = buildAllEcnOperations(payload);
  const masterOps = allOps.filter(o => !['create_product_revision', 'replace_bom_item'].includes(o.operationType));
  const entriesById = new Map((payload?.materialDb?.bomEntries || []).map(e => [e.id, e]));
  const spuList = [
    'LGS032', 'LGS043', 'LGS132', 'LGS232', 'LGS033', 'LGS133', 'LGS233',
    'LGS333', 'LGS334', 'LGS433', 'LGS434', 'LGS723', 'LGS733', 'LGS833', 'LGS834',
  ];

  const batches = [];
  // 1. Master data batches
  for (let i = 0; i < masterOps.length; i += maxBatchSize) {
    const chunk = masterOps.slice(i, i + maxBatchSize);
    batches.push({
      summary: `ECN-2026-0710-LGS Rev 1.4: Master Data Batch ${batches.length + 1} (${chunk.length} operations)`,
      operations: chunk,
    });
  }

  // 2. SPU revision and BOM replacement batches (grouping SPU revisions with their replacements)
  let currentSpuBatch = [];
  for (const spu of spuList) {
    const spuOps = allOps.filter(o => {
      if (o.operationType === 'create_product_revision' && o.targetId === spu) return true;
      if (o.operationType === 'replace_bom_item') {
        const entry = entriesById.get(o.targetId);
        return entry && (entry.productCode === spu || entry.parentId === spu);
      }
      return false;
    });

    if (currentSpuBatch.length + spuOps.length > maxBatchSize) {
      batches.push({
        summary: `ECN-2026-0710-LGS Rev 1.4: SPU Batch ${batches.length + 1} (${currentSpuBatch.length} operations)`,
        operations: currentSpuBatch,
      });
      currentSpuBatch = [];
    }
    currentSpuBatch.push(...spuOps);
  }
  if (currentSpuBatch.length > 0) {
    batches.push({
      summary: `ECN-2026-0710-LGS Rev 1.4: SPU Batch ${batches.length + 1} (${currentSpuBatch.length} operations)`,
      operations: currentSpuBatch,
    });
  }

  return batches;
}
