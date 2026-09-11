import assert from 'node:assert/strict';
import test from 'node:test';
import { assetDisplayUrl, driveFileId, findBomAssets, pdfFrameUrl } from '../src/infrastructure/assets.js';
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
  assert.equal(pdfFrameUrl('https://drive.google.com/file/d/file-id/view'), 'https://drive.google.com/file/d/file-id/preview');
  assert.equal(pdfFrameUrl('https://example.test/drawing.pdf'), 'https://example.test/drawing.pdf');
  assert.equal(
    pdfFrameUrl('https://cdn.jsdelivr.net/gh/acme/repo@main/drawings/catalog/drawing.pdf', { protocol: 'file:', hostname: '' }),
    'https://cdn.jsdelivr.net/gh/acme/repo@main/drawings/catalog/drawing.pdf',
  );
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
