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
  assert.equal(requests[0].options.headers.Accept, 'application/vnd.github.raw');
});

test('public load uses raw GitHub only after the Contents API fails', async () => {
  const requests = [];
  const adapter = createGithubDataAdapter({
    config,
    now: () => 123,
    fetchImpl: async (url) => {
      requests.push(url);
      if (requests.length === 1) return { ok: false, status: 503, statusText: 'Unavailable' };
      return { ok: true, text: async () => serializeDataJs(payload) };
    },
  });
  await adapter.loadPublic();
  assert.equal(requests.length, 2);
  assert.match(requests[0], /api\.github\.com/);
  assert.match(requests[1], /raw\.githubusercontent\.com/);
});

test('write baseline is decoded from the current remote file', async () => {
  const source = serializeDataJs(payload);
  const content = Buffer.from(source, 'utf8').toString('base64');
  const adapter = createGithubDataAdapter({
    config,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ sha: 'remote-sha', content }),
    }),
  });
  const remote = await adapter.loadForWrite('token');
  assert.equal(remote.sha, 'remote-sha');
  assert.deepEqual(remote.payload.bom, {});
});

test('save diffs the current remote payload before writing its SHA', async () => {
  const remotePayload = coreUtils.normalizePayload({
    bom: {},
    materialDb: {
      materials: { m1: { id: 'm1', code: 'M1', name: { zh: 'Remote old', vi: 'Remote old' } } },
      bomEntries: [],
    },
  });
  const localPayload = structuredClone(remotePayload);
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
  assert.equal(app.state.loadedPayload.materialDb.materials.m1.name.zh, 'Local new');
  assert.equal(app.state.payload.materialDb.materials.m1.name.zh, 'Local new');
});
