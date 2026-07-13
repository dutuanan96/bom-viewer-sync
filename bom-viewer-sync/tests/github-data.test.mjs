import assert from 'node:assert/strict';
import test from 'node:test';
import { BomApplication, coreUtils } from '../src/application.js';
import { createGithubDataAdapter, serializeDataJs } from '../src/infrastructure/github-data.js';

const config = {
  owner: 'acme',
  repo: 'bom-data',
  branch: 'main',
  path: 'nested/data.js',
  rawUrl: 'https://raw.githubusercontent.com/acme/bom-data/main/nested/data.js',
};
const payload = { version: 2, bom: {}, materialDb: { materials: {}, bomEntries: [] } };

test('public load prefers cache-busted Contents API raw', async () => {
  const requests = [];
  const adapter = createGithubDataAdapter({
    config,
    now: () => 123,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, text: async () => serializeDataJs(payload) };
    },
  });
  await adapter.loadPublic();
  assert.match(requests[0].url, /api\.github\.com.*ref=main&t=123/);
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(requests[0].options.headers.Accept, 'application/vnd.github.raw');
});

test('public load uses raw GitHub only after the Contents API fails', async () => {
  const requests = [];
  const adapter = createGithubDataAdapter({
    config,
    now: () => 123,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1) return { ok: false, status: 503, statusText: 'Unavailable' };
      return { ok: true, text: async () => serializeDataJs(payload) };
    },
  });
  await adapter.loadPublic();
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /api\.github\.com/);
  assert.equal(requests[0].options.cache, 'no-store');
  assert.match(requests[1].url, /raw\.githubusercontent\.com/);
  assert.equal(requests[1].options.cache, 'no-store');
});

test('write baseline is decoded from the current authenticated remote file', async () => {
  const remotePayload = {
    ...payload,
    bom: { P1: { name: '中文 tiếng Việt' } },
  };
  const source = serializeDataJs(remotePayload);
  const content = Buffer.from(source, 'utf8').toString('base64');
  const requests = [];
  const adapter = createGithubDataAdapter({
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ sha: 'remote-sha', content }),
      };
    },
  });
  const remote = await adapter.loadForWrite('token');
  assert.equal(requests[0].url, 'https://api.github.com/repos/acme/bom-data/contents/nested/data.js?ref=main');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer token');
  assert.equal(requests[0].options.headers.Accept, 'application/vnd.github+json');
  assert.equal(requests[0].options.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(remote.sha, 'remote-sha');
  assert.equal(remote.payload.bom.P1.name, '中文 tiếng Việt');
});

test('missing write baseline returns an empty SHA and payload', async () => {
  const adapter = createGithubDataAdapter({
    config,
    fetchImpl: async () => ({ ok: false, status: 404, statusText: 'Not Found' }),
  });

  assert.deepEqual(await adapter.loadForWrite('token'), { sha: '', payload: null });
});

test('write sends the current SHA and UTF-8 source through the Contents API', async () => {
  const requests = [];
  const response = { ok: true, status: 200, statusText: 'OK' };
  const source = 'window.BOM_VIEWER_DATA = {"label":"中文 tiếng Việt"};';
  const adapter = createGithubDataAdapter({
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response;
    },
  });

  assert.equal(await adapter.write({
    token: 'token',
    sha: 'current-remote-sha',
    source,
    message: 'chore: test write',
  }), response);
  assert.equal(requests[0].url, 'https://api.github.com/repos/acme/bom-data/contents/nested/data.js');
  assert.equal(requests[0].options.method, 'PUT');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer token');
  assert.equal(requests[0].options.headers.Accept, 'application/vnd.github+json');
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.equal(requests[0].options.headers['X-GitHub-Api-Version'], '2022-11-28');
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.message, 'chore: test write');
  assert.equal(body.branch, 'main');
  assert.equal(body.sha, 'current-remote-sha');
  assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), source);
});

test('write rejects a non-ok GitHub response with its status', async () => {
  const adapter = createGithubDataAdapter({
    config,
    fetchImpl: async () => ({ ok: false, status: 409, statusText: 'Conflict' }),
  });

  await assert.rejects(
    adapter.write({ token: 'token', sha: 'remote-sha', source: 'source', message: 'message' }),
    /409 Conflict/,
  );
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

test('save diffs the current remote payload before writing its SHA', async () => {
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
  const calls = [];
  let writeInput;
  const app = Object.create(BomApplication.prototype);
  app.config = config;
  app.githubData = {
    async loadForWrite(token) {
      calls.push({ type: 'loadForWrite', token });
      return { sha: 'current-remote-sha', payload: remotePayload };
    },
    async write(input) {
      calls.push({ type: 'write', input });
      writeInput = input;
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
  assert.equal(writeInput.sha, 'current-remote-sha');
  assert.match(writeInput.source, /"field": "name"/);
  assert.match(writeInput.source, /"before": "Remote old"/);
  assert.match(writeInput.source, /remote-only-notification/);
  assert.equal(app.state.loadedPayload.materialDb.materials.m1.name.zh, 'Local new');
  assert.equal(app.state.payload.materialDb.materials.m1.name.zh, 'Local new');
});
