import { createPdmNavigation } from '../domain/bom.js';
import { normalizeText, queryMatches, stripProductColorName } from '../domain/materials.js';
import { assetDisplayUrl } from '../infrastructure/assets.js';
import { escapeHTML } from './shared-view.js';

function renderProductList() {
  const list = this.query('#productList');
  const navigation = createPdmNavigation(this.state.payload, {
    bom: this.label('productBom'),
    materials: this.label('materialDatabase'),
    structure: this.label('structureView'),
  });
  list.innerHTML = `<div class="module-nav">${navigation.map((item) => this.moduleButtonHtml(item)).join('')}</div>`;
}

function moduleButtonHtml(item) {
  const active = this.state.adminView === item.id ? 'active' : '';
  return `<button class="module-item ${active}" type="button" data-module-view="${escapeHTML(item.id)}">
    <span>${escapeHTML(item.label)}</span><strong>${escapeHTML(item.count)}</strong>
  </button>`;
}

function filteredProductItems() {
  const query = normalizeText(this.state.sidebarQuery);
  return Object.keys(this.state.bom).sort()
    .map((sku) => {
      const product = this.state.bom[sku];
      return { id: sku, code: sku, label: this.productName(product) };
    })
    .filter((item) => !query || queryMatches([item.code, item.label], query))
    .slice(0, 12);
}

function productSelectHtml() {
  const options = Object.keys(this.state.bom).sort().map((sku) => {
    const selected = sku === this.state.currentSku ? 'selected' : '';
    return `<option value="${escapeHTML(sku)}" ${selected}>${escapeHTML(sku)} - ${escapeHTML(this.productName(this.state.bom[sku]))}</option>`;
  }).join('');
  return `<select class="product-select" data-product-select>${options}</select>`;
}

function productButtonHtml(item) {
  const active = this.state.adminView === 'bom' && item.id === this.state.currentSku ? 'active' : '';
  return `<button class="product-item sidebar-node ${active}" type="button" data-sku="${escapeHTML(item.id)}">
    <span class="sku">${escapeHTML(item.code)}</span>
    <span class="product-name-small">${escapeHTML(item.label)}</span>
  </button>`;
}

function productName(product) {
  const firstColor = product && product.color_info ? product.color_info[product.colors[0]] : null;
  if (!firstColor) return product ? product.code : '';
  return this.state.lang === 'vi'
    ? (firstColor.name_vi || firstColor.name_zh || firstColor.name || product.code)
    : (firstColor.name_zh || firstColor.name || firstColor.name_vi || product.code);
}

function renderProductCatalog() {
  const content = this.query('.content');
  this.query('#contentHeader').innerHTML = `<div class="catalog-header">
    <div>
      <h1>${escapeHTML(this.label('productCatalogTitle'))}</h1>
    </div>
    <div class="catalog-count"><strong>${Object.keys(this.state.bom).length}</strong> ${escapeHTML(this.label('products'))}</div>
  </div>`;
  const existing = content.querySelectorAll('.table-container');
  if (existing) existing.forEach(el => el.remove());
  const rows = this.productCatalogRows();
  const addProductBtn = this.isAdmin() ? `<div class="table-actions"><button class="btn btn-primary" type="button" data-action="add-product"><span class="material-symbols-outlined">add</span>${escapeHTML(this.label('addProduct'))}</button></div>` : '';
  content.insertAdjacentHTML('beforeend', `<div class="table-container product-catalog-view">
    <div class="table-toolbar">
      <div class="table-title"><span class="material-symbols-outlined">inventory_2</span><strong>${escapeHTML(this.label('productCatalogTitle'))}</strong><span class="count">${rows.length} ${escapeHTML(this.label('products'))}</span></div>
      ${addProductBtn}
    </div>
    <table><thead><tr>
      <th>${escapeHTML(this.label('spu'))}</th>
      <th>${escapeHTML(this.label('description'))}</th>
      <th>${escapeHTML(this.label('size'))}</th>
      <th>${escapeHTML(this.label('version'))}</th>
      <th>${escapeHTML(this.label('colorDots'))}</th>
      <th>${escapeHTML(this.label('status'))}</th>
      <th>${escapeHTML(this.label('openBom'))}</th>
    </tr></thead><tbody>${rows.map((row) => this.productCatalogRowHtml(row)).join('')}</tbody></table>
  </div>`);
}

function productCatalogRows() {
  const query = normalizeText(this.state.searchQuery);
  return Object.keys(this.state.bom).sort()
    .map((sku) => {
      const product = this.state.bom[sku];
      const firstColor = product?.color_info?.[product.colors?.[0]] || {};
      const revisionOptions = this.productRevisionOptions(sku);
      const revisionInfo = revisionOptions[0] || {};
      const effectiveRevision = revisionOptions.find((item) => item.effective)?.revision || revisionInfo.revision;
      return {
        sku,
        product,
        name: stripProductColorName(this.productName(product), product, this.state.lang),
        size: firstColor.size || '-',
        colors: product.colors || [],
        revision: revisionInfo.revision,
        effectiveRevision,
        effective: Boolean(revisionInfo.effective),
        workflowState: revisionInfo.workflowState || 'released',
        disabled: this.productDisabled(product)
      };
    })
    .filter((row) => !query || queryMatches([row.sku, row.name, row.size, row.colors.join(' ')], query));
}

function productCatalogRowHtml(row) {
  const isDraft = row.workflowState === 'draft';
  const lifecycleKey = isDraft ? 'draftStatus' : 'releasedStatus';
  const lifecycleClass = isDraft ? 'draft' : 'released';
  const effectivityKey = row.effective ? 'effectiveStatus' : 'nonCurrentStatus';
  const effectivityClass = row.effective ? 'effective' : 'non-current';
  const statusHtml = row.disabled
    ? `<span class="status-pill disabled">${escapeHTML(this.label('disabledStatus'))}</span>`
    : `<span class="status-pill ${lifecycleClass}">${escapeHTML(this.label(lifecycleKey))}</span>
      <span class="status-pill ${effectivityClass}">${escapeHTML(this.label(effectivityKey))}</span>`;
  return `<tr class="product-catalog-row">
    <td><span class="spu-code">${escapeHTML(row.sku)}</span></td>
    <td><span class="product-name-link" data-open-bom-product="${escapeHTML(row.sku)}">${escapeHTML(row.name)}</span></td>
    <td>${escapeHTML(row.size)}</td>
    <td><div class="catalog-revision-stack"><span class="version-badge">${escapeHTML(row.revision || this.getSpuVersion(row.sku))}</span><small>${escapeHTML(this.label('effectiveRevision'))}: ${escapeHTML(row.effectiveRevision)}</small></div></td>
    <td><div class="color-dot-list">${row.colors.map((color) => this.productColorDotHtml(row.product, color)).join('')}</div></td>
    <td><div class="catalog-status-stack">${statusHtml}</div></td>
    <td><button class="drawing-btn primary" type="button" data-open-bom-product="${escapeHTML(row.sku)}">${escapeHTML(this.label('viewBom'))}</button></td>
  </tr>`;
}

function productDisabled(product) {
  const status = normalizeText(product?.status || product?.workflowState || product?.state || '');
  return Boolean(product?.disabled || status.includes('disable') || status.includes('obsolete') || status.includes('禁') || status.includes('停'));
}

function getSpuVersion(spuCode) {
  return this.productRevisionOptions(spuCode)[0]?.revision || 'V1';
}

function revisionSelectorHtml() {
  const selectedRevision = this.selectedProductRevision();
  const options = this.productRevisionOptions().map((item) => {
    const lifecycleKey = item.workflowState === 'draft' ? 'draftStatus' : 'releasedStatus';
    const effectivityKey = item.effective ? 'effectiveStatus' : 'nonCurrentStatus';
    const optionLabel = [item.revision, this.label(lifecycleKey), this.label(effectivityKey)].join(' · ');
    return `<option value="${escapeHTML(item.revision)}"${item.revision === selectedRevision ? ' selected' : ''}>${escapeHTML(optionLabel)}</option>`;
  })
    .join('');
  return `<select class="db-filter-select product-revision-select" data-product-revision aria-label="${escapeHTML(this.label('revision'))}">${options}</select>`;
}

function productColorDotHtml(product, color) {
  const colorData = product?.color_info?.[color] || {};
  const label = this.colorLabel(colorData) || color;
  return `<span class="color-dot ${this.colorDotClass(label)}" title="${escapeHTML(label)}"></span>`;
}

function colorDotClass(label) {
  const text = String(label || '');
  if (/黑|black/i.test(text)) return 'black';
  if (/白|white/i.test(text)) return 'white';
  if (/复古|古|brown|gỗ|go|cổ|co/i.test(text)) return 'brown';
  if (/纸|beige|natural/i.test(text)) return 'paper';
  return 'neutral';
}

function contentHeaderHtml(product, colorData) {
  const name = this.localizedProductName(colorData);
  const revisionInfo = this.selectedProductRevisionInfo();
  const title = this.canEditProductRevision() && this.state.editMode
    ? this.productInput(name, 'name', 'edit-title')
    : `<h1>${escapeHTML(name)}</h1>`;
  const sku = this.renderSku(colorData);
  return `<div class="bom-detail-header">
    <div>
      <div class="pdm-title-row">${title}<span class="color-badge">${escapeHTML(this.colorLabel(colorData))}</span>${this.revisionStatusBadgesHtml(revisionInfo)}</div>
      <div class="pdm-meta-line">
        <span>SKU: ${sku}</span><span class="dot"></span>
        <span class="revision-meta">${escapeHTML(this.label('revision'))}: ${this.revisionSelectorHtml()}</span><span class="dot"></span>
        <span>${escapeHTML(this.label('lastModified'))}: ${escapeHTML(this.formatDate(this.state.payload.updatedAt))}</span>
      </div>
      ${this.revisionTransitionHtml(revisionInfo)}
    </div>
    <div class="header-actions">${this.headerActionsHtml()}</div>
  </div>
  <div class="detail-card-grid">
    ${this.productSpecCardHtml(product, colorData)}
    ${this.assemblyPreviewHtml(colorData)}
    ${this.productImagePreviewHtml(colorData)}
  </div>
  <div class="color-tabs">${this.colorTabsHtml(product)}</div>`;
}

function revisionStatusBadgesHtml(revisionInfo) {
  const workflowState = revisionInfo?.workflowState === 'draft' ? 'draft' : 'released';
  const labelKey = workflowState === 'draft' ? 'draftStatus' : 'releasedStatus';
  const effectivityClass = revisionInfo?.effective ? 'effective' : 'non-current';
  const effectivityKey = revisionInfo?.effective ? 'effectiveStatus' : 'nonCurrentStatus';
  return `<span class="status-badge ${workflowState}">${escapeHTML(this.label(labelKey))}</span>
    <span class="status-badge ${effectivityClass}">${escapeHTML(this.label(effectivityKey))}</span>`;
}

function revisionTransitionHtml(revisionInfo) {
  if (!revisionInfo?.sourceRevision) return '';
  const items = [
    `<span><strong>${escapeHTML(this.label('revisionSource'))}:</strong> ${escapeHTML(revisionInfo.sourceRevision)} → ${escapeHTML(revisionInfo.revision)}</span>`,
  ];
  if (revisionInfo.changeReason) {
    items.push(`<span><strong>${escapeHTML(this.label('changeReason'))}:</strong> ${escapeHTML(revisionInfo.changeReason)}</span>`);
  }
  if (revisionInfo.createdAt) {
    items.push(`<span><strong>${escapeHTML(this.label('revisionCreatedAt'))}:</strong> ${escapeHTML(this.formatDate(revisionInfo.createdAt))}</span>`);
  }
  return `<div class="revision-transition-line">${items.join('<span class="dot"></span>')}</div>`;
}

function headerActionsHtml() {
  if (!this.isAdmin()) return '';
  const revisionInfo = this.selectedProductRevisionInfo();
  const readOnlyKey = this.isHistoricalRevision() ? 'historicalRevisionReadOnly' : 'releasedRevisionReadOnly';
  const editButton = this.canEditProductRevision()
    ? `<button class="btn btn-outline ${this.state.editMode ? 'active' : ''}" type="button" data-action="toggle-edit"><span class="material-symbols-outlined">edit</span>${escapeHTML(this.state.editMode ? this.label('done') : this.label('edit'))}</button>`
    : `<span class="read-only-note">${escapeHTML(this.label(readOnlyKey))}</span>`;
  const assemblyButton = this.productModels3d().length
    ? `<button class="btn btn-outline" type="button" data-product-model3d-index="0"><span class="material-symbols-outlined">architecture</span>${escapeHTML(this.label('viewAssembly'))}</button>`
    : '';
  const releaseButton = revisionInfo?.current && revisionInfo.workflowState === 'draft'
    ? `<button class="btn btn-primary" type="button" data-action="release-product-revision"><span class="material-symbols-outlined">publish</span>${escapeHTML(this.label('releaseRevision'))}</button>`
    : '';
  return `${editButton}
    ${releaseButton}
    ${assemblyButton}
    <button class="btn btn-outline" type="button" data-action="copy"><span class="material-symbols-outlined">content_copy</span>${escapeHTML(this.label('copy'))}</button>
    <button class="btn btn-primary" type="button" data-action="exportExcel"><span class="material-symbols-outlined">download</span>${escapeHTML(this.label('export'))}</button>`;
}

function productSpecCardHtml(product, colorData) {
  const editing = this.canEditProductRevision() && this.state.editMode;
  const rows = [
    [this.label('size'), editing ? this.productInput(colorData.size || '', 'size', 'edit-small') : escapeHTML(colorData.size || '-')],
    [this.label('colors'), escapeHTML(Object.keys(product.color_info || {}).length)],
    [this.label('total'), escapeHTML(this.bomRows().length)],
    [this.label('manual'), this.manualButtons()]
  ];
  return `<section class="detail-card spec-card">
    <h2><span class="material-symbols-outlined">info</span>${escapeHTML(this.label('productSpecifications'))}</h2>
    <div class="spec-list">${rows.map(([label, value]) => `<div class="spec-row"><span>${escapeHTML(label)}</span><strong>${value}</strong></div>`).join('')}</div>
  </section>`;
}

function assemblyPreviewHtml(colorData) {
  const models = this.productModels3d();
  const preview = models[0]?.previewUrl || models[0]?.url || '';
  const viewer = preview
    ? `<model-viewer class="assembly-model" src="${escapeHTML(preview)}" camera-controls auto-rotate shadow-intensity="1" exposure="0.72" environment-image="neutral"></model-viewer>`
    : `<div class="assembly-placeholder"><span class="material-symbols-outlined">deployed_code</span><strong>${escapeHTML(colorData.sku || this.state.currentSku)}</strong><small>${escapeHTML(this.label('modelPreview'))}</small></div>`;
  const buttons = models.length ? this.productModel3dButtons(models) : '';
  return `<section class="detail-card preview-card model-preview-card">
    <div class="preview-dots"></div>
    <div class="preview-label">${escapeHTML(this.label('modelPreview'))}</div>
    ${viewer}
    <div class="preview-actions">${buttons}</div>
  </section>`;
}

function productImagePreviewHtml(colorData) {
  const image = this.productPreviewImage(colorData);
  const viewer = image
    ? `<img class="assembly-image" src="${escapeHTML(assetDisplayUrl(image))}" alt="${escapeHTML(image.name || this.localizedProductName(colorData))}" loading="lazy">`
    : `<div class="assembly-placeholder"><span class="material-symbols-outlined">image</span><strong>${escapeHTML(colorData.sku || this.state.currentSku)}</strong><small>${escapeHTML(this.label('productImage'))}</small></div>`;
  return `<section class="detail-card preview-card product-image-preview">
    <div class="preview-dots"></div>
    <div class="preview-label">${escapeHTML(this.label('productImage'))}</div>
    ${viewer}
  </section>`;
}

function productPreviewImage(colorData) {
  const catalog = this.state.productImages?.[this.state.currentSku] || {};
  const colorKeys = [
    this.state.currentColor,
    colorData?.color_ver,
    colorData?.color_zh,
    colorData?.color_ver_vi,
    colorData?.color_vi,
    'default'
  ].filter(Boolean);
  for (const key of colorKeys) {
    const image = catalog[key];
    if (image?.url) return image;
  }
  return null;
}

function renderSku(colorData) {
  return this.canEditProductRevision() && this.state.editMode
    ? this.productInput(colorData.sku || '', 'sku', 'edit-subtitle')
    : escapeHTML(colorData.sku || '');
}

function metaHtml(product, colorData) {
  const editing = this.canEditProductRevision() && this.state.editMode;
  const items = [
    this.metaItem('size', editing ? this.productInput(colorData.size || '', 'size', 'edit-small') : escapeHTML(colorData.size || '')),
    this.metaItem('colors', Object.keys(product.color_info || {}).length),
    this.metaItem('total', this.bomRows().length),
    this.metaItem('manual', this.manualButtons())
  ];
  const productModels = this.productModels3d();
  if (productModels.length) items.push(this.metaItem('model3d', this.productModel3dButtons(productModels)));
  return items.join('');
}

function metaItem(labelKey, value) {
  return `<div class="meta-item"><span class="label">${escapeHTML(this.label(labelKey))}</span><span class="value">${value}</span></div>`;
}

function colorTabsHtml(product) {
  return (product.colors || []).map((color) => {
    const active = color === this.state.currentColor ? 'active' : '';
    const label = this.colorLabel(product.color_info[color]);
    return `<button class="color-tab ${active}" type="button" data-color="${escapeHTML(color)}">${escapeHTML(label)}</button>`;
  }).join('');
}

function localizedProductName(colorData) {
  return this.state.lang === 'vi'
    ? (colorData.name_vi || colorData.name_zh || colorData.name || '')
    : (colorData.name_zh || colorData.name || colorData.name_vi || '');
}

function colorLabel(colorData) {
  return this.state.lang === 'vi'
    ? (colorData.color_ver_vi || colorData.color_vi || colorData.color_ver || colorData.color_zh || '')
    : (colorData.color_ver || colorData.color_zh || colorData.color_ver_vi || colorData.color_vi || '');
}

function productInput(value, field, className) {
  return `<input class="edit-input ${className || ''}" data-product-edit="${field}" value="${escapeHTML(value)}">`;
}

function manualButtons() {
  const manuals = this.state.manuals[this.state.currentSku] || [];
  if (!manuals.length) return escapeHTML(this.label('noManual'));
  return manuals.map((manual, index) => {
    const suffix = manuals.length > 1 ? ` ${index + 1}` : '';
    return `<button class="drawing-btn primary" type="button" data-manual-index="${index}">${escapeHTML(this.label('viewManual') + suffix)}</button>`;
  }).join('');
}

function productModel3dButtons(models) {
  return models.map((model, index) => {
    const suffix = models.length > 1 ? ` ${index + 1}` : '';
    return `<button class="drawing-btn primary" type="button" data-product-model3d-index="${index}">${escapeHTML(this.label('viewDrawing') + suffix)}</button>`;
  }).join('');
}

export const catalogViewMethods = {
  renderProductList,
  moduleButtonHtml,
  filteredProductItems,
  productSelectHtml,
  productButtonHtml,
  productName,
  renderProductCatalog,
  productCatalogRows,
  productCatalogRowHtml,
  productDisabled,
  getSpuVersion,
  revisionSelectorHtml,
  revisionStatusBadgesHtml,
  revisionTransitionHtml,
  productColorDotHtml,
  colorDotClass,
  contentHeaderHtml,
  headerActionsHtml,
  productSpecCardHtml,
  assemblyPreviewHtml,
  productImagePreviewHtml,
  productPreviewImage,
  renderSku,
  metaHtml,
  metaItem,
  colorTabsHtml,
  localizedProductName,
  colorLabel,
  productInput,
  manualButtons,
  productModel3dButtons,
};
