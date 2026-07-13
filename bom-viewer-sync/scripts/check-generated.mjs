import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateArtifacts } from './build.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'bom-build-'));

try {
  await generateArtifacts(tempDir);
  for (const name of ['admin.html', 'app-admin.js', 'styles.css', 'viewer.html']) {
    const [committed, generated] = await Promise.all([
      readFile(path.join(repoRoot, name), 'utf8'),
      readFile(path.join(tempDir, name), 'utf8'),
    ]);
    assert.equal(committed, generated, `${name} is stale; run npm run build`);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
