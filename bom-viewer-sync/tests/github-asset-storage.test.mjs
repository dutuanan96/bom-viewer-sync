import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ASSET_BYTES,
  buildAssetPath,
  buildCdnUrl,
  encodeBase64Bytes,
  sha256Hex,
} from '../src/infrastructure/github-asset-storage.js';

const config = { owner: 'acme', repo: 'bom-viewer-assets', branch: 'main' };

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
