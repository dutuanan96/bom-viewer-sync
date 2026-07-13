import { localizedValue, materialWhereUsed, normalizeText, queryMatches } from '../domain/materials.js';
import { escapeHTML } from './shared-view.js';

function renderMaterialDatabase() {
  const content = this.query('.content');

  const existingFilterBars = content.querySelectorAll('.pdm-module-filter-bar');
  if (existingFilterBars) existingFilterBars.forEach(el => el.remove());

  const selected = this.selectedMaterialRecord();
  if (selected && this.isAdmin()) {
    this.renderMaterialMasterEditor(selected);
    return;
  }
  const title = selected
    ? (localizedValue(selected.name, this.state.lang) || selected.code || this.label('materials'))
    : this.label('materialDatabase');
  const subtitle = selected
    ? `${selected.code || selected.id} · Material Database`
    : 'Material Database';
  this.query('#contentHeader').innerHTML = `<h1>${escapeHTML(title)}</h1>
    <div class="subtitle">${escapeHTML(subtitle)}</div>`;
  const existing = content.querySelectorAll('.table-container');
  if (existing) existing.forEach(el => el.remove());

  const allRecords = this.filteredMaterialRecords();
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(allRecords.length / pageSize));
  const page = Math.max(1, Math.min(this.state.materialDbPage || 1, totalPages));
  const records = allRecords.slice((page - 1) * pageSize, page * pageSize);
  const showActions = this.isAdmin();

  const renderPageNumbers = (curr, total) => {
    let pages = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      if (curr <= 4) {
        pages = [1, 2, 3, 4, 5, 6, '...', total];
      } else if (curr >= total - 3) {
        pages = [1, '...', total - 5, total - 4, total - 3, total - 2, total - 1, total];
      } else {
        pages = [1, '...', curr - 2, curr - 1, curr, curr + 1, curr + 2, '...', total];
      }
    }
    return pages.map(p => {
      if (p === '...') return `<span class="pdm-page-ellipsis material-symbols-outlined">more_horiz</span>`;
      return `<button class="pdm-page-number ${p === curr ? 'active' : ''}" data-action="mdb-go-page" data-page="${p}">${p}</button>`;
    }).join('');
  };

  const paginationHtml = totalPages > 1 ? `
    <div class="pdm-pagination">
      <span class="pdm-page-total">${escapeHTML(this.label('paginationTotal'))} ${allRecords.length} ${escapeHTML(this.label('paginationItems'))}</span>
      <div class="pdm-page-pager">
        <button class="pdm-page-btn" data-action="mdb-prev-page" ${page === 1 ? 'disabled' : ''}>
          <span class="material-symbols-outlined">chevron_left</span>
        </button>
        ${renderPageNumbers(page, totalPages)}
        <button class="pdm-page-btn" data-action="mdb-next-page" ${page === totalPages ? 'disabled' : ''}>
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
      <span class="pdm-page-jump">
        ${escapeHTML(this.label('paginationGoTo'))}
        <input type="number" min="1" max="${totalPages}" value="${page}" data-action="mdb-jump-page">
        ${escapeHTML(this.label('paginationPage'))}
      </span>
    </div>
  ` : '';

  content.insertAdjacentHTML('beforeend', `
    ${this.materialDbFilterBar()}
    <div class="table-container material-db-view">
    <div class="table-toolbar">${this.materialDbToolbar(allRecords)}</div>
    <table><thead><tr>
      <th class="mdb-col-code">${escapeHTML(this.label('materialCode'))}</th>
      <th class="mdb-col-name">${escapeHTML(this.label('materialName'))}</th>
      <th class="mdb-col-spec">${escapeHTML(this.label('specification'))}</th>
      <th class="mdb-col-mat">${escapeHTML(this.label('materialComposition'))}</th>
      <th class="mdb-col-color">${escapeHTML(this.label('materialColor'))}</th>
      <th class="mdb-col-attr">${escapeHTML(this.label('materialAttribute'))}</th>
      <th class="mdb-col-num">2D</th>
      <th class="mdb-col-num">3D</th>
      <th class="mdb-col-used">${escapeHTML(this.label('whereUsed'))}</th>
      <th class="mdb-col-num">${escapeHTML(this.label('parentMaterial'))}</th>
      <th class="mdb-col-num">${escapeHTML(this.label('childMaterial'))}</th>
      ${showActions ? `<th class="mdb-col-action">${escapeHTML(this.label('operation'))}</th>` : ''}
    </tr></thead><tbody>${records.map((record) => this.materialDbRowHtml(record)).join('')}</tbody></table>
    ${paginationHtml}
  </div>`);
}

function materialDbFilterBar() {
  const dbMaterials = Object.values(this.state.materialDb?.materials || {});
  const uniqueMaterials = {};
  const uniqueColors = {};
  dbMaterials.forEach((record) => {
    if (record.material && record.material.zh) uniqueMaterials[record.material.zh] = record.material;
    if (record.color && record.color.zh) uniqueColors[record.color.zh] = record.color;
  });

  const attrs = this.collectAttrs();
  const attrChips = [{ value: 'all', label: this.label('all') }, ...attrs].map(({ value, label }) => {
    const val = value;
    const isActive = this.state.dbFilters.attr === val;
    return `<button class="db-filter-chip ${isActive ? 'active' : ''}" type="button" data-filter-type="attr" data-filter-val="${escapeHTML(val)}">${escapeHTML(label)}</button>`;
  }).join('');

  const buildOptions = (uniques, currentVal) => {
    let html = `<option value="all">${escapeHTML(this.label('all'))}</option>`;
    Object.keys(uniques).sort().forEach(zh => {
      const text = localizedValue(uniques[zh], this.state.lang);
      const selected = currentVal === zh ? 'selected' : '';
      html += `<option value="${escapeHTML(zh)}" ${selected}>${escapeHTML(text)}</option>`;
    });
    return html;
  };

  const yesNoOptions = (currentVal) => {
    return `<option value="all">${escapeHTML(this.label('all'))}</option>
            <option value="yes" ${currentVal === 'yes' ? 'selected' : ''}>${escapeHTML(this.label('yes'))}</option>
            <option value="no" ${currentVal === 'no' ? 'selected' : ''}>${escapeHTML(this.label('no'))}</option>`;
  };

  const hasActiveFilters = this.state.dbFilters.attr !== 'all' ||
    this.state.dbFilters.material !== 'all' ||
    this.state.dbFilters.color !== 'all' ||
    this.state.dbFilters.has2D !== 'all' ||
    this.state.dbFilters.has3D !== 'all';

  return `
    <div class="pdm-module-filter-bar">
      <div class="filter-group">
        <span class="filter-label">${escapeHTML(this.label('materialAttribute'))}</span>
        <div class="filter-chips">${attrChips}</div>
      </div>
      <div class="filter-group">
        <span class="filter-label">${escapeHTML(this.label('materialComposition'))}</span>
        <select class="db-filter-select input-sm" data-filter-type="material">
          ${buildOptions(uniqueMaterials, this.state.dbFilters.material)}
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">${escapeHTML(this.label('materialColor'))}</span>
        <select class="db-filter-select input-sm" data-filter-type="color">
          ${buildOptions(uniqueColors, this.state.dbFilters.color)}
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">${escapeHTML(this.label('has2D'))}</span>
        <select class="db-filter-select input-sm" data-filter-type="has2D">
          ${yesNoOptions(this.state.dbFilters.has2D)}
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">${escapeHTML(this.label('has3D'))}</span>
        <select class="db-filter-select input-sm" data-filter-type="has3D">
          ${yesNoOptions(this.state.dbFilters.has3D)}
        </select>
      </div>
      ${hasActiveFilters ? `<button class="btn small btn-outline clear-filters-btn" type="button" data-action="clear-db-filters">
        <span class="material-symbols-outlined">filter_alt_off</span> ${escapeHTML(this.label('clearFilters'))}
      </button>` : ''}
    </div>
  `;
}

function materialDbToolbar(records) {
  const actions = this.isAdmin()
    ? this.materialDbActionsHtml()
    : `<button class="btn btn-primary" type="button" data-action="exportExcel">${escapeHTML(this.label('exportExcel'))}</button>`;
  return `<div class="count"><strong>${records.length}</strong> ${escapeHTML(this.label('materials'))}</div>
    <div class="table-actions">${actions}</div>`;
}

function materialDbActionsHtml() {
  return `<button class="btn btn-primary" type="button" data-action="save">${escapeHTML(this.label('save'))}</button>
    <button class="btn" type="button" data-action="discard">${escapeHTML(this.label('discard'))}</button>
    <button class="btn" type="button" data-action="reload">${escapeHTML(this.label('reload'))}</button>
    <button class="btn" type="button" data-action="bom-view">BOM</button>
    <button class="btn" type="button" data-action="add-db-material">${escapeHTML(this.label('addMaterial'))}</button>
    <button class="btn btn-primary" type="button" data-action="exportExcel">${escapeHTML(this.label('exportExcel'))}</button>`;
}

function filteredMaterialRecords() {
  const query = normalizeText(this.state.searchQuery);
  if (this.state.selectedMaterialId && this.state.materialDb?.materials?.[this.state.selectedMaterialId] && !query) {
    return [this.state.materialDb.materials[this.state.selectedMaterialId]];
  }
  return Object.values(this.state.materialDb?.materials || {})
    .filter((record) => {
      if (this.state.dbFilters.attr !== 'all' && record.attr?.zh !== this.state.dbFilters.attr) return false;
      if (this.state.dbFilters.material !== 'all' && record.material?.zh !== this.state.dbFilters.material) return false;
      if (this.state.dbFilters.color !== 'all' && record.color?.zh !== this.state.dbFilters.color) return false;

      const has2D = (record.drawings || []).length > 0;
      if (this.state.dbFilters.has2D === 'yes' && !has2D) return false;
      if (this.state.dbFilters.has2D === 'no' && has2D) return false;

      const has3D = (record.models3d || []).length > 0;
      if (this.state.dbFilters.has3D === 'yes' && !has3D) return false;
      if (this.state.dbFilters.has3D === 'no' && has3D) return false;

      return !query || queryMatches([
        record.code, record.name?.zh, record.name?.vi, record.spec?.zh, record.spec?.vi,
        record.material?.zh, record.material?.vi, record.color?.zh, record.color?.vi,
        record.attr?.zh, record.attr?.vi
      ], query);
    })
    .sort((left, right) => String(left.code || '').localeCompare(String(right.code || '')));
}

function materialDbRowHtml(record) {
  const whereUsed = materialWhereUsed(this.state.payload, record.id);
  const usedProducts = Array.from(new Set(whereUsed.productEntries.map((entry) => entry.productCode))).sort();
  const showActions = this.isAdmin();
  const localized = (pair) => this.state.lang === 'vi' ? (pair?.vi || pair?.zh || '') : (pair?.zh || pair?.vi || '');
  const spuPills = usedProducts.length
    ? usedProducts.map((s) => `<span class="spu-pill">${escapeHTML(s)}</span>`).join('')
    : '<span class="mdb-empty">-</span>';
  const editButton = `<button class="drawing-btn" type="button" data-edit-db-material="${escapeHTML(record.id)}">${escapeHTML(this.label('editMaterial'))}</button>`;
  return `<tr data-material-row="${escapeHTML(record.id)}">
    <td class="mdb-col-code"><span class="mat-code">${this.highlight(escapeHTML(record.code || ''))}</span></td>
    <td><div>${this.highlight(localized(record.name))}</div></td>
    <td><div>${this.highlight(localized(record.spec))}</div></td>
    <td><div>${this.highlight(localized(record.material))}</div></td>
    <td><div>${this.renderColorDot(localized(record.color))}</div></td>
    <td><div>${this.renderAttrBadge(localized(record.attr))}</div></td>
    <td class="mdb-center">${(record.drawings || []).length ? `<button class="drawing-btn primary" type="button" data-drawing-material="${escapeHTML(record.id)}">${escapeHTML(this.label('viewDrawing'))}</button>` : '<span class="mdb-empty">-</span>'}</td>
    <td class="mdb-center">${(record.models3d || []).length ? `<button class="drawing-btn primary" type="button" data-model3d-material="${escapeHTML(record.id)}">${escapeHTML(this.label('viewDrawing'))}</button>` : '<span class="mdb-empty">-</span>'}</td>
    <td><div class="spu-pill-list">${spuPills}</div></td>
    <td class="mdb-center">${whereUsed.parentEntries.length}</td>
    <td class="mdb-center">${whereUsed.childEntries.length}</td>
    ${showActions ? `<td>${editButton}</td>` : ''}
  </tr>`;
}

function renderMaterialMasterEditor(record) {
  const deleteButton = this.isNewMaterialDraft(record)
    ? ''
    : `<button class="btn danger" type="button" data-action="delete-material-master">${escapeHTML(this.label('deleteMaterial'))}</button>`;
  const content = this.query('.content');
  this.query('#contentHeader').innerHTML = `<h1>${escapeHTML(this.label('materialMaster'))}</h1>
    <div class="subtitle">${escapeHTML(record.code || record.id)}</div>`;
  const existing = content.querySelectorAll('.table-container');
  if (existing) existing.forEach(el => el.remove());
  content.insertAdjacentHTML('beforeend', `<div class="table-container material-master-view">
    <div class="table-toolbar">
      <div class="table-title"><span class="material-symbols-outlined">inventory_2</span><strong>${escapeHTML(this.label('materialMaster'))}</strong><span class="count">${escapeHTML(record.id)}</span></div>
      <div class="table-actions">
        ${deleteButton}
        <button class="btn" type="button" data-action="back-material-list">${escapeHTML(this.label('backToMaterialList'))}</button>
        <button class="btn btn-primary" type="button" data-action="save-material-master">${escapeHTML(this.label('saveMaterial'))}</button>
      </div>
    </div>
    <div class="material-master-body">
      ${this.materialMasterFormHtml(record)}
      ${this.materialMasterRelationshipsHtml(record)}
      ${this.materialMasterAssetsHtml(record)}
    </div>
  </div>`);
}

function materialMasterFormHtml(record) {
  const pairs = [
    ['name', this.label('materialName')],
    ['spec', this.label('specification')],
    ['material', this.label('materialComposition')],
    ['color', this.label('materialColor')],
    ['attr', this.label('materialAttribute')]
  ];
  return `<section class="material-master-section">
    <h2>${escapeHTML(this.label('materialMaster'))}</h2>
    <div class="material-master-form">
      ${this.materialMasterReadonly(this.label('materialId'), record.id)}
      ${this.materialMasterCodeInput(record)}
      ${pairs.map(([field, label]) => `${this.materialMasterInput(record, field, label, 'zh')}${this.materialMasterInput(record, field, label, 'vi')}`).join('')}
    </div>
  </section>`;
}

function materialMasterReadonly(label, value) {
  return `<label class="material-master-field"><span>${escapeHTML(label)}</span><input class="edit-input" value="${escapeHTML(value || '')}" readonly></label>`;
}

function materialMasterCodeInput(record) {
  return `<label class="material-master-field"><span>${escapeHTML(this.label('materialCode'))}</span><input class="edit-input" data-material-master-edit="code" value="${escapeHTML(record.code || '')}"></label>`;
}

function materialMasterInput(record, field, label, lang) {
  const value = record[field]?.[lang] || '';
  const langLabel = lang === 'zh' ? this.label('chinese') : this.label('vietnamese');
  return `<label class="material-master-field"><span>${escapeHTML(label)} · ${escapeHTML(langLabel)}</span><input class="edit-input" data-material-master-edit="${escapeHTML(field)}" data-lang="${escapeHTML(lang)}" value="${escapeHTML(value)}"></label>`;
}

function materialMasterRelationshipsHtml(record) {
  const whereUsed = materialWhereUsed(this.state.payload, record.id);
  return `<section class="material-master-section">
    <h2>${escapeHTML(this.label('bomRelationships'))}</h2>
    <div class="material-master-relations">
      ${this.materialMasterProductUsage(whereUsed.productEntries)}
      ${this.materialMasterRelationList(this.label('parentMaterial'), whereUsed.parentEntries, 'parent')}
      ${this.materialMasterRelationList(this.label('childMaterial'), whereUsed.childEntries, 'child')}
    </div>
  </section>`;
}

function materialMasterProductUsage(entries) {
  const products = Array.from(new Set((entries || []).map((entry) => entry.productCode).filter(Boolean))).sort();
  const pills = products.length
    ? products.map((code) => `<span class="spu-pill">${escapeHTML(code)}</span>`).join('')
    : '<span class="mdb-empty">-</span>';
  return `<div class="material-master-relation"><strong>${escapeHTML(this.label('whereUsed'))}</strong><div class="spu-pill-list">${pills}</div></div>`;
}

function materialMasterRelationList(title, entries, direction) {
  const rows = (entries || []).length
    ? entries.slice(0, 24).map((entry) => this.materialMasterRelationRow(entry, direction)).join('')
    : '<li class="mdb-empty">-</li>';
  return `<div class="material-master-relation"><strong>${escapeHTML(title)}</strong><ul>${rows}</ul></div>`;
}

function materialMasterRelationRow(entry, direction) {
  const materials = this.state.materialDb?.materials || {};
  const materialId = direction === 'parent' ? entry.parentId : (entry.childMaterialId || entry.materialId);
  const record = materials[materialId] || {};
  const name = localizedValue(record.name, this.state.lang) || '';
  return `<li><span class="mat-code">${escapeHTML(record.code || materialId || '-')}</span><span>${escapeHTML(name)}</span></li>`;
}

function materialMasterAssetsHtml(record) {
  return `<section class="material-master-section">
    <h2>${escapeHTML(this.label('assetSummary'))}</h2>
    <div class="material-master-assets">
      ${this.materialMasterAssetList('2D', record.drawings || [])}
      ${this.materialMasterAssetList('3D', record.models3d || [])}
    </div>
  </section>`;
}

function materialMasterAssetList(title, assets) {
  const typeKey = title === '2D' ? 'drawings' : 'models3d';
  if (this.isAdmin && this.isAdmin()) {
    const addAction = title === '2D' ? 'add-2d-asset' : 'add-3d-asset';
    const rows = assets.map((asset, index) => {
      const name = asset.name || '';
      const url = asset.url || asset.path || '';
      return `<div class="material-asset-edit-row" style="display:flex;gap:8px;margin-bottom:8px;">
        <input class="edit-input" style="flex:1" data-asset-edit="name" data-asset-type="${typeKey}" data-asset-index="${index}" placeholder="${escapeHTML(this.label('assetName'))}" value="${escapeHTML(name)}">
        <input class="edit-input" style="flex:2" data-asset-edit="url" data-asset-type="${typeKey}" data-asset-index="${index}" placeholder="${escapeHTML(this.label('assetUrl'))}" value="${escapeHTML(url)}">
        <button class="btn" type="button" data-action="open-asset" data-asset-url="${escapeHTML(url)}">${escapeHTML(this.label('openAsset'))}</button>
        <button class="btn danger" type="button" data-action="delete-asset-row" data-asset-type="${typeKey}" data-asset-index="${index}">${escapeHTML(this.label('deleteAsset'))}</button>
      </div>`;
    }).join('');

    return `<div class="material-master-asset-list">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong>${escapeHTML(title)}</strong>
        <button class="btn btn-primary small" type="button" data-action="${addAction}">+ ${escapeHTML(this.label(title === '2D' ? 'add2D' : 'add3D'))}</button>
      </div>
      <div id="${typeKey}-container">${rows}</div>
    </div>`;
  }
  const rows = assets.length
    ? assets.map((asset) => `<li><strong>${escapeHTML(asset.name || asset.path || asset.url || '-')}</strong><span><a href="#" data-action="open-asset" data-asset-url="${escapeHTML(asset.url || asset.path || '')}">${escapeHTML(asset.path || asset.url || '')}</a></span></li>`).join('')
    : '<li class="mdb-empty">-</li>';
  return `<div class="material-master-asset-list"><strong>${escapeHTML(title)}</strong><ul>${rows}</ul></div>`;
}

export const materialViewMethods = {
  renderMaterialDatabase,
  materialDbFilterBar,
  materialDbToolbar,
  materialDbActionsHtml,
  filteredMaterialRecords,
  materialDbRowHtml,
  renderMaterialMasterEditor,
  materialMasterFormHtml,
  materialMasterReadonly,
  materialMasterCodeInput,
  materialMasterInput,
  materialMasterRelationshipsHtml,
  materialMasterProductUsage,
  materialMasterRelationList,
  materialMasterRelationRow,
  materialMasterAssetsHtml,
  materialMasterAssetList,
};
