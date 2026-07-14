import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MaterialAssetUploadError,
  resolvePendingMaterialAssets,
  validateMaterialAssetFile,
} from '../src/features/material-asset-upload.js';

function fakeFile(name, type, content, size = null) {
  const bytes = content instanceof Uint8Array ? content : new TextEncoder().encode(content);
  return {
    name,
    type,
    size: size ?? bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

function glbBytes() {
  return new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
}

test('validates PDF extension, MIME type, signature, and size', async () => {
  const result = await validateMaterialAssetFile({
    file: fakeFile('drawing.pdf', 'application/pdf', '%PDF-1.4\n'),
    typeKey: 'drawings',
  });

  assert.equal(result.kind, 'pdf');
  assert.equal(result.contentType, 'application/pdf');
  assert.equal(result.originalName, 'drawing.pdf');
  assert.equal(new TextDecoder().decode(result.bytes), '%PDF-1.4\n');

  for (const file of [
    fakeFile('drawing.txt', 'application/pdf', '%PDF-1.4\n'),
    fakeFile('drawing.pdf', 'text/plain', '%PDF-1.4\n'),
    fakeFile('drawing.pdf', 'application/pdf', 'not-pdf'),
  ]) {
    await assert.rejects(
      validateMaterialAssetFile({ file, typeKey: 'drawings' }),
      (error) => error instanceof MaterialAssetUploadError && error.code === 'INVALID_PDF_FILE',
    );
  }
});

test('validates GLB magic and rejects unsupported model files', async () => {
  const result = await validateMaterialAssetFile({
    file: fakeFile('model.glb', 'model/gltf-binary', glbBytes()),
    typeKey: 'models3d',
  });

  assert.equal(result.kind, 'glb');
  assert.equal(result.contentType, 'model/gltf-binary');

  await assert.rejects(
    validateMaterialAssetFile({
      file: fakeFile('model.glb', 'model/gltf-binary', new Uint8Array([1, 2, 3, 4])),
      typeKey: 'models3d',
    }),
    (error) => error instanceof MaterialAssetUploadError && error.code === 'INVALID_GLB_FILE',
  );
  await assert.rejects(
    validateMaterialAssetFile({
      file: fakeFile('model.obj', 'text/plain', 'model'),
      typeKey: 'models3d',
    }),
    (error) => error instanceof MaterialAssetUploadError && error.code === 'INVALID_ASSET_FILE',
  );
});

test('accepts portable GLTF and rejects relative external resources', async () => {
  const portable = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ uri: 'data:application/octet-stream;base64,AA==' }],
    images: [{ uri: 'https://cdn.example.com/texture.png' }, { bufferView: 0 }],
  });
  const result = await validateMaterialAssetFile({
    file: fakeFile('model.gltf', 'model/gltf+json', portable),
    typeKey: 'models3d',
  });

  assert.equal(result.kind, 'gltf');
  assert.equal(result.contentType, 'model/gltf+json');

  for (const content of [
    '{invalid-json',
    JSON.stringify({ asset: { version: '2.0' }, buffers: {} }),
    JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'buffer.bin' }] }),
    JSON.stringify({ asset: { version: '2.0' }, images: [{ uri: 'http://example.com/texture.png' }] }),
  ]) {
    await assert.rejects(
      validateMaterialAssetFile({
        file: fakeFile('model.gltf', 'model/gltf+json', content),
        typeKey: 'models3d',
      }),
      (error) => error instanceof MaterialAssetUploadError && error.code === 'INVALID_GLTF_FILE',
    );
  }
});

test('rejects empty and oversized files before reading oversized bytes', async () => {
  await assert.rejects(
    validateMaterialAssetFile({
      file: fakeFile('empty.pdf', 'application/pdf', ''),
      typeKey: 'drawings',
    }),
    (error) => error instanceof MaterialAssetUploadError && error.code === 'INVALID_ASSET_FILE',
  );

  let read = false;
  const oversized = {
    name: 'large.pdf',
    type: 'application/pdf',
    size: 20_000_001,
    async arrayBuffer() {
      read = true;
      return new ArrayBuffer(0);
    },
  };
  await assert.rejects(
    validateMaterialAssetFile({ file: oversized, typeKey: 'drawings' }),
    (error) => error instanceof MaterialAssetUploadError && error.code === 'ASSET_FILE_TOO_LARGE',
  );
  assert.equal(read, false);

  const boundary = new Uint8Array(20_000_000);
  boundary.set(new TextEncoder().encode('%PDF-'));
  const accepted = await validateMaterialAssetFile({
    file: fakeFile('boundary.pdf', 'application/pdf', boundary),
    typeKey: 'drawings',
  });
  assert.equal(accepted.bytes.byteLength, 20_000_000);
});

test('resolves only targeted pending material assets in a clone', async () => {
  const pendingId = `assets/models/M1_${'a'.repeat(64)}_model.glb`;
  const pinnedUrl = `https://cdn.jsdelivr.net/gh/acme/assets@${'b'.repeat(40)}/${pendingId}`;
  const payload = {
    bom: {},
    materialDb: {
      materials: {
        m1: {
          id: 'm1',
          models3d: [{
            name: 'Model',
            url: '',
            previewUrl: 'https://old.example.com/model.glb',
            sourceUrl: 'preserved',
            pendingAssetId: pendingId,
          }],
        },
        m2: {
          id: 'm2',
          models3d: [{ url: 'https://unchanged.example.com/model.glb', custom: 'keep' }],
        },
      },
      bomEntries: [],
    },
  };
  const pendingAssets = {
    [pendingId]: {
      path: pendingId,
      contentType: 'model/gltf-binary',
      contentHash: 'a'.repeat(64),
      bytes: new Uint8Array([1, 2, 3]),
    },
  };
  let uploadCount = 0;

  const result = await resolvePendingMaterialAssets({
    payload,
    pendingAssets,
    upload: async () => {
      uploadCount += 1;
      return { url: pinnedUrl };
    },
  });

  const resolved = result.payload.materialDb.materials.m1.models3d[0];
  assert.equal(resolved.url, pinnedUrl);
  assert.equal(resolved.previewUrl, pinnedUrl);
  assert.equal(resolved.sourceUrl, 'preserved');
  assert.equal('pendingAssetId' in resolved, false);
  assert.equal(result.payload.materialDb.materials.m2.models3d[0].url, 'https://unchanged.example.com/model.glb');
  assert.equal(result.payload.materialDb.materials.m2.models3d[0].custom, 'keep');
  assert.equal(payload.materialDb.materials.m1.models3d[0].pendingAssetId, pendingId);
  assert.deepEqual(result.completedPendingIds, [pendingId]);
  assert.equal(uploadCount, 1);

  await resolvePendingMaterialAssets({
    payload,
    pendingAssets,
    upload: async () => {
      throw new Error('resolved upload must be reused');
    },
  });
  assert.equal(uploadCount, 1);
});

test('rejects a pending asset reference without in-memory bytes', async () => {
  const payload = {
    materialDb: {
      materials: {
        m1: { drawings: [{ pendingAssetId: 'missing', url: '' }] },
      },
      bomEntries: [],
    },
  };

  await assert.rejects(
    resolvePendingMaterialAssets({ payload, pendingAssets: {}, upload: async () => ({}) }),
    (error) => error instanceof MaterialAssetUploadError && error.code === 'PENDING_ASSET_MISSING',
  );
});
