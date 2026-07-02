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
      sidebarSearch: '搜索产品/物料...',
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
      headers: ['序号', '物料编码', '部件编号', '物料名称', '规格型号', '材质', '颜色', '属性', '数量', '2D 图纸'],
      sidebarTitle: 'PDM 导航',
      sidebarProductGroup: '产品',
      sidebarParentGroup: '父项物料',
      sidebarChildGroup: '子项物料',
      noSidebarResults: '未找到匹配项',
      replaceMaterial: '替换',
      replaceMaterialPrompt: '输入新物料编码或名称',
      materialNotFound: '未找到物料',
      bomRowNotFound: '未找到 BOM 行',
      productPicker: '产品选择',
      inspector: '检查器',
      selectRowHint: '选择一行 BOM 查看详情',
      selectedBomRow: '已选 BOM 行',
      replaceWith: '替换为',
      replaceNow: '替换物料',
      selectedMaterial: '已选物料',
      whereUsed: '使用位置',
      noSelection: '未选择',
      structureView: '父子项结构',
      assetsView: '图纸 / 3D',
      childCount: '子项',
      parentMaterial: '父项物料',
      childMaterial: '子项物料',
      assetSummary: '图纸资产',
      openBom: '打开 BOM',
      viewMaterial: '查看物料'
    },
    vi: {
      brand: 'Jintai BOM',
      products: 'Sản phẩm',
      materials: 'vật liệu',
      search: 'Tìm mã vật liệu, tên, quy cách, mã linh kiện...',
      sidebarSearch: 'Tìm sản phẩm/vật liệu...',
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
      headers: ['STT', 'Mã VL', 'Mã linh kiện', 'Tên vật liệu', 'Quy cách', 'Chất liệu', 'Màu', 'Thuộc tính', 'SL', 'Bản vẽ 2D'],
      sidebarTitle: 'Điều hướng PDM',
      sidebarProductGroup: 'Sản phẩm',
      sidebarParentGroup: 'Vật liệu cha',
      sidebarChildGroup: 'Vật liệu con',
      noSidebarResults: 'Không tìm thấy',
      replaceMaterial: 'Thay thế',
      replaceMaterialPrompt: 'Nhập mã hoặc tên vật liệu mới',
      materialNotFound: 'Không tìm thấy vật liệu',
      bomRowNotFound: 'Không tìm thấy dòng BOM',
      productPicker: 'Chọn sản phẩm',
      inspector: 'Inspector',
      selectRowHint: 'Chọn một dòng BOM để xem chi tiết',
      selectedBomRow: 'Dòng BOM đã chọn',
      replaceWith: 'Thay bằng',
      replaceNow: 'Thay thế vật liệu',
      selectedMaterial: 'Vật liệu đã chọn',
      whereUsed: 'Đang dùng ở',
      noSelection: 'Chưa chọn',
      structureView: 'Cấu trúc cha con',
      assetsView: 'Bản vẽ / 3D',
      childCount: 'Vật liệu con',
      parentMaterial: 'Vật liệu cha',
      childMaterial: 'Vật liệu con',
      assetSummary: 'Tài sản bản vẽ',
      openBom: 'Mở BOM',
      viewMaterial: 'Xem vật liệu'
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

  function assetKey(value) {
    return normalizeText(value)
      .replace(/\.(pdf|glb|gltf)$/i, '')
      .replace(/[\s\-_()（）[\]【】{}+&.]/g, '')
      .replace(/组件/g, '');
  }

  function colorNeutralCode(value) {
    const key = assetKey(value);
    return key.replace(/(bh|wh|kd|bz|cz|ys|gy|bk)$/i, '');
  }

  function assetParts(key) {
    const [code = '', name = ''] = String(key || '').split('|');
    return {
      code,
      name,
      neutralCode: colorNeutralCode(code)
    };
  }

  function materialAssetParts(material) {
    const code = assetKey(material?.mat_code || '');
    const name = assetKey(material?.name_zh || material?.name_vi || '');
    const comp = assetKey(material?.comp_code || '');
    return {
      directKey: code && name ? `${code}|${name}` : '',
      code,
      neutralCode: colorNeutralCode(code),
      name,
      comp
    };
  }

  function findBomAssetEntry(assetMap, material) {
    const source = assetMap || {};
    const materialParts = materialAssetParts(material || {});
    if (materialParts.directKey && source[materialParts.directKey]) {
      return { key: materialParts.directKey, assets: source[materialParts.directKey] };
    }

    const entries = Object.entries(source);
    const matchers = [
      ([key]) => {
        const parts = assetParts(key);
        return materialParts.name && materialParts.code &&
          parts.name === materialParts.name && parts.code === materialParts.code;
      },
      ([key]) => {
        const parts = assetParts(key);
        return materialParts.name && materialParts.neutralCode &&
          parts.name === materialParts.name && parts.neutralCode === materialParts.neutralCode;
      },
      ([key]) => {
        const parts = assetParts(key);
        return materialParts.code && parts.code === materialParts.code;
      }
    ];

    for (const matcher of matchers) {
      const found = entries.find(matcher);
      if (found) return { key: found[0], assets: found[1] };
    }
    return null;
  }

  function findBomAssets(assetMap, material) {
    return findBomAssetEntry(assetMap, material)?.assets || [];
  }

  function stableId(prefix, value) {
    const textValue = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < textValue.length; index += 1) {
      hash ^= textValue.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${prefix}_${(hash >>> 0).toString(36)}`;
  }

  function localizedPair(zh, vi) {
    return {
      zh: String(zh || vi || ''),
      vi: String(vi || zh || '')
    };
  }

  function canonicalSharedName(value) {
    const raw = String(value || '').trim();
    if (!raw.startsWith('LGS') || !raw.includes('_')) return raw;
    const dash = raw.lastIndexOf('-');
    if (dash < 0) return raw;
    const prefix = raw.slice(0, dash);
    const suffix = raw.slice(dash + 1);
    const codes = Array.from(prefix.matchAll(/(?:LGS)?(\d{3})/g)).map((match) => match[1]);
    if (codes.length < 2) return raw;
    const uniqueCodes = Array.from(new Set(codes)).sort((left, right) => Number(left) - Number(right));
    const style = /-S\b/i.test(prefix) ? '-S' : '';
    return `LGS${uniqueCodes.join('_')}${style}-${suffix}`;
  }

  function canonicalLegacyMaterial(material, productCode) {
    const result = clone(material || {});
    if (productCode === 'LGS111' && /^LGS101/i.test(String(result.mat_code || ''))) {
      result.name_zh = String(result.name_zh || '').replace(/^LGS111-S-/, 'LGS101-S-');
      result.name_vi = String(result.name_vi || '').replace(/^LGS111-S-/, 'LGS101-S-');
    }
    result.name_zh = canonicalSharedName(result.name_zh);
    result.name_vi = canonicalSharedName(result.name_vi);
    return result;
  }

  function materialIdentity(material, productCode) {
    const canonical = canonicalLegacyMaterial(material, productCode);
    const name = canonical.name_zh || canonical.name_vi || '';
    const sharedName = canonicalSharedName(name);
    const codeKey = sharedName !== name
      ? `shared:${assetKey(sharedName)}`
      : `code:${colorNeutralCode(canonical.mat_code || '')}|name:${assetKey(name)}`;
    return [
      codeKey,
      assetKey(canonical.spec || canonical.spec_vi || ''),
      assetKey(canonical.material_zh || canonical.material_vi || ''),
      assetKey(canonical.color_zh || canonical.color_vi || ''),
      assetKey(canonical.attr_zh || canonical.attr_vi || '')
    ].join('|');
  }

  function materialIdFor(material, productCode) {
    return stableId('mat', materialIdentity(material, productCode));
  }

  function mergeAssets(target, assets) {
    const seen = new Set((target || []).map((item) => item.url || item.previewUrl || item.path || item.name));
    (assets || []).forEach((asset) => {
      const key = asset.url || asset.previewUrl || asset.path || asset.name;
      if (!key || seen.has(key)) return;
      seen.add(key);
      target.push(clone(asset));
    });
  }

  function materialRecordFromLegacy(material, productCode) {
    const canonical = canonicalLegacyMaterial(material, productCode);
    const id = materialIdFor(canonical, productCode);
    return {
      id,
      code: String(canonical.mat_code || ''),
      name: localizedPair(canonical.name_zh, canonical.name_vi),
      spec: localizedPair(canonical.spec, canonical.spec_vi),
      material: localizedPair(canonical.material_zh, canonical.material_vi),
      color: localizedPair(canonical.color_zh, canonical.color_vi),
      attr: localizedPair(canonical.attr_zh, canonical.attr_vi),
      drawings: [],
      models3d: []
    };
  }

  function isHardwarePackSummary(material) {
    const code = material?.mat_code || material?.code || '';
    const name = material?.name_zh || material?.name?.zh || '';
    return /^LGS\d+WJBBH$/i.test(String(code || '')) ||
      /^LGS\d+五金包$/i.test(String(name || ''));
  }

  function legacyRowFromRecord(record, entry) {
    return {
      stt: entry.stt || '',
      mat_code: record.code || '',
      comp_code: entry.comp_code || '',
      name_zh: record.name?.zh || '',
      name_vi: record.name?.vi || record.name?.zh || '',
      spec: record.spec?.zh || '',
      spec_vi: record.spec?.vi || record.spec?.zh || '',
      material_zh: record.material?.zh || '',
      material_vi: record.material?.vi || record.material?.zh || '',
      color_zh: record.color?.zh || '',
      color_vi: record.color?.vi || record.color?.zh || '',
      attr_zh: record.attr?.zh || '',
      attr_vi: record.attr?.vi || record.attr?.zh || '',
      color_ver: entry.color_ver || '',
      color_ver_vi: entry.color_ver_vi || entry.color_ver || '',
      qty: entry.qty || '',
      _materialId: record.id,
      _entryId: entry.id,
      _materialRecord: record
    };
  }

  function createMaterialDatabase(payload) {
    const source = payload || {};
    const db = { version: 1, materials: {}, bomEntries: [] };
    const productEntriesByColor = new Map();
    Object.entries(source.bom || {}).forEach(([productCode, product]) => {
      Object.entries(product.color_info || {}).forEach(([colorName, colorData]) => {
        const productEntries = [];
        (colorData.materials || []).forEach((material, index) => {
          const canonical = canonicalLegacyMaterial(material, productCode);
          const materialId = materialIdFor(canonical, productCode);
          if (!db.materials[materialId]) db.materials[materialId] = materialRecordFromLegacy(canonical, productCode);
          const record = db.materials[materialId];
          mergeAssets(record.drawings, findBomAssets((source.drawings || {})[productCode], material));
          mergeAssets(record.drawings, findBomAssets((source.drawings || {})[productCode], canonical));
          mergeAssets(record.models3d, findBomAssets((source.models3d || {})[productCode], material));
          mergeAssets(record.models3d, findBomAssets((source.models3d || {})[productCode], canonical));
          const entry = {
            id: stableId('bom', `${productCode}|${colorName}|${index}|${materialId}|${material.comp_code || ''}`),
            parentType: 'product',
            parentId: productCode,
            productCode,
            color: colorName,
            materialId,
            stt: String(material.stt || ''),
            comp_code: String(material.comp_code || ''),
            qty: String(material.qty || ''),
            color_ver: String(material.color_ver || colorData.color_ver || colorName),
            color_ver_vi: String(material.color_ver_vi || colorData.color_ver_vi || colorName),
            order: index
          };
          db.bomEntries.push(entry);
          productEntries.push({ entry, material: canonical });
        });
        productEntriesByColor.set(`${productCode}|${colorName}`, productEntries);
      });
    });

    productEntriesByColor.forEach((entries, key) => {
      let hardwarePack = entries.find((item) => isHardwarePackSummary(db.materials[item.entry.materialId]));
      const hardwareChildren = entries.filter((item) => db.materials[item.entry.materialId]?.attr?.zh === '五金包');
      if (!hardwarePack && hardwareChildren.length) {
        const [productCode, colorName] = key.split('|');
        const virtualMaterial = {
          mat_code: `${productCode}WJBBH`,
          name_zh: `${productCode}五金包`,
          name_vi: `${productCode} tui ngu kim`,
          spec: '',
          spec_vi: '',
          material_zh: '无',
          material_vi: 'khong',
          color_zh: '',
          color_vi: '',
          attr_zh: '零件',
          attr_vi: 'linh kien'
        };
        const materialId = materialIdFor(virtualMaterial, productCode);
        if (!db.materials[materialId]) db.materials[materialId] = materialRecordFromLegacy(virtualMaterial, productCode);
        const firstOrder = hardwareChildren[0]?.entry?.order ?? 0;
        const entry = {
          id: stableId('bomv', `${key}|${materialId}`),
          parentType: 'product',
          parentId: productCode,
          productCode,
          color: colorName,
          materialId,
          stt: '',
          comp_code: '无',
          qty: '1',
          color_ver: colorName,
          color_ver_vi: colorName,
          order: firstOrder - 0.1,
          virtual: true
        };
        db.bomEntries.push(entry);
        hardwarePack = { entry, material: virtualMaterial };
      }
      if (!hardwarePack) return;
      hardwareChildren.forEach((item, index) => {
          const childEntry = {
            id: stableId('bomc', `${key}|${hardwarePack.entry.materialId}|${item.entry.materialId}|${index}`),
            parentType: 'material',
            parentId: hardwarePack.entry.materialId,
            productCode: hardwarePack.entry.productCode,
            color: hardwarePack.entry.color,
            materialId: item.entry.materialId,
            childMaterialId: item.entry.materialId,
            stt: item.entry.stt,
            comp_code: item.entry.comp_code,
            qty: item.entry.qty,
            color_ver: item.entry.color_ver,
            color_ver_vi: item.entry.color_ver_vi,
            order: index
          };
          db.bomEntries.push(childEntry);
        });
    });
    return db;
  }

  function normalizeMaterialDatabase(payload) {
    if (payload?.materialDb?.materials && payload?.materialDb?.bomEntries) {
      return clone(payload.materialDb);
    }
    return createMaterialDatabase(payload);
  }

  function resolveBomRows(payload, productCode, colorName) {
    const source = payload || {};
    if (!source.materialDb?.materials || !source.materialDb?.bomEntries) {
      return (((source.bom || {})[productCode] || {}).color_info || {})[colorName]?.materials || [];
    }
    return source.materialDb.bomEntries
      .filter((entry) => entry.parentType === 'product' && !entry.virtual && entry.productCode === productCode && entry.color === colorName)
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .map((entry) => {
        const record = source.materialDb.materials[entry.materialId];
        return record ? legacyRowFromRecord(record, entry) : null;
      })
      .filter(Boolean);
  }

  function materialWhereUsed(payload, materialId) {
    const entries = (payload?.materialDb?.bomEntries || []);
    return {
      productEntries: entries.filter((entry) => entry.parentType === 'product' && entry.materialId === materialId),
      parentEntries: entries.filter((entry) => entry.parentType === 'material' && entry.materialId === materialId),
      childEntries: entries.filter((entry) => entry.parentType === 'material' && entry.parentId === materialId)
    };
  }

  function localizedValue(pair, lang) {
    if (!pair || typeof pair !== 'object') return '';
    return lang === 'vi' ? (pair.vi || pair.zh || '') : (pair.zh || pair.vi || '');
  }

  function uniqueValues(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function queryMatches(values, query) {
    if (!query) return true;
    return values.some((value) => normalizeText(value).includes(query));
  }

  function productSidebarItem(payload, productCode, lang) {
    const product = payload?.bom?.[productCode] || {};
    const colorData = product.color_info?.[product.colors?.[0]] || Object.values(product.color_info || {})[0] || {};
    const name = lang === 'vi'
      ? (colorData.name_vi || colorData.name_zh || colorData.name || productCode)
      : (colorData.name_zh || colorData.name || colorData.name_vi || productCode);
    const materialCount = Object.entries(product.color_info || {})
      .reduce((total, [colorName]) => total + resolveBomRows(payload, productCode, colorName).length, 0);
    return {
      type: 'product',
      id: productCode,
      code: productCode,
      label: name,
      subtitle: `${materialCount} materials`,
      searchText: [productCode, name, product.code, colorData.sku].join(' ')
    };
  }

  function relationProducts(entries) {
    return uniqueValues(entries.map((entry) => entry.productCode)).sort();
  }

  function materialSidebarItem(payload, record, type, lang) {
    const whereUsed = materialWhereUsed(payload, record.id);
    const productEntries = type === 'childMaterial' ? whereUsed.parentEntries : whereUsed.productEntries;
    const products = relationProducts(productEntries);
    const parentCodes = uniqueValues(whereUsed.parentEntries
      .map((entry) => payload.materialDb.materials[entry.parentId]?.code || ''))
      .sort();
    const label = localizedValue(record.name, lang) || record.code || record.id;
    return {
      type,
      materialId: record.id,
      code: record.code || '',
      label,
      subtitle: products.join(', ') || parentCodes.join(', ') || '-',
      products,
      parentCodes,
      parentCount: whereUsed.parentEntries.length,
      childCount: whereUsed.childEntries.length,
      drawingCount: (record.drawings || []).length,
      model3dCount: (record.models3d || []).length,
      searchText: [
        record.code,
        record.name?.zh,
        record.name?.vi,
        record.spec?.zh,
        record.spec?.vi,
        record.material?.zh,
        record.material?.vi,
        record.color?.zh,
        record.color?.vi,
        record.attr?.zh,
        record.attr?.vi,
        products.join(' '),
        parentCodes.join(' ')
      ].join(' ')
    };
  }

  function createSidebarIndex(payload, options) {
    const source = payload?.materialDb?.materials ? payload : normalizePayload(payload || {});
    const query = normalizeText(options?.query || '');
    const lang = options?.lang === 'vi' ? 'vi' : 'zh';
    const productItems = Object.keys(source.bom || {})
      .sort()
      .map((productCode) => productSidebarItem(source, productCode, lang))
      .filter((item) => queryMatches([item.searchText], query));
    const parentIds = new Set();
    const childIds = new Set();
    (source.materialDb?.bomEntries || []).forEach((entry) => {
      if (entry.parentType === 'product' && entry.materialId) parentIds.add(entry.materialId);
      if (entry.parentType === 'material' && (entry.childMaterialId || entry.materialId)) {
        childIds.add(entry.childMaterialId || entry.materialId);
      }
    });
    const materialItem = (type) => (materialId) => {
      const record = source.materialDb.materials[materialId];
      return record ? materialSidebarItem(source, record, type, lang) : null;
    };
    const filterItem = (item) => item && queryMatches([item.searchText], query);
    return {
      products: productItems,
      parentMaterials: Array.from(parentIds).map(materialItem('parentMaterial')).filter(filterItem)
        .sort((left, right) => String(left.code).localeCompare(String(right.code))),
      childMaterials: Array.from(childIds).map(materialItem('childMaterial')).filter(filterItem)
        .sort((left, right) => String(left.code).localeCompare(String(right.code)))
    };
  }

  function createPdmNavigation(payload, lang) {
    const source = payload?.materialDb?.materials ? payload : normalizePayload(payload || {});
    const entries = source.materialDb?.bomEntries || [];
    const materials = Object.values(source.materialDb?.materials || {});
    const structureCount = entries.filter((entry) => entry.parentType === 'material').length;
    const assetCount = materials.filter((record) => (record.drawings || []).length || (record.models3d || []).length).length;
    const labels = lang === 'vi'
      ? {
        bom: 'Sản phẩm BOM',
        materials: 'Database vật liệu',
        structure: 'Cấu trúc cha con',
        assets: '2D / 3D'
      }
      : {
        bom: '产品 BOM',
        materials: '物料数据库',
        structure: '父子项结构',
        assets: '图纸 / 3D'
      };
    return [
      { id: 'bom', label: labels.bom, count: Object.keys(source.bom || {}).length },
      { id: 'materials', label: labels.materials, count: materials.length },
      { id: 'structure', label: labels.structure, count: structureCount },
      { id: 'assets', label: labels.assets, count: assetCount }
    ];
  }

  function replaceBomEntryMaterial(payload, entryId, materialId) {
    const entry = (payload?.materialDb?.bomEntries || []).find((item) => item.id === entryId);
    const record = payload?.materialDb?.materials?.[materialId];
    if (!entry || !record) return null;
    entry.materialId = materialId;
    if (entry.parentType === 'material') entry.childMaterialId = materialId;
    return entry;
  }

  function updateMaterialRecord(payload, materialId, patch) {
    const record = payload?.materialDb?.materials?.[materialId];
    if (!record || !patch) return null;
    ['name', 'spec', 'material', 'color', 'attr'].forEach((field) => {
      if (!patch[field]) return;
      record[field] = {
        zh: String(patch[field].zh ?? record[field]?.zh ?? ''),
        vi: String(patch[field].vi ?? record[field]?.vi ?? patch[field].zh ?? record[field]?.zh ?? '')
      };
    });
    if (Object.prototype.hasOwnProperty.call(patch, 'code')) record.code = String(patch.code || '');
    if (Object.prototype.hasOwnProperty.call(patch, 'drawings')) record.drawings = clone(patch.drawings);
    if (Object.prototype.hasOwnProperty.call(patch, 'models3d')) record.models3d = clone(patch.models3d);
    return record;
  }

  function syncLegacyBomFromMaterialDb(payload) {
    if (!payload?.materialDb?.materials || !payload?.materialDb?.bomEntries) return payload;
    Object.entries(payload.bom || {}).forEach(([productCode, product]) => {
      Object.entries(product.color_info || {}).forEach(([colorName, colorData]) => {
        colorData.materials = resolveBomRows(payload, productCode, colorName).map((row) => {
          const copy = clone(row);
          delete copy._materialId;
          delete copy._entryId;
          delete copy._materialRecord;
          return copy;
        });
      });
    });
    return payload;
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
    const normalized = {
      version: 2,
      updatedAt: String(source.updatedAt || ''),
      bom: clone(source.bom),
      drawings: clone(source.drawings),
      manuals: clone(source.manuals),
      models3d: clone(source.models3d)
    };
    normalized.materialDb = normalizeMaterialDatabase({ ...source, ...normalized });
    return normalized;
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
        materialDb: payload.materialDb,
        loadedPayload: clone(payload),
        currentSku: '',
        currentColor: '',
        currentAttr: 'all',
        selectedMaterialId: '',
        selectedEntryId: '',
        adminView: 'bom',
        searchQuery: '',
        sidebarQuery: '',
        replaceQuery: '',
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
      this.ensureInspectorPanel();
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

    ensureInspectorPanel() {
      if (this.query('#inspectorPanel')) return;
      const main = this.query('.main');
      if (!main) return;
      main.insertAdjacentHTML('beforeend', '<aside class="inspector-panel" id="inspectorPanel"></aside>');
    }

    product() {
      return this.state.bom[this.state.currentSku] || null;
    }

    colorData() {
      const product = this.product();
      return product && product.color_info ? product.color_info[this.state.currentColor] : null;
    }

    bomRows(productCode, colorName) {
      return resolveBomRows(this.state.payload, productCode || this.state.currentSku, colorName || this.state.currentColor);
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
        if (this.state.adminView !== 'bom') {
          this.renderContent();
          this.renderInspector();
          return;
        }
        this.renderProductList();
        this.renderTable();
        this.renderInspector();
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
      if (this.state.adminView !== 'bom') {
        this.renderContent();
        this.renderInspector();
        return;
      }
      this.renderProductList();
      this.renderTable();
      this.renderInspector();
    }

    bindNavigation() {
      this.query('#productList').addEventListener('click', (event) => {
        const moduleButton = event.target.closest('[data-module-view]');
        if (moduleButton) {
          this.openModuleView(moduleButton.dataset.moduleView);
          return;
        }
        const item = event.target.closest('[data-sku]');
        if (!item) return;
        this.selectProduct(item.dataset.sku);
      });
      this.query('#productList').addEventListener('change', (event) => {
        const select = event.target.closest('[data-product-select]');
        if (select) this.selectProduct(select.value);
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
        this.state.selectedEntryId = '';
        this.renderContent();
        this.renderInspector();
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
      const handleClick = (event) => {
        const action = event.target.closest('[data-action]');
        const sort = event.target.closest('[data-sort]');
        const deleteDrawing = event.target.closest('[data-delete-drawing-row]');
        const deleteModel3d = event.target.closest('[data-delete-model3d-row]');
        const deleteBom = event.target.closest('[data-delete-bom-row]');
        const replaceBom = event.target.closest('[data-replace-bom-row]');
        const deleteDbMaterial = event.target.closest('[data-delete-db-material]');
        const bomRow = event.target.closest('[data-bom-entry]');
        const materialRow = event.target.closest('[data-material-row]');
        const drawing = event.target.closest('[data-drawing-row]');
        const model3d = event.target.closest('[data-model3d-row]');
        if (deleteDbMaterial) {
          this.deleteDatabaseMaterial(deleteDbMaterial.dataset.deleteDbMaterial);
          return;
        }
        if (deleteBom) {
          this.deleteBomRow(Number(deleteBom.dataset.deleteBomRow));
          return;
        }
        if (replaceBom) {
          this.startReplaceBomRow(Number(replaceBom.dataset.replaceBomRow));
          return;
        }
        if (deleteDrawing) {
          this.deleteMaterialAsset(Number(deleteDrawing.dataset.deleteDrawingRow), 'drawings');
          return;
        }
        if (deleteModel3d) {
          this.deleteMaterialAsset(Number(deleteModel3d.dataset.deleteModel3dRow), 'models3d');
          return;
        }
        if (action) this.runAction(action.dataset.action);
        if (sort) this.sortBy(sort.dataset.sort);
        if (drawing) this.openDrawing(Number(drawing.dataset.drawingRow));
        if (model3d) this.openModel3d(Number(model3d.dataset.model3dRow));
        if (materialRow && !event.target.closest('button,input,a,select,textarea')) {
          this.openMaterialRecord(materialRow.dataset.materialRow);
        }
        if (bomRow && !event.target.closest('button,input,a,select,textarea')) {
          this.selectBomEntry(bomRow.dataset.bomEntry);
        }
      };
      this.query('.content').addEventListener('click', handleClick);
      this.query('#inspectorPanel').addEventListener('click', handleClick);
    }

    bindEditing() {
      this.query('#contentHeader').addEventListener('input', (event) => this.handleProductInput(event, false));
      this.query('#contentHeader').addEventListener('change', (event) => this.handleProductInput(event, true));
      this.query('.content').addEventListener('input', (event) => this.handleMaterialInput(event, false));
      this.query('.content').addEventListener('change', (event) => this.handleMaterialInput(event, true));
      this.query('.content').addEventListener('input', (event) => this.handleMaterialDbInput(event));
      this.query('#inspectorPanel').addEventListener('input', (event) => this.handleInspectorInput(event));
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
      if (action === 'material-db' && this.isAdmin()) this.openMaterialDatabase();
      if (action === 'bom-view' && this.isAdmin()) this.openBomView();
      if (action === 'replace-selected-bom' && this.isAdmin()) this.replaceSelectedBomRow();
      if (action === 'add-db-material' && this.isAdmin()) this.addDatabaseMaterial();
      if (action === 'add-bom-row' && this.isAdmin()) this.addBomRowFromPrompt();
      if (action === 'copy') this.copyTable();
      if (action === 'export') this.exportCSV();
    }

    openModuleView(view) {
      const nextView = ['bom', 'materials', 'structure', 'assets'].includes(view) ? view : 'bom';
      this.state.adminView = nextView;
      this.state.selectedMaterialId = '';
      this.state.selectedEntryId = '';
      this.renderProductList();
      this.renderFilterBar();
      this.renderContent();
      this.renderInspector();
    }

    selectProduct(sku) {
      if (!this.state.bom[sku]) return;
      this.state.currentSku = sku;
      this.state.selectedMaterialId = '';
      this.state.selectedEntryId = '';
      this.state.adminView = 'bom';
      this.ensureColor();
      this.renderProductList();
      this.renderFilterBar();
      this.renderContent();
      this.renderInspector();
    }

    openMaterialDatabase() {
      this.openModuleView('materials');
    }

    openMaterialRecord(materialId) {
      if (!this.state.materialDb?.materials?.[materialId]) return;
      this.state.adminView = 'materials';
      this.state.selectedMaterialId = materialId;
      this.state.searchQuery = '';
      const searchInput = this.query('#searchInput');
      if (searchInput) searchInput.value = '';
      const searchClear = this.query('#searchClear');
      if (searchClear) searchClear.classList.remove('visible');
      this.renderProductList();
      this.renderFilterBar();
      this.renderContent();
      this.renderInspector();
    }

    openBomView() {
      this.openModuleView('bom');
    }

    toggleEdit() {
      this.state.editMode = !this.state.editMode;
      this.renderContent();
      this.renderInspector();
    }

    renderAll() {
      this.ensureInspectorPanel();
      this.renderStaticText();
      this.renderStatus();
      this.renderStats();
      this.renderFilterBar();
      this.renderProductList();
      this.renderContent();
      this.renderInspector();
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
      const syncSourceRow = this.query('[data-sync-source-row]');
      if (syncSourceRow) syncSourceRow.hidden = !this.isAdmin();
      this.query('#syncSource').textContent = this.isAdmin() ? rawUrl(this.config) : '';
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
      if (this.state.adminView === 'materials') {
        this.query('#filterBar').innerHTML = '';
        return;
      }
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
      const navigation = createPdmNavigation(this.state.payload, this.state.lang);
      const productItems = this.filteredProductItems();
      list.innerHTML = `<div class="module-nav">${navigation.map((item) => this.moduleButtonHtml(item)).join('')}</div>
        <div class="product-switcher">
          <div class="sidebar-section-title">${escapeHTML(this.label('productPicker'))}</div>
          ${this.productSelectHtml()}
          <div class="compact-product-list">${productItems.map((item) => this.productButtonHtml(item)).join('') || `<div class="sidebar-empty">${escapeHTML(this.label('noSidebarResults'))}</div>`}</div>
        </div>`;
    }

    moduleButtonHtml(item) {
      const active = this.state.adminView === item.id ? 'active' : '';
      return `<button class="module-item ${active}" type="button" data-module-view="${escapeHTML(item.id)}">
        <span>${escapeHTML(item.label)}</span><strong>${escapeHTML(item.count)}</strong>
      </button>`;
    }

    filteredProductItems() {
      const query = normalizeText(this.state.sidebarQuery);
      return Object.keys(this.state.bom).sort()
        .map((sku) => {
          const product = this.state.bom[sku];
          return { id: sku, code: sku, label: this.productName(product) };
        })
        .filter((item) => !query || normalizeText(`${item.code} ${item.label}`).includes(query))
        .slice(0, 12);
    }

    productSelectHtml() {
      const options = Object.keys(this.state.bom).sort().map((sku) => {
        const selected = sku === this.state.currentSku ? 'selected' : '';
        return `<option value="${escapeHTML(sku)}" ${selected}>${escapeHTML(sku)} - ${escapeHTML(this.productName(this.state.bom[sku]))}</option>`;
      }).join('');
      return `<select class="product-select" data-product-select>${options}</select>`;
    }

    productButtonHtml(item) {
      const active = this.state.adminView === 'bom' && item.id === this.state.currentSku ? 'active' : '';
      return `<button class="product-item sidebar-node ${active}" type="button" data-sku="${escapeHTML(item.id)}">
        <span class="sku">${escapeHTML(item.code)}</span>
        <span class="product-name-small">${escapeHTML(item.label)}</span>
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
      if (this.state.adminView === 'materials') {
        this.renderMaterialDatabase();
        return;
      }
      if (this.state.adminView === 'structure') {
        this.renderStructureView();
        return;
      }
      if (this.state.adminView === 'assets') {
        this.renderAssetsView();
        return;
      }
      const product = this.product();
      const colorData = this.colorData();
      if (!product || !colorData) {
        this.renderEmpty();
        return;
      }
      this.query('#contentHeader').innerHTML = this.contentHeaderHtml(product, colorData);
      this.renderTable();
    }

    clearContentTable() {
      const existing = this.query('.content .table-container');
      if (existing) existing.remove();
    }

    renderEmpty() {
      this.query('#contentHeader').innerHTML = `<div class="empty-state"><div class="icon">BOM</div>
        <h3>${escapeHTML(this.label('emptyTitle'))}</h3><p>${escapeHTML(this.label('emptyText'))}</p></div>`;
      const table = this.query('.content .table-container');
      if (table) table.remove();
    }

    renderMaterialDatabase() {
      const content = this.query('.content');
      const selected = this.state.selectedMaterialId
        ? this.state.materialDb?.materials?.[this.state.selectedMaterialId]
        : null;
      const title = selected
        ? (localizedValue(selected.name, this.state.lang) || selected.code || this.label('materials'))
        : '\u7269\u6599\u6570\u636e\u5e93';
      const subtitle = selected
        ? `${selected.code || selected.id} · Material Database`
        : 'Material Database';
      this.query('#contentHeader').innerHTML = `<h1>${escapeHTML(title)}</h1>
        <div class="subtitle">${escapeHTML(subtitle)}</div>`;
      const existing = content.querySelector('.table-container');
      if (existing) existing.remove();
      const records = this.filteredMaterialRecords();
      content.insertAdjacentHTML('beforeend', `<div class="table-container material-db-view">
        <div class="table-toolbar">${this.materialDbToolbar(records)}</div>
        <table><thead><tr>
          <th>\u7269\u6599\u7f16\u7801</th><th>\u7269\u6599\u540d\u79f0</th><th>\u89c4\u683c\u578b\u53f7</th>
          <th>\u6750\u8d28</th><th>\u989c\u8272</th><th>\u5c5e\u6027</th><th>2D</th><th>3D</th>
          <th>\u4f7f\u7528\u4e8e</th><th>\u7236\u9879</th><th>\u5b50\u9879</th><th>\u64cd\u4f5c</th>
        </tr></thead><tbody>${records.map((record) => this.materialDbRowHtml(record)).join('')}</tbody></table>
      </div>`);
    }

    materialDbToolbar(records) {
      const adminActions = this.isAdmin() ? this.adminActionsHtml() : `<span class="read-only-note">${escapeHTML(this.label('readOnly'))}</span>`;
      return `<div class="count"><strong>${records.length}</strong> \u7269\u6599</div>
        <div class="table-actions">${adminActions}</div>`;
    }

    filteredMaterialRecords() {
      const query = normalizeText(this.state.searchQuery);
      if (this.state.selectedMaterialId && this.state.materialDb?.materials?.[this.state.selectedMaterialId] && !query) {
        return [this.state.materialDb.materials[this.state.selectedMaterialId]];
      }
      return Object.values(this.state.materialDb?.materials || {})
        .filter((record) => !query || [
          record.code, record.name?.zh, record.name?.vi, record.spec?.zh, record.spec?.vi,
          record.material?.zh, record.material?.vi, record.color?.zh, record.color?.vi,
          record.attr?.zh, record.attr?.vi
        ].some((value) => normalizeText(value).includes(query)))
        .sort((left, right) => String(left.code || '').localeCompare(String(right.code || '')));
    }

    materialDbRowHtml(record) {
      const whereUsed = materialWhereUsed(this.state.payload, record.id);
      const usedProducts = Array.from(new Set(whereUsed.productEntries.map((entry) => entry.productCode))).sort();
      const edit = this.isAdmin() && this.state.editMode;
      const cell = (field, value, lang) => edit
        ? `<input class="edit-input edit-wide" data-material-id="${escapeHTML(record.id)}" data-material-db-edit="${field}" ${lang ? `data-lang="${lang}"` : ''} value="${escapeHTML(value)}">`
        : escapeHTML(value);
      const bilingual = (field, pair) => edit
        ? `<div class="db-i18n">${cell(field, pair?.zh || '', 'zh')}${cell(field, pair?.vi || '', 'vi')}</div>`
        : `<div>${escapeHTML(this.state.lang === 'vi' ? (pair?.vi || pair?.zh || '') : (pair?.zh || pair?.vi || ''))}</div>`;
      const deleteButton = edit
        ? `<button class="drawing-btn danger" type="button" data-delete-db-material="${escapeHTML(record.id)}">${escapeHTML(this.deleteAssetLabel())}</button>`
        : '';
      return `<tr data-material-row="${escapeHTML(record.id)}">
        <td>${cell('code', record.code || '')}</td>
        <td>${bilingual('name', record.name)}</td>
        <td>${bilingual('spec', record.spec)}</td>
        <td>${bilingual('material', record.material)}</td>
        <td>${bilingual('color', record.color)}</td>
        <td>${bilingual('attr', record.attr)}</td>
        <td>${(record.drawings || []).length}</td>
        <td>${(record.models3d || []).length}</td>
        <td>${escapeHTML(usedProducts.join(', ') || '-')}</td>
        <td>${whereUsed.parentEntries.length}</td>
        <td>${whereUsed.childEntries.length}</td>
        <td>${deleteButton}</td>
      </tr>`;
    }

    renderStructureView() {
      const content = this.query('.content');
      this.query('#contentHeader').innerHTML = `<h1>${escapeHTML(this.label('structureView'))}</h1>
        <div class="subtitle">Parent / Child BOM</div>`;
      const existing = content.querySelector('.table-container');
      if (existing) existing.remove();
      const rows = this.structureRows();
      content.insertAdjacentHTML('beforeend', `<div class="table-container structure-view">
        <div class="table-toolbar">${this.genericToolbar(rows.length, this.label('structureView'))}</div>
        <table><thead><tr>
          <th>${escapeHTML(this.label('parentMaterial'))}</th>
          <th>${escapeHTML(this.label('childMaterial'))}</th>
          <th>${escapeHTML(this.label('whereUsed'))}</th>
          <th>${escapeHTML(this.label('headers')[8])}</th>
          <th>2D</th><th>3D</th>
        </tr></thead><tbody>${rows.map((row) => this.structureRowHtml(row)).join('')}</tbody></table>
      </div>`);
    }

    structureRows() {
      const query = normalizeText(this.state.searchQuery);
      return (this.state.materialDb?.bomEntries || [])
        .filter((entry) => entry.parentType === 'material')
        .map((entry) => ({
          entry,
          parent: this.state.materialDb.materials[entry.parentId],
          child: this.state.materialDb.materials[entry.childMaterialId || entry.materialId]
        }))
        .filter((row) => row.parent && row.child)
        .filter((row) => !query || [
          row.parent.code, row.parent.name?.zh, row.parent.name?.vi,
          row.child.code, row.child.name?.zh, row.child.name?.vi,
          row.entry.productCode
        ].some((value) => normalizeText(value).includes(query)))
        .sort((left, right) => String(left.parent.code || '').localeCompare(String(right.parent.code || '')));
    }

    structureRowHtml(row) {
      const parentName = localizedValue(row.parent.name, this.state.lang);
      const childName = localizedValue(row.child.name, this.state.lang);
      return `<tr data-material-row="${escapeHTML(row.child.id)}">
        <td><strong>${escapeHTML(row.parent.code || '')}</strong><div class="muted-line">${escapeHTML(parentName)}</div></td>
        <td><strong>${escapeHTML(row.child.code || '')}</strong><div class="muted-line">${escapeHTML(childName)}</div></td>
        <td>${escapeHTML(row.entry.productCode || '-')}</td>
        <td><span class="qty">${escapeHTML(row.entry.qty || '')}</span></td>
        <td>${(row.child.drawings || []).length}</td>
        <td>${(row.child.models3d || []).length}</td>
      </tr>`;
    }

    renderAssetsView() {
      const content = this.query('.content');
      this.query('#contentHeader').innerHTML = `<h1>${escapeHTML(this.label('assetsView'))}</h1>
        <div class="subtitle">${escapeHTML(this.label('assetSummary'))}</div>`;
      const existing = content.querySelector('.table-container');
      if (existing) existing.remove();
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

    assetRows() {
      const query = normalizeText(this.state.searchQuery);
      return Object.values(this.state.materialDb?.materials || {})
        .filter((record) => (record.drawings || []).length || (record.models3d || []).length)
        .filter((record) => !query || [
          record.code, record.name?.zh, record.name?.vi, record.attr?.zh, record.attr?.vi
        ].some((value) => normalizeText(value).includes(query)))
        .sort((left, right) => ((right.drawings || []).length + (right.models3d || []).length) -
          ((left.drawings || []).length + (left.models3d || []).length));
    }

    assetRowHtml(record) {
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

    genericToolbar(count, label) {
      return `<div class="count"><strong>${count}</strong> ${escapeHTML(label)}</div>
        <div class="table-actions">${this.isAdmin() ? this.adminActionsHtml() : `<span class="read-only-note">${escapeHTML(this.label('readOnly'))}</span>`}</div>`;
    }

    renderInspector() {
      const panel = this.query('#inspectorPanel');
      if (!panel) return;
      if (this.state.adminView === 'bom') {
        panel.innerHTML = this.bomInspectorHtml();
        return;
      }
      const record = this.state.selectedMaterialId ? this.state.materialDb?.materials?.[this.state.selectedMaterialId] : null;
      panel.innerHTML = record ? this.materialInspectorHtml(record) : this.emptyInspectorHtml();
    }

    bomInspectorHtml() {
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

    productInspectorHtml() {
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

    materialInspectorHtml(record) {
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

    emptyInspectorHtml() {
      return `<div class="inspector-header">
        <span class="eyebrow">${escapeHTML(this.label('inspector'))}</span>
        <h2>${escapeHTML(this.label('noSelection'))}</h2>
        <p>${escapeHTML(this.label('selectRowHint'))}</p>
      </div>`;
    }

    inspectorField(label, value) {
      return `<div class="inspector-field"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`;
    }

    replaceControlHtml(selected) {
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

    materialOptionsHtml(currentMaterialId) {
      return Object.values(this.state.materialDb?.materials || {})
        .filter((record) => record.id !== currentMaterialId)
        .sort((left, right) => String(left.code || '').localeCompare(String(right.code || '')))
        .map((record) => `<option value="${escapeHTML(record.code || record.id)}">${escapeHTML(localizedValue(record.name, this.state.lang))}</option>`)
        .join('');
    }

    materialAssetsSummaryHtml(record) {
      if (!record) return '';
      return `<div class="inspector-section">
        ${this.inspectorField('2D', String((record.drawings || []).length))}
        ${this.inspectorField('3D', String((record.models3d || []).length))}
      </div>`;
    }

    contentHeaderHtml(product, colorData) {
      const name = this.localizedProductName(colorData);
      const title = this.state.editMode ? this.productInput(name, 'name', 'edit-title') : `<h1>${escapeHTML(name)}</h1>`;
      return `<div class="pdm-title-row">${title}<span class="status-badge released">RELEASED</span></div><div class="subtitle">${this.renderSku(colorData)}</div>
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
        this.metaItem('total', this.bomRows().length),
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
      return filterMaterials({
        materials: this.bomRows(),
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
      const viewAction = this.state.adminView === 'materials'
        ? `<button class="btn" type="button" data-action="bom-view">BOM</button>`
        : `<button class="btn" type="button" data-action="material-db">\u7269\u6599\u6570\u636e\u5e93</button>`;
      const bomAdd = this.state.adminView === 'bom' && this.state.editMode
        ? `<button class="btn" type="button" data-action="add-bom-row">\u6dfb\u52a0\u7269\u6599</button>`
        : '';
      const dbAdd = this.state.adminView === 'materials' && this.state.editMode
        ? `<button class="btn" type="button" data-action="add-db-material">\u65b0\u589e\u7269\u6599</button>`
        : '';
      return `<button class="btn ${this.state.editMode ? 'active' : ''}" type="button" data-action="toggle-edit">${escapeHTML(this.state.editMode ? this.label('done') : this.label('edit'))}</button>
        <button class="btn btn-primary" type="button" data-action="save">${escapeHTML(this.label('save'))}</button>
        <button class="btn" type="button" data-action="discard">${escapeHTML(this.label('discard'))}</button>
        <button class="btn" type="button" data-action="reload">${escapeHTML(this.label('reload'))}</button>
        ${viewAction}${bomAdd}${dbAdd}`;
    }

    tableHeadHtml() {
      const headers = this.label('headers');
      const cols = ['stt', 'mat_code', 'comp_code', 'name', 'spec', 'material', 'color', 'attr', 'qty'];
      const sortable = cols.map((col, index) => `<th><button class="th-button" type="button" data-sort="${col}">${escapeHTML(headers[index])} ${this.sortIcon(col)}</button></th>`);
      const editAction = this.isAdmin() && this.state.editMode ? '<th>\u64cd\u4f5c</th>' : '';
      return `<tr>${sortable.join('')}<th>${escapeHTML(headers[9])}</th><th>3D</th>${editAction}</tr>`;
    }

    rowHtml(material, index) {
      const cells = ['mat_code', 'comp_code', 'name', 'spec', 'material', 'color', 'attr', 'qty']
        .map((field) => this.cellHtml(material, field, index))
        .join('');
      const editAction = this.isAdmin() && this.state.editMode
        ? `<td><div class="drawing-tools">
          <button class="drawing-btn" type="button" data-replace-bom-row="${index}">${escapeHTML(this.label('replaceMaterial'))}</button>
          <button class="drawing-btn danger" type="button" data-delete-bom-row="${index}">${escapeHTML(this.deleteAssetLabel())}</button>
        </div></td>`
        : '';
      const active = material._entryId && material._entryId === this.state.selectedEntryId ? 'selected-row' : '';
      return `<tr class="${active}" data-bom-entry="${escapeHTML(material._entryId || '')}"><td>${index + 1}</td>${cells}<td class="drawing-cell">${this.drawingCellHtml(material, index)}</td><td class="model3d-cell">${this.model3dCellHtml(material, index)}</td>${editAction}</tr>`;
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
      const deleteButton = this.assetDeleteButton('drawing', index);
      return `<div class="drawing-tools"><button class="drawing-btn primary" type="button" data-drawing-row="${index}">${escapeHTML(this.label('viewDrawing'))}</button>${deleteButton}</div>`;
    }

    model3dCellHtml(material, index) {
      const models = this.models3dFor(material);
      if (!models.length) return `<div class="drawing-note">${escapeHTML(this.label('noDrawing'))}</div>`;
      const deleteButton = this.assetDeleteButton('model3d', index);
      return `<div class="drawing-tools"><button class="drawing-btn primary" type="button" data-model3d-row="${index}">${escapeHTML(this.label('viewDrawing'))}</button>${deleteButton}</div>`;
    }

    assetDeleteButton(type, index) {
      if (!this.isAdmin() || !this.state.editMode) return '';
      const attr = type === 'drawing' ? 'data-delete-drawing-row' : 'data-delete-model3d-row';
      return `<button class="drawing-btn danger" type="button" ${attr}="${index}">${escapeHTML(this.deleteAssetLabel())}</button>`;
    }

    deleteAssetLabel() {
      return this.state.lang === 'vi' ? 'X\u00f3a' : '\u5220\u9664';
    }

    drawingsFor(material) {
      if (material?._materialRecord?.drawings) return material._materialRecord.drawings;
      const skuDrawings = this.state.drawings[this.state.currentSku] || {};
      return findBomAssets(skuDrawings, material);
    }

    models3dFor(material) {
      if (material?._materialRecord?.models3d) return material._materialRecord.models3d;
      const skuModels = this.state.models3d[this.state.currentSku] || {};
      return findBomAssets(skuModels, material);
    }

    productModels3d() {
      const skuModels = this.state.models3d[this.state.currentSku] || {};
      return Object.entries(skuModels)
        .filter(([key]) => !key.includes('|'))
        .flatMap(([, models]) => models);
    }

    drawingKey(value) {
      return assetKey(value);
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

    selectBomEntry(entryId) {
      if (!entryId) return;
      this.state.selectedEntryId = entryId;
      const row = this.bomRows().find((item) => item._entryId === entryId);
      this.state.selectedMaterialId = row?._materialId || '';
      this.renderTable();
      this.renderInspector();
    }

    startReplaceBomRow(index) {
      const material = this.state.lastRows[index];
      if (!material?._entryId) return;
      this.state.selectedEntryId = material._entryId;
      this.state.selectedMaterialId = material._materialId || '';
      this.state.replaceQuery = '';
      this.renderTable();
      this.renderInspector();
      const input = this.query('#replaceMaterialInput');
      if (input) input.focus();
    }

    selectedBomRow() {
      if (!this.state.selectedEntryId) return null;
      return this.bomRows().find((row) => row._entryId === this.state.selectedEntryId) || null;
    }

    handleInspectorInput(event) {
      const replaceInput = event.target.closest('[data-replace-material-query]');
      if (replaceInput) this.state.replaceQuery = replaceInput.value;
    }

    replaceSelectedBomRow() {
      if (!this.isAdmin()) return;
      const selected = this.selectedBomRow();
      if (!selected?._entryId) {
        this.setStatus(this.label('bomRowNotFound'), 'error');
        return;
      }
      const input = this.query('#replaceMaterialInput');
      const record = this.findMaterialRecord(input?.value || this.state.replaceQuery);
      if (!record) {
        this.setStatus(this.label('materialNotFound'), 'error');
        return;
      }
      const entry = replaceBomEntryMaterial(this.state.payload, selected._entryId, record.id);
      if (!entry) {
        this.setStatus(this.label('bomRowNotFound'), 'error');
        return;
      }
      this.state.materialDb = this.state.payload.materialDb;
      this.state.selectedMaterialId = record.id;
      this.state.replaceQuery = '';
      this.markDirty();
      this.renderContent();
      this.renderInspector();
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
        this.renderInspector();
      }
    }

    updateMaterial(index, field, value) {
      const material = this.state.lastRows[index];
      if (!material) return;
      if (material._materialId && this.state.materialDb?.materials?.[material._materialId]) {
        this.updateMaterialDbBackedRow(material, field, value);
      } else if (field === 'mat_code') {
        this.replaceMaterialCode(material.mat_code, value);
      } else if (field === 'comp_code' || field === 'qty') {
        material[field] = value;
      } else {
        this.updateSharedMaterialField(material.mat_code, this.materialEditKey(field), value);
      }
      this.markDirty();
      this.renderInspector();
    }

    updateMaterialDbBackedRow(material, field, value) {
      const entry = this.state.materialDb.bomEntries.find((item) => item.id === material._entryId);
      if (field === 'comp_code' || field === 'qty') {
        if (entry) entry[field] = value;
        return;
      }
      const patch = {};
      if (field === 'mat_code') patch.code = value;
      if (field === 'name') patch.name = { [this.state.lang === 'vi' ? 'vi' : 'zh']: value };
      if (field === 'spec') patch.spec = { [this.state.lang === 'vi' ? 'vi' : 'zh']: value };
      if (field === 'material') patch.material = { [this.state.lang === 'vi' ? 'vi' : 'zh']: value };
      if (field === 'color') patch.color = { [this.state.lang === 'vi' ? 'vi' : 'zh']: value };
      if (field === 'attr') patch.attr = { [this.state.lang === 'vi' ? 'vi' : 'zh']: value };
      updateMaterialRecord(this.state.payload, material._materialId, patch);
      this.state.materialDb = this.state.payload.materialDb;
    }

    handleMaterialDbInput(event) {
      const input = event.target.closest('[data-material-db-edit]');
      if (!input || !this.isAdmin()) return;
      const record = this.state.materialDb.materials[input.dataset.materialId];
      if (!record) return;
      const field = input.dataset.materialDbEdit;
      const lang = input.dataset.lang || this.state.lang;
      if (field === 'code') {
        updateMaterialRecord(this.state.payload, record.id, { code: input.value });
      } else {
        updateMaterialRecord(this.state.payload, record.id, {
          [field]: { [lang]: input.value }
        });
      }
      this.markDirty();
    }

    deleteMaterialAsset(index, collectionName) {
      if (!this.isAdmin()) return;
      const material = this.state.lastRows[index];
      if (!material) return;
      const collection = collectionName === 'models3d' ? this.state.models3d : this.state.drawings;
      if (material._materialRecord) {
        const assetField = collectionName === 'models3d' ? 'models3d' : 'drawings';
        const confirmKey = collectionName === 'models3d'
          ? 'deleteModel3dConfirm'
          : 'deleteDrawingConfirm';
        if (global.confirm && !global.confirm(this.deleteAssetConfirmText(confirmKey))) return;
        updateMaterialRecord(this.state.payload, material._materialId, { [assetField]: [] });
        this.state.materialDb = this.state.payload.materialDb;
        this.markDirty();
        this.renderTable();
        this.renderInspector();
        return;
      }
      const skuAssets = collection[this.state.currentSku] || {};
      const entry = findBomAssetEntry(skuAssets, material);
      if (!entry) return;
      const confirmKey = collectionName === 'models3d'
        ? 'deleteModel3dConfirm'
        : 'deleteDrawingConfirm';
      if (global.confirm && !global.confirm(this.deleteAssetConfirmText(confirmKey))) return;
      delete skuAssets[entry.key];
      collection[this.state.currentSku] = skuAssets;
      this.markDirty();
      this.renderTable();
      this.renderInspector();
    }

    deleteBomRow(index) {
      if (!this.isAdmin()) return;
      const material = this.state.lastRows[index];
      if (!material?._entryId) return;
      if (global.confirm && !global.confirm(this.state.lang === 'vi' ? 'Xoa dong BOM nay?' : '\u5220\u9664\u8fd9\u884c BOM\uff1f')) return;
      this.state.materialDb.bomEntries = this.state.materialDb.bomEntries.filter((entry) => entry.id !== material._entryId);
      this.state.payload.materialDb = this.state.materialDb;
      if (this.state.selectedEntryId === material._entryId) this.state.selectedEntryId = '';
      this.markDirty();
      this.renderTable();
      this.renderInspector();
    }

    findMaterialRecord(query) {
      const rawQuery = String(query || '').trim();
      if (!rawQuery) return null;
      const normalized = normalizeText(rawQuery);
      const records = Object.values(this.state.materialDb?.materials || {});
      return records.find((item) => item.id === rawQuery || normalizeText(item.code) === normalized) ||
        records.find((item) => [
          item.code,
          item.name?.zh,
          item.name?.vi,
          item.spec?.zh,
          item.spec?.vi,
          item.material?.zh,
          item.material?.vi
        ].some((value) => normalizeText(value).includes(normalized))) ||
        null;
    }

    addBomRowFromPrompt() {
      if (!this.isAdmin() || !global.prompt) return;
      const query = global.prompt(this.state.lang === 'vi' ? 'Nhap ma vat lieu hoac materialId' : '\u8f93\u5165\u7269\u6599\u7f16\u7801\u6216 materialId', '');
      if (!query) return;
      const record = this.findMaterialRecord(query);
      if (!record) {
        this.setStatus(this.label('materialNotFound'), 'error');
        return;
      }
      const rows = this.bomRows();
      const compCode = global.prompt(this.state.lang === 'vi' ? 'Ma linh kien' : '\u90e8\u4ef6\u7f16\u53f7', '') || '';
      const qty = global.prompt(this.state.lang === 'vi' ? 'So luong' : '\u6570\u91cf', '1') || '1';
      const entry = {
        id: stableId('bom', `${this.state.currentSku}|${this.state.currentColor}|${Date.now()}|${record.id}`),
        parentType: 'product',
        parentId: this.state.currentSku,
        productCode: this.state.currentSku,
        color: this.state.currentColor,
        materialId: record.id,
        stt: String(rows.length + 1),
        comp_code: compCode,
        qty,
        color_ver: this.state.currentColor,
        color_ver_vi: this.state.currentColor,
        order: rows.length
      };
      this.state.materialDb.bomEntries.push(entry);
      this.state.payload.materialDb = this.state.materialDb;
      this.markDirty();
      this.renderContent();
    }

    addDatabaseMaterial() {
      const id = stableId('mat', `manual|${Date.now()}|${Math.random()}`);
      this.state.materialDb.materials[id] = {
        id,
        code: '',
        name: { zh: '\u65b0\u7269\u6599', vi: 'vat lieu moi' },
        spec: { zh: '', vi: '' },
        material: { zh: '', vi: '' },
        color: { zh: '', vi: '' },
        attr: { zh: '\u96f6\u4ef6', vi: 'linh kien' },
        drawings: [],
        models3d: []
      };
      this.state.payload.materialDb = this.state.materialDb;
      this.state.selectedMaterialId = id;
      this.markDirty();
      this.renderContent();
      this.renderInspector();
    }

    deleteDatabaseMaterial(materialId) {
      if (!this.isAdmin()) return;
      const whereUsed = materialWhereUsed(this.state.payload, materialId);
      const usedCount = whereUsed.productEntries.length + whereUsed.parentEntries.length + whereUsed.childEntries.length;
      const message = this.state.lang === 'vi'
        ? `Xoa vat lieu nay va ${usedCount} quan he BOM?`
        : `\u5220\u9664\u8be5\u7269\u6599\u548c ${usedCount} \u6761 BOM \u5173\u7cfb\uff1f`;
      if (global.confirm && !global.confirm(message)) return;
      delete this.state.materialDb.materials[materialId];
      this.state.materialDb.bomEntries = this.state.materialDb.bomEntries
        .filter((entry) => entry.materialId !== materialId && entry.childMaterialId !== materialId && entry.parentId !== materialId);
      this.state.payload.materialDb = this.state.materialDb;
      if (this.state.selectedMaterialId === materialId) this.state.selectedMaterialId = '';
      this.markDirty();
      this.renderContent();
      this.renderInspector();
    }

    deleteAssetConfirmText(key) {
      if (key === 'deleteModel3dConfirm') {
        return this.state.lang === 'vi'
          ? 'X\u00f3a li\u00ean k\u1ebft model 3D n\u00e0y?'
          : '\u5220\u9664\u8fd9\u4e2a 3D \u6a21\u578b\u5173\u8054\uff1f';
      }
      return this.state.lang === 'vi'
        ? 'X\u00f3a li\u00ean k\u1ebft b\u1ea3n v\u1ebd 2D n\u00e0y?'
        : '\u5220\u9664\u8fd9\u4e2a 2D \u56fe\u7eb8\u5173\u8054\uff1f';
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
      this.state.materialDb = this.state.payload.materialDb;
      this.state.loadedPayload = clone(this.state.payload);
      this.state.dirty = false;
      this.state.selectedMaterialId = '';
      this.state.selectedEntryId = '';
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
      this.syncLegacyBom();
      const payload = normalizePayload({
        updatedAt,
        bom: this.state.bom,
        drawings: this.state.drawings,
        manuals: this.state.manuals,
        models3d: this.state.models3d,
        materialDb: this.state.materialDb
      });
      syncLegacyBomFromMaterialDb(payload);
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

    syncLegacyBom() {
      const payload = {
        bom: this.state.bom,
        drawings: this.state.drawings,
        manuals: this.state.manuals,
        models3d: this.state.models3d,
        materialDb: this.state.materialDb
      };
      syncLegacyBomFromMaterialDb(payload);
      this.state.bom = payload.bom;
      this.state.payload.bom = payload.bom;
      this.state.payload.materialDb = this.state.materialDb;
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
    createPdmNavigation,
    createSidebarIndex,
    createMaterialDatabase,
    findBomAssets,
    filterMaterials,
    materialWhereUsed,
    normalizePayload,
    normalizeConfig,
    parseDataJsPayload,
    rawUrl,
    replaceBomEntryMaterial,
    resolveBomRows,
    syncLegacyBomFromMaterialDb,
    updateMaterialRecord,
    serializeDataJs
  };
}(typeof window !== 'undefined' ? window : globalThis));
