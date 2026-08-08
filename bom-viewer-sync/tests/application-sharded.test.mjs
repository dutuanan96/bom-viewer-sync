import assert from 'node:assert/strict';
import test from 'node:test';
import { BomApplication, coreUtils } from '../src/application.js';

test('application does not bootstrap runtime state from the legacy BOM_VIEWER_DATA global', () => {
  const previous = globalThis.BOM_VIEWER_DATA;
  globalThis.BOM_VIEWER_DATA = {
    version: 99,
    bom: { LEGACY: { id: 'LEGACY' } },
    materialDb: { materials: {}, bomEntries: [] },
  };
  try {
    const app = new BomApplication({
      mode: 'viewer',
      config: { owner: 'test', repo: 'test', branch: 'main', shardRoot: 'data' },
      githubData: {},
    });
    assert.deepEqual(Object.keys(app.state.bom), []);
    assert.equal(app.state.payload.version, 2);
  } finally {
    if (previous === undefined) delete globalThis.BOM_VIEWER_DATA;
    else globalThis.BOM_VIEWER_DATA = previous;
  }
});

test('application normalizes current notifications and identifies incoming notifications', () => {
  const existing = {
    id: 'notification-existing',
    type: 'github-save',
    actor: 'admin',
    createdAt: '2026-07-11T00:00:00.000Z',
    changes: [{ kind: 'material', code: 'M1', field: 'name', before: 'Old', after: 'New' }],
  };
  const incoming = {
    id: 'notification-incoming',
    type: 'github-save',
    actor: 'admin',
    createdAt: '2026-07-12T00:00:00.000Z',
    changes: [{ kind: 'material', code: 'M2', field: 'spec', before: 'A', after: 'B' }],
  };
  const app = Object.create(BomApplication.prototype);
  app.state = { payload: { notifications: [null, existing] } };

  const current = app.notifications();
  const newNotifications = app.newNotifications(current, [existing, incoming]);

  assert.deepEqual(current.map((notification) => notification.id), ['notification-existing']);
  assert.deepEqual(newNotifications.map((notification) => notification.id), ['notification-incoming']);
  assert.equal(newNotifications[0].changes[0].field, 'spec');
});

test('post-save batch release requires a reason and releases every affected draft', async () => {
  const app = Object.create(BomApplication.prototype);
  app.state = {
    payload: coreUtils.normalizePayload({
      bom: { P1: { revision: 'V2' }, P2: { revision: 'V5' } },
      productRevisions: {
        P1: { currentRevision: 'V2', currentRevisionInfo: { workflowState: 'draft' } },
        P2: { currentRevision: 'V5', currentRevisionInfo: { workflowState: 'draft' } },
      },
      materialDb: { materials: {}, bomEntries: [] },
    }),
    dirty: false,
  };
  app.label = (key) => key === 'batchReleaseConfirm' ? '{products}' : key;
  app.openPdmConfirm = (message, onConfirm) => {
    assert.equal(message, 'P1, P2');
    onConfirm();
  };
  app.openPdmPrompt = (title, fields, onConfirm) => {
    assert.equal(fields[0].required, true);
    onConfirm({ releaseReason: 'Approved batch change' });
  };
  const completed = new Promise((resolve) => {
    app.writeGithubData = async (token, options) => {
      assert.equal(token, 'token');
      assert.deepEqual(options, { historyAction: 'release', historyReason: 'Approved batch change' });
      resolve();
    };
  });
  app.setStatus = () => {};

  app.offerBatchRelease(['P1', 'P2'], 'token');
  await completed;

  assert.equal(app.state.payload.productRevisions.P1.currentRevisionInfo.workflowState, 'released');
  assert.equal(app.state.payload.productRevisions.P2.currentRevisionInfo.workflowState, 'released');
  assert.equal(app.state.payload.productRevisions.P1.effectivityEvents[0].reason, 'Approved batch change');
});

test('save diffs the current remote payload before writing its expectedHeadSha and payload', async () => {
  const remotePayload = coreUtils.normalizePayload({
    bom: {},
    notifications: [{
      id: 'remote-only-notification',
      type: 'github-save',
      actor: 'other-admin',
      createdAt: '2026-07-12T00:00:00.000Z',
    }],
    materialDb: {
      materials: { m1: { id: 'm1', code: 'M1', name: { zh: 'Remote old', vi: 'Remote old' } } },
      bomEntries: [],
    },
  });
  const localPayload = structuredClone(remotePayload);
  localPayload.notifications = [];
  localPayload.materialDb.materials.m1.name.zh = 'Local new';
  localPayload.productRevisions = {
    P1: {
      currentRevision: 'V4.1',
      effectiveRevision: 'V4.1',
      currentRevisionInfo: {
        sourceRevision: 'V4',
        workflowState: 'released',
      },
      revisions: [],
      effectivityEvents: [{
        id: 'effectivity_release_v4_1',
        action: 'release',
        revision: 'V4.1',
        previousRevision: 'V4',
        occurredAt: '2026-07-13T02:03:04.000Z',
        reason: 'Approved for production',
      }],
    },
  };
  const calls = [];
  let writeInput;
  const app = Object.create(BomApplication.prototype);
  app.config = { branch: 'main' };
  app.githubData = {
    async loadForWrite(token) {
      calls.push({ type: 'loadForWrite', token });
      return { expectedHeadSha: 'current-remote-sha', payload: remotePayload };
    },
    async write(input) {
      calls.push({ type: 'write', input });
      writeInput = input;
      return { commitSha: 'new-commit-sha' };
    },
  };
  app.state = {
    payload: localPayload,
    bom: localPayload.bom,
    drawings: localPayload.drawings,
    manuals: localPayload.manuals,
    models3d: localPayload.models3d,
    productImages: localPayload.productImages,
    materialDb: localPayload.materialDb,
    loadedPayload: coreUtils.normalizePayload({
      bom: {},
      materialDb: {
        materials: { m1: { id: 'm1', code: 'M1', name: { zh: 'Stale value', vi: 'Stale value' } } },
        bomEntries: [],
      },
    }),
    dirty: true,
  };
  app.label = (key) => key;
  app.setStatus = () => {};
  app.renderAll = () => {};

  await app.writeGithubData('token');

  assert.deepEqual(calls.map(({ type }) => type), ['loadForWrite', 'write']);
  assert.equal(writeInput.expectedHeadSha, 'current-remote-sha');

  const writtenPayload = writeInput.payload;
  assert.equal(writtenPayload.notifications.length, 2); // local notification + remote-only
  assert.equal(writtenPayload.notifications[1].id, 'remote-only-notification');
  assert.equal(writtenPayload.notifications[0].changes[0].field, 'name');
  assert.equal(writtenPayload.notifications[0].changes[0].before, 'Remote old');

  assert.equal(app.state.loadedPayload.materialDb.materials.m1.name.zh, 'Local new');
  assert.equal(app.state.loadedPayload.productRevisions.P1.currentRevision, 'V4.1');
  assert.equal(app.state.loadedPayload.productRevisions.P1.effectiveRevision, 'V4.1');
  assert.equal(app.state.loadedPayload.productRevisions.P1.effectivityEvents[0].reason, 'Approved for production');
  assert.equal(app.state.payload.materialDb.materials.m1.name.zh, 'Local new');
});

function pendingAssetSaveApp({ uploadAsset, write }) {
  const contentHash = 'a'.repeat(64);
  const pendingId = `assets/pdfs/M1_${contentHash}_drawing.pdf`;
  const localPayload = coreUtils.normalizePayload({
    bom: {},
    materialDb: {
      materials: {
        m1: {
          id: 'm1',
          code: 'M1',
          name: { zh: 'Material', vi: 'Material' },
          drawings: [{
            name: 'Drawing',
            url: '',
            sourceUrl: 'preserved-source',
            pendingAssetId: pendingId,
          }],
          models3d: [],
        },
      },
      bomEntries: [],
    },
  });
  const remotePayload = coreUtils.normalizePayload({
    bom: {},
    materialDb: {
      materials: {
        m1: {
          id: 'm1',
          code: 'M1',
          name: { zh: 'Material', vi: 'Material' },
          drawings: [],
          models3d: [],
        },
      },
      bomEntries: [],
    },
  });

  const calls = [];
  const app = Object.create(BomApplication.prototype);
  app.config = { owner: 'acme', repo: 'bom-data' };
  app.githubData = {
    async loadForWrite(token) {
      calls.push({ type: 'loadForWrite', token });
      return { expectedHeadSha: 'current-remote-sha', payload: remotePayload };
    },
    async write(input) {
      calls.push({ type: 'write', input });
      if (write) await write();
      return { commitSha: 'new-commit-sha' };
    },
  };
  app.state = {
    payload: localPayload,
    bom: localPayload.bom,
    drawings: localPayload.drawings,
    manuals: localPayload.manuals,
    models3d: localPayload.models3d,
    productImages: localPayload.productImages,
    materialDb: localPayload.materialDb,
    loadedPayload: remotePayload,
    pendingMaterialAssets: {
      [pendingId]: {
        contentType: 'application/pdf',
        bytes: new Uint8Array([1, 2, 3]),
      },
    },
    dirty: true,
  };
  app.label = (key) => key;
  app.setStatus = () => {};
  app.renderAll = () => {};
  app.githubAssetStorage = {
    async uploadAsset(...args) {
      calls.push({ type: 'uploadAsset', input: args[0] });
      return uploadAsset(...args);
    }
  };

  return { app, calls, pendingId };
}

test('Save to GitHub uploads referenced assets before reading the current BOM expectedHeadSha', async () => {
  const pinnedUrl = `https://cdn.jsdelivr.net/gh/acme/bom-data@${'c'.repeat(40)}/assets/pdfs/M1_${'a'.repeat(64)}_drawing.pdf`;
  const { app, calls, pendingId } = pendingAssetSaveApp({
    uploadAsset: async () => ({ url: pinnedUrl, sha: 'c'.repeat(40) }),
  });

  await app.writeGithubData('token');

  assert.deepEqual(calls.map(({ type }) => type), ['uploadAsset', 'loadForWrite', 'write']);
  assert.equal(calls[0].input.token, 'token');
  assert.equal(calls[0].input.contentType, 'application/pdf');
  assert.equal(calls[0].input.bytes instanceof Uint8Array, true);

  const writeInput = calls[2].input;
  assert.equal(writeInput.expectedHeadSha, 'current-remote-sha');
  const writtenPayload = writeInput.payload;
  assert.equal(writtenPayload.materialDb.materials.m1.drawings[0].url, pinnedUrl);
  assert.equal(writtenPayload.materialDb.materials.m1.drawings[0].sourceUrl, 'preserved-source');
  assert.ok(!writtenPayload.materialDb.materials.m1.drawings[0].pendingAssetId);

  assert.equal(app.state.materialDb.materials.m1.drawings[0].url, pinnedUrl);
  assert.deepEqual(app.state.pendingMaterialAssets, {});
});

test('asset upload failure leaves the remote BOM untouched and pending bytes available', async () => {
  const { app, calls, pendingId } = pendingAssetSaveApp({
    uploadAsset: async () => {
      throw new Error('satellite unavailable');
    },
    write: async () => {},
  });

  await assert.rejects(app.writeGithubData('token'));

  assert.deepEqual(calls.map(({ type }) => type), ['uploadAsset']);
  assert.equal(app.state.materialDb.materials.m1.drawings[0].pendingAssetId, pendingId);
  assert.equal(app.state.pendingMaterialAssets[pendingId].bytes instanceof Uint8Array, true);
});

test('BOM write retry reuses an already resolved asset without uploading again', async () => {
  const pinnedUrl = `https://cdn.jsdelivr.net/gh/acme/bom-data@${'c'.repeat(40)}/assets/pdfs/M1_${'a'.repeat(64)}_drawing.pdf`;
  let writeCount = 0;
  const { app, calls, pendingId } = pendingAssetSaveApp({
    uploadAsset: async () => ({ url: pinnedUrl }),
    write: async () => {
      writeCount += 1;
      if (writeCount === 1) throw new Error('BOM write failed');
    },
  });

  await assert.rejects(app.writeGithubData('token'), /BOM write failed/);
  assert.equal(app.state.pendingMaterialAssets[pendingId].resolved.url, pinnedUrl);
  assert.equal(app.state.materialDb.materials.m1.drawings[0].pendingAssetId, pendingId);

  await app.writeGithubData('token');

  assert.equal(calls.filter(({ type }) => type === 'uploadAsset').length, 1);
  assert.equal(calls.filter(({ type }) => type === 'loadForWrite').length, 2);
  assert.equal(calls.filter(({ type }) => type === 'write').length, 2);
  assert.equal(app.state.materialDb.materials.m1.drawings[0].url, pinnedUrl);
  assert.deepEqual(app.state.pendingMaterialAssets, {});
});
