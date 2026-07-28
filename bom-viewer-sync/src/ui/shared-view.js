import { localizedValue } from '../domain/materials.js';
import { pdfFrameUrl } from '../infrastructure/assets.js';

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

const CHANGE_KIND_LABELS = {
  material_added: 'diffKindMaterialAdded',
  material_deleted: 'diffKindMaterialDeleted',
  material: 'diffKindMaterial',
  bom_added: 'diffKindBomAdded',
  bom_deleted: 'diffKindBomDeleted',
  bom_qty_changed: 'diffKindBomQty',
  product_added: 'diffKindProductAdded',
};

const CHANGE_FIELD_LABELS = {
  code: 'materialCode',
  name: 'materialName',
  spec: 'specification',
  material: 'materialComposition',
  color: 'materialColor',
  attr: 'materialAttribute',
  unit: 'unit',
};

const CHANGE_PREVIEW_LIMIT = 8;










function renderStaticText() {
  this.queryAll('[data-i18n]').forEach((element) => {
    element.textContent = this.label(element.dataset.i18n);
  });
  this.queryAll('[data-i18n-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', this.label(element.dataset.i18nPlaceholder));
  });
  this.queryAll('.lang-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.lang === this.state.lang);
  });
  this.query('#modeBadge').textContent = this.isAdmin() ? 'Admin' : 'Viewer';

  const aiDrawerClose = this.query('#aiDrawerClose');
  if (aiDrawerClose) aiDrawerClose.setAttribute('aria-label', this.label('ai.workspace.close') || 'Close');

  const aiFab = this.query('#aiFab');
  if (aiFab) aiFab.setAttribute('aria-label', this.label('ai.workspace.open') || 'Open AI Assistant');
}

function renderStatus() {
  const syncSourceRow = this.query('[data-sync-source-row]');
  if (syncSourceRow) syncSourceRow.hidden = !this.isAdmin();
  this.query('#syncSource').textContent = this.isAdmin() ? this.dataSourceUrl() : '';
  this.query('#lastSync').textContent = this.formatDate(this.state.payload.updatedAt);
  this.query('#lastLocalRefresh').textContent = this.state.lastLoadAt ? this.formatDate(this.state.lastLoadAt) : '-';
  this.query('#adminControls').hidden = !this.isAdmin();
  const tokenInput = this.query('#githubToken');
  if (tokenInput) tokenInput.value = this.readToken();
  this.setStatus(this.state.dirty ? this.label('dirty') : '', this.state.dirty ? 'dirty' : '');
  const versionDisplay = this.query('#sidebarVersionDisplay');
  if (versionDisplay) {
    versionDisplay.textContent = `V${this.state.payload.version || 1}`;
  }
}

function syncDirtyVisibility() {
  this.queryAll('[data-dirty-action]').forEach((action) => {
    action.hidden = !this.state.dirty;
  });
}

function changePreviewHtml() {
  const changes = this.pendingPayloadChanges();
  let rows;
  if (!this.state.dirty) {
    rows = `<tr><td colspan="5" class="diff-empty">${escapeHTML(this.label('noDirtySummary'))}</td></tr>`;
  } else if (!changes.length) {
    rows = `<tr><td colspan="5" class="diff-empty">${escapeHTML(this.label('noChangesSummary'))}</td></tr>`;
  } else {
    rows = changes.slice(0, CHANGE_PREVIEW_LIMIT).map((change) => {
      const kind = this.label(CHANGE_KIND_LABELS[change.kind] || change.kind);
      const field = change.field ? this.label(CHANGE_FIELD_LABELS[change.field] || change.field) : '';
      return `<tr><td>${escapeHTML(kind)}</td><td>${escapeHTML(change.code || '')}</td><td>${escapeHTML(field)}</td><td>${escapeHTML(change.before || '')}</td><td>${escapeHTML(change.after || '')}</td></tr>`;
    }).join('');
  }

  return `<div class="pdm-modal-content diff-modal" role="dialog" aria-modal="true" aria-labelledby="diffModalTitle">
    <div class="pdm-modal-header">
      <h2 id="diffModalTitle">${escapeHTML(this.label('diffSummary'))}</h2>
      <button class="pdm-modal-close" type="button" data-close-diff aria-label="${escapeHTML(this.label('close'))}">&times;</button>
    </div>
    <div class="pdm-modal-body">
      <table class="diff-table"><thead><tr><th>${escapeHTML(this.label('diffColType'))}</th><th>${escapeHTML(this.label('diffColCode'))}</th><th>${escapeHTML(this.label('diffColField'))}</th><th>${escapeHTML(this.label('diffColBefore'))}</th><th>${escapeHTML(this.label('diffColAfter'))}</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  </div>`;
}

function showDiffModal(actionElement) {
  if (this.closeDiffModal) this.closeDiffModal(false);
  else this.query('#diffModalOverlay')?.remove();
  globalThis.document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="diffModalOverlay" class="pdm-modal-overlay diff-modal-overlay open">${this.changePreviewHtml()}</div>`,
  );
  const overlay = this.query('#diffModalOverlay');
  const closeControl = overlay.querySelector('[data-close-diff]');
  let handleKeyDown;
  const closeModal = (restoreFocus = true) => {
    globalThis.document.removeEventListener('keydown', handleKeyDown);
    overlay.remove();
    if (this.closeDiffModal === closeModal) this.closeDiffModal = null;
    if (restoreFocus && typeof actionElement?.focus === 'function') actionElement.focus();
  };
  handleKeyDown = (event) => {
    if (event.key === 'Escape') closeModal();
  };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
  });
  closeControl.addEventListener('click', () => closeModal());
  globalThis.document.addEventListener('keydown', handleKeyDown);
  this.closeDiffModal = closeModal;
  closeControl.focus();
}

function renderStats() {
  const productsCount = Object.keys(this.state.bom || {}).length;
  const materialsCount = Object.keys(this.state.materialDb?.materials || {}).length;
  this.query('#statProducts').textContent = String(productsCount);
  this.query('#statMaterials').textContent = String(materialsCount);
}

function renderNotifications() {
  const button = this.query('#notificationButton');
  const panel = this.query('#notificationPanel');
  const badge = this.query('#notificationBadge');
  const title = this.query('#notificationTitle');
  const readButton = this.query('#notificationReadBtn');
  const list = this.query('#notificationList');
  if (!button || !panel || !badge || !title || !readButton || !list) return;

  const notifications = this.notifications();
  const unreadCount = this.unreadNotifications().length;
  button.setAttribute('aria-label', this.label('notifications'));
  button.setAttribute('aria-expanded', this.state.notificationOpen ? 'true' : 'false');
  button.classList.toggle('has-unread', unreadCount > 0);
  badge.hidden = unreadCount === 0;
  badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
  panel.hidden = !this.state.notificationOpen;
  title.textContent = this.label('notifications');
  readButton.textContent = this.label('notificationMarkRead');
  readButton.disabled = unreadCount === 0;

  if (!notifications.length) {
    list.innerHTML = `<div class="notification-empty">${escapeHTML(this.label('notificationEmpty'))}</div>`;
    return;
  }

  list.innerHTML = notifications.map((notification) => {
    const isUnread = this.unreadNotifications().some((item) => item.id === notification.id);
    const className = isUnread ? 'notification-item unread' : 'notification-item';
    return `<div class="${className}" data-notification-id="${escapeHTML(notification.id)}">
      <div class="notification-item-title">${escapeHTML(this.notificationTitle(notification))}</div>
      <div class="notification-item-body">${escapeHTML(this.notificationBody(notification))}</div>
      <div class="notification-item-meta">
        <span>${escapeHTML(notification.actor || 'admin')}</span>
        <span>${escapeHTML(this.formatDate(notification.createdAt))}</span>
      </div>
    </div>`;
  }).join('');
}

function renderFilterBar() {
  const el = this.query('#filterBar');
  if (el) el.innerHTML = '';
}

function clearContentTable() {
  const existing = this.queryAll('.content .table-container');
  if (existing) existing.forEach(el => el.remove());
}

function renderEmpty() {
  this.query('#contentHeader').innerHTML = `<div class="empty-state"><div class="icon">BOM</div>
    <h3>${escapeHTML(this.label('emptyTitle'))}</h3><p>${escapeHTML(this.label('emptyText'))}</p></div>`;
  const tables = this.queryAll('.content .table-container');
  if (tables) tables.forEach(el => el.remove());
}

function genericToolbar(count, label) {
  const actions = this.isAdmin()
    ? this.adminActionsHtml()
    : `<button class="btn btn-primary" type="button" data-action="exportExcel">${escapeHTML(this.label('exportExcel'))}</button>`;
  return `<div class="count"><strong>${count}</strong> ${escapeHTML(label)}</div>
    <div class="table-actions">${actions}</div>`;
}

function showModal(url, title, subtitle) {
  this.query('#pdfModalTitle').textContent = title || this.label('viewDrawing');
  const frame = this.query('#pdfFrame');
  const modelViewer = this.ensureModelViewer();
  frame.hidden = false;
  modelViewer.hidden = true;
  modelViewer.removeAttribute('src');
  frame.src = pdfFrameUrl(url);
  this.query('#pdfOpenLink').href = url || '#';
  this.query('#pdfOpenLink').textContent = this.label('download');
  this.query('#pdfCloseBtn').textContent = this.label('close');
  this.query('#pdfModal').classList.add('open');
}

function showModel3dModal(model, fallbackTitle) {
  const previewUrl = model.previewUrl || model.url || '';
  const sourceUrl = model.sourceUrl || previewUrl;
  const frame = this.query('#pdfFrame');
  const modelViewer = this.ensureModelViewer();
  this.query('#pdfModalTitle').textContent = model.name || fallbackTitle || '3D';
  this.query('#pdfModalSubtitle').textContent = model.path || fallbackTitle || '';
  frame.hidden = true;
  frame.src = 'about:blank';
  modelViewer.hidden = false;
  modelViewer.setAttribute('src', previewUrl);
  this.query('#pdfOpenLink').href = sourceUrl || '#';
  this.query('#pdfOpenLink').textContent = model.sourceUrl ? 'STEP' : 'Open';
  this.query('#pdfModal').classList.add('open');
}

function ensureModelViewer() {
  let modelViewer = this.query('#model3dViewer');
  if (modelViewer) return modelViewer;
  modelViewer = globalThis.document.createElement('model-viewer');
  modelViewer.id = 'model3dViewer';
  modelViewer.className = 'model3d-frame';
  modelViewer.setAttribute('camera-controls', '');
  modelViewer.setAttribute('auto-rotate', '');
  modelViewer.setAttribute('shadow-intensity', '1');
  modelViewer.setAttribute('exposure', '0.72');
  modelViewer.setAttribute('environment-image', 'neutral');
  modelViewer.setAttribute('interaction-prompt', 'auto');
  modelViewer.hidden = true;
  this.query('#pdfFrame').insertAdjacentElement('afterend', modelViewer);
  return modelViewer;
}

function closeModal() {
  this.query('#pdfFrame').src = 'about:blank';
  const modelViewer = this.query('#model3dViewer');
  if (modelViewer) {
    modelViewer.removeAttribute('src');
    modelViewer.hidden = true;
  }
  this.query('#pdfModal').classList.remove('open');
}

function openPdmPrompt(title, fields, onConfirm) {
  let overlay = this.query('#pdmPromptOverlay');
  if (overlay) overlay.remove();

  const fieldsHtml = fields.map(f => `
    <div class="pdm-modal-form-group">
      <label>${escapeHTML(f.label)}${f.required ? ' *' : ''}</label>
      <input type="text" data-field-key="${escapeHTML(f.key)}" placeholder="${escapeHTML(f.placeholder || '')}" value="${escapeHTML(f.defaultValue || '')}">
      <div class="pdm-modal-form-error" data-error-for="${escapeHTML(f.key)}"></div>
    </div>
  `).join('');

  const html = `<div id="pdmPromptOverlay" class="pdm-modal-overlay">
    <div class="pdm-modal-content pdm-modal-sm">
      <div class="pdm-modal-header">
        <h2>${escapeHTML(title)}</h2>
        <button class="pdm-modal-close" data-pdm-prompt-close>&times;</button>
      </div>
      <div class="pdm-modal-body">
        <div class="pdm-modal-form">${fieldsHtml}</div>
      </div>
      <div class="pdm-modal-footer">
        <button class="btn" data-pdm-prompt-close>${escapeHTML(this.label('cancelBtn'))}</button>
        <button class="btn btn-primary" data-pdm-prompt-confirm>${escapeHTML(this.label('confirmBtn'))}</button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  overlay = this.query('#pdmPromptOverlay');

  const closeModal = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 200);
  };

  overlay.querySelectorAll('[data-pdm-prompt-close]').forEach(btn => btn.addEventListener('click', closeModal));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  overlay.querySelector('[data-pdm-prompt-confirm]').addEventListener('click', () => {
    const values = {};
    let hasError = false;
    fields.forEach(f => {
      const input = overlay.querySelector(`[data-field-key="${f.key}"]`);
      const errEl = overlay.querySelector(`[data-error-for="${f.key}"]`);
      const val = input ? input.value.trim() : '';
      values[f.key] = val;
      if (f.required && !val) {
        if (input) input.classList.add('pdm-input-error');
        if (errEl) errEl.textContent = this.label('required');
        hasError = true;
      } else {
        if (input) input.classList.remove('pdm-input-error');
        if (errEl) errEl.textContent = '';
      }
    });
    if (hasError) return;
    closeModal();
    onConfirm(values);
  });

  requestAnimationFrame(() => {
    overlay.classList.add('open');
    const firstInput = overlay.querySelector('.pdm-modal-form-group input');
    if (firstInput) firstInput.focus();
  });
}

function openPdmConfirm(message, onConfirm) {
  let overlay = this.query('#pdmConfirmOverlay');
  if (overlay) overlay.remove();

  const html = `<div id="pdmConfirmOverlay" class="pdm-modal-overlay">
    <div class="pdm-modal-content pdm-modal-sm">
      <div class="pdm-modal-header">
        <h2>${escapeHTML(this.label('confirmBtn'))}</h2>
        <button class="pdm-modal-close" data-pdm-confirm-close>&times;</button>
      </div>
      <div class="pdm-modal-body">
        <div class="pdm-confirm-body">
          <span class="material-symbols-outlined pdm-confirm-icon">warning</span>
          <div class="pdm-confirm-message">${escapeHTML(message)}</div>
        </div>
      </div>
      <div class="pdm-modal-footer">
        <button class="btn" data-pdm-confirm-close>${escapeHTML(this.label('cancelBtn'))}</button>
        <button class="btn btn-danger" data-pdm-confirm-ok>${escapeHTML(this.label('confirmBtn'))}</button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  overlay = this.query('#pdmConfirmOverlay');

  const closeModal = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 200);
  };

  overlay.querySelectorAll('[data-pdm-confirm-close]').forEach(btn => btn.addEventListener('click', closeModal));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  overlay.querySelector('[data-pdm-confirm-ok]').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });

  requestAnimationFrame(() => overlay.classList.add('open'));
}

function openMaterialSelector(title, onSelect) {
  let modalOverlay = this.query('#materialSelectorOverlay');
  if (modalOverlay) modalOverlay.remove();

  const overlayHtml = `<div id="materialSelectorOverlay" class="pdm-modal-overlay">
    <div class="pdm-modal-content">
      <div class="pdm-modal-header">
        <h2>${escapeHTML(title)}</h2>
        <button class="pdm-modal-close" data-action="close-selector">&times;</button>
      </div>
      <div class="pdm-modal-body">
        <input type="text" class="pdm-modal-search" placeholder="${escapeHTML(this.label('searchPlaceholder'))}">
        <ul class="pdm-modal-list"></ul>
      </div>
      <div class="pdm-modal-footer">
        <button class="btn" data-action="close-selector">${escapeHTML(this.label('cancelBtn'))}</button>
        <button class="btn btn-primary" data-action="confirm-selector" disabled>${escapeHTML(this.label('selectBtn'))}</button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', overlayHtml);
  modalOverlay = this.query('#materialSelectorOverlay');

  const searchInput = modalOverlay.querySelector('.pdm-modal-search');
  const listEl = modalOverlay.querySelector('.pdm-modal-list');
  const confirmBtn = modalOverlay.querySelector('[data-action="confirm-selector"]');
  const closeBtns = modalOverlay.querySelectorAll('[data-action="close-selector"]');

  let selectedMaterialId = null;
  let allMaterials = Object.values(this.state.materialDb?.materials || {});

  const renderList = (query = '') => {
    const lowerQuery = query.toLowerCase().trim();
    const filtered = allMaterials.filter(m => {
      const nameStr = localizedValue(m.name, this.state.lang).toLowerCase();
      const specStr = localizedValue(m.spec, this.state.lang).toLowerCase();
      return (m.code || '').toLowerCase().includes(lowerQuery) ||
        nameStr.includes(lowerQuery) ||
        specStr.includes(lowerQuery);
    });

    listEl.innerHTML = filtered.map(m => `
      <li class="pdm-modal-list-item ${m.id === selectedMaterialId ? 'selected' : ''}" data-id="${escapeHTML(m.id)}">
        <span class="pdm-modal-list-item-code">${escapeHTML(m.code || m.id)}</span>
        <span class="pdm-modal-list-item-name">${escapeHTML(localizedValue(m.name, this.state.lang))} - ${escapeHTML(localizedValue(m.spec, this.state.lang))}</span>
      </li>
    `).join('');
  };

  renderList();

  listEl.addEventListener('click', (e) => {
    const item = e.target.closest('.pdm-modal-list-item');
    if (!item) return;
    selectedMaterialId = item.dataset.id;
    renderList(searchInput.value);
    confirmBtn.disabled = false;
  });

  searchInput.addEventListener('input', (e) => renderList(e.target.value));

  const closeModal = () => {
    modalOverlay.classList.remove('open');
    setTimeout(() => modalOverlay.remove(), 200);
  };

  closeBtns.forEach(btn => btn.addEventListener('click', closeModal));

  confirmBtn.addEventListener('click', () => {
    if (!selectedMaterialId) return;
    const selectedMaterial = allMaterials.find(m => m.id === selectedMaterialId);
    if (selectedMaterial) onSelect(selectedMaterial);
    closeModal();
  });

  requestAnimationFrame(() => {
    modalOverlay.classList.add('open');
    searchInput.focus();
  });
}

function openMaterialAssetSelector(typeKey, onSelect) {
  if (!['drawings', 'models3d'].includes(typeKey)) return;
  let modalOverlay = this.query('#materialAssetSelectorOverlay');
  if (modalOverlay) modalOverlay.remove();

  const titleKey = typeKey === 'drawings' ? 'selectExisting2D' : 'selectExisting3D';
  const overlayHtml = `<div id="materialAssetSelectorOverlay" class="pdm-modal-overlay">
    <div class="pdm-modal-content">
      <div class="pdm-modal-header">
        <h2>${escapeHTML(this.label(titleKey))}</h2>
        <button class="pdm-modal-close" data-action="close-asset-selector">&times;</button>
      </div>
      <div class="pdm-modal-body">
        <input type="text" class="pdm-modal-search" placeholder="${escapeHTML(this.label('searchPlaceholder'))}">
        <ul class="pdm-modal-list"></ul>
      </div>
      <div class="pdm-modal-footer">
        <button class="btn" data-action="close-asset-selector">${escapeHTML(this.label('cancelBtn'))}</button>
        <button class="btn btn-primary" data-action="confirm-asset-selector" disabled>${escapeHTML(this.label('selectBtn'))}</button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', overlayHtml);
  modalOverlay = this.query('#materialAssetSelectorOverlay');
  const searchInput = modalOverlay.querySelector('.pdm-modal-search');
  const listEl = modalOverlay.querySelector('.pdm-modal-list');
  const confirmBtn = modalOverlay.querySelector('[data-action="confirm-asset-selector"]');
  const currentMaterialId = this.state.materialDraft?.id || this.state.selectedMaterialId;
  const candidates = Object.values(this.state.materialDb?.materials || {})
    .filter((material) => material.id !== currentMaterialId)
    .flatMap((material) => (material[typeKey] || []).map((asset) => ({
      material,
      asset: {
        ...asset,
        url: asset.url || (typeKey === 'models3d' ? asset.previewUrl : '') || '',
      },
    })))
    .filter((candidate) => candidate.asset.url);
  let selectedIndex = -1;

  const renderList = (query = '') => {
    const normalizedQuery = query.toLowerCase().trim();
    const rows = candidates
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => {
        const { material, asset } = candidate;
        const searchable = [
          material.code,
          localizedValue(material.name, this.state.lang),
          localizedValue(material.spec, this.state.lang),
          asset.name,
          asset.url,
        ].join(' ').toLowerCase();
        return searchable.includes(normalizedQuery);
      });
    listEl.innerHTML = rows.length
      ? rows.map(({ candidate, index }) => {
        const materialName = localizedValue(candidate.material.name, this.state.lang);
        const assetName = candidate.asset.name || candidate.asset.url;
        return `<li class="pdm-modal-list-item ${index === selectedIndex ? 'selected' : ''}" data-index="${index}">
          <span class="pdm-modal-list-item-code">${escapeHTML(candidate.material.code || candidate.material.id)}</span>
          <span class="pdm-modal-list-item-name">${escapeHTML(assetName)}${materialName ? ` · ${escapeHTML(materialName)}` : ''}</span>
        </li>`;
      }).join('')
      : `<li class="pdm-modal-list-item">${escapeHTML(this.label('noReusableAssets'))}</li>`;
  };

  const closeModal = () => {
    modalOverlay.classList.remove('open');
    setTimeout(() => modalOverlay.remove(), 200);
  };

  renderList();
  listEl.addEventListener('click', (event) => {
    const item = event.target.closest('[data-index]');
    if (!item) return;
    selectedIndex = Number.parseInt(item.dataset.index, 10);
    confirmBtn.disabled = !Number.isInteger(selectedIndex) || !candidates[selectedIndex];
    renderList(searchInput.value);
  });
  searchInput.addEventListener('input', (event) => renderList(event.target.value));
  modalOverlay.querySelectorAll('[data-action="close-asset-selector"]')
    .forEach((button) => button.addEventListener('click', closeModal));
  modalOverlay.addEventListener('click', (event) => {
    if (event.target === modalOverlay) closeModal();
  });
  confirmBtn.addEventListener('click', () => {
    const selected = candidates[selectedIndex];
    if (!selected) return;
    onSelect(selected);
    closeModal();
  });
  requestAnimationFrame(() => {
    modalOverlay.classList.add('open');
    searchInput.focus();
  });
}

export const sharedViewMethods = {
  renderStaticText,
  renderStatus,
  syncDirtyVisibility,
  changePreviewHtml,
  showDiffModal,
  renderStats,
  renderNotifications,
  renderFilterBar,
  clearContentTable,
  renderEmpty,
  genericToolbar,
  showModal,
  showModel3dModal,
  ensureModelViewer,
  closeModal,
  openPdmPrompt,
  openPdmConfirm,
  openMaterialSelector,
  openMaterialAssetSelector,
};
