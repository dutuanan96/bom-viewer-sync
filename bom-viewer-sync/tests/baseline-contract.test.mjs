import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { coreUtils } from '../src/application.js';
import { loadDataPayload, repoRoot } from './helpers/load-data.mjs';

test('application exports the behavior required by the modular migration', () => {
  const utils = coreUtils;
  for (const name of [
    'appendNotificationEvent',
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
  const utils = coreUtils;
  const payload = utils.normalizePayload(loadDataPayload());
  assert.equal(Object.keys(payload.bom).length, 22);
  assert.equal(Object.keys(payload.materialDb.materials).length, 628);
  assert.equal(payload.materialDb.bomEntries.length, 2725);
});

test('current Viewer is standalone and current Admin uses the shared runtime chain', () => {
  const viewer = fs.readFileSync(path.join(repoRoot, 'viewer.html'), 'utf8');
  const admin = fs.readFileSync(path.join(repoRoot, 'admin.html'), 'utf8');
  assert.doesNotMatch(viewer, /<script src="(?:data|app-core|app-viewer)\.js/);
  assert.match(viewer, /mode:\s*['"]viewer['"]/);
  assert.match(admin, /app-admin\.js\?v=[a-f0-9]{12}/);
  assert.doesNotMatch(admin, /app-core\.js|app-viewer\.js/);
});
