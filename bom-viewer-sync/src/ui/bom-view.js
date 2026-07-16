import {
  filterMaterials,
  localizedValue,
  materialText,
  materialWhereUsed,
  sortMaterials,
} from '../domain/materials.js';
import { assetKey } from '../infrastructure/assets.js';
import { escapeHTML } from './shared-view.js';

function renderInspector() {
  const panel = this.query('#inspectorPanel');
  if (!panel) return;
  if (this.state.adminView === 'bom') {
    panel.classList.toggle('visible', false);
    panel.innerHTML = '';
    return;
  }
  if (this.state.adminView === 'materials' || this.state.adminView === 'structure') {
    panel.classList.toggle('visible', false);
    panel.innerHTML = '';
    return;
  }
  const record = this.state.selectedMaterialId ? this.state.materialDb?.materials?.[this.state.selectedMaterialId] : null;
  panel.classList.toggle('visible', Boolean(record));
  panel.innerHTML = record ? this.materialInspectorHtml(record) : this.emptyInspectorHtml();
}

function bomInspectorHtml() {
  const selected = this.selectedBomRow();
  if (!selected) return this.productInspectorHtml();
  const name = materialText(selected, 'name', this.state.lang);
  return `<div class="inspector-header">
    <span class="eyebrow">${escapeHTML(this.label('selectedBomRow'))}</span>
    <h2>${escapeHTML(selected.mat_code || this.label('noSelection'))}</h2>
    <p>${escapeHTML(name)}</p>
  </div>
  <div class="inspector-section">
    ${this.inspectorField(this.label('headers')[2], selected.comp_code || '-')}
    ${this.inspectorField(this.label('headers')[4], materialText(selected, 'spec', this.state.lang) || '-')}
    ${this.inspectorField(this.label('headers')[8], selected.qty || '-')}
    ${this.inspectorField(this.label('headers')[7], materialText(selected, 'attr', this.state.lang) || '-')}
  </div>
  ${this.replaceControlHtml(selected)}
  ${this.materialAssetsSummaryHtml(selected._materialRecord)}`;
}

function productInspectorHtml() {
  const product = this.product();
  const colorData = this.colorData();
  const title = colorData ? this.localizedProductName(colorData) : this.label('noSelection');
  return `<div class="inspector-header">
    <span class="eyebrow">${escapeHTML(this.label('sidebarProductGroup'))}</span>
    <h2>${escapeHTML(this.state.currentSku || '-')}</h2>
    <p>${escapeHTML(title)}</p>
  </div>
  <div class="inspector-section">
    ${this.inspectorField(this.label('size'), colorData?.size || '-')}
    ${this.inspectorField(this.label('colors'), String(Object.keys(product?.color_info || {}).length))}
    ${this.inspectorField(this.label('total'), String(this.bomRows().length))}
  </div>
  <div class="inspector-help">${escapeHTML(this.label('selectRowHint'))}</div>`;
}

function materialInspectorHtml(record) {
  const whereUsed = materialWhereUsed(this.state.payload, record.id);
  const products = Array.from(new Set(whereUsed.productEntries.map((entry) => entry.productCode))).sort();
  return `<div class="inspector-header">
    <span class="eyebrow">${escapeHTML(this.label('selectedMaterial'))}</span>
    <h2>${escapeHTML(record.code || '-')}</h2>
    <p>${escapeHTML(localizedValue(record.name, this.state.lang))}</p>
  </div>
  <div class="inspector-section">
    ${this.inspectorField(this.label('headers')[4], localizedValue(record.spec, this.state.lang) || '-')}
    ${this.inspectorField(this.label('headers')[5], localizedValue(record.material, this.state.lang) || '-')}
    ${this.inspectorField(this.label('headers')[6], localizedValue(record.color, this.state.lang) || '-')}
    ${this.inspectorField(this.label('headers')[7], localizedValue(record.attr, this.state.lang) || '-')}
  </div>
  <div class="inspector-section">
    ${this.inspectorField('2D', String((record.drawings || []).length))}
    ${this.inspectorField('3D', String((record.models3d || []).length))}
    ${this.inspectorField(this.label('whereUsed'), products.join(', ') || '-')}
    ${this.inspectorField(this.label('parentMaterial'), String(whereUsed.parentEntries.length))}
    ${this.inspectorField(this.label('childCount'), String(whereUsed.childEntries.length))}
  </div>`;
}

function emptyInspectorHtml() {
  return `<div class="inspector-header">
    <span class="eyebrow">${escapeHTML(this.label('inspector'))}</span>
    <h2>${escapeHTML(this.label('noSelection'))}</h2>
    <p>${escapeHTML(this.label('selectRowHint'))}</p>
  </div>`;
}

function inspectorField(label, value) {
  return `<div class="inspector-field"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`;
}

function replaceControlHtml(selected) {
  if (!this.isAdmin()) return `<div class="inspector-help">${escapeHTML(this.label('readOnly'))}</div>`;
  return `<div class="inspector-section replace-box">
    <label>
      <span>${escapeHTML(this.label('replaceWith'))}</span>
      <input class="edit-input" id="replaceMaterialInput" data-replace-material-query list="materialOptions" placeholder="${escapeHTML(this.label('replaceMaterialPrompt'))}" value="${escapeHTML(this.state.replaceQuery)}">
    </label>
    <datalist id="materialOptions">${this.materialOptionsHtml(selected?._materialId)}</datalist>
    <button class="btn btn-primary full-width" type="button" data-action="replace-selected-bom">${escapeHTML(this.label('replaceNow'))}</button>
  </div>`;
}

function materialOptionsHtml(currentMaterialId) {
  return Object.values(this.state.materialDb?.materials || {})
    .filter((record) => record.id !== currentMaterialId)
    .sort((left, right) => String(left.code || '').localeCompare(String(right.code || '')))
    .map((record) => `<option value="${escapeHTML(record.code || record.id)}">${escapeHTML(localizedValue(record.name, this.state.lang))}</option>`)
    .join('');
}

function materialAssetsSummaryHtml(record) {
  if (!record) return '';
  return `<div class="inspector-section">
    ${this.inspectorField('2D', String((record.drawings || []).length))}
    ${this.inspectorField('3D', String((record.models3d || []).length))}
  </div>`;
}

function renderTable() {
  const content = this.query('.content');
  const existingFilterBars = content.querySelectorAll('.pdm-module-filter-bar');
  if (existingFilterBars) existingFilterBars.forEach(el => el.remove());
  const existing = content.querySelectorAll('.table-container');
  if (existing) existing.forEach(el => el.remove());
  content.insertAdjacentHTML('beforeend', this.materialDbFilterBar());
  const rows = this.filteredRows();
  this.state.lastRows = rows;
  content.insertAdjacentHTML('beforeend', rows.length ? this.tableHtml(rows) : this.emptyTableHtml());
}

function filteredRows() {
  const allRows = this.bomRows();
  const filtered = filterMaterials({
    materials: allRows,
    attr: this.state.currentAttr,
    query: this.state.searchQuery,
    sortCol: this.state.sortCol,
    sortAsc: this.state.sortAsc,
    lang: this.state.lang,
    attrOrder: this.attrOrder(),
    dbFilters: this.state.dbFilters,
    has2D: (m) => this.drawingsFor(m).length > 0,
    has3D: (m) => this.models3dFor(m).length > 0
  });
  const includedEntryIds = new Set(filtered.map((row) => row._entryId).filter(Boolean));
  if (!allRows.some((row) => row._parentEntryId)) return filtered;
  const parentByEntry = new Map();
  const childrenByParent = new Map();
  allRows.forEach((row) => {
    if (!row._entryId || !row._parentEntryId) return;
    parentByEntry.set(row._entryId, row._parentEntryId);
    if (!childrenByParent.has(row._parentEntryId)) childrenByParent.set(row._parentEntryId, []);
    childrenByParent.get(row._parentEntryId).push(row._entryId);
  });
  const hasIncludedAncestor = (row) => {
    let parentId = row._parentEntryId;
    let guard = 0;
    while (parentId && guard < 50) {
      if (includedEntryIds.has(parentId)) return true;
      parentId = parentByEntry.get(parentId);
      guard += 1;
    }
    return false;
  };
  const hasIncludedDescendant = (entryId) => {
    const stack = [...(childrenByParent.get(entryId) || [])];
    const seen = new Set();
    while (stack.length) {
      const childId = stack.pop();
      if (!childId || seen.has(childId)) continue;
      seen.add(childId);
      if (includedEntryIds.has(childId)) return true;
      stack.push(...(childrenByParent.get(childId) || []));
    }
    return false;
  };
  const finalRows = allRows.filter((row) => !row._entryId ||
    includedEntryIds.has(row._entryId) ||
    hasIncludedAncestor(row) ||
    hasIncludedDescendant(row._entryId));

  const rowsByParent = new Map();
  finalRows.forEach((row) => {
    const parentId = row._parentEntryId || 'root';
    if (!rowsByParent.has(parentId)) rowsByParent.set(parentId, []);
    rowsByParent.get(parentId).push(row);
  });

  const sortOpts = { sortCol: this.state.sortCol, sortAsc: this.state.sortAsc, lang: this.state.lang, attrOrder: this.attrOrder() };
  const sortedOutput = [];

  const addSortedChildren = (parentId) => {
    const children = rowsByParent.get(parentId) || [];
    sortMaterials(children, sortOpts).forEach((child) => {
      sortedOutput.push(child);
      addSortedChildren(child._entryId);
    });
  };

  addSortedChildren('root');
  return sortedOutput;
}

function attrOrder() {
  return this.collectAttrs().reduce((result, item, index) => {
    result[item.value] = index;
    return result;
  }, {});
}

function emptyTableHtml() {
  return `<div class="table-container"><div class="empty-state"><div class="icon">BOM</div>
    <h3>${escapeHTML(this.label('noResultTitle'))}</h3><p>${escapeHTML(this.label('noResultText'))}</p></div></div>`;
}

function tableHtml(rows) {
  return `<div class="table-container"><div class="table-toolbar">${this.toolbarHtml(rows)}</div>
    <table class="bom-table">${this.tableColgroupHtml()}<thead>${this.tableHeadHtml()}</thead><tbody>${rows.map((row, index) => this.rowHtml(row, index)).join('')}</tbody></table></div>`;
}

function tableColgroupHtml() {
  const editAction = this.canEditProductRevision() ? '<col class="col-actions">' : '';
  return `<colgroup>
    <col class="col-level">
    <col class="col-mat-code">
    <col class="col-comp-code">
    <col class="col-description">
    <col class="col-spec">
    <col class="col-material">
    <col class="col-color">
    <col class="col-attr">
    <col class="col-qty">
    <col class="col-2d">
    <col class="col-3d">
    ${editAction}
  </colgroup>`;
}

function bomActionsHtml() {
  const createRevisionAction = this.canCreateProductRevision()
    ? `<button class="btn" type="button" data-action="create-product-revision">${escapeHTML(this.label('createRevision'))}</button>`
    : '';
  return `<button class="btn btn-primary" type="button" data-action="save">${escapeHTML(this.label('save'))}</button>
    <button class="btn" type="button" data-action="discard">${escapeHTML(this.label('discard'))}</button>
    <button class="btn" type="button" data-action="reload">${escapeHTML(this.label('reload'))}</button>
    ${createRevisionAction}
    <button class="btn" type="button" data-action="material-db">${escapeHTML(this.label('materialDatabase'))}</button>`;
}

function toolbarHtml(rows) {
  const readOnlyLabel = this.isHistoricalRevision() ? 'historicalRevisionReadOnly' : 'readOnly';
  const adminActions = this.isAdmin() && !this.isHistoricalRevision()
    ? this.bomActionsHtml()
    : `<span class="read-only-note">${escapeHTML(this.label(readOnlyLabel))}</span>`;
  return `<div class="table-title"><span class="material-symbols-outlined">view_list</span><strong>${escapeHTML(this.label('billOfMaterials'))}</strong><span class="count">${rows.length} ${escapeHTML(this.label('materials'))}</span></div>
    <div class="table-actions">${adminActions}
    <button class="btn" type="button" data-action="copy">${escapeHTML(this.label('copy'))}</button>
    <button class="btn btn-primary" type="button" data-action="exportExcel">${escapeHTML(this.label('exportExcel'))}</button></div>`;
}

function adminActionsHtml() {
  const viewAction = this.state.adminView === 'materials'
    ? `<button class="btn" type="button" data-action="bom-view">BOM</button>`
    : `<button class="btn" type="button" data-action="material-db">\u7269\u6599\u6570\u636e\u5e93</button>`;
  const bomAdd = this.state.adminView === 'bom' && this.state.editMode
    ? `<button class="btn" type="button" data-action="add-bom-row">\u6dfb\u52a0\u7269\u6599</button>`
    : '';
  const dbAdd = this.state.adminView === 'materials' && this.state.editMode
    ? `<button class="btn" type="button" data-action="add-db-material">\u65b0\u589e\u7269\u6599</button>`
    : '';
  const strAdd = this.state.adminView === 'structure' && this.state.selectedParentId && this.state.editMode
    ? `<button class="btn" type="button" data-action="add-child-material">\u6dfb\u52a0\u5b50\u9879</button>`
    : '';
  return `<button class="btn ${this.state.editMode ? 'active' : ''}" type="button" data-action="toggle-edit">${escapeHTML(this.state.editMode ? this.label('done') : this.label('edit'))}</button>
    <button class="btn btn-primary" type="button" data-action="save">${escapeHTML(this.label('save'))}</button>
    <button class="btn" type="button" data-action="discard">${escapeHTML(this.label('discard'))}</button>
    <button class="btn" type="button" data-action="reload">${escapeHTML(this.label('reload'))}</button>
    ${viewAction}${bomAdd}${dbAdd}${strAdd}`;
}

function tableHeadHtml() {
  const headers = this.label('headers');
  const sortable = [
    ['stt', this.label('level')],
    ['mat_code', this.label('partNumber')],
    ['comp_code', this.label('componentNumber')],
    ['name', this.label('description')],
    ['spec', headers[4]],
    ['material', headers[5]],
    ['color', headers[6]],
    ['attr', headers[7]],
    ['qty', headers[8]]
  ].map(([col, label]) => `<th><button class="th-button" type="button" data-sort="${col}">${escapeHTML(label)} ${this.sortIcon(col)}</button></th>`);
  const editAction = this.canEditProductRevision() ? '<th>\u64cd\u4f5c</th>' : '';
  return `<tr>${sortable.join('')}<th>${escapeHTML(headers[9])}</th><th>3D</th>${editAction}</tr>`;
}

function rowHtml(material, index) {
  const editAction = this.canEditProductRevision()
    ? `<td><div class="drawing-tools">
      <button class="drawing-btn" type="button" data-edit-bom-material="${escapeHTML(material._materialId || '')}">${escapeHTML(this.label('editMaterial'))}</button>
      <button class="drawing-btn" type="button" data-replace-bom-row="${index}">${escapeHTML(this.label('replaceMaterial'))}</button>
      <button class="drawing-btn danger" type="button" data-delete-bom-row="${index}">${escapeHTML(this.deleteAssetLabel())}</button>
    </div></td>`
    : '';
  const active = material._entryId && material._entryId === this.state.selectedEntryId ? 'selected-row' : '';
  const level = Number(material._level || 1);
  const levelTag = `<span class="level-tag level-tag-${Math.min(level, 5)}">${escapeHTML(String(level))}</span>`;
  let levelCell = `<span class="level-cell">${levelTag}</span>`;
  let trAttrs = `class="${active}" data-bom-entry="${escapeHTML(material._entryId || '')}"`;
  if (level > 1) {
    const indent = Math.min(Math.max(level - 2, 0) * 14 + 16, 72);
    const toggleClass = material._hasChildren ? ' level-toggle expanded' : '';
    const toggleAttr = material._hasChildren ? ` data-level-toggle="${escapeHTML(material._entryId || '')}"` : '';
    const icon = material._hasChildren ? ' <span class="level-expand-icon">▾</span>' : '';
    levelCell = `<span class="level-cell-2${toggleClass}"${toggleAttr} style="--bom-level-indent:${indent}px">└ ${levelTag}${icon}</span>`;
    trAttrs += ` data-child-level="${escapeHTML(material._parentEntryId || '')}"`;
  } else if (material._hasChildren) {
    levelCell = `<span class="level-cell level-toggle expanded" data-level-toggle="${escapeHTML(material._entryId || '')}">${levelTag} <span class="level-expand-icon">▾</span></span>`;
  }
  return `<tr ${trAttrs}>
    <td>${levelCell}</td>
    ${this.partNumberCellHtml(material, index)}
    ${this.componentNumberCellHtml(material, index)}
    ${this.cellHtml(material, 'name', index)}
    ${this.cellHtml(material, 'spec', index)}
    ${this.cellHtml(material, 'material', index)}
    ${this.cellHtml(material, 'color', index)}
    ${this.cellHtml(material, 'attr', index)}
    ${this.cellHtml(material, 'qty', index)}
    <td class="drawing-cell">${this.drawingCellHtml(material, index)}</td>
    <td class="model3d-cell">${this.model3dCellHtml(material, index)}</td>
    ${editAction}
  </tr>`;
}

function partNumberCellHtml(material, index) {
  if (this.canEditProductRevision() && this.state.editMode) {
    return `<td>${this.editInput(materialText(material, 'mat_code', this.state.lang), 'mat_code', index)}</td>`;
  }
  return `<td><span class="mat-code">${this.highlight(materialText(material, 'mat_code', this.state.lang))}</span></td>`;
}

function componentNumberCellHtml(material, index) {
  if (this.canEditProductRevision() && this.state.editMode) {
    return `<td>${this.editInput(materialText(material, 'comp_code', this.state.lang), 'comp_code', index)}</td>`;
  }
  return `<td><span class="comp-code">${escapeHTML(materialText(material, 'comp_code', this.state.lang) || '-')}</span></td>`;
}

function materialStackCellHtml(material, index) {
  if (this.canEditProductRevision() && this.state.editMode) {
    return `<td><div class="stack-cell">${this.editInput(materialText(material, 'material', this.state.lang), 'material', index)}${this.editInput(materialText(material, 'color', this.state.lang), 'color', index)}</div></td>`;
  }
  return `<td><div class="stack-cell"><span>${this.highlight(materialText(material, 'material', this.state.lang))}</span><span class="muted-line">${this.renderColorDot(materialText(material, 'color', this.state.lang))}</span></div></td>`;
}

function cellHtml(material, field, index) {
  const value = materialText(material, field, this.state.lang);
  if (this.canEditProductRevision() && this.state.editMode) return `<td>${this.editInput(value, field, index)}</td>`;
  if (field === 'attr') {
    return `<td>${this.renderAttrBadge(value)}</td>`;
  }
  if (field === 'qty') return `<td><span class="qty">${escapeHTML(value)}</span></td>`;
  if (field === 'color') return `<td>${this.renderColorDot(value)}</td>`;
  return `<td>${this.highlight(value)}</td>`;
}

function renderAttrBadge(attrValue) {
  if (!attrValue) return '<span class="mdb-empty">-</span>';
  const valLower = attrValue.toLowerCase();
  let type = 'default';
  if (valLower.includes('\u96f6\u4ef6') || valLower.includes('linh') || valLower.includes('part')) type = 'part';
  else if (valLower.includes('\u4e94\u91d1') || valLower.includes('ng\u0169 kim') || valLower.includes('hardware')) type = 'hardware';
  else if (valLower.includes('\u5305\u6750') || valLower.includes('\u0111\u00f3ng g\u00f3i') || valLower.includes('pack')) type = 'pack';
  return `<span class="attr-badge attr-${type}">${this.highlight(attrValue)}</span>`;
}

function renderColorDot(colorStr) {
  if (!colorStr) return '-';
  let hex = '';
  let extraStyle = '';
  const lower = colorStr.toLowerCase();

  // Combination & specific colors first
  if (lower.includes('\u767d\u5e95\u9ed1\u5b57') || lower.includes('n\u1ec1n tr\u1eafng') || lower.includes('\u9ed1\u767d') || lower.includes('\u0111en tr\u1eafng')) {
    hex = 'linear-gradient(135deg, #ffffff 50%, #1a1a1a 50%)';
    extraStyle = 'border: 1px solid #c3c6d6;';
  }
  else if (lower.includes('\u9540\u950c') || lower.includes('m\u1ea1 k\u1ebdm') || lower.includes('k\u1ebdm')) hex = '#94a3b8';
  else if (lower.includes('\u7eb8') || lower.includes('gi\u1ea5y')) hex = '#d7c5a0';
  else if (lower.includes('\u672c\u8272') || lower.includes('t\u1ef1 nhi\u00ean')) hex = '#e2e8f0';
  else if (lower.includes('\u590d\u53e4') || lower.includes('g\u1ed7 c\u1ed5')) hex = '#8b5a2b';
  else if (lower.includes('n\u00e2u') || lower.includes('brown')) hex = '#8b5a2b';
  else if (lower.includes('\u539f\u6728') || lower.includes('g\u1ed7') || lower.includes('oak')) hex = '#d2b48c';
  else if (lower.includes('\u80e1\u6843') || lower.includes('walnut')) hex = '#5c4033';
  else if (lower.includes('\u9ed1') || lower.includes('black') || lower.includes('\u0111en')) hex = '#1a1a1a';
  else if (lower.includes('\u767d') || lower.includes('white') || lower.includes('tr\u1eafng')) hex = '#ffffff';
  else if (lower.includes('\u7070') || lower.includes('gray') || lower.includes('grey') || lower.includes('x\u00e1m')) hex = '#9ca3af';
  else if (lower.includes('\u7ea2') || lower.includes('red') || lower.includes('\u0111\u1ecf')) hex = '#ef4444';
  else if (lower.includes('\u84dd') || lower.includes('blue') || lower.includes('xanh d\u01b0\u01a1ng')) hex = '#3b82f6';
  else if (lower.includes('\u7eff') || lower.includes('green') || lower.includes('xanh l\u00e1')) hex = '#10b981';
  else if (lower.includes('\u9ec4') || lower.includes('yellow') || lower.includes('v\u00e0ng')) hex = '#f59e0b';

  if (hex) {
    if (!extraStyle && (hex === '#ffffff' || hex === '#e2e8f0')) extraStyle = 'border: 1px solid #c3c6d6;';
    const bgProp = hex.includes('gradient') ? 'background' : 'background-color';
    return `<div class="color-dot-wrapper"><span class="color-dot" style="${bgProp}: ${hex}; ${extraStyle}"></span><span>${this.highlight(colorStr)}</span></div>`;
  }
  return this.highlight(colorStr);
}

function editInput(value, field, index) {
  const wide = field === 'name' || field === 'spec' ? 'edit-wide' : '';
  return `<input class="edit-input ${wide}" data-row-index="${index}" data-edit-field="${field}" value="${escapeHTML(value)}">`;
}

function highlight(value) {
  const escaped = escapeHTML(value);
  if (!this.state.searchQuery || !value) return escaped;
  const keywords = this.state.searchQuery.trim().split(/\s+/).filter(Boolean);
  if (!keywords.length) return escaped;
  const pattern = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return escaped.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
}

function drawingCellHtml(material, index) {
  const drawings = this.drawingsFor(material);
  if (!drawings.length) return `<div class="drawing-note">${escapeHTML(this.label('noDrawing'))}</div>`;
  const deleteButton = this.assetDeleteButton('drawing', index);
  return `<div class="drawing-tools"><button class="drawing-btn primary" type="button" data-drawing-row="${index}">${escapeHTML(this.label('viewDrawing'))}</button>${deleteButton}</div>`;
}

function model3dCellHtml(material, index) {
  const models = this.models3dFor(material);
  if (!models.length) return `<div class="drawing-note">${escapeHTML(this.label('noDrawing'))}</div>`;
  const deleteButton = this.assetDeleteButton('model3d', index);
  return `<div class="drawing-tools"><button class="drawing-btn primary" type="button" data-model3d-row="${index}">${escapeHTML(this.label('viewDrawing'))}</button>${deleteButton}</div>`;
}

function assetDeleteButton(type, index) {
  if (!this.canEditProductRevision() || !this.state.editMode) return '';
  const attr = type === 'drawing' ? 'data-delete-drawing-row' : 'data-delete-model3d-row';
  return `<button class="drawing-btn danger" type="button" ${attr}="${index}">${escapeHTML(this.deleteAssetLabel())}</button>`;
}

function deleteAssetLabel() {
  return this.state.lang === 'vi' ? 'X\u00f3a' : '\u5220\u9664';
}

function drawingsFor(material) {
  return material?._materialRecord?.drawings || [];
}

function models3dFor(material) {
  return material?._materialRecord?.models3d || [];
}

function productModels3d() {
  const skuModels = this.state.models3d[this.state.currentSku] || {};
  return Object.entries(skuModels)
    .filter(([key]) => !key.includes('|'))
    .flatMap(([, models]) => models);
}

function drawingKey(value) {
  return assetKey(value);
}

function sortIcon(col) {
  if (this.state.sortCol !== col) return '';
  return this.state.sortAsc ? '↑' : '↓';
}

export const bomViewMethods = {
  renderInspector,
  bomInspectorHtml,
  productInspectorHtml,
  materialInspectorHtml,
  emptyInspectorHtml,
  inspectorField,
  replaceControlHtml,
  materialOptionsHtml,
  materialAssetsSummaryHtml,
  renderTable,
  filteredRows,
  attrOrder,
  emptyTableHtml,
  tableHtml,
  tableColgroupHtml,
  bomActionsHtml,
  toolbarHtml,
  adminActionsHtml,
  tableHeadHtml,
  rowHtml,
  partNumberCellHtml,
  componentNumberCellHtml,
  materialStackCellHtml,
  cellHtml,
  renderAttrBadge,
  renderColorDot,
  editInput,
  highlight,
  drawingCellHtml,
  model3dCellHtml,
  assetDeleteButton,
  deleteAssetLabel,
  drawingsFor,
  models3dFor,
  productModels3d,
  drawingKey,
  sortIcon,
};
