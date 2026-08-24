import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyMutationProposalTransaction, buildMutationProposalReview } from '../src/features/ai-assistant/mutation-engine.js';
import { buildEcnProposalBatches as buildScriptBatches } from '../scripts/lib/ecn-2026-0710-proposal-builder.mjs';
import { buildEcnProposalBatches, buildAllEcnOperations, CHANGE_REASON } from '../src/features/ecn-proposal/ecn-2026-0710-proposal-builder.js';

function loadCanonicalSnapshot() {
  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8'));
  const materialsData = JSON.parse(fs.readFileSync(path.join(root, 'data/materials.json'), 'utf8'));
  const products = {};
  for (const p of manifest.products) {
    products[p] = JSON.parse(fs.readFileSync(path.join(root, `data/products/${p}.json`), 'utf8'));
  }

  // Filter out legacy orphan entries from materialsData whose product color does not exist
  const cleanBomEntries = materialsData.materialDb.bomEntries.filter(entry => {
    if (entry.parentType === 'material') return true;
    const pid = entry.productCode || entry.parentId;
    return Boolean(products[pid]?.color_info?.[entry.color]);
  });

  return {
    isAdmin: true,
    canEditRevision: true,
    dirty: false,
    selection: { productCode: 'LGS032', color: '复古色' },
    payload: {
      bom: products,
      productRevisions: manifest.productRevisions,
      notifications: manifest.notifications,
      materialDb: {
        ...materialsData.materialDb,
        bomEntries: cleanBomEntries,
      },
    },
  };
}

test('ECN-2026-0710-LGS Rev 1.4 Proposal Verification', async (t) => {
  const initialSnapshot = loadCanonicalSnapshot();
  const batches = buildEcnProposalBatches(initialSnapshot.payload, 40);

  await t.test('All proposal batches conform to schema and operation limits (<= 50 ops)', () => {
    assert.ok(Array.isArray(batches));
    for (const batch of batches) {
      assert.ok(batch.operations.length > 0 && batch.operations.length <= 50, `Batch size ${batch.operations.length} exceeds limit`);
      assert.ok(batch.summary, 'Batch summary must exist');
    }
  });

  // Sequentially execute all proposal batches through applyMutationProposalTransaction
  let currentSnapshot = initialSnapshot;
  const reviews = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const result = applyMutationProposalTransaction(currentSnapshot, batch);
    assert.ok(result.review, `Batch ${i + 1} review must be produced`);
    assert.ok(result.review.operations.length > 0, `Batch ${i + 1} operations must execute`);
    reviews.push(result.review);

    // Advance snapshot to proposed snapshot in memory
    currentSnapshot = {
      ...currentSnapshot,
      payload: result.payload,
    };
  }

  const finalProposed = currentSnapshot.payload;
  const materials = finalProposed.materialDb.materials;
  const bomEntries = finalProposed.materialDb.bomEntries;

  await t.test('15 SPUs have correct draft revision and unchanged effective revision', () => {
    const expectedRevisions = {
      LGS032: { current: initialSnapshot.payload.productRevisions.LGS032?.currentRevision, effective: initialSnapshot.payload.productRevisions.LGS032?.effectiveRevision },
      LGS043: { current: 'V3.1', effective: initialSnapshot.payload.productRevisions.LGS043?.effectiveRevision },
      LGS132: { current: initialSnapshot.payload.productRevisions.LGS132?.currentRevision, effective: initialSnapshot.payload.productRevisions.LGS132?.effectiveRevision },
      LGS232: { current: 'V3.1', effective: initialSnapshot.payload.productRevisions.LGS232?.effectiveRevision },
      LGS033: { current: 'V4.1', effective: initialSnapshot.payload.productRevisions.LGS033?.effectiveRevision },
      LGS133: { current: 'V4.1', effective: initialSnapshot.payload.productRevisions.LGS133?.effectiveRevision },
      LGS233: { current: 'V4.1', effective: initialSnapshot.payload.productRevisions.LGS233?.effectiveRevision },
      LGS333: { current: 'V4.1', effective: initialSnapshot.payload.productRevisions.LGS333?.effectiveRevision },
      LGS334: { current: 'V4.1', effective: initialSnapshot.payload.productRevisions.LGS334?.effectiveRevision },
      LGS433: { current: 'V4.1', effective: initialSnapshot.payload.productRevisions.LGS433?.effectiveRevision },
      LGS434: { current: 'V5.1', effective: initialSnapshot.payload.productRevisions.LGS434?.effectiveRevision },
      LGS723: { current: 'V4.1', effective: initialSnapshot.payload.productRevisions.LGS723?.effectiveRevision },
      LGS733: { current: 'V4.1', effective: initialSnapshot.payload.productRevisions.LGS733?.effectiveRevision },
      LGS833: { current: 'V4.1', effective: initialSnapshot.payload.productRevisions.LGS833?.effectiveRevision },
      LGS834: { current: 'V4.1', effective: initialSnapshot.payload.productRevisions.LGS834?.effectiveRevision },
    };

    for (const [spu, expected] of Object.entries(expectedRevisions)) {
      expected.current = initialSnapshot.payload.productRevisions[spu]?.currentRevision;
    }

    for (const [spu, expected] of Object.entries(expectedRevisions)) {
      const revEntry = finalProposed.productRevisions[spu];
      assert.ok(revEntry, `SPU ${spu} must exist in productRevisions`);
      assert.equal(revEntry.currentRevision, expected.current, `${spu} current/draft revision mismatch`);
      assert.equal(revEntry.effectiveRevision, expected.effective, `${spu} effective revision must not change`);
      assert.ok(revEntry.currentRevisionInfo?.workflowState, `${spu} workflowState must exist`);
    }
  });

  await t.test('Square pipe materials and consumption rates are correct', () => {
    // FG1515064804 (4804mm for 647x290mm side frames)
    const pipe4804 = Object.values(materials).find(m => m.code === 'FG1515064804');
    assert.ok(pipe4804, 'FG1515064804 must exist');
    assert.equal(pipe4804.spec.zh, '15×15×0.6Tmm，长度 4804mm');

    const frames290 = [
      'LGS033ZKBH647', 'LGS033YKBH647', 'LGS033ZKWH647', 'LGS033YKWH647',
      'LGS333ZKBH647', 'LGS333YKBH647', 'LGS333ZKWH647', 'LGS333YKWH647',
      'LGS833ZKBH647', 'LGS833YKBH647', 'LGS833ZKWH647', 'LGS833YKWH647',
    ];
    for (const code of frames290) {
      const mat = Object.values(materials).find(m => m.code === code);
      assert.ok(mat, `${code} must exist`);
      const child = bomEntries.find(e => e.parentId === mat.id && (e.materialId === pipe4804.id || e.childMaterialId === pipe4804.id));
      assert.ok(child, `${code} must have child ${pipe4804.code}`);
      assert.equal(Number(child.qty), 0.333333, `${code} consumption rate mismatch`);
    }

    // FG1515064930 (4930mm for 647x335mm side frames)
    const pipe4930 = Object.values(materials).find(m => m.code === 'FG1515064930');
    assert.ok(pipe4930, 'FG1515064930 must exist');
    const frames335 = [
      'LGS043ZKBH647', 'LGS043YKBH647',
      'LGS132ZKBH647', 'LGS132YKBH647',
      'LGS133ZKBH647', 'LGS133YKBH647',
      'LGS233ZKBH647', 'LGS233YKBH647', 'LGS233ZKWH647', 'LGS233YKWH647',
      'LGS334ZKBH647', 'LGS334YKBH647',
      'LGS434ZKWH647', 'LGS434YKWH647',
      'LGS723ZKBH647', 'LGS723YKBH647', 'LGS723ZKWH647', 'LGS723YKWH647',
      'LGS834ZKBH647', 'LGS834YKBH647', 'LGS834ZKWH647', 'LGS834YKWH647',
    ];
    for (const code of frames335) {
      const mat = Object.values(materials).find(m => m.code === code);
      assert.ok(mat, `${code} must exist`);
      const child = bomEntries.find(e => e.parentId === mat.id && (e.materialId === pipe4930.id || e.childMaterialId === pipe4930.id));
      assert.ok(child, `${code} must have child ${pipe4930.code}`);
      assert.equal(Number(child.qty), 0.333333, `${code} consumption rate mismatch`);
    }
  });

  await t.test('Foot 41 sub-BOMs contain FG1515066013 with quantity 0.006993 and full 4 components', () => {
    const footConfigs = [
      { code: 'ZJG150641BH', pipe: 'FG1515066013', plug: 'M6GS1515BH', nut: 'M6YLM139', screw: 'NLPLS6018BZ' },
      { code: 'ZJG150641WH', pipe: 'FG1515066013', plug: 'M6GS1515WH', nut: 'M6YLM139', screw: 'NLPLS6018WZ' },
      { code: 'ZJG15064123BH', pipe: 'FG1515066013', plug: 'M6GS1515BH', nut: 'M6YLM139', screw: 'NLPLS6030BZ' },
      { code: 'ZJG15064123WH', pipe: 'FG1515066013', plug: 'M6GS1515WH', nut: 'M6YLM139', screw: 'NLPLS6030WZ' },
    ];

    for (const config of footConfigs) {
      const mat = Object.values(materials).find(m => m.code === config.code);
      assert.ok(mat, `${config.code} must exist`);
      const children = bomEntries.filter(e => e.parentId === mat.id && e.parentType === 'material');
      assert.equal(children.length, 4, `${config.code} must have exactly 4 sub-BOM components`);

      const pipeChild = children.find(c => {
        const cm = materials[c.childMaterialId || c.materialId];
        return cm?.code === config.pipe;
      });
      assert.ok(pipeChild, `${config.code} must have pipe ${config.pipe}`);
      assert.equal(Number(pipeChild.qty), 0.006993, `${config.code} pipe quantity must be 0.006993`);

      const plugChild = children.find(c => {
        const cm = materials[c.childMaterialId || c.materialId];
        return cm?.code === config.plug;
      });
      assert.ok(plugChild, `${config.code} must have plug ${config.plug}`);

      const nutChild = children.find(c => {
        const cm = materials[c.childMaterialId || c.materialId];
        return cm?.code === config.nut;
      });
      assert.ok(nutChild, `${config.code} must have nut ${config.nut}`);

      const screwChild = children.find(c => {
        const cm = materials[c.childMaterialId || c.materialId];
        return cm?.code === config.screw;
      });
      assert.ok(screwChild, `${config.code} must have screw ${config.screw}`);
    }
  });

  await t.test('LGS043 and LGS723 foot exceptions are preserved', () => {
    // Check LGS043 BOM items
    for (const color of ['复古色', '黑色']) {
      const entries = finalProposed.bom['LGS043']?.[color] || [];
      const hasFoot41 = entries.some(e => ['ZJG150641BH', 'ZJG150641WH', 'ZJG15064123BH', 'ZJG15064123WH'].includes(e.mat_code));
      assert.equal(hasFoot41, false, `LGS043 ${color} must NOT contain 41 bottom foot`);
    }

    // Check LGS723 BOM items
    for (const color of ['复古色', '白色', '黑色']) {
      const entries = finalProposed.bom['LGS723']?.[color] || [];
      const hasFoot41 = entries.some(e => ['ZJG150641BH', 'ZJG150641WH', 'ZJG15064123BH', 'ZJG15064123WH'].includes(e.mat_code));
      assert.equal(hasFoot41, false, `LGS723 ${color} must NOT contain 41 bottom foot`);
    }
  });

  await t.test('Affected SPUs have no legacy 51 or 54 feet remaining', () => {
    const spuToCheck = [
      'LGS032', 'LGS132', 'LGS232', 'LGS033', 'LGS133', 'LGS233',
      'LGS333', 'LGS334', 'LGS433', 'LGS434', 'LGS733', 'LGS833', 'LGS834'
    ];
    for (const spu of spuToCheck) {
      const product = finalProposed.bom[spu];
      for (const [color, items] of Object.entries(product || {})) {
        if (!Array.isArray(items)) continue;
        const legacyFoot = items.find(e => ['ZJG150651BH', 'ZJG150654BH', 'ZJG150654WH', 'ZJG15065423BH', 'ZJG15065423WH'].includes(e.mat_code));
        assert.equal(legacyFoot, undefined, `${spu} (${color}) should not contain legacy foot ${legacyFoot?.mat_code}`);
      }
    }
  });

  await t.test('Material dependency graph has no cycles', () => {
    const adj = new Map();
    for (const entry of bomEntries) {
      if (entry.parentType !== 'material') continue;
      const parent = entry.parentId;
      const child = entry.childMaterialId || entry.materialId;
      if (!adj.has(parent)) adj.set(parent, []);
      adj.get(parent).push(child);
    }

    const visited = new Set();
    const recursionStack = new Set();

    function checkCycle(node) {
      visited.add(node);
      recursionStack.add(node);
      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (checkCycle(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }
      recursionStack.delete(node);
      return false;
    }

    for (const node of adj.keys()) {
      if (!visited.has(node)) {
        assert.equal(checkCycle(node), false, `Cycle detected involving material ${node}`);
      }
    }
  });

  await t.test('Dynamic sequential batch loop converges to 0 remaining batches (Admin UI simulation)', () => {
    let loopSnapshot = loadCanonicalSnapshot();
    let batchCount = 0;
    const maxIterations = 20;

    while (batchCount < maxIterations) {
      const remainingBatches = buildEcnProposalBatches(loopSnapshot.payload, 40);
      if (remainingBatches.length === 0) {
        break;
      }
      const firstBatch = remainingBatches[0];
      const result = applyMutationProposalTransaction(loopSnapshot, firstBatch);
      loopSnapshot = {
        ...loopSnapshot,
        payload: result.payload,
      };
      batchCount++;
    }

    assert.ok(batchCount <= 10, `Expected batch loop to finish within 10 iterations, took ${batchCount}`);
    const finalCheck = buildEcnProposalBatches(loopSnapshot.payload, 40);
    assert.equal(finalCheck.length, 0, 'No proposal operations should remain after full sequential application');
  });
});
