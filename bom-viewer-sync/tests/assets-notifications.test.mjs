import assert from 'node:assert/strict';
import test from 'node:test';
import { assetDisplayUrl, driveFileId, findBomAssets, pdfFrameUrl } from '../src/infrastructure/assets.js';
import { appendNotificationEvent, describePayloadChanges } from '../src/features/notifications.js';
import { coreUtils } from '../src/application.js';

const { normalizePayload } = coreUtils;

test('asset matching remains color-neutral and Drive-aware', () => {
  const assets = findBomAssets({ 'abc123bh|panel': [{ name: 'panel.pdf' }] }, {
    mat_code: 'ABC123WH',
    name_zh: 'Panel',
  });
  assert.equal(assets[0].name, 'panel.pdf');
  assert.equal(driveFileId('https://drive.google.com/file/d/file-id/view'), 'file-id');
  assert.equal(pdfFrameUrl('https://drive.google.com/file/d/file-id/view'), 'https://drive.google.com/file/d/file-id/preview');
  assert.match(assetDisplayUrl({ driveId: 'file-id' }, { protocol: 'file:', hostname: '' }), /thumbnail\?id=file-id/);
});

test('material diffs become persistent GitHub-save notifications', () => {
  const previous = normalizePayload({
    bom: {},
    materialDb: { materials: { m1: { id: 'm1', code: 'M1', name: { zh: 'Old name' } } }, bomEntries: [] },
  });
  const next = structuredClone(previous);
  next.materialDb.materials.m1.name.zh = 'New name';
  const changes = describePayloadChanges(previous, next);
  const updated = appendNotificationEvent(next, {
    id: 'notification-1',
    type: 'github-save',
    actor: 'admin',
    createdAt: '2026-07-11T00:00:00.000Z',
    changes,
  });
  assert.deepEqual(changes.map(({ code, field }) => ({ code, field })), [{ code: 'M1', field: 'name' }]);
  assert.equal(updated.notifications[0].id, 'notification-1');
});
