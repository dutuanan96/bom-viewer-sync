import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ASSET_BYTES,
  GithubAssetStorageError,
  buildAssetPath,
  buildCdnUrl,
  createGithubAssetStorageAdapter,
  encodeBase64Bytes,
  sha256Hex,
} from '../src/infrastructure/github-asset-storage.js';
import { buildSmokePdf } from '../scripts/smoke-github-contents-assets.mjs';

const config = { owner: 'acme', repo: 'bom-viewer-assets', branch: 'main' };

function jsonResponse(body, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  };
}

test('encodes arbitrary binary bytes without UTF-8 conversion', () => {
  const bytes = new Uint8Array([0x00, 0xff, 0x80, 0x01]);
  assert.equal(encodeBase64Bytes(bytes), 'AP+AAQ==');
});

test('builds a deterministic content-addressed PDF path', async () => {
  const bytes = new Uint8Array([0x00, 0xff, 0x80, 0x01]);
  const contentHash = await sha256Hex(bytes);
  assert.equal(contentHash, '6509423fd9da5c225d2f8619ffae394b40f9f7686fee55a38c54b1424ac65f46');
  assert.equal(buildAssetPath({
    kind: 'pdf',
    materialCode: 'LGS 032/S',
    originalName: '../drawing final.pdf',
    contentHash,
  }), `assets/pdfs/LGS_032_S_${contentHash}_drawing_final.pdf`);
});

test('builds an encoded commit-pinned jsDelivr URL', () => {
  assert.equal(buildCdnUrl({
    config,
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    path: 'assets/models/M1_hash_model.glb',
  }), 'https://cdn.jsdelivr.net/gh/acme/bom-viewer-assets@0123456789abcdef0123456789abcdef01234567/assets/models/M1_hash_model.glb');
});

test('rejects unsupported kinds, invalid hashes, and non-commit refs', () => {
  assert.equal(MAX_ASSET_BYTES, 20_000_000);
  assert.throws(() => buildAssetPath({
    kind: 'obj',
    materialCode: 'M1',
    originalName: 'model.obj',
    contentHash: 'a'.repeat(64),
  }), /Unsupported asset kind/);
  assert.throws(() => buildAssetPath({
    kind: 'pdf',
    materialCode: 'M1',
    originalName: 'drawing.pdf',
    contentHash: 'short',
  }), /contentHash/);
  assert.throws(() => buildCdnUrl({ config, commitSha: 'main', path: 'assets/pdfs/file.pdf' }), /commitSha/);
});

test('uploads binary as a create-only Contents API request', async () => {
  const bytes = new Uint8Array([0x00, 0xff, 0x80, 0x01]);
  const hash = await sha256Hex(bytes);
  const path = `assets/models/M1_${hash}_model.glb`;
  const requests = [];
  const adapter = createGithubAssetStorageAdapter({
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({
        content: { path, size: bytes.byteLength },
        commit: { sha: '0123456789abcdef0123456789abcdef01234567' },
      }, 201, 'Created');
    },
  });

  const result = await adapter.uploadAsset({
    token: 'secret-token',
    path,
    contentType: 'model/gltf-binary',
    bytes,
  });

  assert.equal(requests[0].url, `https://api.github.com/repos/acme/bom-viewer-assets/contents/${path}`);
  assert.equal(requests[0].options.method, 'PUT');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer secret-token');
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.content, 'AP+AAQ==');
  assert.equal(body.branch, 'main');
  assert.equal('sha' in body, false);
  assert.equal(result.reused, false);
  assert.equal(result.contentHash, hash);
  assert.match(result.url, /@0123456789abcdef0123456789abcdef01234567\//);
});

test('rejects invalid upload input before a network call', async () => {
  let requestCount = 0;
  const adapter = createGithubAssetStorageAdapter({
    config,
    fetchImpl: async () => {
      requestCount += 1;
      return jsonResponse({});
    },
  });
  const cases = [
    { path: 'other/file.pdf', contentType: 'application/pdf', bytes: new Uint8Array([1]) },
    { path: 'assets/pdfs/file.pdf', contentType: 'text/plain', bytes: new Uint8Array([1]) },
    { path: 'assets/pdfs/file.pdf', contentType: 'application/pdf', bytes: new Uint8Array() },
    { path: 'assets/pdfs/file.pdf', contentType: 'application/pdf', bytes: new Uint8Array(MAX_ASSET_BYTES + 1) },
  ];
  for (const input of cases) await assert.rejects(adapter.uploadAsset({ token: 'token', ...input }));
  assert.equal(requestCount, 0);
});

test('accepts portable GLTF content in the models folder', async () => {
  const bytes = new TextEncoder().encode('{"asset":{"version":"2.0"}}');
  const hash = await sha256Hex(bytes);
  const path = `assets/models/M1_${hash}_model.gltf`;
  const adapter = createGithubAssetStorageAdapter({
    config,
    fetchImpl: async () => jsonResponse({
      content: { path, size: bytes.byteLength },
      commit: { sha: '0123456789abcdef0123456789abcdef01234567' },
    }, 201, 'Created'),
  });

  const result = await adapter.uploadAsset({
    token: 'token',
    path,
    contentType: 'model/gltf+json',
    bytes,
  });

  assert.equal(result.path, path);
  assert.equal(result.reused, false);
});

test('rejects malformed upload metadata without exposing the token', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = await sha256Hex(bytes);
  const path = `assets/pdfs/M1_${hash}_drawing.pdf`;
  const adapter = createGithubAssetStorageAdapter({
    config,
    fetchImpl: async () => jsonResponse({ content: { path, size: 3 }, commit: { sha: 'short' } }, 201),
  });
  await assert.rejects(
    adapter.uploadAsset({ token: 'do-not-expose', path, contentType: 'application/pdf', bytes }),
    (error) => error instanceof GithubAssetStorageError
      && error.code === 'GITHUB_ASSET_INVALID_RESPONSE'
      && !error.message.includes('do-not-expose'),
  );
});

test('recovers an exact immutable upload after a create conflict', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = await sha256Hex(bytes);
  const path = `assets/pdfs/M1_${hash}_drawing.pdf`;
  const requests = [];
  const responses = [
    jsonResponse({}, 422, 'Unprocessable Entity'),
    jsonResponse({ path, size: bytes.byteLength }),
    jsonResponse([{ sha: 'fedcba9876543210fedcba9876543210fedcba98' }]),
  ];
  const adapter = createGithubAssetStorageAdapter({
    config,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return responses.shift();
    },
  });

  const result = await adapter.uploadAsset({
    token: 'token',
    path,
    contentType: 'application/pdf',
    bytes,
  });

  assert.equal(result.reused, true);
  assert.equal(result.commitSha, 'fedcba9876543210fedcba9876543210fedcba98');
  assert.equal(requests.some(({ options }) => options.method === 'DELETE'), false);
  assert.equal(JSON.parse(requests[0].options.body).sha, undefined);
});

test('rejects an existing path when size or hash identity does not match', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = await sha256Hex(bytes);
  const path = `assets/models/M1_${hash}_model.glb`;
  const adapter = createGithubAssetStorageAdapter({
    config,
    fetchImpl: async (_url, options = {}) => options.method === 'PUT'
      ? jsonResponse({}, 409, 'Conflict')
      : jsonResponse({ path, size: 999 }),
  });

  await assert.rejects(
    adapter.uploadAsset({ token: 'token', path, contentType: 'model/gltf-binary', bytes }),
    (error) => error instanceof GithubAssetStorageError
      && error.code === 'GITHUB_ASSET_CONFLICT',
  );
});

test('builds a valid self-contained PDF for live smoke', () => {
  const source = new TextDecoder().decode(buildSmokePdf());
  const startXref = Number(source.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
  assert.match(source, /^%PDF-1\.4/);
  assert.equal(source.slice(startXref, startXref + 4), 'xref');
  assert.match(source, /BOM Contents Asset Smoke/);
});
