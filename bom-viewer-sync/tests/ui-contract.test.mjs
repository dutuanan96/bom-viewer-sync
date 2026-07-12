import assert from 'node:assert/strict';
import test from 'node:test';
import { BomApplication } from '../src/application.js';
import { bomViewMethods } from '../src/ui/bom-view.js';
import { catalogViewMethods } from '../src/ui/catalog-view.js';
import { materialViewMethods } from '../src/ui/material-view.js';
import { sharedViewMethods } from '../src/ui/shared-view.js';
import { structureViewMethods } from '../src/ui/structure-view.js';

test('view modules own their public render entry points', () => {
  assert.equal(typeof catalogViewMethods.renderProductCatalog, 'function');
  assert.equal(typeof bomViewMethods.renderTable, 'function');
  assert.equal(typeof bomViewMethods.renderInspector, 'function');
  assert.equal(typeof materialViewMethods.renderMaterialDatabase, 'function');
  assert.equal(typeof materialViewMethods.renderMaterialMasterEditor, 'function');
  assert.equal(typeof structureViewMethods.renderStructureView, 'function');
  assert.equal(typeof structureViewMethods.renderStructureDetail, 'function');
});

test('BOM view keeps the redundant inspector hidden', () => {
  const source = String(bomViewMethods.renderInspector);
  assert.match(source, /adminView === 'bom'/);
  assert.match(source, /panel\.classList\.toggle\('visible', false\)/);
  assert.match(source, /panel\.innerHTML = ''/);
  assert.doesNotMatch(source, /bomInspectorHtml\(\)/);
});

test('BomApplication installs each uniquely owned view method', () => {
  const collections = [
    sharedViewMethods,
    catalogViewMethods,
    bomViewMethods,
    materialViewMethods,
    structureViewMethods,
  ];
  const methodNames = collections.flatMap((collection) => Object.keys(collection));

  assert.equal(new Set(methodNames).size, methodNames.length, 'view method keys must be unique');
  for (const collection of collections) {
    for (const [name, method] of Object.entries(collection)) {
      assert.equal(BomApplication.prototype[name], method, `${name} must be installed on BomApplication.prototype`);
    }
  }
});
