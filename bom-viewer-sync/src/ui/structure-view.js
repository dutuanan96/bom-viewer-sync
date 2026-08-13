import { localizedValue, materialWhereUsed, normalizeText, queryMatches } from '../domain/materials.js';
import { childMaterialId, groupMaterialChildRows, scopeLabel } from '../domain/relationships.js';
import { escapeHTML } from './shared-view.js';

function renderStructureView() {
  const content = this.query('.content');
  this.query('#contentHeader').innerHTML = `<h1>${escapeHTML(this.label('structureView'))}</h1>
    <div class="subtitle">Parent / Child BOM</div>`;
  const existingFilterBars = content.querySelectorAll('.pdm-module-filter-bar');
  if (existingFilterBars) existingFilterBars.forEach(el => el.remove());
  const existing = content.querySelectorAll('.table-container');
  if (existing) existing.forEach(el => el.remove());
  content.insertAdjacentHTML('beforeend', this.materialDbFilterBar());
  const parents = this.parentStructureRows();
  const totalChildren = parents.reduce((sum, p) => sum + p.children.length, 0);
  content.insertAdjacentHTML('beforeend', `<div class="table-container structure-view">
    <div class="table-toolbar">${this.structureToolbar(parents.length, this.label('structureView'), { addParent: true })}</div>
    <table><thead><tr>
      <th class="str-col-code">${escapeHTML(this.label('partNumber'))}</th>
      <th>${escapeHTML(this.label('headers')[2])}</th>
      <th>${escapeHTML(this.label('description'))}</th>
      <th>${escapeHTML(this.label('size'))}</th>
      <th>${escapeHTML(this.label('headers')[5])}</th>
      <th>${escapeHTML(this.label('headers')[6])}</th>
      <th>${escapeHTML(this.label('headers')[7])}</th>
      <th class="str-col-num">${escapeHTML(this.label('childCount'))}</th>
      <th class="str-col-num">2D</th>
      <th class="str-col-num">3D</th>
      <th class="str-col-used">${escapeHTML(this.label('whereUsed'))}</th>
      ${this.isAdmin() ? `<th class="str-col-action">${escapeHTML(this.label('operation'))}</th>` : ''}
      <th class="str-col-drill"></th>
    </tr></thead><tbody>${parents.map((p) => this.parentStructureRowHtml(p)).join('')}</tbody></table>
  </div>`);
}

function parentStructureRows() {
  const query = normalizeText(this.state.searchQuery);
  const materials = this.state.materialDb?.materials || {};
  const entries = (this.state.materialDb?.bomEntries || []).filter((e) => e.parentType === 'material');
  const payload = { ...this.state.payload, materialDb: this.state.materialDb };
  const parentMap = {};
  entries.forEach((entry) => {
    const parent = materials[entry.parentId];
    if (!parent || !materials[childMaterialId(entry)]) return;
    if (!parentMap[entry.parentId]) {
      parentMap[entry.parentId] = { parent, children: [], productCodes: new Set() };
    }
    if (entry.productCode) parentMap[entry.parentId].productCodes.add(entry.productCode);
  });
  return Object.values(parentMap)
    .map((row) => ({ ...row, children: groupMaterialChildRows(payload, row.parent.id, this.label('sharedScope')) }))
    .filter((row) => {
      const { dbFilters } = this.state;
      if (dbFilters) {
        if (dbFilters.attr !== 'all' && row.parent.attr?.zh !== dbFilters.attr) return false;
        if (dbFilters.material !== 'all' && row.parent.material?.zh !== dbFilters.material) return false;
        if (dbFilters.color !== 'all' && row.parent.color?.zh !== dbFilters.color) return false;

        const has2DVal = (row.parent.drawings || []).length > 0;
        if (dbFilters.has2D === 'yes' && !has2DVal) return false;
        if (dbFilters.has2D === 'no' && has2DVal) return false;

        const has3DVal = (row.parent.models3d || []).length > 0;
        if (dbFilters.has3D === 'yes' && !has3DVal) return false;
        if (dbFilters.has3D === 'no' && has3DVal) return false;
      }
      return true;
    })
    .filter((row) => !query || queryMatches([
      row.parent.code, row.parent.name?.zh, row.parent.name?.vi,
      row.parent.spec?.zh, row.parent.spec?.vi,
      row.parent.material?.zh, row.parent.material?.vi,
      row.parent.color?.zh, row.parent.color?.vi,
      row.parent.attr?.zh, row.parent.attr?.vi,
      ...row.children.map((c) => c.child.code),
      ...row.children.map((c) => c.child.name?.zh),
      ...row.children.map((c) => c.child.name?.vi),
      ...Array.from(row.productCodes)
    ], query))
    .sort((a, b) => String(a.parent.code || '').localeCompare(String(b.parent.code || '')));
}

function parentStructureRowHtml(row) {
  const { parent, children } = row;
  const parentName = localizedValue(parent.name, this.state.lang);
  
  const whereUsed = materialWhereUsed(this.state.payload, parent.id);
  const products = Array.from(new Set(whereUsed.productEntries.map((entry) => entry.productCode))).sort();
  
  const spuPills = products.length
    ? products.map((s) => `<span class="spu-pill">${escapeHTML(s)}</span>`).join('')
    : '<span class="mdb-empty">-</span>';
  const editAction = this.isAdmin()
    ? `<td><button class="drawing-btn" type="button" data-edit-structure-parent="${escapeHTML(parent.id)}">${escapeHTML(this.label('editMaterial'))}</button></td>`
    : '';

  const attrVal = localizedValue(parent.attr, this.state.lang);
  let attrHtml = '<td><span class="mdb-empty">-</span></td>';
  if (attrVal) {
    let attrType = 'default';
    const valLower = attrVal.toLowerCase();
    if (valLower.includes('\u96f6\u4ef6') || valLower.includes('linh') || valLower.includes('part')) attrType = 'part';
    else if (valLower.includes('\u4e94\u91d1') || valLower.includes('ng\u0169 kim') || valLower.includes('hardware')) attrType = 'hardware';
    else if (valLower.includes('\u5305\u6750') || valLower.includes('\u0111\u00f3ng g\u00f3i') || valLower.includes('pack')) attrType = 'pack';
    attrHtml = `<td><span class="attr-badge attr-${attrType}">${escapeHTML(attrVal)}</span></td>`;
  }

  return `<tr class="str-parent-row">
    <td><span class="mat-code str-parent-code" data-parent-toggle="${escapeHTML(parent.id)}">${escapeHTML(parent.code || '')}</span></td>
    <td><span class="mdb-empty">-</span></td>
    <td><span class="str-parent-name">${escapeHTML(parentName)}</span></td>
    <td>${this.highlight(localizedValue(parent.spec, this.state.lang)) || '<span class="mdb-empty">-</span>'}</td>
    <td>${this.highlight(localizedValue(parent.material, this.state.lang)) || '<span class="mdb-empty">-</span>'}</td>
    <td>${this.renderColorDot(localizedValue(parent.color, this.state.lang)) || '<span class="mdb-empty">-</span>'}</td>
    ${attrHtml}
    <td class="mdb-center">${children.length}</td>
    <td class="mdb-center">${(parent.drawings || []).length ? `<button class="drawing-btn primary" type="button" data-drawing-material="${escapeHTML(parent.id)}">${escapeHTML(this.label('viewDrawing'))}</button>` : '<span class="mdb-empty">-</span>'}</td>
    <td class="mdb-center">${(parent.models3d || []).length ? `<button class="drawing-btn primary" type="button" data-model3d-material="${escapeHTML(parent.id)}">${escapeHTML(this.label('viewDrawing'))}</button>` : '<span class="mdb-empty">-</span>'}</td>
    <td><div class="spu-pill-list">${spuPills}</div></td>
    ${editAction}
    <td><button class="drawing-btn primary str-drill-btn" type="button" data-parent-toggle="${escapeHTML(parent.id)}">${escapeHTML(this.label('view'))}</button></td>
  </tr>`;
}

function renderStructureDetail() {
  const content = this.query('.content');
  const parent = this.state.materialDb?.materials?.[this.state.selectedParentId];
  if (!parent) { this.renderStructureView(); return; }
  const parentName = localizedValue(parent.name, this.state.lang);
  const payload = { ...this.state.payload, materialDb: this.state.materialDb };

  const children = groupMaterialChildRows(payload, this.state.selectedParentId, this.label('sharedScope'));
  const rowCount = children.length;
  const rowsHtml = children.map(({ entries, child, qty, scopes }) => {
    const childName = localizedValue(child.name, this.state.lang);
    const spec = localizedValue(child.spec, this.state.lang);
    const material = localizedValue(child.material, this.state.lang);
    const color = localizedValue(child.color, this.state.lang);
    const attr = localizedValue(child.attr, this.state.lang);
    let attrHtml = '<td><span class="mdb-empty">-</span></td>';
    if (attr) {
      let attrType = 'default';
      const valLower = attr.toLowerCase();
      if (valLower.includes('\u96f6\u4ef6') || valLower.includes('linh') || valLower.includes('part')) attrType = 'part';
      else if (valLower.includes('\u4e94\u91d1') || valLower.includes('ng\u0169 kim') || valLower.includes('hardware')) attrType = 'hardware';
      else if (valLower.includes('\u5305\u6750') || valLower.includes('\u0111\u00f3ng g\u00f3i') || valLower.includes('pack')) attrType = 'pack';
      attrHtml = `<td><span class="attr-badge attr-${attrType}">${escapeHTML(attr)}</span></td>`;
    }
    const scopePills = scopes.length
      ? scopes.map((scope) => `<span class="spu-pill">${escapeHTML(scope)}</span>`).join('')
      : '<span class="mdb-empty">-</span>';

    const rowActions = this.isAdmin()
      ? `<div class="drawing-tools">
          <button class="drawing-btn" type="button" data-edit-structure-child="${escapeHTML(child.id)}">${escapeHTML(this.label('editMaterial'))}</button>
          ${entries.map((entry) => `<button class="drawing-btn danger" type="button" data-delete-child-entry="${escapeHTML(entry.id)}" title="${escapeHTML(scopeLabel(entry, this.label('sharedScope')))}">&#x2715;</button>`).join('')}
        </div>`
      : '';

    const qtyHtml = this.isAdmin()
      ? `<input class="edit-input mdb-center" style="width:60px" data-structure-edit-group="${escapeHTML(child.id)}" data-original-qty="${escapeHTML(qty)}" value="${escapeHTML(qty || '')}">`
      : `<span class="qty">${escapeHTML(qty || '')}</span>`;

    return `<tr data-material-row="${escapeHTML(child.id)}">
      <td><span class="mat-code">${escapeHTML(child.code || '')}</span></td>
      <td><span class="mdb-empty">-</span></td>
      <td>${escapeHTML(childName)}</td>
      <td>${escapeHTML(spec) || '<span class="mdb-empty">-</span>'}</td>
      <td>${escapeHTML(material) || '<span class="mdb-empty">-</span>'}</td>
      <td>${this.renderColorDot(color) || '<span class="mdb-empty">-</span>'}</td>
      ${attrHtml}
      <td class="mdb-center">${qtyHtml}</td>
      <td class="mdb-center">${(child.drawings || []).length ? `<button class="drawing-btn primary" type="button" data-drawing-material="${escapeHTML(child.id)}">${escapeHTML(this.label('viewDrawing'))}</button>` : '<span class="mdb-empty">-</span>'}</td>
      <td class="mdb-center">${(child.models3d || []).length ? `<button class="drawing-btn primary" type="button" data-model3d-material="${escapeHTML(child.id)}">${escapeHTML(this.label('viewDrawing'))}</button>` : '<span class="mdb-empty">-</span>'}</td>
      <td><div class="spu-pill-list">${scopePills}</div></td>
      ${this.isAdmin() ? `<td>${rowActions}</td>` : ''}
    </tr>`;
  }).join('');

  // Header
  this.query('#contentHeader').innerHTML = `
    <div class="str-detail-header">
      <button class="btn str-back-btn" type="button" data-action-back-structure>&#8592; ${escapeHTML(this.label('structureView'))}</button>
      <h1>${escapeHTML(parent.code || '')} <span class="str-detail-parent-name">${escapeHTML(parentName)}</span></h1>
      <div class="subtitle">${escapeHTML(this.label('childMaterial'))} &middot; ${rowCount} ${escapeHTML(this.label('items'))}</div>
    </div>`;
  const existing = content.querySelectorAll('.table-container');
  if (existing) existing.forEach(el => el.remove());
  const actionHeader = this.isAdmin() ? `<th>${escapeHTML(this.label('operation'))}</th>` : '';
  content.insertAdjacentHTML('beforeend', `<div class="table-container structure-detail-view">
    <div class="table-toolbar">${this.structureToolbar(rowCount, this.label('childMaterial'), { addChild: true, isDetail: true })}</div>
    <table><thead><tr>
      <th class="str-col-code">${escapeHTML(this.label('partNumber'))}</th>
      <th>${escapeHTML(this.label('headers')[2])}</th>
      <th>${escapeHTML(this.label('description'))}</th>
      <th>${escapeHTML(this.label('size'))}</th>
      <th>${escapeHTML(this.label('headers')[5])}</th>
      <th>${escapeHTML(this.label('headers')[6])}</th>
      <th>${escapeHTML(this.label('headers')[7])}</th>
      <th class="str-col-num">${escapeHTML(this.label('headers')[8])}</th>
      <th class="str-col-num">2D</th>
      <th class="str-col-num">3D</th>
      <th class="str-col-used">${escapeHTML(this.label('whereUsed'))}</th>
      ${actionHeader}
    </tr></thead><tbody>${rowsHtml}</tbody></table>
  </div>`);
  this.bindStructureDetailControls(content);
}

function structureToolbar(count, label, options = {}) {
  const actions = this.isAdmin()
    ? this.structureActionsHtml(options)
    : `<span class="read-only-note">${escapeHTML(this.label('readOnly'))}</span>`;
  return `<div class="count"><strong>${count}</strong> ${escapeHTML(label)}</div>
    <div class="table-actions">${actions}</div>`;
}

function structureActionsHtml(options = {}) {
  const dirtyHidden = this.state.dirty ? '' : ' hidden';
  const addChild = options.addChild
    ? `<button class="btn" type="button" data-action="add-child-material">${escapeHTML(this.label('addChildMaterial'))}</button>`
    : '';
  const addParent = options.addParent
    ? `<button class="btn" type="button" data-action="add-parent-material">${escapeHTML(this.label('addParentMaterial'))}</button>`
    : '';

  if (options.isDetail) {
    return `${addChild}
      <button class="btn btn-primary" type="button" data-action="save-structure-draft">${escapeHTML(this.label('saveStructureDraft'))}</button>
      <button class="btn danger" type="button" data-action="delete-parent-structure">${escapeHTML(this.label('deleteParentStructure'))}</button>`;
  }

  return `${addParent}${addChild}
    <button class="btn btn-primary" type="button" data-dirty-action data-action="save"${dirtyHidden}>${escapeHTML(this.label('save'))}</button>
    <button class="btn" type="button" data-dirty-action data-action="view-changes"${dirtyHidden}>${escapeHTML(this.label('viewChanges'))}</button>
    <button class="btn" type="button" data-dirty-action data-action="discard"${dirtyHidden}>${escapeHTML(this.label('discard'))}</button>
    <button class="btn" type="button" data-action="reload">${escapeHTML(this.label('reload'))}</button>
    <button class="btn" type="button" data-action="material-db">${escapeHTML(this.label('materialDatabase'))}</button>`;
}

function renderAssetsView() {
  const content = this.query('.content');
  this.query('#contentHeader').innerHTML = `<h1>${escapeHTML(this.label('assetsView'))}</h1>
    <div class="subtitle">${escapeHTML(this.label('assetSummary'))}</div>`;
  const existing = content.querySelectorAll('.table-container');
  if (existing) existing.forEach(el => el.remove());
  const rows = this.assetRows();
  content.insertAdjacentHTML('beforeend', `<div class="table-container assets-view">
    <div class="table-toolbar">${this.genericToolbar(rows.length, this.label('assetSummary'))}</div>
    <table><thead><tr>
      <th>${escapeHTML(this.label('headers')[1])}</th>
      <th>${escapeHTML(this.label('headers')[3])}</th>
      <th>${escapeHTML(this.label('headers')[7])}</th>
      <th>2D</th><th>3D</th><th>${escapeHTML(this.label('whereUsed'))}</th>
    </tr></thead><tbody>${rows.map((record) => this.assetRowHtml(record)).join('')}</tbody></table>
  </div>`);
}

function assetRows() {
  const query = normalizeText(this.state.searchQuery);
  return Object.values(this.state.materialDb?.materials || {})
    .filter((record) => (record.drawings || []).length || (record.models3d || []).length)
    .filter((record) => !query || queryMatches([
      record.code, record.name?.zh, record.name?.vi, record.attr?.zh, record.attr?.vi
    ], query))
    .sort((left, right) => ((right.drawings || []).length + (right.models3d || []).length) -
      ((left.drawings || []).length + (left.models3d || []).length));
}

function assetRowHtml(record) {
  const whereUsed = materialWhereUsed(this.state.payload, record.id);
  const products = Array.from(new Set(whereUsed.productEntries.map((entry) => entry.productCode))).sort();
  return `<tr data-material-row="${escapeHTML(record.id)}">
    <td><strong>${escapeHTML(record.code || '')}</strong></td>
    <td>${escapeHTML(localizedValue(record.name, this.state.lang))}</td>
    <td><span class="attr-badge">${escapeHTML(localizedValue(record.attr, this.state.lang))}</span></td>
    <td>${(record.drawings || []).length}</td>
    <td>${(record.models3d || []).length}</td>
    <td>${escapeHTML(products.join(', ') || '-')}</td>
  </tr>`;
}

export const structureViewMethods = {
  renderStructureView,
  parentStructureRows,
  parentStructureRowHtml,
  renderStructureDetail,
  structureToolbar,
  structureActionsHtml,
  renderAssetsView,
  assetRows,
  assetRowHtml,
};
