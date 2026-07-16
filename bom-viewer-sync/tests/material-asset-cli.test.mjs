import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runMaterialAssetAudit } from '../scripts/audit-material-assets.mjs';

function fixturePayload() {
  return {
    drawings: {},
    models3d: {},
    materialDb: {
      materials: {
        shared: {
          id: 'shared',
          code: 'MAT-1',
          drawings: [
            {
              name: 'same.pdf',
              path: 'Google Drive > P1 > same.pdf',
              url: 'https://drive.google.com/file/d/pdf-a/view',
            },
            {
              name: 'same.pdf',
              path: 'Google Drive > P2 > same.pdf',
              url: 'https://drive.google.com/file/d/pdf-b/view',
            },
          ],
          models3d: [
            { name: 'same-a.glb', path: 'models3d/a.glb' },
            { name: 'same-b.glb', path: 'models3d/b.glb' },
          ],
        },
      },
      bomEntries: [
        { id: 'one', parentType: 'product', productCode: 'P1', materialId: 'shared' },
        { id: 'two', parentType: 'product', productCode: 'P2', materialId: 'shared' },
      ],
    },
  };
}

async function setupFixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'material-assets-'));
  const pdfRoot = path.join(rootDir, 'pdfs');
  await mkdir(path.join(pdfRoot, 'P1'), { recursive: true });
  await mkdir(path.join(pdfRoot, 'P2'), { recursive: true });
  await writeFile(path.join(rootDir, 'materials.json'), `${JSON.stringify(fixturePayload(), null, 2)}\n`);
  await writeFile(path.join(rootDir, 'mapping.json'), `${JSON.stringify({
    version: 1,
    sources: {
      'https://drive.google.com/file/d/pdf-a/view': [
        'P1/same.pdf',
        'P2/same.pdf',
      ],
    },
    materials: {
      shared: {
        drawings: 'https://drive.google.com/file/d/pdf-a/view',
        models3d: 'models3d/a.glb',
      },
    },
  }, null, 2)}\n`);
  await writeFile(path.join(pdfRoot, 'P1', 'same.pdf'), 'same-pdf');
  await writeFile(path.join(pdfRoot, 'P2', 'same.pdf'), 'same-pdf');
  await mkdir(path.join(rootDir, 'models3d'));
  await writeFile(path.join(rootDir, 'models3d', 'a.glb'), 'same-model');
  await writeFile(path.join(rootDir, 'models3d', 'b.glb'), 'same-model');
  return { rootDir, pdfRoot };
}

test('dry-run hashes assets deterministically without writing materials.json', async () => {
  const { rootDir, pdfRoot } = await setupFixture();
  try {
    const inputPath = path.join(rootDir, 'materials.json');
    const before = await readFile(inputPath, 'utf8');

    const first = await runMaterialAssetAudit({
      rootDir,
      pdfRoot,
      inputPath,
    });
    const second = await runMaterialAssetAudit({
      rootDir,
      pdfRoot,
      inputPath,
    });

    assert.equal(first.applied, false);
    assert.equal(first.audit.materials.shared.drawings.status, 'duplicate');
    assert.equal(first.audit.materials.shared.models3d.status, 'duplicate');
    assert.deepEqual(first, second);
    assert.equal(await readFile(inputPath, 'utf8'), before);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('apply requires a mapping and is idempotent', async () => {
  const { rootDir, pdfRoot } = await setupFixture();
  try {
    const inputPath = path.join(rootDir, 'materials.json');
    await assert.rejects(
      runMaterialAssetAudit({
        rootDir,
        pdfRoot,
        inputPath,
        apply: true,
      }),
      /MAPPING_REQUIRED/,
    );

    const first = await runMaterialAssetAudit({
      rootDir,
      pdfRoot,
      inputPath,
      mappingPath: path.join(rootDir, 'mapping.json'),
      apply: true,
    });
    const afterFirst = await readFile(inputPath, 'utf8');
    const second = await runMaterialAssetAudit({
      rootDir,
      pdfRoot,
      inputPath,
      mappingPath: path.join(rootDir, 'mapping.json'),
      apply: true,
    });

    assert.equal(first.applied, true);
    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.equal(await readFile(inputPath, 'utf8'), afterFirst);
    const payload = JSON.parse(afterFirst);
    assert.equal(payload.materialDb.materials.shared.drawings.length, 1);
    assert.equal(payload.materialDb.materials.shared.models3d.length, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('offline audit fails instead of downloading an unresolved PDF', async () => {
  const { rootDir, pdfRoot } = await setupFixture();
  try {
    const inputPath = path.join(rootDir, 'materials.json');
    const payload = JSON.parse(await readFile(inputPath, 'utf8'));
    payload.materialDb.materials.shared.drawings[0].path = '';
    await writeFile(inputPath, `${JSON.stringify(payload, null, 2)}\n`);

    await assert.rejects(
      runMaterialAssetAudit({ rootDir, pdfRoot, inputPath }),
      /UNRESOLVED_PDF_SOURCE/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('mapped product sources must all have identical content', async () => {
  const { rootDir, pdfRoot } = await setupFixture();
  try {
    const inputPath = path.join(rootDir, 'materials.json');
    await writeFile(path.join(pdfRoot, 'P2', 'same.pdf'), 'different-pdf');

    await assert.rejects(
      runMaterialAssetAudit({
        rootDir,
        pdfRoot,
        inputPath,
        mappingPath: path.join(rootDir, 'mapping.json'),
      }),
      /SOURCE_CONTENT_CONFLICT/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
