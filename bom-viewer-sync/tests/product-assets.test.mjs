import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePayload } from '../src/infrastructure/github-data.js';
import { buildAssetPath, sha256Hex } from '../src/infrastructure/github-asset-storage.js';
import { createGithubAssetStorageAdapter } from '../src/infrastructure/github-asset-storage.js';
import { createProductRevision } from '../src/domain/revisions.js';
import {
  resolveProductAssets,
  resolveProductImage,
  syncLegacyProductAssetMirrors,
} from '../src/domain/product-assets.js';
import { buildLogicalShardFiles, parseLogicalShardFiles } from '../src/domain/sharded-files.js';
import { catalogViewMethods } from '../src/ui/catalog-view.js';
import { BomApplication } from '../src/application.js';
import { describePayloadChanges } from '../src/features/notifications.js';
import { assetDisplayUrl } from '../src/infrastructure/assets.js';
import {
  AssetUploadError,
  resolvePendingAssetReferences,
  validateAssetFile,
} from '../src/features/material-asset-upload.js';

function fakeFile(name, type, content) {
  const bytes = content instanceof Uint8Array ? content : new TextEncoder().encode(content);
  return {
    name,
    type,
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

const glbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);

function createDraftProductAssetApp(payload, { productCode, revision, color = '' }) {
  const app = new BomApplication({
    mode: 'admin',
    config: { owner: 'acme', repo: 'bom-data', branch: 'main' },
    githubData: {},
    githubAssetStorage: {},
  });
  app.state.payload = payload;
  app.state.bom = payload.bom;
  app.state.drawings = payload.drawings;
  app.state.manuals = payload.manuals;
  app.state.models3d = payload.models3d;
  app.state.productImages = payload.productImages;
  app.state.materialDb = payload.materialDb;
  app.state.currentSku = productCode;
  app.state.currentColor = color;
  app.state.selectedRevision = revision;
  app.state.pendingMaterialAssets = {};
  app.renderAll = () => {};
  app.setStatus = () => {};
  return app;
}

async function resolveProductAssetUpload(app, url) {
  const result = await resolvePendingAssetReferences({
    payload: app.state.payload,
    pendingAssets: app.state.pendingMaterialAssets,
    upload: async (pending) => ({
      path: pending.path,
      contentHash: pending.contentHash,
      url,
    }),
  });
  return result.payload;
}

test('validates product manual PDF and assembly GLB/GLTF through the shared asset validator', async () => {
  const manual = await validateAssetFile({
    file: fakeFile('manual.pdf', 'application/pdf', '%PDF-1.7\n'),
    ownerType: 'product',
    typeKey: 'manual',
  });
  assert.equal(manual.kind, 'pdf');
  assert.equal(manual.contentType, 'application/pdf');

  const assemblyGlb = await validateAssetFile({
    file: fakeFile('assembly.glb', 'model/gltf-binary', glbBytes),
    ownerType: 'product',
    typeKey: 'assembly',
  });
  assert.equal(assemblyGlb.kind, 'glb');

  const assemblyGltf = await validateAssetFile({
    file: fakeFile('assembly.gltf', 'model/gltf+json', '{"asset":{"version":"2.0"}}'),
    ownerType: 'product',
    typeKey: 'assembly',
  });
  assert.equal(assemblyGltf.kind, 'gltf');
});

test('validates JPEG, PNG, and WebP product images and rejects mismatched content', async () => {
  const fixtures = [
    ['photo.jpg', 'image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    ['photo.png', 'image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['photo.webp', 'image/webp', new TextEncoder().encode('RIFF\x04\x00\x00\x00WEBP')],
  ];
  for (const [name, type, bytes] of fixtures) {
    const result = await validateAssetFile({
      file: fakeFile(name, type, bytes),
      ownerType: 'product',
      typeKey: 'image',
    });
    assert.equal(result.contentType, type);
  }

  await assert.rejects(
    validateAssetFile({
      file: fakeFile('photo.png', 'image/png', new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
      ownerType: 'product',
      typeKey: 'image',
    }),
    (error) => error instanceof AssetUploadError && error.code === 'INVALID_IMAGE_FILE',
  );
});

test('builds deterministic product asset paths containing owner, revision, color, hash, and filename', async () => {
  const bytes = new TextEncoder().encode('same image bytes');
  const contentHash = await sha256Hex(bytes);
  const input = {
    ownerType: 'product',
    kind: 'webp',
    productCode: 'LGS433',
    revision: 'V5',
    color: '复古色',
    originalName: 'front view.webp',
    contentHash,
  };
  const path = buildAssetPath(input);
  assert.equal(path, buildAssetPath(input));
  assert.match(path, new RegExp(`^assets/products/images/LGS433_V5_.*_${contentHash}_front_view\\.webp$`));
});

test('GitHub asset storage accepts product namespaces while retaining material namespaces', async () => {
  const types = [
    ['pdf', 'application/pdf', 'manual.pdf'],
    ['glb', 'model/gltf-binary', 'assembly.glb'],
    ['webp', 'image/webp', 'photo.webp'],
  ];
  for (const [kind, contentType, originalName] of types) {
    const bytes = new TextEncoder().encode(`asset-${kind}`);
    const contentHash = await sha256Hex(bytes);
    const path = buildAssetPath({
      ownerType: 'product',
      kind,
      productCode: 'LGS433',
      revision: 'V5',
      color: kind === 'webp' ? '复古色' : undefined,
      originalName,
      contentHash,
    });
    const adapter = createGithubAssetStorageAdapter({
      config: { owner: 'acme', repo: 'bom-viewer-assets' },
      fetchImpl: async () => ({
        ok: true,
        status: 201,
        statusText: 'Created',
        json: async () => ({
          content: { path, size: bytes.byteLength },
          commit: { sha: '0123456789abcdef0123456789abcdef01234567' },
        }),
      }),
    });
    assert.equal((await adapter.uploadAsset({ token: 'token', path, contentType, bytes })).path, path);
  }
});

test('productAssets and legacy product assets round-trip through manifest sharding and payload normalization', async () => {
  const payload = normalizePayload({
    bom: { LGS433: { code: 'LGS433', colors: [], color_info: {} } },
    manuals: { LGS433: [{ name: 'legacy.pdf', url: 'https://cdn.example/legacy.pdf' }] },
    models3d: { LGS433: {
      assembly: [{ name: 'legacy.glb', url: 'https://cdn.example/legacy.glb' }],
      'M1|material one': [{ name: 'component.glb', url: 'https://cdn.example/component.glb' }],
    } },
    productImages: { LGS433: { black: { name: 'legacy.webp', url: 'https://cdn.example/legacy.webp' } } },
    productAssets: {
      LGS433: {
        V5: {
          manuals: [{ name: 'manual.pdf', url: 'https://cdn.example/manual.pdf' }],
          assemblyModels: [{ name: 'assembly.glb', url: 'https://cdn.example/assembly.glb' }],
          images: { '复古色': { name: 'front.webp', url: 'https://cdn.example/front.webp' } },
        },
      },
    },
    materialDb: { materials: {}, bomEntries: [] },
  });
  const files = buildLogicalShardFiles(payload);
  const manifest = JSON.parse(files.get('manifest.json'));
  assert.deepEqual(manifest.productAssets, payload.productAssets);
  const reloaded = normalizePayload(await parseLogicalShardFiles(files));
  assert.deepEqual(reloaded.productAssets, payload.productAssets);
  assert.deepEqual(reloaded.manuals, payload.manuals);
  assert.deepEqual(reloaded.models3d, payload.models3d);
  assert.deepEqual(reloaded.productImages, payload.productImages);
});

test('current canonical product assets mirror to legacy fields and replace stale assembly buckets', () => {
  const componentModels = {
    'M1|material one': [{ name: 'component-1.glb', url: 'https://cdn.example/component-1.glb' }],
    'M2|material two': [{ name: 'component-2.glb', url: 'https://cdn.example/component-2.glb' }],
  };
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    productRevisions: { P1: { currentRevision: 'V5' } },
    productAssets: {
      P1: {
        V5: {
          manuals: [{ name: 'current.pdf', url: 'https://cdn.example/current.pdf' }],
          assemblyModels: [{ name: 'current.glb', url: 'https://cdn.example/current.glb' }],
          images: { black: { name: 'current.webp', url: 'https://cdn.example/current.webp' } },
        },
      },
    },
    manuals: { P1: [{ name: 'stale.pdf', url: 'https://cdn.example/stale.pdf' }] },
    models3d: { P1: {
      'old product assembly': [{ name: 'stale.glb', url: 'https://cdn.example/stale.glb' }],
      'duplicate stale assembly': [{ name: 'stale-duplicate.glb', url: 'https://cdn.example/stale-duplicate.glb' }],
      ...componentModels,
    } },
    productImages: { P1: { black: { name: 'stale.webp', url: 'https://cdn.example/stale.webp' } } },
    materialDb: { materials: {}, bomEntries: [] },
  });
  const componentModelsBefore = structuredClone(componentModels);

  assert.equal(syncLegacyProductAssetMirrors(payload), payload);
  assert.deepEqual(payload.manuals.P1, payload.productAssets.P1.V5.manuals);
  assert.notEqual(payload.manuals.P1, payload.productAssets.P1.V5.manuals);
  assert.deepEqual(payload.productImages.P1, payload.productAssets.P1.V5.images);
  assert.notEqual(payload.productImages.P1, payload.productAssets.P1.V5.images);
  assert.deepEqual(payload.models3d.P1['old product assembly'], payload.productAssets.P1.V5.assemblyModels);
  assert.notEqual(payload.models3d.P1['old product assembly'], payload.productAssets.P1.V5.assemblyModels);
  assert.equal(Object.hasOwn(payload.models3d.P1, 'duplicate stale assembly'), false);
  assert.deepEqual(Object.fromEntries(Object.entries(payload.models3d.P1).filter(([key]) => key.includes('|'))), componentModelsBefore);
  assert.equal(Object.keys(payload.models3d.P1).filter((key) => !key.includes('|')).length, 1);
});

test('uses the product code as assembly bucket key when no product bucket exists', () => {
  const componentModel = [{ name: 'component.glb', url: 'https://cdn.example/component.glb' }];
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    productRevisions: { P1: { currentRevision: 'V2' } },
    productAssets: {
      P1: {
        V2: {
          manuals: [],
          assemblyModels: [{ name: 'current.glb', url: 'https://cdn.example/current.glb' }],
          images: {},
        },
      },
    },
    models3d: { P1: { 'M1|material one': componentModel } },
    materialDb: { materials: {}, bomEntries: [] },
  });

  syncLegacyProductAssetMirrors(payload);

  assert.deepEqual(payload.models3d.P1.P1, payload.productAssets.P1.V2.assemblyModels);
  assert.deepEqual(payload.models3d.P1['M1|material one'], componentModel);
  assert.deepEqual(Object.keys(payload.models3d.P1).filter((key) => !key.includes('|')), ['P1']);
});

test('empty current canonical assets remove stale legacy assets but preserve material models', () => {
  const componentModels = [{ name: 'component.glb', url: 'https://cdn.example/component.glb' }];
  const payload = normalizePayload({
    bom: {
      P1: { code: 'P1', colors: [], color_info: {} },
      P2: { code: 'P2', colors: [], color_info: {} },
    },
    productRevisions: {
      P1: { currentRevision: 'V2' },
      P2: { currentRevision: 'V3' },
    },
    productAssets: {
      P1: { V2: { manuals: [], assemblyModels: [], images: {} } },
      P2: { V3: { manuals: [], assemblyModels: [], images: {} } },
    },
    manuals: {
      P1: [{ name: 'stale.pdf', url: 'https://cdn.example/stale.pdf' }],
      P2: [{ name: 'stale-2.pdf', url: 'https://cdn.example/stale-2.pdf' }],
    },
    models3d: {
      P1: {
        assembly: [{ name: 'stale.glb', url: 'https://cdn.example/stale.glb' }],
        'M1|material one': componentModels,
      },
      P2: { assembly: [{ name: 'stale-2.glb', url: 'https://cdn.example/stale-2.glb' }] },
    },
    productImages: {
      P1: { black: { name: 'stale.webp', url: 'https://cdn.example/stale.webp' } },
      P2: { white: { name: 'stale-2.webp', url: 'https://cdn.example/stale-2.webp' } },
    },
    materialDb: { materials: {}, bomEntries: [] },
  });

  syncLegacyProductAssetMirrors(payload);

  assert.deepEqual(payload.manuals.P1, []);
  assert.deepEqual(payload.productImages.P1, {});
  assert.deepEqual(payload.models3d.P1, { 'M1|material one': componentModels });
  assert.deepEqual(payload.manuals.P2, []);
  assert.deepEqual(payload.productImages.P2, {});
  assert.equal(Object.hasOwn(payload.models3d, 'P2'), false);
});

test('products without an exact current canonical entry leave legacy fields untouched', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    productRevisions: { P1: { currentRevision: 'V5' } },
    productAssets: { P1: { V4: { manuals: [], assemblyModels: [], images: {} } } },
    manuals: { P1: [{ name: 'legacy.pdf', url: 'https://cdn.example/legacy.pdf' }] },
    models3d: { P1: { assembly: [{ name: 'legacy.glb', url: 'https://cdn.example/legacy.glb' }] } },
    productImages: { P1: { black: { name: 'legacy.webp', url: 'https://cdn.example/legacy.webp' } } },
    materialDb: { materials: {}, bomEntries: [] },
  });
  const legacyFields = {
    manuals: payload.manuals.P1,
    models3d: payload.models3d.P1,
    productImages: payload.productImages.P1,
  };
  const legacySnapshot = structuredClone(legacyFields);

  syncLegacyProductAssetMirrors(payload);

  assert.deepEqual(legacyFields, legacySnapshot);
  assert.equal(payload.productAssets.P1.V5, undefined);
});

test('current legacy mirrors do not affect an exact historical canonical revision', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    productRevisions: { P1: { currentRevision: 'V5' } },
    productAssets: {
      P1: {
        V4: { manuals: [{ name: 'old.pdf', url: 'https://cdn.example/old.pdf' }], assemblyModels: [], images: {} },
        V5: { manuals: [{ name: 'current.pdf', url: 'https://cdn.example/current.pdf' }], assemblyModels: [], images: {} },
      },
    },
    manuals: { P1: [{ name: 'legacy-stale.pdf', url: 'https://cdn.example/legacy-stale.pdf' }] },
    materialDb: { materials: {}, bomEntries: [] },
  });

  syncLegacyProductAssetMirrors(payload);

  assert.equal(resolveProductAssets(payload, 'P1', 'V4').manuals[0].name, 'old.pdf');
  assert.equal(resolveProductAssets(payload, 'P1', 'V5').manuals[0].name, 'current.pdf');
});

test('an exact empty canonical revision remains authoritative over non-empty legacy mirrors', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    productRevisions: { P1: { currentRevision: 'V5' } },
    productAssets: { P1: { V5: { manuals: [], assemblyModels: [], images: {} } } },
    manuals: { P1: [{ name: 'legacy.pdf', url: 'https://cdn.example/legacy.pdf' }] },
    models3d: { P1: { assembly: [{ name: 'legacy.glb', url: 'https://cdn.example/legacy.glb' }] } },
    productImages: { P1: { black: { name: 'legacy.webp', url: 'https://cdn.example/legacy.webp' } } },
    materialDb: { materials: {}, bomEntries: [] },
  });

  const assets = resolveProductAssets(payload, 'P1', 'V5');

  assert.deepEqual(assets, { manuals: [], assemblyModels: [], images: {} });
});

test('resolves canonical assets by selected revision and falls back to legacy product fields', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    manuals: { P1: [{ name: 'legacy.pdf', url: 'https://cdn.example/legacy.pdf' }] },
    models3d: { P1: { assembly: [{ name: 'legacy.glb', url: 'https://cdn.example/legacy.glb' }] } },
    productImages: { P1: { black: { name: 'legacy.png', url: 'https://cdn.example/legacy.png' } } },
    productAssets: {
      P1: {
        V1: {
          manuals: [{ name: 'v1.pdf', url: 'https://cdn.example/v1.pdf' }],
          assemblyModels: [],
          images: {
            black: { name: 'v1.png', url: 'https://cdn.example/v1.png' },
            white: { name: 'v1-white.png', url: 'https://cdn.example/v1-white.png' },
          },
        },
        V2: {
          manuals: [{ name: 'v2.pdf', url: 'https://cdn.example/v2.pdf' }],
          assemblyModels: [{ name: 'v2.glb', url: 'https://cdn.example/v2.glb' }],
          images: { black: { name: 'v2.png', url: 'https://cdn.example/v2.png' } },
        },
      },
    },
    materialDb: { materials: {}, bomEntries: [] },
  });

  assert.equal(resolveProductAssets(payload, 'P1', 'V2').manuals[0].name, 'v2.pdf');
  assert.equal(resolveProductAssets(payload, 'P1', 'V2').assemblyModels[0].name, 'v2.glb');
  assert.equal(resolveProductImage(resolveProductAssets(payload, 'P1', 'V1'), ['black']).name, 'v1.png');
  assert.equal(resolveProductImage(resolveProductAssets(payload, 'P1', 'V1'), ['white']).name, 'v1-white.png');
  assert.equal(resolveProductAssets(payload, 'P1', 'V3').manuals[0].name, 'legacy.pdf');
  assert.equal(resolveProductAssets(payload, 'P1', 'V3').assemblyModels[0].name, 'legacy.glb');
  assert.equal(resolveProductImage(resolveProductAssets(payload, 'P1', 'V3'), ['black']).name, 'legacy.png');
});

test('new revision inherits independent product asset metadata references', () => {
  const payload = normalizePayload({
    bom: { LGS433: { code: 'LGS433', colors: [], color_info: {} } },
    productRevisions: { LGS433: { currentRevision: 'V5', revisions: [] } },
    productAssets: {
      LGS433: {
        V5: {
          manuals: [{ name: 'v5.pdf', url: 'https://cdn.example/manual.pdf' }],
          assemblyModels: [{ name: 'v5.glb', url: 'https://cdn.example/assembly.glb' }],
          images: { black: { name: 'v5.png', url: 'https://cdn.example/black.png' } },
        },
      },
    },
    materialDb: { materials: { m1: { id: 'm1', drawings: [], models3d: [] } }, bomEntries: [] },
  });
  const materialBefore = structuredClone(payload.materialDb);

  createProductRevision(payload, 'LGS433', 'V6');
  assert.deepEqual(payload.productAssets.LGS433.V6, payload.productAssets.LGS433.V5);
  assert.notEqual(payload.productAssets.LGS433.V6, payload.productAssets.LGS433.V5);
  assert.equal(payload.productAssets.LGS433.V6.manuals[0].url, payload.productAssets.LGS433.V5.manuals[0].url);

  payload.productAssets.LGS433.V6.manuals[0] = { name: 'v6.pdf', url: 'https://cdn.example/v6.pdf' };
  assert.equal(resolveProductAssets(payload, 'LGS433', 'V5').manuals[0].name, 'v5.pdf');
  assert.equal(resolveProductAssets(payload, 'LGS433', 'V6').manuals[0].name, 'v6.pdf');
  assert.deepEqual(payload.materialDb, materialBefore);
});

test('legacy product assets seed the first canonical revision without rewriting legacy fields', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    manuals: { P1: [{ name: 'legacy.pdf', url: 'https://cdn.example/legacy.pdf' }] },
    models3d: { P1: { assembly: [{ name: 'legacy.glb', url: 'https://cdn.example/legacy.glb' }] } },
    productImages: { P1: { black: { name: 'legacy.png', url: 'https://cdn.example/legacy.png' } } },
    materialDb: { materials: {}, bomEntries: [] },
  });
  const originalLegacy = structuredClone({ manuals: payload.manuals, models3d: payload.models3d, productImages: payload.productImages });

  createProductRevision(payload, 'P1', 'V2');

  assert.equal(payload.productAssets.P1.V2.manuals[0].url, 'https://cdn.example/legacy.pdf');
  assert.equal(payload.productAssets.P1.V2.assemblyModels[0].url, 'https://cdn.example/legacy.glb');
  assert.equal(payload.productAssets.P1.V2.images.black.url, 'https://cdn.example/legacy.png');
  assert.deepEqual({ manuals: payload.manuals, models3d: payload.models3d, productImages: payload.productImages }, originalLegacy);
});

test('replacing a legacy V4 manual in the V5 draft uses only the new file metadata', async () => {
  const payload = normalizePayload({
    bom: { LGS433: { code: 'LGS433', colors: ['retro'], color_info: { retro: { sku: 'LGS433-R' } } } },
    manuals: {
      LGS433: [{
        name: 'LGS433-S-A4-说明书-V4.pdf',
        path: 'legacy/manual-v4.pdf',
        url: 'https://cdn.example/manual-v4.pdf',
        contentHash: 'old-v4-hash',
        source: 'legacy-manual',
      }],
    },
    productRevisions: {
      LGS433: { currentRevision: 'V5', currentRevisionInfo: { workflowState: 'draft' }, revisions: [] },
    },
    materialDb: { materials: {}, bomEntries: [] },
  });
  const app = createDraftProductAssetApp(payload, { productCode: 'LGS433', revision: 'V5' });
  const replacementName = 'LGS433-S-A4-说明书-V5.pdf';
  await app.handleProductAssetFileInput({
    dataset: { productAssetType: 'manual', productAssetIndex: '0', productAssetColor: '' },
    files: [fakeFile(replacementName, 'application/pdf', '%PDF-1.7\n')],
    value: 'selected',
  });

  const staged = app.state.payload.productAssets.LGS433.V5.manuals[0];
  const newPendingPath = staged.pendingAssetId;
  assert.equal(staged.name, replacementName);
  assert.equal(staged.path, undefined);
  assert.equal(staged.contentHash, undefined);
  assert.equal(staged.source, undefined);

  const resolvedPayload = await resolveProductAssetUpload(app, 'https://cdn.example/manual-v5.pdf');
  const replacement = resolvedPayload.productAssets.LGS433.V5.manuals[0];
  assert.equal(replacement.name, replacementName);
  assert.equal(replacement.url, 'https://cdn.example/manual-v5.pdf');
  assert.equal(replacement.path, newPendingPath);
  assert.equal(replacement.contentHash, app.state.pendingMaterialAssets[newPendingPath].contentHash);
  assert.notEqual(replacement.path, 'legacy/manual-v4.pdf');
  assert.notEqual(replacement.url, 'https://cdn.example/manual-v4.pdf');
  assert.deepEqual(Object.keys(replacement).sort(), ['contentHash', 'name', 'path', 'url']);
});

test('replacing a legacy Google Drive product image removes Drive metadata and displays the new URL', async () => {
  const payload = normalizePayload({
    bom: { LGS433: { code: 'LGS433', colors: ['retro'], color_info: { retro: { sku: 'LGS433-R' } } } },
    productImages: {
      LGS433: {
        retro: {
          name: 'legacy-product-image.webp',
          source: 'google-drive',
          driveId: 'legacy-drive-id',
          directUrl: 'https://drive.google.com/uc?id=legacy-drive-id',
          url: 'https://drive.google.com/file/d/legacy-drive-id/view',
        },
      },
    },
    productRevisions: {
      LGS433: { currentRevision: 'V5', currentRevisionInfo: { workflowState: 'draft' }, revisions: [] },
    },
    materialDb: { materials: {}, bomEntries: [] },
  });
  const app = createDraftProductAssetApp(payload, { productCode: 'LGS433', revision: 'V5', color: 'retro' });
  const newImageUrl = 'https://cdn.example/product-image-v5.webp';
  await app.handleProductAssetFileInput({
    dataset: { productAssetType: 'image', productAssetIndex: '0', productAssetColor: 'retro' },
    files: [fakeFile('product-image-v5.webp', 'image/webp', new TextEncoder().encode('RIFF\x04\x00\x00\x00WEBP'))],
    value: 'selected',
  });
  const resolvedPayload = await resolveProductAssetUpload(app, newImageUrl);
  const replacement = resolvedPayload.productAssets.LGS433.V5.images.retro;

  assert.equal(replacement.url, newImageUrl);
  assert.match(replacement.path, /^assets\/products\/images\//);
  assert.ok(replacement.contentHash);
  assert.equal(replacement.driveId, undefined);
  assert.equal(replacement.directUrl, undefined);
  assert.equal(replacement.source, undefined);
  assert.deepEqual(Object.keys(replacement).sort(), ['contentHash', 'name', 'path', 'url']);
  assert.equal(assetDisplayUrl(replacement, { protocol: 'https:', hostname: 'app.example' }), newImageUrl);
});

test('replacing an inherited legacy assembly clears stale metadata and preserves the source revision', async () => {
  const legacyAssembly = {
    name: 'LGS434-assembly-V5.glb',
    url: 'https://cdn.example/assembly-v5.glb',
    previewUrl: 'https://cdn.example/assembly-v5-preview.glb',
    matched_name: 'legacy matched assembly',
    score: 0.97,
    bytes: 123456,
  };
  const payload = normalizePayload({
    bom: { LGS434: { code: 'LGS434', colors: ['black'], color_info: { black: { sku: 'LGS434-B' } } } },
    models3d: { LGS434: { assembly: [legacyAssembly] } },
    productRevisions: {
      LGS434: { currentRevision: 'V5', currentRevisionInfo: { workflowState: 'released' }, revisions: [] },
    },
    materialDb: { materials: {}, bomEntries: [] },
  });
  const sourceRevisionAssetObject = payload.models3d.LGS434.assembly[0];
  const sourceRevisionAsset = structuredClone(sourceRevisionAssetObject);
  createProductRevision(payload, 'LGS434', 'V6');
  assert.deepEqual(payload.productAssets.LGS434.V6.assemblyModels[0], sourceRevisionAsset);

  const app = createDraftProductAssetApp(payload, { productCode: 'LGS434', revision: 'V6', color: 'black' });
  const newAssemblyUrl = 'https://cdn.example/assembly-v6.glb';
  await app.handleProductAssetFileInput({
    dataset: { productAssetType: 'assembly', productAssetIndex: '0', productAssetColor: '' },
    files: [fakeFile('LGS434-assembly-V6.glb', 'model/gltf-binary', glbBytes)],
    value: 'selected',
  });
  const newPendingPath = app.state.payload.productAssets.LGS434.V6.assemblyModels[0].pendingAssetId;
  const resolvedPayload = await resolveProductAssetUpload(app, newAssemblyUrl);
  const replacement = resolvedPayload.productAssets.LGS434.V6.assemblyModels[0];

  assert.equal(replacement.name, 'LGS434-assembly-V6.glb');
  assert.equal(replacement.path, newPendingPath);
  assert.equal(replacement.url, newAssemblyUrl);
  assert.equal(replacement.previewUrl, newAssemblyUrl);
  assert.ok(replacement.contentHash);
  assert.equal(replacement.matched_name, undefined);
  assert.equal(replacement.score, undefined);
  assert.equal(replacement.bytes, undefined);
  assert.deepEqual(Object.keys(replacement).sort(), ['contentHash', 'name', 'path', 'previewUrl', 'url']);
  assert.equal(payload.models3d.LGS434.assembly[0], sourceRevisionAssetObject);
  assert.deepEqual(payload.models3d.LGS434.assembly[0], sourceRevisionAsset);
  assert.notEqual(resolvedPayload.productAssets.LGS434.V6.assemblyModels[0], sourceRevisionAssetObject);
  assert.deepEqual(resolveProductAssets(payload, 'LGS434', 'V5').assemblyModels[0], sourceRevisionAsset);
});

test('Admin product asset editor shows revision and color context and locks read-only revisions', () => {
  const context = {
    isAdmin: () => true,
    canEditProductRevision: () => true,
    isHistoricalRevision: () => true,
    selectedProductRevision: () => 'V5',
    label: (key) => key,
    colorLabel: () => 'black',
    state: {
      currentSku: 'LGS433',
      currentColor: 'black',
      payload: {
        productAssets: {
          LGS433: {
            V5: {
              manuals: [{ name: 'manual.pdf', url: 'https://cdn.example/manual.pdf' }],
              assemblyModels: [{ name: 'assembly.glb', url: 'https://cdn.example/assembly.glb' }],
              images: { black: { name: 'product.webp', url: 'https://cdn.example/product.webp' } },
            },
          },
        },
      },
      pendingMaterialAssets: {},
    },
  };
  const editableHtml = catalogViewMethods.productAssetsEditorHtml.call(context, {});
  assert.match(editableHtml, /LGS433 · revision: V5/);
  assert.match(editableHtml, /product-asset-color="black"/);
  assert.match(editableHtml, /data-action="upload-product-asset-file"/);
  assert.match(editableHtml, /data-action="remove-product-asset"/);

  context.canEditProductRevision = () => false;
  for (const [historical, expectedLabel] of [[true, 'historicalRevisionReadOnly'], [false, 'releasedRevisionReadOnly']]) {
    context.isHistoricalRevision = () => historical;
    const readOnlyHtml = catalogViewMethods.productAssetsEditorHtml.call(context, {});
    assert.match(readOnlyHtml, /data-action="open-product-asset"/);
    assert.match(readOnlyHtml, new RegExp(expectedLabel));
    assert.doesNotMatch(readOnlyHtml, /upload-product-asset-file|remove-product-asset/);
  }
});

test('product asset updates appear in the existing payload change summary', () => {
  const previous = normalizePayload({ bom: {}, materialDb: { materials: {}, bomEntries: [] } });
  const next = normalizePayload({
    bom: {},
    materialDb: { materials: {}, bomEntries: [] },
    productAssets: {
      LGS433: {
        V5: { manuals: [], assemblyModels: [], images: { black: { name: 'front.webp', url: 'https://cdn.example/front.webp' } } },
      },
    },
  });
  const changes = describePayloadChanges(previous, next);
  assert.ok(changes.some((change) => (
    change.kind === 'product'
    && change.code === 'LGS433'
    && change.field === 'V5.images'
    && change.after.includes('black:front.webp')
  )));
});

test('product asset selection stays pending until Save, then writes a commit-pinned product reference', async () => {
  const product = { code: 'P1', revision: 'V2', colors: ['black'], color_info: { black: { sku: 'P1-B' } } };
  const localPayload = normalizePayload({
    bom: {
      P1: product,
      P2: { code: 'P2', revision: 'V3', colors: [], color_info: {} },
    },
    productRevisions: {
      P1: { currentRevision: 'V2', currentRevisionInfo: { workflowState: 'draft' }, revisions: [] },
      P2: { currentRevision: 'V3', currentRevisionInfo: { workflowState: 'draft' }, revisions: [] },
    },
    productAssets: { P1: { V2: { manuals: [], assemblyModels: [], images: {} } } },
    manuals: {
      P1: [{ name: 'stale.pdf', url: 'https://cdn.example/stale.pdf' }],
      P2: [{ name: 'unmigrated.pdf', url: 'https://cdn.example/unmigrated.pdf' }],
    },
    models3d: {
      P1: {
        assembly: [{ name: 'stale.glb', url: 'https://cdn.example/stale.glb' }],
        'M1|material one': [{ name: 'component.glb', url: 'https://cdn.example/component.glb' }],
      },
      P2: {
        assembly: [{ name: 'unmigrated.glb', url: 'https://cdn.example/unmigrated.glb' }],
        'M2|material two': [{ name: 'unmigrated-component.glb', url: 'https://cdn.example/unmigrated-component.glb' }],
      },
    },
    productImages: {
      P1: { black: { name: 'stale.webp', url: 'https://cdn.example/stale.webp' } },
      P2: { white: { name: 'unmigrated.webp', url: 'https://cdn.example/unmigrated.webp' } },
    },
    materialDb: { materials: {}, bomEntries: [] },
  });
  const remotePayload = structuredClone(localPayload);
  let uploadCount = 0;
  let writtenPayload;
  const app = new BomApplication({
    mode: 'admin',
    config: { owner: 'acme', repo: 'bom-data', branch: 'main' },
    githubData: {
      async loadForWrite() {
        return { expectedHeadSha: 'a'.repeat(40), payload: remotePayload };
      },
      async write({ payload }) {
        writtenPayload = payload;
        return { commitSha: 'b'.repeat(40) };
      },
    },
    githubAssetStorage: {
      async uploadAsset({ path, contentType, bytes }) {
        uploadCount += 1;
        return {
          path,
          contentHash: await sha256Hex(bytes),
          url: `https://cdn.jsdelivr.net/gh/acme/bom-viewer-assets@${'b'.repeat(40)}/${path}`,
        };
      },
    },
  });
  app.state.payload = localPayload;
  app.state.bom = localPayload.bom;
  app.state.drawings = localPayload.drawings;
  app.state.manuals = localPayload.manuals;
  app.state.models3d = localPayload.models3d;
  app.state.productImages = localPayload.productImages;
  app.state.materialDb = localPayload.materialDb;
  app.state.currentSku = 'P1';
  app.state.currentColor = 'black';
  app.state.selectedRevision = 'V2';
  app.state.pendingMaterialAssets = {};
  app.renderAll = () => {};
  app.setStatus = () => {};

  const file = fakeFile('manual.pdf', 'application/pdf', '%PDF-1.7\n');
  await app.handleProductAssetFileInput({
    dataset: { productAssetType: 'manual', productAssetIndex: '0', productAssetColor: '' },
    files: [file],
    value: 'selected',
  });

  const staged = app.state.payload.productAssets.P1.V2.manuals[0];
  assert.equal(uploadCount, 0);
  assert.equal(staged.name, 'manual.pdf');
  assert.match(staged.pendingAssetId, /^assets\/products\/manuals\/P1_V2_[a-f0-9]{64}_manual\.pdf$/);
  assert.ok(app.state.pendingMaterialAssets[staged.pendingAssetId].bytes instanceof Uint8Array);

  await app.writeGithubData('token');
  assert.equal(uploadCount, 1);
  assert.match(writtenPayload.productAssets.P1.V2.manuals[0].url, /bom-viewer-assets@[a-f0-9]{40}/);
  assert.equal(writtenPayload.productAssets.P1.V2.manuals[0].pendingAssetId, undefined);
  assert.deepEqual(writtenPayload.manuals.P1, writtenPayload.productAssets.P1.V2.manuals);
  assert.equal(writtenPayload.manuals.P1[0].url, writtenPayload.productAssets.P1.V2.manuals[0].url);
  assert.deepEqual(writtenPayload.productImages.P1, {});
  assert.deepEqual(Object.keys(writtenPayload.models3d.P1), ['M1|material one']);
  assert.deepEqual(writtenPayload.models3d.P1['M1|material one'], localPayload.models3d.P1['M1|material one']);
  assert.equal(writtenPayload.productAssets.P2, undefined);
  assert.deepEqual(writtenPayload.manuals.P2, localPayload.manuals.P2);
  assert.deepEqual(writtenPayload.models3d.P2, localPayload.models3d.P2);
  assert.deepEqual(writtenPayload.productImages.P2, localPayload.productImages.P2);
  assert.equal(Object.keys(app.state.pendingMaterialAssets).length, 0);
});

test('manual view follows the explicitly selected historical revision', () => {
  const payload = normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    productRevisions: {
      P1: {
        currentRevision: 'V2',
        currentRevisionInfo: { workflowState: 'draft' },
        revisions: [{ revision: 'V1', workflowState: 'released', snapshot: { product: { code: 'P1' } } }],
      },
    },
    productAssets: {
      P1: {
        V1: { manuals: [{ name: 'v1.pdf', url: 'https://cdn.example/v1.pdf' }], assemblyModels: [], images: {} },
        V2: { manuals: [{ name: 'v2.pdf', url: 'https://cdn.example/v2.pdf' }], assemblyModels: [], images: {} },
      },
    },
    materialDb: { materials: {}, bomEntries: [] },
  });
  const app = Object.create(BomApplication.prototype);
  app.state = { payload, currentSku: 'P1', selectedRevision: 'V1' };
  app.label = (key) => key;
  let viewedUrl = '';
  app.showModal = (url) => { viewedUrl = url; };

  app.openManual(0);
  assert.equal(viewedUrl, 'https://cdn.example/v1.pdf');
  app.state.selectedRevision = 'V2';
  app.openManual(0);
  assert.equal(viewedUrl, 'https://cdn.example/v2.pdf');
});
