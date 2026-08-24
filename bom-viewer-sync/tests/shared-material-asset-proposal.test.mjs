import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyMutationProposalTransaction } from '../src/features/ai-assistant/mutation-engine.js';
import { buildSharedMaterialAssetProposalBatches } from '../src/features/ecn-proposal/shared-material-asset-proposal-builder.js';

function loadSnapshot() {
  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8'));
  const materialsData = JSON.parse(fs.readFileSync(path.join(root, 'data/materials.json'), 'utf8'));
  const bom = Object.fromEntries(manifest.products.map((code) => [
    code, JSON.parse(fs.readFileSync(path.join(root, `data/products/${code}.json`), 'utf8')),
  ]));
  const bomEntries = materialsData.materialDb.bomEntries.filter((entry) => entry.parentType === 'material'
    || Boolean(bom[entry.productCode || entry.parentId]?.color_info?.[entry.color]));
  return {
    isAdmin: true,
    canEditRevision: false,
    dirty: false,
    selection: { productCode: null, color: null },
    payload: { bom, materialDb: { ...materialsData.materialDb, bomEntries } },
  };
}

function fragmentedGroups(materials, field) {
  const groups = new Map();
  for (const material of Object.values(materials)) {
    if (!material[field]?.length) continue;
    const key = [material.name?.zh, material.spec?.zh, material.material?.zh, material.attr?.zh].join('\u0001');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(material);
  }
  return [...groups.values()].filter((group) => group.length > 1
    && new Set(group.flatMap((material) => (field === 'models3d' ? material[field].slice(0, 1) : material[field])
      .map((asset) => asset.url))).size > 1);
}

test('shared material asset proposal canonicalizes color-neutral 2D and 3D references', () => {
  let snapshot = loadSnapshot();
  const initial = structuredClone(snapshot.payload);
  const batches = buildSharedMaterialAssetProposalBatches(snapshot.payload);
  assert.ok(batches.length > 0);
  assert.ok(batches.flatMap((batch) => batch.operations).length > 0);
  for (const batch of batches) {
    snapshot = { ...snapshot, payload: applyMutationProposalTransaction(snapshot, batch).payload };
  }

  assert.equal(fragmentedGroups(snapshot.payload.materialDb.materials, 'drawings').length, 0);
  assert.equal(fragmentedGroups(snapshot.payload.materialDb.materials, 'models3d').length, 0);
  assert.equal(buildSharedMaterialAssetProposalBatches(snapshot.payload).length, 0);
  assert.equal(Object.keys(snapshot.payload.materialDb.materials).length, Object.keys(initial.materialDb.materials).length);
  assert.equal(snapshot.payload.materialDb.bomEntries.length, initial.materialDb.bomEntries.length);
});
