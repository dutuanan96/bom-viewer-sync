import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  commitStagedArtifacts,
  computeBuildId,
  normalizeNewlines,
  renderHtmlArtifact,
} from '../scripts/build.mjs';
import { repoRoot } from './helpers/load-data.mjs';

const artifactNames = ['admin.html', 'app-admin.js', 'styles.css', 'viewer.html'];

test('build ID is stable across LF and CRLF worktrees', () => {
  const inputs = {
    shell: '<html>\n<body>{{BUILD_ID}}</body>\n</html>\n',
    css: 'body{color:#000}\n',
    adminBundle: '(()=>{console.log("admin")})();\n',
    viewerBundle: '(()=>{console.log("viewer")})();\n',
  };
  const withCrLf = Object.fromEntries(
    Object.entries(inputs).map(([name, value]) => [name, value.replaceAll('\n', '\r\n')]),
  );

  assert.equal(computeBuildId(inputs), computeBuildId(withCrLf));
  assert.equal(
    renderHtmlArtifact(inputs.shell, { BUILD_ID: 'abc123' }),
    renderHtmlArtifact(withCrLf.shell, { BUILD_ID: 'abc123' }),
  );
});

test('generated artifact verification ignores LF and CRLF differences', () => {
  const lf = '<html>\n<body>stable</body>\n</html>\n';
  const crlf = lf.replaceAll('\n', '\r\n');

  assert.equal(normalizeNewlines(lf), normalizeNewlines(crlf));
});

test('generated Viewer is one file with inline local code and CSS', () => {
  const viewer = fs.readFileSync(path.join(repoRoot, 'viewer.html'), 'utf8');
  assert.match(viewer, /<meta name="pdm-build" content="[a-f0-9]{12}">/);
  assert.match(viewer, /<style>[\s\S]+<\/style>/);
  assert.doesNotMatch(viewer, /<script src="(?:data|app-admin|app-core|app-viewer)\.js/);
  assert.match(viewer, /mode:\s*['"]viewer['"]/);
});

test('generated Admin loads only the complete local Admin bundle', () => {
  const admin = fs.readFileSync(path.join(repoRoot, 'admin.html'), 'utf8');
  assert.doesNotMatch(admin, /<script src="data\.js/);
  assert.match(admin, /shardRoot:\s*['"]bom-viewer-sync\/data['"]/);
  assert.match(admin, /<script src="app-admin\.js\?v=[a-f0-9]{12}"><\/script>/);
  assert.doesNotMatch(admin, /app-core\.js|app-viewer\.js/);
});

test('artifact commit rolls back the complete set after a partial failure', async (t) => {
  const outDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bom-build-rollback-'));
  const tempDir = path.join(outDir, '.build-tmp');
  const stagedDir = path.join(tempDir, 'staged');
  t.after(() => fs.promises.rm(outDir, { recursive: true, force: true }));

  await fs.promises.mkdir(stagedDir, { recursive: true });
  await Promise.all(artifactNames.flatMap((name) => [
    fs.promises.writeFile(path.join(outDir, name), `old:${name}`, 'utf8'),
    fs.promises.writeFile(path.join(stagedDir, name), `new:${name}`, 'utf8'),
  ]));

  let replacedCount = 0;
  const commitFile = async (stagedPath, finalPath) => {
    if (replacedCount === 1) throw new Error('injected artifact commit failure');
    await fs.promises.rm(finalPath, { force: true });
    await fs.promises.rename(stagedPath, finalPath);
    replacedCount += 1;
  };

  await assert.rejects(
    commitStagedArtifacts(outDir, artifactNames, { commitFile }),
    /injected artifact commit failure/,
  );

  assert.equal(replacedCount, 1, 'failure must occur after one artifact was replaced');
  for (const name of artifactNames) {
    assert.equal(await fs.promises.readFile(path.join(outDir, name), 'utf8'), `old:${name}`);
  }
  assert.equal(fs.existsSync(tempDir), false, 'transaction staging and backups must be removed');
});
