import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadDataPayload, loadLegacyCoreUtils, repoRoot } from './helpers/load-data.mjs';

test('legacy runtime exports the behavior required by the modular migration', () => {
  const utils = loadLegacyCoreUtils();
  for (const name of [
    'appendNotificationEvent',
    'buildGithubUpdateRequest',
    'buildBomTreeRows',
    'createPdmNavigation',
    'describePayloadChanges',
    'findBomAssets',
    'normalizePayload',
    'resolveBomRows',
    'syncLegacyBomFromMaterialDb',
  ]) {
    assert.equal(typeof utils[name], 'function', `${name} must remain available`);
  }
});

test('current data baseline remains clean enough to normalize', () => {
  const utils = loadLegacyCoreUtils();
  const payload = utils.normalizePayload(loadDataPayload());
  assert.equal(Object.keys(payload.bom).length, 22);
  assert.equal(Object.keys(payload.materialDb.materials).length, 643);
  assert.equal(payload.materialDb.bomEntries.length, 2725);
});

test('current Viewer is standalone and current Admin uses the shared runtime chain', () => {
  const viewer = fs.readFileSync(path.join(repoRoot, 'viewer.html'), 'utf8');
  const admin = fs.readFileSync(path.join(repoRoot, 'admin.html'), 'utf8');
  assert.doesNotMatch(viewer, /<script src="(?:data|app-core|app-viewer)\.js/);
  assert.match(viewer, /mode:\s*['"]viewer['"]/);
  assert.match(admin, /app-core\.js\?v=/);
  assert.match(admin, /app-admin\.js\?v=/);
});
