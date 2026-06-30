(function (global) {
  'use strict';

  const REFRESH_MS = 60 * 60 * 1000;
  const TOKEN_KEY = 'bom_admin_github_token_v2';

  const TEXT = {
    zh: {
      brand: '金汰 BOM',
      products: '产品',
      materials: '物料',
      search: '搜索物料编码、名称、规格、部件编号...',
      sidebarSearch: '搜索产品...',
      all: '全部',
      size: '尺寸',
      colors: '颜色数',
      total: '总物料',
      manual: '说明书',
      noManual: '未上传',
      viewManual: '查看说明书',
      viewDrawing: '查看',
      model3d: '3D',
      noDrawing: '未匹配',
      edit: '编辑',
      done: '完成',
      save: '保存到 GitHub',
      reload: '重新加载',
      discard: '放弃更改',
      copy: '复制',
      exportCSV: '导出 CSV',
      readOnly: 'Viewer 只读',
      token: 'GitHub token',
      loaded: '已加载 GitHub 数据',
      loadFailed: 'GitHub 数据加载失败',
      saving: '正在保存到 GitHub...',
      saved: '已保存到 GitHub',
      saveFailed: '保存失败',
      dirty: '有未保存更改',
      copied: '已复制表格',
      source: 'GitHub 数据源',
      updated: '数据更新时间',
      localRefresh: '本机刷新时间',
      discardConfirm: '放弃当前未保存更改？',
      emptyTitle: '选择产品查看 BOM',
      emptyText: '点击左侧产品或使用搜索',
      noResultTitle: '没有找到结果',
      noResultText: '请调整筛选条件或搜索词',
      headers: ['序号', '物料编码', '部件编号', '物料名称', '规格型号', '材质', '颜色', '属性', '数量', '2D 图纸']
    },
    vi: {
      brand: 'Jintai BOM',
      products: 'Sản phẩm',
      materials: 'vật liệu',
      search: 'Tìm mã vật liệu, tên, quy cách, mã linh kiện...',
      sidebarSearch: 'Tìm sản phẩm...',
      all: 'Tất cả',
      size: 'Kích thước',
      colors: 'Số màu',
      total: 'Tổng vật liệu',
      manual: 'Hướng dẫn',
      noManual: 'Chưa có',
      viewManual: 'Xem hướng dẫn',
      viewDrawing: 'Xem',
      model3d: '3D',
      noDrawing: 'Chưa khớp',
      edit: 'Sửa',
      done: 'Xong',
      save: 'Lưu lên GitHub',
      reload: 'Tải lại',
      discard: 'Bỏ thay đổi',
      copy: 'Copy',
      exportCSV: 'Xuất CSV',
      readOnly: 'Viewer chỉ được xem',
      token: 'GitHub token',
      loaded: 'Đã tải dữ liệu GitHub',
      loadFailed: 'Tải dữ liệu GitHub thất bại',
      saving: 'Đang lưu lên GitHub...',
      saved: 'Đã lưu lên GitHub',
      saveFailed: 'Lưu thất bại',
      dirty: 'Có thay đổi chưa lưu',
      copied: 'Đã copy bảng',
      source: 'Nguồn dữ liệu GitHub',
      updated: 'Dữ liệu cập nhật',
      localRefresh: 'Máy này tải lúc',
      discardConfirm: 'Bỏ thay đổi chưa lưu?',
      emptyTitle: 'Chọn sản phẩm để xem BOM',
      emptyText: 'Click sản phẩm bên trái hoặc tìm kiếm',
      noResultTitle: 'Không tìm thấy',
      noResultText: 'Thử đổi bộ lọc hoặc từ khóa tìm kiếm',
      headers: ['STT', 'Mã VL', 'Mã linh kiện', 'Tên vật liệu', 'Quy cách', 'Chất liệu', 'Màu', 'Thuộc tính', 'SL', 'Bản vẽ 2D']
    }
  };

  const EDIT_FIELDS = ['mat_code', 'comp_code', 'name', 'spec', 'material', 'color', 'attr', 'qty'];

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase().normalize('NFKD');
  }

  function normalizeConfig(config) {
    const source = config || {};
    return {
      owner: String(source.owner || ''),
      repo: String(source.repo || ''),
      branch: String(source.branch || 'main'),
      path: String(source.path || 'data.js'),
      rawUrl: String(source.rawUrl || '')
    };
  }

  function apiPath(pathValue) {
    return String(pathValue || 'data.js').split('/').map(encodeURIComponent).join('/');
  }

  function rawUrl(config) {
    const clean = normalizeConfig(config);
    if (clean.rawUrl) return clean.rawUrl;
    if (!clean.owner || !clean.repo || !clean.branch || !clean.path) return '';
    return `https://raw.githubusercontent.com/${clean.owner}/${clean.repo}/${clean.branch}/${clean.path}`;
  }

  function contentsUrl(config) {
    const clean = normalizeConfig(config);
    return `https://api.github.com/repos/${encodeURIComponent(clean.owner)}/${encodeURIComponent(clean.repo)}/contents/${apiPath(clean.path)}`;
  }

  function encodeBase64Utf8(value) {
    const bytes = new TextEncoder().encode(String(value));
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let output = '';
    for (let index = 0; index < bytes.length; index += 3) {
      const first = bytes[index];
      const second = bytes[index + 1];
      const third = bytes[index + 2];
      output += alphabet[first >> 2];
      output += alphabet[((first & 3) << 4) | ((second || 0) >> 4)];
      output += index + 1 < bytes.length ? alphabet[((second & 15) << 2) | ((third || 0) >> 6)] : '=';
      output += index + 2 < bytes.length ? alphabet[third & 63] : '=';
    }
    return output;
  }

  function normalizePayload(payload) {
    const source = payload || {};
    return {
      version: Number(source.version || 1),
      updatedAt: String(source.updatedAt || ''),
      bom: clone(source.bom),
      drawings: clone(source.drawings),
      manuals: clone(source.manuals),
      models3d: clone(source.models3d)
    };
  }

  function currentPayloadFromWindow() {
    if (global.BOM_VIEWER_DATA && global.BOM_VIEWER_DATA.bom) {
      return normalizePayload(global.BOM_VIEWER_DATA);
    }
    return normalizePayload({
      bom: global.BOM_DATA || {},
      drawings: global.DRAWING_INDEX || {},
      manuals: global.MANUAL_INDEX || {},
      models3d: global.MODEL3D_INDEX || {}
    });
  }

  function serializeDataJs(payload) {
    return [
      '/* BOM cloud data. Update only through admin.html. */',
      `window.BOM_VIEWER_DATA = ${JSON.stringify(normalizePayload(payload), null, 2)};`,
      ''
    ].join('\n');
  }

  function parseDataJsPayload(source) {
    const sandbox = {};
    const runner = new Function('window', `${source}\nreturn window.BOM_VIEWER_DATA;`);
    const payload = runner(sandbox);
    if (!payload || !payload.bom) throw new Error('Invalid data.js payload');
    return normalizePayload(payload);
  }

  function buildGithubUpdateRequest({ config, token, sha, source, message }) {
    const clean = normalizeConfig(config);
    const body = {
      message: message || 'chore: update bom data',
      content: encodeBase64Utf8(source),
      branch: clean.branch
    };
    if (sha) body.sha = sha;
    return {
      url: contentsUrl(clean),
      options: {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify(body)
      }
    };
  }

  function parseQty(value) {
    const textValue = String(value || '');
    if (!textValue) return 0;
    if (!textValue.includes('+')) return parseInt(textValue, 10) || 0;
    return textValue.split('+').reduce((sum, item) => sum + (parseInt(item.trim(), 10) || 0), 0);
  }

  function materialText(material, field, lang) {
    if (field === 'name') return lang === 'vi' ? (material.name_vi || material.name_zh || '') : (material.name_zh || material.name_vi || '');
    if (field === 'spec') return lang === 'vi' ? (material.spec_vi || material.spec || '') : (material.spec || material.spec_vi || '');
    if (field === 'material') return lang === 'vi' ? (material.material_vi || material.material_zh || '') : (material.material_zh || material.material_vi || '');
    if (field === 'color') return lang === 'vi' ? (material.color_vi || material.color_zh || '') : (material.color_zh || material.color_vi || '');
    if (field === 'attr') return lang === 'vi' ? (material.attr_vi || material.attr_zh || '') : (material.attr_zh || material.attr_vi || '');
    return material[field] || '';
  }

  function materialSearchMatch(material, query) {
    if (!query) return true;
    return ['mat_code', 'comp_code', 'name_zh', 'name_vi', 'spec', 'spec_vi', 'material_zh', 'material_vi', 'color_zh', 'color_vi', 'attr_zh', 'attr_vi']
      .some((key) => normalizeText(material[key]).includes(query));
  }

  function sortMaterials(materials, options) {
    return materials.slice().sort((left, right) => compareMaterial(left, right, options));
  }

  function compareMaterial(left, right, options) {
    const { sortCol, sortAsc, lang, attrOrder } = options;
    if (sortCol === 'stt') return directional((parseInt(left.stt, 10) || 0) - (parseInt(right.stt, 10) || 0), sortAsc);
    if (sortCol === 'qty') return directional(parseQty(left.qty) - parseQty(right.qty), sortAsc);
    if (sortCol === 'attr') return directional((attrOrder[left.attr_zh] ?? 99) - (attrOrder[right.attr_zh] ?? 99), sortAsc);
    const leftValue = materialText(left, sortCol, lang);
    const rightValue = materialText(right, sortCol, lang);
    return directional(String(leftValue).localeCompare(String(rightValue), lang === 'vi' ? 'vi' : 'zh'), sortAsc);
  }

  function directional(value, sortAsc) {
    return sortAsc ? value : -value;
  }

  function filterMaterials({ materials, attr, query, sortCol, sortAsc, lang, attrOrder }) {
    const normalizedQuery = normalizeText(query);
    const filtered = (materials || [])
      .filter((material) => attr === 'all' || material.attr_zh === attr)
      .filter((material) => materialSearchMatch(material, normalizedQuery));
    return sortMaterials(filtered, { sortCol, sortAsc, lang, attrOrder: attrOrder || {} });
  }

  function createApp(options) {
    const app = new BomApplication(options || {});
    app.start();
    return app;
  }

  class BomApplication {
    constructor(options) {
      this.mode = options.mode === 'admin' ? 'admin' : 'viewer';
      this.config = normalizeConfig(options.config);
      this.state = this.initialState();
    }

    initialState() {
      const payload = currentPayloadFromWindow();
      return {
        lang: 'zh',
        payload,
        bom: payload.bom,
        drawings: payload.drawings,
        manuals: payload.manuals,
        models3d: payload.models3d,
        loadedPayload: clone(payload),
        currentSku: '',
        currentColor: '',
        currentAttr: 'all',
        searchQuery: '',
        sidebarQuery: '',
        sortCol: 'attr',
        sortAsc: true,
        editMode: false,
        dirty: false,
        lastRows: [],
        lastLoadAt: ''
      };
    }

    start() {
      if (!global.document) return;
      this.pickFirstProduct();
      this.bindEvents();
      this.renderAll();
      this.loadCloud({ silent: true });
      global.setInterval(() => this.loadCloud({ silent: true }), REFRESH_MS);
    }

    label(key) {
      return (TEXT[this.state.lang] && TEXT[this.state.lang][key]) || TEXT.zh[key] || key;
    }

    isAdmin() {
      return this.mode === 'admin';
    }

    query(selector) {
      return global.document.querySelector(selector);
    }

    queryAll(selector) {
      return Array.from(global.document.querySelectorAll(selector));
    }

    product() {
      return this.state.bom[this.state.currentSku] || null;
    }

    colorData() {
      const product = this.product();
      return product && product.color_info ? product.color_info[this.state.currentColor] : null;
    }

    pickFirstProduct() {
      if (!this.state.currentSku || !this.state.bom[this.state.currentSku]) {
        this.state.currentSku = Object.keys(this.state.bom).sort()[0] || '';
      }
      this.ensureColor();
    }

    ensureColor() {
      const product = this.product();
      if (!product) {
        this.state.currentColor = '';
        return;
      }
      if (!this.state.currentColor || !product.colors.includes(this.state.currentColor)) {
        this.state.currentColor = product.colors[0] || Object.keys(product.color_info || {})[0] || '';
      }
    }

    bindEvents() {
      this.bindSearch();
      this.bindNavigation();
      this.bindActions();
      this.bindEditing();
      this.bindModal();
      this.bindLanguage();
    }

    bindSearch() {
      this.query('#searchInput').addEventListener('input', (event) => {
        this.state.searchQuery = event.target.value.trim();
        this.query('#searchClear').classList.toggle('visible', this.state.searchQuery.length > 0);
        this.renderProductList();
        this.renderTable();
      });
      this.query('#searchClear').addEventListener('click', () => this.clearSearch());
      this.query('#sidebarSearch').addEventListener('input', (event) => {
        this.state.sidebarQuery = event.target.value.trim();
        this.renderProductList();
      });
    }

    clearSearch() {
      this.state.searchQuery = '';
      this.query('#searchInput').value = '';
      this.query('#searchClear').classList.remove('visible');
      this.renderProductList();
      this.renderTable();
    }

    bindNavigation() {
      this.query('#productList').addEventListener('click', (event) => {
        const item = event.target.closest('[data-sku]');
        if (!item) return;
        this.state.currentSku = item.dataset.sku;
        this.ensureColor();
        this.renderProductList();
        this.renderContent();
      });
      this.query('#filterBar').addEventListener('click', (event) => this.handleFilterClick(event));
      this.query('#contentHeader').addEventListener('click', (event) => this.handleHeaderClick(event));
    }

    handleFilterClick(event) {
      const chip = event.target.closest('[data-attr]');
      if (!chip) return;
      this.state.currentAttr = chip.dataset.attr;
      this.renderFilterBar();
      this.renderTable();
    }

    handleHeaderClick(event) {
      const color = event.target.closest('[data-color]');
      if (color) {
        this.state.currentColor = color.dataset.color;
        this.renderContent();
        return;
      }
      const manual = event.target.closest('[data-manual-index]');
      if (manual) {
        this.openManual(Number(manual.dataset.manualIndex));
        return;
      }
      const productModel3d = event.target.closest('[data-product-model3d-index]');
      if (productModel3d) this.openProductModel3d(Number(productModel3d.dataset.productModel3dIndex));
    }

    bindActions() {
      this.query('.content').addEventListener('click', (event) => {
        const action = event.target.closest('[data-action]');
        const sort = event.target.closest('[data-sort]');
        const drawing = event.target.closest('[data-drawing-row]');
        const model3d = event.target.closest('[data-model3d-row]');
        if (action) this.runAction(action.dataset.action);
        if (sort) this.sortBy(sort.dataset.sort);
        if (drawing) this.openDrawing(Number(drawing.dataset.drawingRow));
        if (model3d) this.openModel3d(Number(model3d.dataset.model3dRow));
      });
    }

    bindEditing() {
      this.query('#contentHeader').addEventListener('input', (event) => this.handleProductInput(event, false));
      this.query('#contentHeader').addEventListener('change', (event) => this.handleProductInput(event, true));
      this.query('.content').addEventListener('input', (event) => this.handleMaterialInput(event, false));
      this.query('.content').addEventListener('change', (event) => this.handleMaterialInput(event, true));
      const tokenInput = this.query('#githubToken');
      if (tokenInput) tokenInput.addEventListener('change', () => this.storeToken(tokenInput.value.trim()));
    }

    bindModal() {
      const modal = this.query('#pdfModal');
      modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('[data-close-modal]')) this.closeModal();
      });
      global.document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') this.closeModal();
      });
    }

    bindLanguage() {
      this.queryAll('.lang-btn').forEach((button) => {
        button.addEventListener('click', () => {
          this.state.lang = button.dataset.lang;
          this.renderAll();
        });
      });
    }

    runAction(action) {
      if (action === 'toggle-edit' && this.isAdmin()) this.toggleEdit();
      if (action === 'save' && this.isAdmin()) this.saveCloud();
      if (action === 'reload') this.loadCloud({ silent: false });
      if (action === 'discard' && this.isAdmin()) this.discard();
      if (action === 'copy') this.copyTable();
      if (action === 'export') this.exportCSV();
    }

    toggleEdit() {
      this.state.editMode = !this.state.editMode;
      this.renderContent();
    }

    renderAll() {
      this.renderStaticText();
      this.renderStatus();
      this.renderStats();
      this.renderFilterBar();
      this.renderProductList();
      this.renderContent();
    }

    renderStaticText() {
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
    }

    renderStatus() {
      this.query('#syncSource').textContent = rawUrl(this.config);
      this.query('#lastSync').textContent = this.formatDate(this.state.payload.updatedAt);
      this.query('#lastLocalRefresh').textContent = this.state.lastLoadAt ? this.formatDate(this.state.lastLoadAt) : '-';
      this.query('#adminControls').hidden = !this.isAdmin();
      const tokenInput = this.query('#githubToken');
      if (tokenInput) tokenInput.value = this.readToken();
      this.setStatus(this.state.dirty ? this.label('dirty') : '', this.state.dirty ? 'dirty' : '');
    }

    renderStats() {
      let materials = 0;
      Object.values(this.state.bom).forEach((product) => {
        Object.values(product.color_info || {}).forEach((colorData) => {
          materials += (colorData.materials || []).length;
        });
      });
      this.query('#statProducts').textContent = String(Object.keys(this.state.bom).length);
      this.query('#statMaterials').textContent = String(materials);
    }

    renderFilterBar() {
      const attrs = this.collectAttrs();
      const items = [{ value: 'all', label: this.label('all') }].concat(attrs);
      this.query('#filterBar').innerHTML = items.map((item) => {
        const active = item.value === this.state.currentAttr ? 'active' : '';
        return `<button class="filter-chip ${active}" type="button" data-attr="${escapeHTML(item.value)}">${escapeHTML(item.label)}</button>`;
      }).join('');
    }

    collectAttrs() {
      const attrs = new Map();
      Object.values(this.state.bom).forEach((product) => {
        Object.values(product.color_info || {}).forEach((colorData) => this.collectColorAttrs(attrs, colorData));
      });
      return Array.from(attrs.values());
    }

    collectColorAttrs(attrs, colorData) {
      (colorData.materials || []).forEach((material) => {
        if (!material.attr_zh || attrs.has(material.attr_zh)) return;
        attrs.set(material.attr_zh, {
          value: material.attr_zh,
          label: this.state.lang === 'vi' ? (material.attr_vi || material.attr_zh) : material.attr_zh
        });
      });
    }

    renderProductList() {
      const list = this.query('#productList');
      const sidebarQuery = normalizeText(this.state.sidebarQuery);
      const tableQuery = normalizeText(this.state.searchQuery);
      list.innerHTML = Object.keys(this.state.bom).sort()
        .filter((sku) => this.productVisible(sku, sidebarQuery, tableQuery))
        .map((sku) => this.productButtonHtml(sku))
        .join('');
    }

    productVisible(sku, sidebarQuery, tableQuery) {
      const product = this.state.bom[sku];
      const sidebarMatch = !sidebarQuery || normalizeText(`${sku} ${this.productName(product)}`).includes(sidebarQuery);
      return sidebarMatch && this.productMatchesTableQuery(product, tableQuery);
    }

    productMatchesTableQuery(product, tableQuery) {
      if (!tableQuery) return true;
      const fields = [product.code, product.name_zh, product.name_vi];
      Object.values(product.color_info || {}).forEach((colorData) => this.addProductSearchFields(fields, colorData));
      return fields.some((field) => normalizeText(field).includes(tableQuery));
    }

    addProductSearchFields(fields, colorData) {
      fields.push(colorData.sku, colorData.name_zh, colorData.name_vi, colorData.color_ver, colorData.color_ver_vi);
      (colorData.materials || []).forEach((material) => {
        fields.push(material.mat_code, material.comp_code, material.name_zh, material.name_vi, material.spec, material.spec_vi);
      });
    }

    productButtonHtml(sku) {
      const product = this.state.bom[sku];
      const active = sku === this.state.currentSku ? 'active' : '';
      return `<button class="product-item ${active}" type="button" data-sku="${escapeHTML(sku)}">
        <span class="sku">${escapeHTML(sku)}</span>
        <span class="product-name-small">${escapeHTML(this.productName(product))}</span>
      </button>`;
    }

    productName(product) {
      const firstColor = product && product.color_info ? product.color_info[product.colors[0]] : null;
      if (!firstColor) return product ? product.code : '';
      return this.state.lang === 'vi'
        ? (firstColor.name_vi || firstColor.name_zh || firstColor.name || product.code)
        : (firstColor.name_zh || firstColor.name || firstColor.name_vi || product.code);
    }

    renderContent() {
      const product = this.product();
      const colorData = this.colorData();
      if (!product || !colorData) {
        this.renderEmpty();
        return;
      }
      this.query('#contentHeader').innerHTML = this.contentHeaderHtml(product, colorData);
      this.renderTable();
    }

    renderEmpty() {
      this.query('#contentHeader').innerHTML = `<div class="empty-state"><div class="icon">BOM</div>
        <h3>${escapeHTML(this.label('emptyTitle'))}</h3><p>${escapeHTML(this.label('emptyText'))}</p></div>`;
      const table = this.query('.content .table-container');
      if (table) table.remove();
    }

    contentHeaderHtml(product, colorData) {
      const name = this.localizedProductName(colorData);
      const title = this.state.editMode ? this.productInput(name, 'name', 'edit-title') : `<h1>${escapeHTML(name)}</h1>`;
      return `${title}<div class="subtitle">${this.renderSku(colorData)}</div>
        <div class="product-meta">${this.metaHtml(product, colorData)}</div>
        <div class="color-tabs">${this.colorTabsHtml(product)}</div>`;
    }

    renderSku(colorData) {
      return this.state.editMode ? this.productInput(colorData.sku || '', 'sku', 'edit-subtitle') : escapeHTML(colorData.sku || '');
    }

    metaHtml(product, colorData) {
      const items = [
        this.metaItem('size', this.state.editMode ? this.productInput(colorData.size || '', 'size', 'edit-small') : escapeHTML(colorData.size || '')),
        this.metaItem('colors', Object.keys(product.color_info || {}).length),
        this.metaItem('total', (colorData.materials || []).length),
        this.metaItem('manual', this.manualButtons())
      ];
      const productModels = this.productModels3d();
      if (productModels.length) items.push(this.metaItem('model3d', this.productModel3dButtons(productModels)));
      return items.join('');
    }

    metaItem(labelKey, value) {
      return `<div class="meta-item"><span class="label">${escapeHTML(this.label(labelKey))}</span><span class="value">${value}</span></div>`;
    }

    colorTabsHtml(product) {
      return (product.colors || []).map((color) => {
        const active = color === this.state.currentColor ? 'active' : '';
        const label = this.colorLabel(product.color_info[color]);
        return `<button class="color-tab ${active}" type="button" data-color="${escapeHTML(color)}">${escapeHTML(label)}</button>`;
      }).join('');
    }

    localizedProductName(colorData) {
      return this.state.lang === 'vi'
        ? (colorData.name_vi || colorData.name_zh || colorData.name || '')
        : (colorData.name_zh || colorData.name || colorData.name_vi || '');
    }

    colorLabel(colorData) {
      return this.state.lang === 'vi'
        ? (colorData.color_ver_vi || colorData.color_vi || colorData.color_ver || colorData.color_zh || '')
        : (colorData.color_ver || colorData.color_zh || colorData.color_ver_vi || colorData.color_vi || '');
    }

    productInput(value, field, className) {
      return `<input class="edit-input ${className || ''}" data-product-edit="${field}" value="${escapeHTML(value)}">`;
    }

    manualButtons() {
      const manuals = this.state.manuals[this.state.currentSku] || [];
      if (!manuals.length) return escapeHTML(this.label('noManual'));
      return manuals.map((manual, index) => {
        const suffix = manuals.length > 1 ? ` ${index + 1}` : '';
        return `<button class="drawing-btn primary" type="button" data-manual-index="${index}">${escapeHTML(this.label('viewManual') + suffix)}</button>`;
      }).join('');
    }

    productModel3dButtons(models) {
      return models.map((model, index) => {
        const suffix = models.length > 1 ? ` ${index + 1}` : '';
        return `<button class="drawing-btn primary" type="button" data-product-model3d-index="${index}">${escapeHTML(this.label('viewDrawing') + suffix)}</button>`;
      }).join('');
    }

    renderTable() {
      const content = this.query('.content');
      const existing = content.querySelector('.table-container');
      if (existing) existing.remove();
      const rows = this.filteredRows();
      this.state.lastRows = rows;
      content.insertAdjacentHTML('beforeend', rows.length ? this.tableHtml(rows) : this.emptyTableHtml());
    }

    filteredRows() {
      const colorData = this.colorData();
      return filterMaterials({
        materials: colorData ? colorData.materials : [],
        attr: this.state.currentAttr,
        query: this.state.searchQuery,
        sortCol: this.state.sortCol,
        sortAsc: this.state.sortAsc,
        lang: this.state.lang,
        attrOrder: this.attrOrder()
      });
    }

    attrOrder() {
      return this.collectAttrs().reduce((result, item, index) => {
        result[item.value] = index;
        return result;
      }, {});
    }

    emptyTableHtml() {
      return `<div class="table-container"><div class="empty-state"><div class="icon">BOM</div>
        <h3>${escapeHTML(this.label('noResultTitle'))}</h3><p>${escapeHTML(this.label('noResultText'))}</p></div></div>`;
    }

    tableHtml(rows) {
      return `<div class="table-container"><div class="table-toolbar">${this.toolbarHtml(rows)}</div>
        <table><thead>${this.tableHeadHtml()}</thead><tbody>${rows.map((row, index) => this.rowHtml(row, index)).join('')}</tbody></table></div>`;
    }

    toolbarHtml(rows) {
      const adminActions = this.isAdmin() ? this.adminActionsHtml() : `<span class="read-only-note">${escapeHTML(this.label('readOnly'))}</span>`;
      return `<div class="count"><strong>${rows.length}</strong> ${escapeHTML(this.label('materials'))}</div>
        <div class="table-actions">${adminActions}
        <button class="btn" type="button" data-action="copy">${escapeHTML(this.label('copy'))}</button>
        <button class="btn btn-primary" type="button" data-action="export">${escapeHTML(this.label('exportCSV'))}</button></div>`;
    }

    adminActionsHtml() {
      return `<button class="btn ${this.state.editMode ? 'active' : ''}" type="button" data-action="toggle-edit">${escapeHTML(this.state.editMode ? this.label('done') : this.label('edit'))}</button>
        <button class="btn btn-primary" type="button" data-action="save">${escapeHTML(this.label('save'))}</button>
        <button class="btn" type="button" data-action="discard">${escapeHTML(this.label('discard'))}</button>
        <button class="btn" type="button" data-action="reload">${escapeHTML(this.label('reload'))}</button>`;
    }

    tableHeadHtml() {
      const headers = this.label('headers');
      const cols = ['stt', 'mat_code', 'comp_code', 'name', 'spec', 'material', 'color', 'attr', 'qty'];
      const sortable = cols.map((col, index) => `<th><button class="th-button" type="button" data-sort="${col}">${escapeHTML(headers[index])} ${this.sortIcon(col)}</button></th>`);
      return `<tr>${sortable.join('')}<th>${escapeHTML(headers[9])}</th><th>3D</th></tr>`;
    }

    rowHtml(material, index) {
      const cells = ['mat_code', 'comp_code', 'name', 'spec', 'material', 'color', 'attr', 'qty']
        .map((field) => this.cellHtml(material, field, index))
        .join('');
      return `<tr><td>${index + 1}</td>${cells}<td class="drawing-cell">${this.drawingCellHtml(material, index)}</td><td class="model3d-cell">${this.model3dCellHtml(material, index)}</td></tr>`;
    }

    cellHtml(material, field, index) {
      const value = materialText(material, field, this.state.lang);
      if (this.isAdmin() && this.state.editMode) return `<td>${this.editInput(value, field, index)}</td>`;
      if (field === 'attr') return `<td><span class="attr-badge">${escapeHTML(value)}</span></td>`;
      if (field === 'qty') return `<td><span class="qty">${escapeHTML(value)}</span></td>`;
      return `<td>${this.highlight(value)}</td>`;
    }

    editInput(value, field, index) {
      const wide = field === 'name' || field === 'spec' ? 'edit-wide' : '';
      return `<input class="edit-input ${wide}" data-row-index="${index}" data-edit-field="${field}" value="${escapeHTML(value)}">`;
    }

    highlight(value) {
      const escaped = escapeHTML(value);
      if (!this.state.searchQuery || !value) return escaped;
      const pattern = this.state.searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return escaped.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
    }

    drawingCellHtml(material, index) {
      const drawings = this.drawingsFor(material);
      if (!drawings.length) return `<div class="drawing-note">${escapeHTML(this.label('noDrawing'))}</div>`;
      return `<div class="drawing-tools"><button class="drawing-btn primary" type="button" data-drawing-row="${index}">${escapeHTML(this.label('viewDrawing'))}</button></div>`;
    }

    model3dCellHtml(material, index) {
      const models = this.models3dFor(material);
      if (!models.length) return `<div class="drawing-note">${escapeHTML(this.label('noDrawing'))}</div>`;
      return `<div class="drawing-tools"><button class="drawing-btn primary" type="button" data-model3d-row="${index}">${escapeHTML(this.label('viewDrawing'))}</button></div>`;
    }

    drawingsFor(material) {
      const skuDrawings = this.state.drawings[this.state.currentSku] || {};
      const directKey = this.drawingKey(`${material.mat_code || ''}|${material.name_zh || ''}`);
      if (skuDrawings[directKey]) return skuDrawings[directKey];
      const code = this.drawingKey(material.mat_code || '');
      const found = Object.entries(skuDrawings).find(([key]) => key.includes(code));
      return found ? found[1] : [];
    }

    models3dFor(material) {
      const skuModels = this.state.models3d[this.state.currentSku] || {};
      const directKey = this.drawingKey(`${material.mat_code || ''}|${material.name_zh || ''}`);
      if (skuModels[directKey]) return skuModels[directKey];
      const name = this.drawingKey(material.name_zh || material.name_vi || '');
      const code = this.drawingKey(material.mat_code || '');
      const foundByCode = Object.entries(skuModels).find(([key]) => code && key.split('|')[0] === code);
      if (foundByCode) return foundByCode[1];
      const foundByName = Object.entries(skuModels).find(([key]) => name && key.split('|')[1] === name);
      if (foundByName) return foundByName[1];
      return [];
    }

    productModels3d() {
      const skuModels = this.state.models3d[this.state.currentSku] || {};
      return Object.entries(skuModels)
        .filter(([key]) => !key.includes('|'))
        .flatMap(([, models]) => models);
    }

    drawingKey(value) {
      return normalizeText(value).replace(/\.(pdf|glb|gltf)$/i, '').replace(/[\s\-_()（）[\]【】{}+&.]/g, '').replace(/组件/g, '');
    }

    sortIcon(col) {
      if (this.state.sortCol !== col) return '';
      return this.state.sortAsc ? '↑' : '↓';
    }

    sortBy(col) {
      if (this.state.sortCol === col) {
        this.state.sortAsc = !this.state.sortAsc;
      } else {
        this.state.sortCol = col;
        this.state.sortAsc = true;
      }
      this.renderTable();
    }

    handleProductInput(event, refresh) {
      const input = event.target.closest('[data-product-edit]');
      if (!input || !this.isAdmin()) return;
      const colorData = this.colorData();
      const key = input.dataset.productEdit === 'name' ? (this.state.lang === 'vi' ? 'name_vi' : 'name_zh') : input.dataset.productEdit;
      colorData[key] = input.value;
      if (key === 'name_zh') colorData.name = input.value;
      this.markDirty();
      if (refresh) this.renderProductList();
    }

    handleMaterialInput(event, refresh) {
      const input = event.target.closest('[data-edit-field]');
      if (!input || !this.isAdmin()) return;
      this.updateMaterial(Number(input.dataset.rowIndex), input.dataset.editField, input.value);
      if (refresh) {
        this.renderProductList();
        this.renderTable();
      }
    }

    updateMaterial(index, field, value) {
      const material = this.state.lastRows[index];
      if (!material) return;
      if (field === 'mat_code') {
        this.replaceMaterialCode(material.mat_code, value);
      } else if (field === 'comp_code' || field === 'qty') {
        material[field] = value;
      } else {
        this.updateSharedMaterialField(material.mat_code, this.materialEditKey(field), value);
      }
      this.markDirty();
    }

    replaceMaterialCode(oldCode, newCode) {
      if (!newCode.trim()) return;
      this.forEachMaterialWithCode(oldCode, (material) => {
        material.mat_code = newCode;
      });
    }

    updateSharedMaterialField(matCode, key, value) {
      this.forEachMaterialWithCode(matCode, (material) => {
        material[key] = value;
      });
    }

    forEachMaterialWithCode(matCode, callback) {
      Object.values(this.state.bom).forEach((product) => {
        Object.values(product.color_info || {}).forEach((colorData) => {
          (colorData.materials || []).forEach((material) => {
            if (material.mat_code === matCode) callback(material);
          });
        });
      });
    }

    materialEditKey(field) {
      if (field === 'name') return this.state.lang === 'vi' ? 'name_vi' : 'name_zh';
      if (field === 'material') return this.state.lang === 'vi' ? 'material_vi' : 'material_zh';
      if (field === 'color') return this.state.lang === 'vi' ? 'color_vi' : 'color_zh';
      if (field === 'attr') return this.state.lang === 'vi' ? 'attr_vi' : 'attr_zh';
      if (field === 'spec') return this.state.lang === 'vi' ? 'spec_vi' : 'spec';
      return field;
    }

    markDirty() {
      this.state.dirty = true;
      this.renderStatus();
    }

    discard() {
      if (global.confirm && !global.confirm(this.label('discardConfirm'))) return;
      this.applyPayload(this.state.loadedPayload);
      this.state.editMode = false;
      this.state.dirty = false;
      this.renderAll();
    }

    async loadCloud(options) {
      if (this.state.dirty && options.silent) return false;
      const url = rawUrl(this.config);
      if (!url) return false;
      try {
        const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const payload = parseDataJsPayload(await response.text());
        this.applyPayload(payload);
        this.state.lastLoadAt = new Date().toISOString();
        this.renderAll();
        if (!options.silent) this.setStatus(this.label('loaded'), 'saved');
        return true;
      } catch (error) {
        if (!options.silent) this.setStatus(`${this.label('loadFailed')}: ${error.message}`, 'error');
        return false;
      }
    }

    applyPayload(payload) {
      this.state.payload = normalizePayload(payload);
      this.state.bom = this.state.payload.bom;
      this.state.drawings = this.state.payload.drawings;
      this.state.manuals = this.state.payload.manuals;
      this.state.models3d = this.state.payload.models3d;
      this.state.loadedPayload = clone(this.state.payload);
      this.state.dirty = false;
      this.pickFirstProduct();
    }

    async saveCloud() {
      const token = this.readToken();
      if (!token) {
        this.setStatus(`${this.label('saveFailed')}: ${this.label('token')}`, 'error');
        return;
      }
      try {
        await this.writeGithubData(token);
      } catch (error) {
        this.setStatus(`${this.label('saveFailed')}: ${error.message}`, 'error');
      }
    }

    async writeGithubData(token) {
      this.setStatus(this.label('saving'), '');
      const updatedAt = new Date().toISOString();
      const payload = normalizePayload({
        updatedAt,
        bom: this.state.bom,
        drawings: this.state.drawings,
        manuals: this.state.manuals,
        models3d: this.state.models3d
      });
      const source = serializeDataJs(payload);
      const sha = await this.fetchGithubSha(token);
      const request = buildGithubUpdateRequest({ config: this.config, token, sha, source, message: `chore: update bom data ${updatedAt}` });
      const response = await fetch(request.url, request.options);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      this.state.loadedPayload = clone(payload);
      this.state.payload = payload;
      this.state.dirty = false;
      this.renderAll();
      this.setStatus(this.label('saved'), 'saved');
    }

    async fetchGithubSha(token) {
      const url = `${contentsUrl(this.config)}?ref=${encodeURIComponent(this.config.branch)}`;
      const response = await fetch(url, { headers: this.githubHeaders(token) });
      if (response.status === 404) return '';
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      return data.sha || '';
    }

    githubHeaders(token) {
      return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      };
    }

    readToken() {
      try {
        return global.sessionStorage ? global.sessionStorage.getItem(TOKEN_KEY) || '' : '';
      } catch (error) {
        return '';
      }
    }

    storeToken(token) {
      try {
        if (global.sessionStorage) global.sessionStorage.setItem(TOKEN_KEY, token);
      } catch (error) {
        this.setStatus(error.message, 'error');
      }
    }

    setStatus(message, state) {
      const status = this.query('#syncStatus');
      if (!status) return;
      status.textContent = message || '';
      status.dataset.state = state || '';
    }

    formatDate(value) {
      if (!value) return '-';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString(this.state.lang === 'vi' ? 'vi-VN' : 'zh-CN');
    }

    openManual(index) {
      const manual = (this.state.manuals[this.state.currentSku] || [])[index];
      if (manual) this.showModal(manual.url, manual.name, manual.path || this.label('manual'));
    }

    openDrawing(index) {
      const material = this.state.lastRows[index];
      const drawing = material ? this.drawingsFor(material)[0] : null;
      if (drawing) this.showModal(drawing.url, drawing.name, drawing.path || materialText(material, 'name', this.state.lang));
    }

    openModel3d(index) {
      const material = this.state.lastRows[index];
      const model = material ? this.models3dFor(material)[0] : null;
      if (model) this.showModel3dModal(model, materialText(material, 'name', this.state.lang));
    }

    openProductModel3d(index) {
      const model = this.productModels3d()[index];
      const colorData = this.colorData();
      if (model) this.showModel3dModal(model, this.localizedProductName(colorData || {}));
    }

    showModal(url, title, subtitle) {
      this.query('#pdfModalTitle').textContent = title || this.label('viewDrawing');
      this.query('#pdfModalSubtitle').textContent = subtitle || '';
      const frame = this.query('#pdfFrame');
      const modelViewer = this.ensureModelViewer();
      frame.hidden = false;
      modelViewer.hidden = true;
      modelViewer.removeAttribute('src');
      frame.src = this.pdfFrameUrl(url);
      this.query('#pdfOpenLink').href = url || '#';
      this.query('#pdfOpenLink').textContent = 'Open';
      this.query('#pdfModal').classList.add('open');
    }

    showModel3dModal(model, fallbackTitle) {
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

    ensureModelViewer() {
      let modelViewer = this.query('#model3dViewer');
      if (modelViewer) return modelViewer;
      modelViewer = global.document.createElement('model-viewer');
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

    pdfFrameUrl(url) {
      const value = String(url || '').trim();
      const match = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
      return match ? `https://drive.google.com/file/d/${encodeURIComponent(match[1])}/preview` : value || 'about:blank';
    }

    closeModal() {
      this.query('#pdfFrame').src = 'about:blank';
      const modelViewer = this.query('#model3dViewer');
      if (modelViewer) {
        modelViewer.removeAttribute('src');
        modelViewer.hidden = true;
      }
      this.query('#pdfModal').classList.remove('open');
    }

    rowsForExport() {
      const rows = [this.label('headers')];
      this.filteredRows().forEach((material) => {
        rows.push([rows.length, material.mat_code || '', material.comp_code || '', materialText(material, 'name', this.state.lang),
          materialText(material, 'spec', this.state.lang), materialText(material, 'material', this.state.lang),
          materialText(material, 'color', this.state.lang), materialText(material, 'attr', this.state.lang),
          material.qty || '', this.drawingsFor(material).map((drawing) => drawing.name).join(' | '),
          this.models3dFor(material).map((model) => model.name).join(' | ')]);
      });
      return rows;
    }

    copyTable() {
      const textValue = this.rowsForExport().map((row) => row.join('\t')).join('\n');
      if (global.navigator && global.navigator.clipboard) {
        global.navigator.clipboard.writeText(textValue).then(() => this.setStatus(this.label('copied'), 'saved'));
      }
    }

    exportCSV() {
      const csv = `\uFEFF${this.rowsForExport().map((row) => row.map(this.escapeCSV).join(',')).join('\n')}`;
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const link = global.document.createElement('a');
      link.href = url;
      link.download = `BOM_${this.state.currentSku}_${this.state.currentColor}_${this.state.lang}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }

    escapeCSV(value) {
      const textValue = String(value ?? '');
      return /[",\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
    }
  }

  global.BomApp = { createApp, start: createApp };
  global.BomCoreUtils = {
    buildGithubUpdateRequest,
    filterMaterials,
    normalizeConfig,
    parseDataJsPayload,
    rawUrl,
    serializeDataJs
  };
}(typeof window !== 'undefined' ? window : globalThis));
