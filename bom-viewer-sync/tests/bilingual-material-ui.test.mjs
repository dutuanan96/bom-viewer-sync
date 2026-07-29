import test from 'node:test';
import assert from 'node:assert/strict';
import { BomApplication } from '../src/application.js';
import { buildBilingualDictionary } from '../src/domain/bilingual-dictionary.js';

function localizedMaterial(id, code, nameZh, nameVi) {
  return {
    id,
    code,
    name: { zh: nameZh, vi: nameVi },
    spec: { zh: '', vi: '' },
    material: { zh: '', vi: '' },
    color: { zh: '', vi: '' },
    attr: { zh: '零件', vi: 'Linh kiện' },
    drawings: [],
    models3d: [],
  };
}

function bilingualInputs(field = 'name') {
  const form = {
    inputs: {},
    querySelector(selector) {
      const lang = selector.match(/data-lang="(zh|vi)"/)?.[1];
      return this.inputs[lang] || null;
    },
  };
  const createInput = (lang) => ({
    value: '',
    dataset: {
      materialMasterEdit: field,
      lang,
      bilingualProvenance: 'empty',
    },
    matches: () => true,
    closest: (selector) => selector === '.material-master-form' ? form : null,
    dispatchEvent: () => true,
  });
  form.inputs.zh = createInput('zh');
  form.inputs.vi = createInput('vi');
  return form.inputs;
}

function setupApp(materials) {
  const app = new BomApplication({
    mode: 'admin',
    config: { owner: 'test', repo: 'test', branch: 'main' },
  });
  app.bilingualDict = buildBilingualDictionary(materials);
  app.showBilingualHint = () => {};
  return app;
}

test('bilingual blur updates only empty or auto-filled partner fields', () => {
  const app = setupApp({
    M1: localizedMaterial('M1', 'A', '纸卡', 'Giấy lót'),
    M2: localizedMaterial('M2', 'B', '棉布', 'Vải cotton'),
  });
  const inputs = bilingualInputs();

  inputs.zh.value = '纸卡';
  inputs.zh.dataset.bilingualProvenance = 'user-edited';
  app.handleBilingualBlur({ target: inputs.zh });
  assert.equal(inputs.vi.value, 'Giấy lót');
  assert.equal(inputs.vi.dataset.bilingualProvenance, 'auto-filled');

  inputs.zh.value = '棉布';
  app.handleBilingualBlur({ target: inputs.zh });
  assert.equal(inputs.vi.value, 'Vải cotton');

  inputs.vi.value = 'Bản dịch Admin';
  inputs.vi.dataset.bilingualProvenance = 'user-edited';
  inputs.zh.value = '纸卡';
  app.handleBilingualBlur({ target: inputs.zh });
  assert.equal(inputs.vi.value, 'Bản dịch Admin');
});

test('bilingual blur refuses to select an ambiguous translation', () => {
  const app = setupApp({
    M1: localizedMaterial('M1', 'A', '纸卡', 'Giấy lót'),
    M2: localizedMaterial('M2', 'B', '纸卡', 'Thẻ giấy'),
  });
  const inputs = bilingualInputs();
  let hint = '';
  app.label = (key) => key;
  app.showBilingualHint = (_input, text) => { hint = text; };
  inputs.zh.value = '纸卡';

  app.handleBilingualBlur({ target: inputs.zh });

  assert.equal(inputs.vi.value, '');
  assert.equal(hint, 'bilingualAmbiguousMapping');
});

function configureSaveForm(app, draft) {
  const fields = [
    ['code', '', draft.code],
    ...['name', 'spec', 'material', 'color', 'attr']
      .flatMap((field) => ['zh', 'vi'].map((lang) => [field, lang, draft[field]?.[lang] || ''])),
  ].map(([field, lang, value]) => ({
    value,
    dataset: { materialMasterEdit: field, ...(lang ? { lang } : {}) },
  }));
  app.queryAll = (selector) => {
    if (selector === '[data-material-master-edit]') return fields;
    return [];
  };
  app.renderProductList = () => {};
  app.renderContent = () => {};
  app.renderInspector = () => {};
  app.prunePendingMaterialAssets = () => {};
  app.markDirty = () => {};
  app.setStatus = (message, status) => { app.lastStatus = { message, status }; };
  app.label = (key) => key;
}

test('Material Master allows a shared name with a new code and blocks a duplicate code', () => {
  const existing = localizedMaterial('M1', 'PAPER-1', '纸卡', 'Giấy lót');
  const app = setupApp({ M1: existing });
  app.state.payload = { materialDb: { materials: { M1: structuredClone(existing) }, bomEntries: [] } };
  app.state.materialDb = app.state.payload.materialDb;

  const newDraft = localizedMaterial('M2', 'PAPER-2', '纸卡', 'Giấy lót');
  app.state.materialDraft = structuredClone(newDraft);
  app.state.selectedMaterialId = 'M2';
  configureSaveForm(app, newDraft);
  app.saveMaterialMaster();
  assert.equal(app.state.materialDb.materials.M2.code, 'PAPER-2');
  assert.equal(app.state.materialDb.materials.M2.name.zh, '纸卡');

  const duplicateDraft = localizedMaterial('M3', ' paper-1 ', '纸卡', 'Giấy lót');
  app.state.materialDraft = structuredClone(duplicateDraft);
  app.state.selectedMaterialId = 'M3';
  configureSaveForm(app, duplicateDraft);
  app.saveMaterialMaster();
  assert.equal(app.state.materialDb.materials.M3, undefined);
  assert.deepEqual(app.lastStatus, { message: 'materialCodeExists', status: 'error' });
});
