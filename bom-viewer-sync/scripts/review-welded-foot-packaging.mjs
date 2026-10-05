import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildWeldedFootPackagingProposal } from '../src/features/ecn-proposal/welded-foot-packaging-proposal-builder.js';
import { buildMutationProposalReview, applyMutationProposalTransaction } from '../src/features/ai-assistant/mutation-engine.js';
import { assembleShardedPayload } from '../src/domain/sharded-data.js';
import { buildLogicalShardFiles } from '../src/domain/sharded-files.js';

const outputDirectory = process.argv[2];
const applyLocal = process.argv.includes('--apply-local');
if (!outputDirectory) throw new Error('Provide a review output directory.');
const baseSha = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
const read = (file) => JSON.parse(execFileSync('git', ['show', `${baseSha}:bom-viewer-sync/data/${file}`], {
  encoding: 'utf8', maxBuffer: 60 * 1024 * 1024,
}));
const manifest = read('manifest.json');
const payload = await assembleShardedPayload(manifest, read('materials.json'), async (code) => read(`products/${code}.json`));
payload.bom = { ...payload.bom };
const original = structuredClone(payload);
const { packagingNotes, ...proposal } = buildWeldedFootPackagingProposal(payload);
const snapshot = { isAdmin: true, isEcnProposal: true, canEditRevision: true, dirty: false, payload,
  selection: { currentView: 'ProductList', productCode: null, color: null, revision: null, materialId: '' } };
const review = buildMutationProposalReview(snapshot, proposal);
const result = applyMutationProposalTransaction(snapshot, proposal);
assert.deepEqual(payload, original);
assert.deepEqual(result.payload.productRevisions, original.productRevisions);
assert.deepEqual(result.payload.materialDb.bomEntries.filter((row) => row.parentType === 'material'),
  original.materialDb.bomEntries.filter((row) => row.parentType === 'material'));
for (const note of packagingNotes) {
  const materials = Object.values(result.payload.materialDb.materials);
  for (const [code, qty] of [[note.oldBag, note.remainingQuantity], [note.newBag, 1]]) {
    const material = materials.find((item) => item.code === code);
    const rows = result.payload.materialDb.bomEntries.filter((row) => row.parentType === 'product'
      && row.productCode === note.productCode && row.color === note.color && row.materialId === material.id);
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].qty), qty);
    assert.equal(rows[0].remark, code === note.oldBag ? note.updatedOldRemark : note.newRemark);
  }
}
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, 'proposal.json'), JSON.stringify(proposal, null, 2));
writeFileSync(path.join(outputDirectory, 'review.json'), JSON.stringify({ baseSha, review, packagingNotes }, null, 2));
const lines = ['# ECN — Quy cách chân hàn và túi PE', '', `Canonical base: ${baseSha}`, '',
  `Số operation thực tế: ${proposal.operations.length}; 1 batch. Dry-run: PASS.`, '',
  '## Before / after', '',
  '- LGS433 thanh đáy trước/sau WH/BH: 1098×15×15mm → 1098×62×15mm.',
  '- LGS434 thanh đáy trái-trước/trái-sau WH/BH: 760×15×15mm → 760×62×15mm.',
  '- Tạo PE1160X120 và PE830X120; giữ nguyên các vật liệu túi 60mm.', '',
  '| SPU | Màu | Túi cũ trước | Túi cũ sau | Túi mới sau |',
  '| --- | --- | --- | --- | --- |',
  ...packagingNotes.map((note) => `| ${note.productCode} | ${note.color} | ${note.oldBag} ×${note.productCode === 'LGS433' ? 2 : 4} | ${note.oldBag} ×${note.remainingQuantity} | ${note.newBag} ×1 |`), '',
  '## Ghi chú đóng gói được cập nhật trong cùng transaction', '',
  ...packagingNotes.flatMap((note) => [
    `- ${note.productCode} / ${note.color}: ${note.newBag} — ${note.newRemark}`,
    `  ${note.oldBag}: ${note.updatedOldRemark}`,
  ]), '',
  '## Xác minh', '',
  applyLocal ? '- Đã apply vào shard local sau dry-run; chưa release hoặc publish.' : '- Chỉ dry-run trên payload clone; chưa apply PDM, chưa release hoặc publish.',
  '- Registry revision, prerequisite và toàn bộ quan hệ vật liệu con giữ nguyên.',
  '- Không tạo revision mới; LGS433 V5 / LGS434 V6 vẫn draft.',
];
writeFileSync(path.join(outputDirectory, 'ECN-review.md'), lines.join('\n'));
if (applyLocal) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== baseSha) throw new Error('Local HEAD must match the canonical base before local application.');
  const generated = buildLogicalShardFiles(result.payload);
  const changedFiles = ['materials.json', 'products/LGS433.json', 'products/LGS434.json'];
  for (const file of ['manifest.json', 'materials.json', ...manifest.products.map((code) => `products/${code}.json`)]) {
    assert.deepEqual(JSON.parse(readFileSync(path.join('data', file), 'utf8')), read(file), `Local data differs: ${file}`);
    if (!changedFiles.includes(file)) assert.deepEqual(JSON.parse(generated.get(file)), read(file), `Unrelated shard changed: ${file}`);
  }
  const backup = path.join(outputDirectory, 'backup');
  for (const file of changedFiles) {
    const target = path.join(backup, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(path.join('data', file)));
  }
  for (const file of changedFiles) writeFileSync(path.join('data', file), generated.get(file));
  writeFileSync(path.join(outputDirectory, 'local-apply.json'), JSON.stringify({ baseSha, changedFiles, backup, operationCount: proposal.operations.length }, null, 2));
}
console.log(JSON.stringify({ baseSha, operationCount: proposal.operations.length, variants: packagingNotes.length,
  dryRun: 'PASS', appliedLocal: applyLocal, outputDirectory }));
