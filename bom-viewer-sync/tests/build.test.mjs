import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

function parseCsp(html) {
  const match = html.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)">/i,
  );
  assert.ok(match, 'expected a generated Content Security Policy meta tag');
  return new Map(match[1].split(';').map((part) => {
    const [directive, ...sources] = part.trim().split(/\s+/);
    return [directive, sources];
  }));
}

function inlineScriptHashes(html) {
  return [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`)
    .sort();
}

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

test('generated CSP governs resources and exactly hashes every inline script', () => {
  for (const name of ['admin.html', 'viewer.html']) {
    const html = fs.readFileSync(path.join(repoRoot, name), 'utf8');
    const metaIndex = html.indexOf('<meta http-equiv="Content-Security-Policy"');
    const governedResourceIndexes = [html.indexOf('<link '), html.indexOf('<style'), html.indexOf('<script')]
      .filter((index) => index >= 0);

    assert.ok(metaIndex >= 0, `${name} must contain a CSP meta tag`);
    assert.ok(
      governedResourceIndexes.every((index) => metaIndex < index),
      `${name} CSP must precede governed resources`,
    );

    const csp = parseCsp(html);
    assert.deepEqual(csp.get('default-src'), ["'none'"]);
    assert.deepEqual(csp.get('object-src'), ["'none'"]);
    assert.deepEqual(csp.get('base-uri'), ["'none'"]);
    assert.deepEqual(csp.get('form-action'), ["'none'"]);
    assert.deepEqual(csp.get('style-src'), [
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com',
    ]);
    assert.deepEqual(csp.get('img-src'), [
      "'self'",
      'data:',
      'blob:',
      'https://drive.google.com',
      'https://lh3.googleusercontent.com',
      'https://raw.githubusercontent.com',
      'https://cdn.jsdelivr.net',
    ]);
    assert.deepEqual(csp.get('connect-src'), [
      'https://api.github.com',
      'https://raw.githubusercontent.com',
      'https://cdn.jsdelivr.net',
      'https://openrouter.ai',
    ]);
    assert.deepEqual(csp.get('frame-src'), [
      "'self'",
      'blob:',
      'https://drive.google.com',
      'https://raw.githubusercontent.com',
      'https://cdn.jsdelivr.net',
    ]);
    assert.equal(csp.has('frame-ancestors'), false);
    assert.equal(csp.has('sandbox'), false);
    assert.equal(csp.has('report-uri'), false);

    const scriptSources = csp.get('script-src') ?? [];
    assert.equal(scriptSources.includes("'unsafe-inline'"), false);
    assert.equal(scriptSources.includes("'unsafe-eval'"), false);
    assert.equal(scriptSources.some((source) => /^https?:|^\*$/.test(source)), false);
    assert.equal(scriptSources.includes("'self'"), name === 'admin.html');
    assert.deepEqual(
      scriptSources.filter((source) => !source.startsWith("'sha256-")),
      name === 'admin.html'
        ? ["'self'", "'wasm-unsafe-eval'"]
        : ["'wasm-unsafe-eval'"],
    );
    assert.deepEqual(
      scriptSources.filter((source) => source.startsWith("'sha256-")).sort(),
      inlineScriptHashes(html),
      `${name} script hashes must match exact emitted inline bytes with no stale hashes`,
    );
  }
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
