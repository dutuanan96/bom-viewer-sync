import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import archivedPdfs from '../src/infrastructure/archived-pdfs.json' with { type: 'json' };
import { archivedPdfAddress, assetDisplayUrl, driveFileId, findBomAssets, pdfFrameUrl } from '../src/infrastructure/assets.js';
import { appendNotificationEvent, describePayloadChanges } from '../src/features/notifications.js';
import { BomApplication, coreUtils } from '../src/application.js';
import { sharedViewMethods } from '../src/ui/shared-view.js';

const { normalizePayload } = coreUtils;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createPdfPreviewApp() {
  const events = [];
  const frame = {
    hidden: false,
    _src: '',
    set src(value) {
      this._src = value;
      events.push(`frame:${value}`);
    },
    get src() { return this._src; },
  };
  const modelViewer = { hidden: true, removeAttribute: () => {} };
  const elements = {
    '#pdfFrame': frame,
    '#pdfModalTitle': {},
    '#pdfModalSubtitle': {},
    '#modelResetBtn': {},
    '#pdfCloseBtn': {},
    '#pdfOpenLink': {},
    '#pdfModal': { classList: { add: () => {}, remove: () => {} } },
    '#model3dViewer': modelViewer,
  };
  const app = {
    label: (key) => key,
    query: (selector) => elements[selector],
    ensureModelViewer: () => modelViewer,
    clearPdfPreview: sharedViewMethods.clearPdfPreview,
    loadPdfPreview: sharedViewMethods.loadPdfPreview,
  };
  return { app, elements, events };
}

async function flushAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function withPdfPreviewGlobals(run) {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = globalThis.URL.createObjectURL;
  const originalRevokeObjectUrl = globalThis.URL.revokeObjectURL;
  const originalWarn = console.warn;
  const objectUrls = [];
  const revoked = [];
  const warnings = [];
  let nextObjectUrl = 0;
  globalThis.URL.createObjectURL = () => {
    const url = `blob:pdf-${++nextObjectUrl}`;
    objectUrls.push(url);
    return url;
  };
  globalThis.URL.revokeObjectURL = (url) => revoked.push(url);
  console.warn = (...args) => warnings.push(args);
  try {
    await run({ objectUrls, revoked, warnings });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.URL.createObjectURL = originalCreateObjectUrl;
    globalThis.URL.revokeObjectURL = originalRevokeObjectUrl;
    console.warn = originalWarn;
  }
}

test('PDF preview fetches into a Blob URL and preserves the original download URL', async () => {
  await withPdfPreviewGlobals(async ({ objectUrls }) => {
    const { app, elements } = createPdfPreviewApp();
    const sourceUrl = 'https://example.test/drawing.pdf';
    globalThis.fetch = async (url) => {
      assert.equal(url, sourceUrl);
      return { ok: true, blob: async () => new Blob(['%PDF-']) };
    };
    sharedViewMethods.showModal.call(app, sourceUrl, 'Drawing');
    await flushAsyncWork();
    assert.deepEqual(objectUrls, ['blob:pdf-1']);
    assert.equal(elements['#pdfFrame'].src, 'blob:pdf-1');
    assert.equal(elements['#pdfOpenLink'].href, sourceUrl);
  });
});

test('an unarchived Drive PDF shows an error without requesting Drive', async () => {
  await withPdfPreviewGlobals(async ({ objectUrls }) => {
    const { app, elements } = createPdfPreviewApp();
    const sourceUrl = 'https://drive.google.com/file/d/drive-file-id/view';
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      throw new Error('Google Drive preview must not be fetched');
    };

    sharedViewMethods.showModal.call(app, sourceUrl, 'Drawing');
    await flushAsyncWork();

    assert.equal(elements['#pdfFrame'].src, 'about:blank');
    assert.equal(fetchCount, 0);
    assert.deepEqual(objectUrls, []);
    assert.equal(app.activePdfObjectUrl, undefined);
    assert.equal(elements['#pdfOpenLink'].href, '#');
    assert.equal(elements['#pdfOpenLink'].hidden, true);
    assert.equal(elements['#pdfModalSubtitle'].textContent, 'archivedPdfUnavailable');
  });
});

test('PDF preview logs HTTP and fetch failures without creating object URLs', async () => {
  await withPdfPreviewGlobals(async ({ objectUrls, warnings }) => {
    const { app } = createPdfPreviewApp();
    globalThis.fetch = async () => ({ ok: false, status: 404, statusText: 'Not Found' });
    sharedViewMethods.showModal.call(app, 'https://example.test/missing.pdf');
    await flushAsyncWork();
    globalThis.fetch = async () => { throw new Error('offline'); };
    sharedViewMethods.showModal.call(app, 'https://example.test/offline.pdf');
    await flushAsyncWork();
    assert.deepEqual(objectUrls, []);
    assert.equal(warnings.length, 2);
    assert.equal(warnings[0][0], 'PDF preview HTTP failure');
    assert.equal(warnings[1][0], 'PDF preview fetch failed');
  });
});

test('PDF preview logs Blob conversion failures without creating object URLs', async () => {
  await withPdfPreviewGlobals(async ({ objectUrls, warnings }) => {
    const { app } = createPdfPreviewApp();
    globalThis.fetch = async () => ({ ok: true, blob: async () => { throw new Error('invalid PDF'); } });
    sharedViewMethods.showModal.call(app, 'https://example.test/invalid.pdf');
    await flushAsyncWork();
    assert.deepEqual(objectUrls, []);
    assert.equal(warnings[0][0], 'PDF preview blob conversion failed');
  });
});

test('opening another PDF revokes only the previous Blob URL', async () => {
  await withPdfPreviewGlobals(async ({ revoked }) => {
    const { app, elements } = createPdfPreviewApp();
    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['%PDF-']) });
    sharedViewMethods.showModal.call(app, 'https://example.test/a.pdf');
    await flushAsyncWork();
    sharedViewMethods.showModal.call(app, 'https://example.test/b.pdf');
    await flushAsyncWork();
    assert.deepEqual(revoked, ['blob:pdf-1']);
    assert.equal(elements['#pdfFrame'].src, 'blob:pdf-2');
  });
});

test('closing the PDF modal resets the iframe before revoking the active Blob URL', async () => {
  await withPdfPreviewGlobals(async ({ revoked }) => {
    const { app, events } = createPdfPreviewApp();
    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['%PDF-']) });
    sharedViewMethods.showModal.call(app, 'https://example.test/a.pdf');
    await flushAsyncWork();
    globalThis.URL.revokeObjectURL = (url) => {
      events.push(`revoke:${url}`);
      revoked.push(url);
    };
    sharedViewMethods.closeModal.call(app);
    assert.deepEqual(revoked, ['blob:pdf-1']);
    assert.ok(events.indexOf('frame:about:blank') < events.indexOf('revoke:blob:pdf-1'));
    assert.equal(app.activePdfObjectUrl, null);
  });
});

test('repeated PDF open and close does not retain Blob URLs', async () => {
  await withPdfPreviewGlobals(async ({ objectUrls, revoked }) => {
    const { app } = createPdfPreviewApp();
    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['%PDF-']) });
    for (const sourceUrl of ['a', 'b', 'c']) {
      sharedViewMethods.showModal.call(app, `https://example.test/${sourceUrl}.pdf`);
      await flushAsyncWork();
      sharedViewMethods.closeModal.call(app);
    }
    assert.deepEqual(revoked, objectUrls);
    assert.equal(app.activePdfObjectUrl, null);
  });
});

test('a stale PDF response cannot overwrite the newer preview or revoke its Blob URL', async () => {
  await withPdfPreviewGlobals(async ({ revoked }) => {
    const { app, elements } = createPdfPreviewApp();
    const first = deferred();
    globalThis.fetch = (url) => url.endsWith('/a.pdf')
      ? first.promise
      : Promise.resolve({ ok: true, blob: async () => new Blob(['%PDF-B']) });
    sharedViewMethods.showModal.call(app, 'https://example.test/a.pdf');
    sharedViewMethods.showModal.call(app, 'https://example.test/b.pdf');
    await flushAsyncWork();
    first.resolve({ ok: true, blob: async () => new Blob(['%PDF-A']) });
    await flushAsyncWork();
    assert.equal(elements['#pdfFrame'].src, 'blob:pdf-1');
    assert.deepEqual(revoked, []);
  });
});

test('asset matching remains color-neutral and Drive-aware', () => {
  const assets = findBomAssets({ 'abc123bh|panel': [{ name: 'panel.pdf' }] }, {
    mat_code: 'ABC123WH',
    name_zh: 'Panel',
  });
  assert.equal(assets[0].name, 'panel.pdf');
  assert.equal(driveFileId('https://drive.google.com/file/d/file-id/view'), 'file-id');
  assert.equal(pdfFrameUrl('https://drive.google.com/file/d/file-id/view'), 'about:blank');
  assert.equal(pdfFrameUrl('https://drive.google.com/open?id=file-id'), 'about:blank');
  assert.equal(pdfFrameUrl('https://example.test/drawing.pdf'), 'https://example.test/drawing.pdf');
  assert.equal(pdfFrameUrl('https://example.test/drawing.pdf?id=file-id'), 'https://example.test/drawing.pdf?id=file-id');
  assert.equal(
    pdfFrameUrl('https://raw.githubusercontent.com/acme/repo/main/drawings/catalog/drawing.pdf'),
    'https://cdn.jsdelivr.net/gh/acme/repo@main/drawings/catalog/drawing.pdf',
  );
  assert.equal(
    pdfFrameUrl('https://cdn.jsdelivr.net/gh/acme/repo@main/drawings/catalog/drawing.pdf', { protocol: 'file:', hostname: '' }),
    'https://cdn.jsdelivr.net/gh/acme/repo@main/drawings/catalog/drawing.pdf',
  );
  assert.equal(assetDisplayUrl({ driveId: 'file-id' }, { protocol: 'file:', hostname: '' }), '');
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

test('notification body renders normalized material changes', () => {
  const app = Object.create(BomApplication.prototype);
  app.state = { lang: 'zh' };

  const body = app.notificationBody({
    type: 'github-save',
    changes: [{ kind: 'material', code: 'M1', field: 'name', before: 'Old', after: 'New' }],
  });

  assert.match(body, /M1/);
  assert.match(body, /Old/);
  assert.match(body, /New/);
});

test('notification body summarizes asset changes without exposing source URLs', () => {
  const app = Object.create(BomApplication.prototype);
  app.state = { lang: 'zh' };

  const body = app.notificationBody({
    type: 'github-save',
    changes: [{
      kind: 'material',
      code: 'M1',
      field: 'drawings',
      before: '',
      after: 'drawing.pdf|https://cdn.example.test/assets/pdfs/a-very-long-file-name',
    }],
  });

  assert.match(body, /M1/);
  assert.doesNotMatch(body, /https:\/\//);
});

test('3D material preview applies a consistent studio material appearance', () => {
  const calls = [];
  let onLoad;
  const modelViewer = {
    hidden: true,
    model: {
      materials: [{
        pbrMetallicRoughness: {
          setBaseColorFactor: (value) => calls.push(['color', value]),
          setMetallicFactor: (value) => calls.push(['metallic', value]),
          setRoughnessFactor: (value) => calls.push(['roughness', value]),
        },
      }],
    },
    addEventListener: (_name, handler) => { onLoad = handler; },
    setAttribute: (name) => { if (name === 'src') onLoad(); },
  };
  const frame = { hidden: false };
  const app = {
    ensureModelViewer: () => modelViewer,
    label: (key) => key,
    clearPdfPreview: sharedViewMethods.clearPdfPreview,
    query: (selector) => ({
      '#pdfFrame': frame,
      '#pdfModalTitle': {},
      '#pdfModalSubtitle': {},
      '#modelResetBtn': {},
      '#pdfCloseBtn': {},
      '#pdfOpenLink': {},
      '#pdfModal': { classList: { add: () => {} } },
    })[selector],
  };

  sharedViewMethods.showModel3dModal.call(app, { url: 'https://example.test/model.glb' }, '3D');

  assert.deepEqual(calls, [
    ['color', [0.48, 0.63, 0.76, 1]],
    ['metallic', 0.58],
    ['roughness', 0.32],
  ]);
});

test('notification body identifies BOM edits and material replacements', () => {
  const app = Object.create(BomApplication.prototype);
  app.state = { lang: 'zh' };

  const body = app.notificationBody({
    type: 'github-save',
    changes: [
      { kind: 'bom_comp_code_changed', code: 'P1', field: 'M1', before: 'A', after: 'B' },
      { kind: 'bom_material_changed', code: 'P1', before: 'M1', after: 'M2' }
    ],
  });

  assert.match(body, /P1/);
  assert.match(body, /A/);
  assert.match(body, /B/);
  assert.match(body, /M1/);
  assert.match(body, /M2/);
});

test('Admin creation flows assign stable IDs and create their records', () => {
  const app = Object.create(BomApplication.prototype);
  const materialDb = {
    materials: {
      parent: { id: 'parent', code: 'PARENT', name: { zh: 'Parent' } },
      child: { id: 'child', code: 'CHILD', name: { zh: 'Child' } },
    },
    bomEntries: [],
  };
  app.mode = 'admin';
  app.state = {
    lang: 'zh',
    selectedParentId: 'parent',
    currentSku: 'P1',
    currentColor: 'black',
    materialDb,
    payload: {
      bom: { P1: { code: 'P1', colors: ['black'], color_info: { black: { materials: [] } } } },
      materialDb,
      productRevisions: {
        P1: {
          currentRevision: 'V1',
          currentRevisionInfo: { workflowState: 'draft' },
          revisions: [],
        },
      },
    },
    adminView: 'bom',
    selectedRevision: 'V1',
    selectedMaterialId: '',
  };
  app.openMaterialSelector = (_title, select) => select(materialDb.materials.child);
  app.openPdmPrompt = (_title, _fields, submit) => submit({ comp_code: 'COMP-1', qty: '2' });
  app.markDirty = () => {};
  app.renderStructureDetail = () => {};
  app.renderProductList = () => {};
  app.renderFilterBar = () => {};
  app.renderContent = () => {};
  app.renderInspector = () => {};

  app.addChildMaterialFromPrompt();
  const childEntry = materialDb.bomEntries.find((entry) => entry.parentType === 'material');
  assert.match(childEntry.id, /^bomc_/);
  assert.equal(childEntry.childMaterialId, 'child');

  app.addBomRowFromPrompt();
  const productEntry = materialDb.bomEntries.find((entry) => entry.parentType === 'product');
  assert.match(productEntry.id, /^bom_/);
  assert.equal(productEntry.materialId, 'child');
  assert.equal(productEntry.comp_code, 'COMP-1');

  app.addDatabaseMaterial();
  assert.match(app.state.materialDraft.id, /^mat_/);
  assert.equal(app.state.selectedMaterialId, app.state.materialDraft.id);
});

test('portable product images prefer a remote URL over a missing adjacent asset path', () => {
  const asset = {
    path: 'product-images/5106_KD.jpg',
    url: 'https://raw.githubusercontent.com/acme/repo/main/product-images/5106_KD.jpg',
  };
  const localFile = { protocol: 'file:', hostname: '' };
  assert.equal(assetDisplayUrl(asset, localFile), asset.url);
  assert.equal(assetDisplayUrl({ ...asset, directUrl: 'https://cdn.example/5106.jpg' }, localFile),
    'https://cdn.example/5106.jpg');
  assert.equal(assetDisplayUrl({ path: asset.path }, localFile), asset.path);
  assert.equal(assetDisplayUrl(asset, { protocol: 'http:', hostname: 'localhost' }), asset.path);
  assert.equal(assetDisplayUrl(asset, { protocol: 'http:', hostname: '127.0.0.1' }), asset.path);
  assert.equal(assetDisplayUrl(asset, { protocol: 'https:', hostname: 'viewer.example' }), asset.url);
});

test('repository-backed Drive product images load from GitHub in a portable viewer', () => {
  const config = { owner: 'acme', repo: 'pdm', branch: 'main', shardRoot: 'pdm/data' };
  const portable = { protocol: 'file:', hostname: '' };
  const image = { path: 'product-images/LGS433_KD.jpg', driveId: 'drive-id' };
  assert.equal(assetDisplayUrl(image, portable, config),
    'https://raw.githubusercontent.com/acme/pdm/main/pdm/product-images/LGS433_KD.jpg');
  assert.equal(assetDisplayUrl(image, portable, { ...config, shardRoot: 'data' }),
    'https://raw.githubusercontent.com/acme/pdm/main/product-images/LGS433_KD.jpg');
  assert.equal(assetDisplayUrl(image, { protocol: 'http:', hostname: 'localhost' }, config),
    'https://raw.githubusercontent.com/acme/pdm/main/pdm/product-images/LGS433_KD.jpg');
  assert.equal(assetDisplayUrl({ ...image, path: 'product-images/../outside.jpg' }, portable, config), '');
});

test('an archived Drive PDF with different bytes cannot be previewed or downloaded', async () => {
  await withPdfPreviewGlobals(async ({ objectUrls }) => {
    const { app, elements } = createPdfPreviewApp();
    app.config = { owner: 'acme', repo: 'pdm', branch: 'main', shardRoot: 'workspace/data' };
    const original = 'https://drive.google.com/file/d/1_0Cv2sa0axbMkGDPSbmU4jkm0xDojLLY/view';
    const requested = [];
    globalThis.fetch = async (url) => {
      requested.push(url);
      return new Response('%PDF-1.7\nwrong PDF', { headers: { 'content-type': 'application/octet-stream' } });
    };
    let preview;
    app.loadPdfPreview = (...args) => { preview = sharedViewMethods.loadPdfPreview.call(app, ...args); return preview; };
    sharedViewMethods.showModal.call(app, original, 'Drawing');
    await preview;
    await flushAsyncWork();
    assert.equal(requested.length, 1);
    assert.match(requested[0], /^https:\/\/raw\.githubusercontent\.com\/acme\/pdm\/main\/workspace\/drawings\/catalog\/drawing-[a-f0-9]{64}\.pdf$/);
    assert.deepEqual(objectUrls, []);
    assert.equal(elements['#pdfFrame'].src, 'about:blank');
    assert.equal(elements['#pdfOpenLink'].href, '#');
    assert.equal(elements['#pdfOpenLink'].hidden, true);
    assert.equal(elements['#pdfModalSubtitle'].textContent, 'archivedPdfUnavailable');
  });
});

test('a recovered drawing is previewed and downloaded from the same checked PDF', async () => {
  const original = 'https://drive.google.com/file/d/1BXe7v1NXe1cJsR6PLEBLaVxbOe_xi12B/view';
  const archive = archivedPdfAddress(original, null, { protocol: 'http:', hostname: '127.0.0.1' });
  const file = await readFile(new URL(`../${archive.url}`, import.meta.url));
  assert.equal(archive.needsDrawingReview, true);
  assert.equal(archivedPdfAddress('https://example.test/?id=1BXe7v1NXe1cJsR6PLEBLaVxbOe_xi12B', null), null);
  await withPdfPreviewGlobals(async () => {
    const { app, elements } = createPdfPreviewApp();
    app.config = { owner: 'acme', repo: 'pdm' };
    const requested = [];
    globalThis.fetch = async (url) => {
      requested.push(url);
      return new Response(file);
    };
    let preview;
    app.loadPdfPreview = (...args) => {
      preview = sharedViewMethods.loadPdfPreview.call(app, ...args);
      return preview;
    };
    sharedViewMethods.showModal.call(app, original, '350-L.pdf', 'Rail');
    await preview;
    await flushAsyncWork();
    assert.deepEqual(requested, [`https://raw.githubusercontent.com/acme/pdm/main/${archive.url}`]);
    assert.equal(elements['#pdfFrame'].src, 'blob:pdf-1');
    assert.equal(elements['#pdfOpenLink'].href, 'blob:pdf-1');
    assert.equal(elements['#pdfOpenLink'].hidden, false);
    assert.equal(elements['#pdfOpenLink'].download, '350-L.pdf');
    assert.equal(elements['#pdfModalSubtitle'].textContent, 'Rail · archivedDrawingReview');
  });
});

test('the 327 mm reference is limited to the matching LGS043 V3 materials', () => {
  const original = 'https://drive.google.com/file/d/1DYQHdWN33Nfexhp7OE8q-c-u6K8kQ-ja/view';
  const location = { protocol: 'http:', hostname: '127.0.0.1' };
  const context = { product: 'LGS043', revision: 'V3', materialCode: 'BC300327148KD' };
  const archive = archivedPdfAddress(original, null, location, context);
  assert.equal(archive.url, 'drawings/catalog/drawing-2ck3el-d6307c03.pdf');
  assert.match(archive.title, /32\.7/);
  assert.equal(archivedPdfAddress(original, null, location, { ...context, materialCode: 'BC300327148BH' }).url, archive.url);
  assert.equal(archivedPdfAddress(original, null, location), null);
  assert.equal(archivedPdfAddress(original, null, location, { ...context, revision: 'V4' }), null);
  assert.equal(archivedPdfAddress(original, null, location, { ...context, materialCode: 'BC300325148KD' }), null);
});

test('every registered PDF is present with its expected checksum', async () => {
  const archivePaths = new Set(Object.values(archivedPdfs.files));
  const expected = new Map([...archivePaths].map((path) => [
    path, /-([a-f0-9]{64})\.pdf$/.exec(path)?.[1],
  ]));
  for (const { path, hash } of Object.values(archivedPdfs.referenceDrawings)) {
    expected.set(path, hash);
  }
  for (const [path, hash] of expected) {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-', path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, path);
  }
});

test('every legacy PDF in the runtime shards has an archive or a scoped reference', async () => {
  const readJson = async (path) => JSON.parse(await readFile(new URL(`../data/${path}`, import.meta.url), 'utf8'));
  const manifest = await readJson('manifest.json');
  const materials = await readJson('materials.json');
  const products = await Promise.all(manifest.products.map(code => readJson(`products/${code}.json`)));
  const driveIds = new Set();
  function collect(value, pdfScope = false) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (pdfScope && ['url', 'previewUrl'].includes(key) && typeof child === 'string'
        && /^https:\/\/drive\.google\.com\//i.test(child)) {
        driveIds.add(driveFileId(child));
      } else {
        collect(child, pdfScope || key === 'drawings' || key === 'manuals');
      }
    }
  }
  for (const shard of [manifest, materials, ...products]) collect(shard);
  assert.ok(driveIds.size > 0);
  for (const id of driveIds) {
    assert.ok(Object.hasOwn(archivedPdfs.files, id) || Object.hasOwn(archivedPdfs.referenceDrawings, id), id);
  }
});
