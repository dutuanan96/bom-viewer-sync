import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers/load-data.mjs';

test('generated Viewer is one file with inline local code and CSS', () => {
  const viewer = fs.readFileSync(path.join(repoRoot, 'viewer.html'), 'utf8');
  assert.match(viewer, /<meta name="pdm-build" content="[a-f0-9]{12}">/);
  assert.match(viewer, /<style>[\s\S]+<\/style>/);
  assert.doesNotMatch(viewer, /<script src="(?:data|app-admin|app-core|app-viewer)\.js/);
  assert.match(viewer, /mode:\s*['"]viewer['"]/);
});

test('generated Admin loads only the complete local Admin bundle', () => {
  const admin = fs.readFileSync(path.join(repoRoot, 'admin.html'), 'utf8');
  assert.match(admin, /<script src="data\.js\?v=22"><\/script>/);
  assert.match(admin, /<script src="app-admin\.js\?v=[a-f0-9]{12}"><\/script>/);
  assert.doesNotMatch(admin, /app-core\.js|app-viewer\.js/);
});
