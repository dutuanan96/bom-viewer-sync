import {
  clone,
  createMaterialDatabase,
  filterMaterials,
  findBomAssetEntry,
  findBomAssets,
  localizedValue,
  materialText,
  materialWhereUsed,
  normalizeText,
  replaceBomEntryMaterial,
  stripProductColorName,
  updateMaterialRecord,
} from './domain/materials.js';
import {
  normalizeConfig,
  normalizePayload,
} from './infrastructure/github-data.js';
import { createGithubShardedDataAdapter } from './infrastructure/github-sharded-data.js';
import { createGithubGitDataWriter } from './infrastructure/github-git-data.js';
import {
  buildAssetPath,
  createGithubAssetStorageAdapter,
  sha256Hex,
} from './infrastructure/github-asset-storage.js';
import {
  MaterialAssetUploadError,
  resolvePendingMaterialAssets,
  validateMaterialAssetFile,
} from './features/material-asset-upload.js';
import { stableId } from './shared/primitives.js';
import {
  appendNotificationEvent as appendNormalizedNotificationEvent,
  describePayloadChanges as describeNormalizedPayloadChanges,
  normalizeNotificationChanges,
  normalizeNotifications,
} from './features/notifications.js';
import { createPdmNavigation, createSidebarIndex, resolveBomRows } from './domain/bom.js';
import {
  buildBomTreeRows,
  childMaterialId,
  groupMaterialChildRows,
  hasChildMaterialRelation,
  syncLegacyBomFromMaterialDb,
} from './domain/relationships.js';
import { AI_PROMPT_PACK_VERSION, createAiAssistantFeature } from './features/ai-assistant/index.js';
import { PdmKnowledge } from './features/ai-assistant/pdm-knowledge.js';
import { PdmDiscovery } from './features/ai-assistant/pdm-discovery.js';
import { applyMutationTransaction } from './features/ai-assistant/mutation-engine.js';
import { createLocalAiStore } from './features/ai-assistant/local-store.js';
import { createMemoryManager } from './features/ai-assistant/memory-manager.js';
import {
  CONFIRMED_MARKETPLACE_ALIASES,
  getMarketplaceInsights,
  validateMarketplaceSearch,
} from './features/ai-assistant/marketplace-insights.js';
import {
  createProductRevision,
  isHistoricalProductRevision,
  payloadForProductRevision,
  productRevisionOptions as revisionOptionsForProduct,
  releaseProductRevision,
  withdrawProductRevision,
} from './domain/revisions.js';
import { bomViewMethods } from './ui/bom-view.js';
import { catalogViewMethods } from './ui/catalog-view.js';
import { materialViewMethods } from './ui/material-view.js';
import { escapeHTML, sharedViewMethods } from './ui/shared-view.js';
import { structureViewMethods } from './ui/structure-view.js';

  'use strict';

const global = globalThis;

  const REFRESH_MS = 60 * 60 * 1000;
  const NOTIFICATION_REFRESH_MS = 60 * 1000;
  const TOKEN_KEY = 'bom_admin_github_token_v2';
  const ASSET_STORAGE_CONFIG = {
    owner: 'dutuanan96',
    repo: 'bom-viewer-assets',
    branch: 'main',
  };

  const TEXT = {
    zh: {
      brand: '金汰 BOM',
      brandTitle: '金汰家具',
      brandSubtitle: 'PDM系统',
      developedBy: 'Developed by 俞俊安',
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
      save: '\u63d0\u4ea4\u66f4\u6539',
      viewChanges: '\u67e5\u770b\u66f4\u6539',
      noChangesSummary: '\u6709\u672a\u63d0\u4ea4\u7684\u66f4\u6539\uff0c\u4f46\u4e0d\u5728\u6458\u8981\u8303\u56f4\u5185',
      diffSummary: '\u53d8\u66f4\u6458\u8981\uff08\u6700\u591a\u663e\u793a 8 \u9879\uff09',
      diffColType: '\u7c7b\u578b',
      diffColCode: '\u7f16\u7801',
      diffColField: '\u5b57\u6bb5',
      diffColBefore: '\u4fee\u6539\u524d',
      diffColAfter: '\u4fee\u6539\u540e',
      diffKindMaterial: '\u7269\u6599\u5c5e\u6027',
      diffKindMaterialAdded: '\u65b0\u589e\u7269\u6599',
      diffKindMaterialDeleted: '\u5220\u9664\u7269\u6599',
      diffKindBomAdded: '\u7236\u9879\u65b0\u589e\u5b50\u9879',
      diffKindBomDeleted: '\u7236\u9879\u79fb\u9664\u5b50\u9879',
      diffKindBomQty: '\u6570\u91cf\u53d8\u66f4',
      diffKindProductAdded: '\u65b0\u589e\u4ea7\u54c1',
      reload: '重新加载',
      discard: '放弃更改',
      copy: '复制',

      exportExcel: '导出 Excel',
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
      addParentMaterial: '新增父项',
      addParentMaterialPrompt: '输入物料编码或名称以作为父项',
      deleteParentStructure: '删除父项结构',
      deleteParentStructureConfirm: '确定要删除此父项的所有子项结构吗？物料本身不会被删除，仅删除其结构关系。',
      parentStructureDeleted: '父项结构已删除',
      saveStructureDraft: '保存结构',
      assetsView: '图纸 / 3D',
      childCount: '子项',
      parentMaterial: '父项物料',
      childMaterial: '子项物料',
      addChildMaterialPrompt: '输入子项物料编码或名称',
      childMaterialExists: '该子项物料已存在',
      assetSummary: '图纸资产',
      materialDatabase: '物料数据库',
      addChildMaterial: '添加子项',
      openBom: '打开 BOM',
      viewMaterial: '查看物料',
      editMaterial: '编辑',
      materialMaster: '物料主数据',
      backToMaterialList: '返回物料列表',
      saveMaterial: '保存物料',
      materialSaved: '物料已保存',
      deleteMaterial: '删除物料',
      deleteMaterialConfirm: '删除该物料？',
      materialDeleted: '物料已删除',
      materialDeleteBlocked: '该物料已被 BOM 使用，不能删除',
      addMaterial: '新增物料',
      add2D: '添加 2D',
      add3D: '添加 3D',
      assetName: '显示名称 (选填)',
      assetUrl: 'URL (必填)',
      openAsset: '打开',
      deleteAsset: '删除',
      invalid2DUrl: '2D 必须是 HTTPS PDF 或 Google Drive 文件',
      invalid3DUrl: '3D 必须是 HTTPS GLB/GLTF 直链',
      duplicateUrl: 'URL 已存在',
      saveLocalOnly: '已更新本地状态，请点击【保存到 GitHub】生效',
      materialId: 'MaterialID',
      materialCode: '物料编码',
      materialName: '物料名称',
      specification: '规格型号',
      materialComposition: '材质',
      materialColor: '颜色',
      materialAttribute: '属性',
      selectMaterial: '选择物料',
      searchPlaceholder: '搜索物料编码、名称、规格...',
      selectBtn: '选择',
      cancelBtn: '取消',
      chinese: '中文',
      vietnamese: '越南语',
      bomRelationships: 'BOM 关系',
      productCatalogTitle: 'LGS 产品',
      productCatalogSubtitle: '按 SPU 管理规格、颜色、状态和 BOM',
      spu: 'SPU',
      version: '版本',
      status: '状态',
      activeStatus: '使用中',
      disabledStatus: '禁用',
      viewBom: '查看 BOM',
      colorDots: '颜色',
      productSpecifications: '产品规格',
      billOfMaterials: 'Bill of Materials (BOM)',
      assemblyPreview: '装配预览',
      modelPreview: '3D 装配',
      productImage: '产品图片',
      revision: '版本',
      lastModified: '最后修改',
      unit: '单位',
      viewAssembly: '查看装配',
      export: '导出',
      level: '层级',
      partNumber: '物料编码',
      componentNumber: '编号',
      description: '名称',
      items: '项',
      operation: '操作',
      view: '查看',
      yes: '有',
      no: '无',
      clearFilters: '清除筛选',
      has2D: '2D图纸',
      has3D: '3D模型',
      download: '下载',
      close: '关闭',
      'ai.title': 'AI 助手',
      'ai.settings.title': 'AI 设置',
      'ai.settings.connection': '连接',
      'ai.settings.privacy': '隐私',
      'ai.settings.diagnostics': '诊断',
      'ai.settings.apiKey': 'OpenRouter API 密钥',
      'ai.settings.modelLabel': 'AI 模型选择',
      'ai.settings.connect': '连接',
      'ai.settings.disconnect': '断开连接',
      'ai.settings.consentLabel': '允许回退到付费模型',
      'ai.settings.statusConnected': '已连接',
      'ai.settings.statusDisconnected': '未连接',
      'ai.workspace.placeholder': '输入您的问题...',
      'ai.workspace.send': '发送',
      'ai.workspace.clear': '清除对话',
      'ai.workspace.close': '关闭',
      'ai.workspace.open': '打开 AI 助手',
      'ai.workspace.loading': 'AI 正在输入...',
      'ai.workspace.conversationLabel': '对话记录',
      'ai.settings.keyNotPersisted': '⚠ 出于安全原因，API 密钥仅保存在当前会话内存中，刷新页面后需要重新连接。',
      'ai.memory.title': '记忆与知识',
      'ai.memory.confirm': '确认',
      'ai.memory.reject': '拒绝',
      'ai.memory.delete': '删除',
      'ai.memory.export': '导出记忆与审计',
      'ai.memory.persistent': '记忆保存在此浏览器中。',
      'ai.memory.sessionOnly': '浏览器存储不可用；当前为仅会话模式。',
      'ai.knowledge.import': '导入 JSON、CSV、TXT 或 Markdown 知识文件',
      'ai.knowledge.importedCandidate': '已导入为待确认的非可信知识。',
      'ai.knowledge.importFailed': '知识导入失败',
      'ai.mapping.clarification': '该名称可能对应多个标准对象，请选择正确的产品或物料。',
      'ai.mapping.choose': '选择此对象',
      'ai.mapping.candidateCreated': '已保存为个人映射候选项，请在设置中确认后使用。',
      'ai.mapping.exportPromotion': '导出公司映射候选',
      'ai.marketplace.webConsent': '允许一次仅限 Amazon 的联网搜索（可能产生 OpenRouter 搜索费用）',
      'ai.proposal.title': '建议更改',
      'ai.proposal.noChanges': '未检测到更改。',
      'ai.proposal.type': '类型',
      'ai.proposal.code': '编码',
      'ai.proposal.field': '字段',
      'ai.proposal.before': '更改前',
      'ai.proposal.after': '更改后',
      'ai.proposal.reject': '拒绝',
      'ai.proposal.rejected': '已拒绝建议。',
      'ai.proposal.approve': '批准并应用到本地',
      'ai.proposal.approved': '已批准建议。',
      'ai.proposal.prepared': '我已准备好一个更改建议，请在下方审核。',
      'ai.proposal.applyError': '应用建议失败',
      'ai.proposal.applied': '建议已应用到本地工作区。请检查更改，然后单独点击保存。',
      'ai.message.fallback': 'AI 助手暂时不可用。请稍后再试。',
      'ai.message.error': '发生错误',
      'ai.error.budgetExceeded': '本轮模型重复调用过多，请重试或更换模型。',
      'ai.error.no_compatible_endpoint': '当前没有兼容的模型服务端点。请选择其他模型或稍后重试。',
      'ai.error.circuit_open': '近期请求过多，请稍候再试。',
      'ai.error.model_incompatible': '当前模型不支持所需功能，请选择其他模型。',
      'ai.error.policy_blocked': '请求被安全策略阻止。',
      'ai.error.rate_limited': '请求已达到速率限制，请稍候再试。',
      'ai.error.server_error': '模型服务发生错误，请稍后重试。',
      'ai.error.timeout': '请求超时，请重试。',
      'ai.error.provider_error': 'AI 助手暂时不可用，请稍后重试。',
      'ai.message.greetingResponse': '您好！有什么我可以帮您的？',
      'ai.workspace.greeting': '👋 您好！我是 JinTai PDM 的 AI 助手。\n\n请在下方输入您的问题，我随时准备为您提供帮助！🤩',
      'ai.sync.title': 'GitHub 技能与知识同步',
      'ai.sync.status': '同步状态',
      'ai.sync.refresh': '手动刷新',
      'ai.sync.rollback': '回滚',
      'ai.sync.synced': '已从 GitHub 同步',
      'ai.sync.cached': '使用本地缓存',
      'ai.sync.fallback': '使用内置默认版本',
      'ai.sync.error': '同步失败',
    },
    vi: {
      brand: 'Jintai BOM',
      brandTitle: 'Nội thất JinTai',
      brandSubtitle: 'Hệ thống PDM',
      developedBy: 'Developed by Du Tuan An',
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
      save: 'G\u1eedi thay \u0111\u1ed5i',
      viewChanges: 'Xem thay \u0111\u1ed5i',
      noChangesSummary: 'C\u00f3 thay \u0111\u1ed5i ch\u01b0a g\u1eedi, nh\u01b0ng kh\u00f4ng n\u1eb1m trong ph\u1ea7n t\u00f3m t\u1eaft',
      diffSummary: 'T\u00f3m t\u1eaft thay \u0111\u1ed5i (t\u1ed1i \u0111a 8 m\u1ee5c)',
      diffColType: 'Lo\u1ea1i',
      diffColCode: 'M\u00e3',
      diffColField: 'Tr\u01b0\u1eddng',
      diffColBefore: 'Tr\u01b0\u1edbc',
      diffColAfter: 'Sau',
      diffKindMaterial: 'Thu\u1ed9c t\u00ednh v\u1eadt li\u1ec7u',
      diffKindMaterialAdded: 'Th\u00eam v\u1eadt li\u1ec7u',
      diffKindMaterialDeleted: 'X\u00f3a v\u1eadt li\u1ec7u',
      diffKindBomAdded: 'Th\u00eam con v\u00e0o ph\u1ee5 huynh',
      diffKindBomDeleted: 'X\u00f3a con kh\u1ecfi ph\u1ee5 huynh',
      diffKindBomQty: '\u0110\u1ed5i s\u1ed1 l\u01b0\u1ee3ng',
      diffKindProductAdded: 'Th\u00eam s\u1ea3n ph\u1ea9m',
      reload: 'Tải lại',
      discard: 'Bỏ thay đổi',
      copy: 'Copy',

      exportExcel: 'Xuất Excel',
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
      addParentMaterial: 'Thêm vật liệu cha',
      addParentMaterialPrompt: 'Nhập mã hoặc tên vật liệu để biến thành cha',
      deleteParentStructure: 'Xóa kết cấu cha',
      deleteParentStructureConfirm: 'Bạn có chắc muốn xóa TẤT CẢ vật liệu con của mã cha này? Bản thân vật liệu cha vẫn sẽ được giữ lại trong CSDL, chỉ xóa kết cấu.',
      parentStructureDeleted: 'Đã xóa kết cấu cha',
      saveStructureDraft: 'Lưu kết cấu',
      assetsView: 'Bản vẽ / 3D',
      childCount: 'Vật liệu con',
      parentMaterial: 'Vật liệu cha',
      childMaterial: 'Vật liệu con',
      addChildMaterialPrompt: 'Nhập mã hoặc tên vật liệu con',
      childMaterialExists: 'Vật liệu con này đã tồn tại',
      assetSummary: 'Tài sản bản vẽ',
      materialDatabase: 'CSDL vật liệu',
      addChildMaterial: 'Thêm vật liệu con',
      openBom: 'Mở BOM',
      viewMaterial: 'Xem vật liệu',
      editMaterial: 'Sửa',
      materialMaster: 'Dữ liệu chủ vật liệu',
      backToMaterialList: 'Quay lại danh sách vật liệu',
      saveMaterial: 'Lưu vật liệu',
      materialSaved: 'Đã lưu vật liệu',
      deleteMaterial: 'Xóa vật liệu',
      deleteMaterialConfirm: 'Xóa vật liệu này?',
      materialDeleted: 'Đã xóa vật liệu',
      materialDeleteBlocked: 'Vật liệu đang được BOM sử dụng, không thể xóa',
      addMaterial: 'Thêm vật liệu',
      add2D: 'Thêm 2D',
      add3D: 'Thêm 3D',
      assetName: 'Tên hiển thị (không bắt buộc)',
      assetUrl: 'URL (bắt buộc)',
      openAsset: 'Mở',
      deleteAsset: 'Xóa',
      invalid2DUrl: '2D URL phải là HTTPS PDF hoặc Google Drive',
      invalid3DUrl: '3D URL phải là HTTPS GLB/GLTF trực tiếp',
      duplicateUrl: 'URL đã tồn tại',
      saveLocalOnly: 'Đã cập nhật local, hãy bấm [Lưu lên GitHub] để đồng bộ',
      materialId: 'MaterialID',
      materialCode: 'Mã vật liệu',
      materialName: 'Tên vật liệu',
      specification: 'Quy cách',
      materialComposition: 'Chất liệu',
      materialColor: 'Màu',
      materialAttribute: 'Thuộc tính',
      selectMaterial: 'Chọn vật liệu',
      searchPlaceholder: 'Tìm mã vật liệu, tên, quy cách...',
      selectBtn: 'Chọn',
      cancelBtn: 'Hủy',
      chinese: 'Tiếng Trung',
      vietnamese: 'Tiếng Việt',
      bomRelationships: 'Quan hệ BOM',
      productCatalogTitle: 'Sản phẩm LGS',
      productCatalogSubtitle: 'Quản lý quy cách, màu sắc, trạng thái và BOM theo SPU',
      spu: 'SPU',
      version: 'Phiên bản',
      status: 'Trạng thái',
      activeStatus: 'Đang dùng',
      disabledStatus: 'Cấm dùng',
      viewBom: 'Xem BOM',
      colorDots: 'Màu',
      productSpecifications: 'Thông số sản phẩm',
      billOfMaterials: 'Bill of Materials (BOM)',
      assemblyPreview: 'Xem lắp ráp',
      modelPreview: '3D lắp ráp',
      productImage: 'Ảnh sản phẩm',
      revision: 'Phiên bản',
      lastModified: 'Cập nhật',
      unit: 'Đơn vị',
      viewAssembly: 'Xem lắp ráp',
      export: 'Xuất',
      level: 'Cấp',
      partNumber: 'Mã vật liệu',
      componentNumber: 'Mã bộ phận',
      description: 'Tên gọi',
      items: 'mục',
      operation: 'Thao tác',
      view: 'Xem',
      yes: 'Có',
      no: 'Không',
      clearFilters: 'Xóa bộ lọc',
      has2D: 'Bản vẽ 2D',
      has3D: 'Mô hình 3D',
      download: 'Tải xuống',
      close: 'Đóng',
      'ai.title': 'Trợ lý AI',
      'ai.settings.title': 'Cài đặt AI',
      'ai.settings.connection': 'Kết nối',
      'ai.settings.privacy': 'Quyền riêng tư',
      'ai.settings.diagnostics': 'Chẩn đoán',
      'ai.settings.apiKey': 'Khóa API OpenRouter',
      'ai.settings.modelLabel': 'Chọn mô hình AI',
      'ai.settings.connect': 'Kết nối',
      'ai.settings.disconnect': 'Ngắt kết nối',
      'ai.settings.consentLabel': 'Cho phép chuyển sang mô hình trả phí',
      'ai.settings.statusConnected': 'Đã kết nối',
      'ai.settings.statusDisconnected': 'Chưa kết nối',
      'ai.workspace.placeholder': 'Nhập câu hỏi của bạn...',
      'ai.workspace.send': 'Gửi',
      'ai.workspace.clear': 'Xóa trò chuyện',
      'ai.workspace.close': 'Đóng',
      'ai.workspace.open': 'Mở Trợ lý AI',
      'ai.workspace.loading': 'AI đang nhập...',
      'ai.workspace.conversationLabel': 'Lịch sử trò chuyện',
      'ai.settings.keyNotPersisted': '⚠ Vì lý do bảo mật, khóa API chỉ được lưu trong bộ nhớ phiên hiện tại. Bạn cần kết nối lại sau khi tải lại trang.',
      'ai.memory.title': 'Bộ nhớ và kiến thức',
      'ai.memory.confirm': 'Xác nhận',
      'ai.memory.reject': 'Từ chối',
      'ai.memory.delete': 'Xóa',
      'ai.memory.export': 'Xuất bộ nhớ và audit',
      'ai.memory.persistent': 'Bộ nhớ được lưu trong trình duyệt này.',
      'ai.memory.sessionOnly': 'Không thể dùng lưu trữ trình duyệt; đang chạy ở chế độ chỉ trong phiên.',
      'ai.knowledge.import': 'Nhập file kiến thức JSON, CSV, TXT hoặc Markdown',
      'ai.knowledge.importedCandidate': 'Đã nhập dưới dạng kiến thức không tin cậy chờ xác nhận.',
      'ai.knowledge.importFailed': 'Nhập kiến thức thất bại',
      'ai.mapping.clarification': 'Tên này có thể khớp nhiều đối tượng chuẩn. Hãy chọn đúng sản phẩm hoặc vật liệu.',
      'ai.mapping.choose': 'Chọn đối tượng này',
      'ai.mapping.candidateCreated': 'Đã lưu dưới dạng mapping cá nhân chờ xác nhận. Hãy xác nhận trong Cài đặt trước khi dùng.',
      'ai.mapping.exportPromotion': 'Xuất ứng viên mapping công ty',
      'ai.marketplace.webConsent': 'Cho phép một lượt tìm kiếm web chỉ trên Amazon (có thể phát sinh phí tìm kiếm OpenRouter)',
      'ai.proposal.title': 'Đề xuất thay đổi',
      'ai.proposal.noChanges': 'Không phát hiện thay đổi.',
      'ai.proposal.type': 'Loại',
      'ai.proposal.code': 'Mã',
      'ai.proposal.field': 'Trường',
      'ai.proposal.before': 'Trước',
      'ai.proposal.after': 'Sau',
      'ai.proposal.reject': 'Từ chối',
      'ai.proposal.rejected': 'Đã từ chối đề xuất.',
      'ai.proposal.approve': 'Duyệt và áp dụng cục bộ',
      'ai.proposal.approved': 'Đã duyệt đề xuất.',
      'ai.proposal.prepared': 'Tôi đã chuẩn bị một đề xuất thay đổi. Vui lòng kiểm tra bên dưới.',
      'ai.proposal.applyError': 'Không thể áp dụng đề xuất',
      'ai.proposal.applied': 'Đề xuất đã được áp dụng vào workspace cục bộ. Hãy kiểm tra thay đổi rồi bấm Lưu riêng.',
      'ai.message.fallback': 'Trợ lý AI tạm thời không khả dụng. Vui lòng thử lại sau.',
      'ai.message.error': 'Đã xảy ra lỗi',
      'ai.error.budgetExceeded': 'Mô hình đã gọi lặp quá nhiều trong lượt này. Hãy thử lại hoặc đổi mô hình.',
      'ai.error.no_compatible_endpoint': 'Hiện không có endpoint model tương thích. Hãy chọn model khác hoặc thử lại sau.',
      'ai.error.circuit_open': 'Gần đây có quá nhiều yêu cầu. Vui lòng chờ một chút rồi thử lại.',
      'ai.error.model_incompatible': 'Model hiện tại không hỗ trợ tính năng cần thiết. Hãy chọn model khác.',
      'ai.error.policy_blocked': 'Yêu cầu đã bị chính sách bảo mật chặn.',
      'ai.error.rate_limited': 'Đã vượt giới hạn tốc độ. Vui lòng chờ rồi thử lại.',
      'ai.error.server_error': 'Dịch vụ model gặp lỗi. Vui lòng thử lại sau.',
      'ai.error.timeout': 'Yêu cầu đã hết thời gian chờ. Vui lòng thử lại.',
      'ai.error.provider_error': 'Trợ lý AI tạm thời không khả dụng. Vui lòng thử lại sau.',
      'ai.message.greetingResponse': 'Xin chào! Tôi có thể giúp gì cho bạn?',
      'ai.workspace.greeting': '👋 Xin chào! Tôi là Trợ lý AI của JinTai PDM.\n\nHãy nhập câu hỏi của bạn xuống bên dưới, tôi đã sẵn sàng hỗ trợ bạn bất cứ lúc nào! 🤩'
    }
  };

  Object.assign(TEXT.zh, {
    'ai.localFallback.notice': '模型服务暂时不可用，以下是本地 PDM 工具返回的确定结果：',
    'ai.localFallback.scope': '范围',
    'ai.localFallback.currentRevision': '当前版本',
    'ai.localFallback.effectiveRevision': '生效版本',
    'ai.localFallback.added': '新增',
    'ai.localFallback.removed': '删除',
    'ai.localFallback.modified': '修改',
    'ai.localFallback.matches': '匹配结果',
    'ai.localFallback.usedProducts': '使用产品',
    'ai.localFallback.recentChanges': '最近变更',
    'ai.localFallback.interpretation': '解析',
    'ai.localFallback.clarificationPrompt': '需要确认',
    'ai.localFallback.totalMatches': '总计/数量',
    'ai.localFallback.exactCommon': '完全相同',
    'ai.localFallback.probableCommon': '可能相同',
    'ai.localFallback.dataQualityWarnings': '数据质量警告',
    'ai.localFallback.onlyProduct': '仅',
    'ai.localFallback.clarifyComponent': '\u672a\u80fd\u4ece\u95ee\u9898\u4e2d\u786e\u5b9a\u5177\u4f53\u96f6\u90e8\u4ef6\u3002\u8bf7\u8bf4\u660e\u8981\u67e5\u8be2\u7684\u96f6\u4ef6\u7c7b\u522b\u3001\u540d\u79f0\u3001\u89c4\u683c\u3001\u989c\u8272\u6216\u7528\u9014\u3002',
    'ai.localFallback.noScopedData': '\u5f53\u524d\u4ea7\u54c1\u8303\u56f4\u5185\u6ca1\u6709\u53ef\u68c0\u7d22\u7684 BOM \u6570\u636e\u3002\u8bf7\u786e\u8ba4\u4ea7\u54c1\u3001\u989c\u8272\u6216\u7248\u672c\u3002',
    'ai.localFallback.mappingConflict': '\u5df2\u627e\u5230\u53ef\u80fd\u7684\u540d\u79f0\u6620\u5c04\uff0c\u4f46\u6620\u5c04\u7684\u7269\u6599\u4e0d\u5728\u5f53\u524d\u4ea7\u54c1 BOM \u4e2d\u3002\u8bf7\u786e\u8ba4\u96f6\u4ef6\u540d\u79f0\u3001\u4ea7\u54c1\u6216\u7248\u672c\u3002',
    'ai.localFallback.attributeConflict': 'BOM 属性存在冲突，需人工核对',
    'ai.localFallback.confirmProduct': '您的意思是',
    'ai.localFallback.noExactDimension': '未找到精确尺寸',
    'ai.localFallback.nearDimensions': '接近尺寸',
    'ai.localFallback.choosePartsMetric': '请确认要按“唯一物料种类”还是“BOM 总用量”排名。',
    'ai.localFallback.materialTypes': '种物料',
    'ai.localFallback.totalQuantity': '总用量',
    'ai.localFallback.colorNotDefined': '该颜色版本未在当前产品中定义',
    'ai.localFallback.availableColors': '现有颜色',
    'ai.intent.clarification': '\u6211\u8fd8\u4e0d\u80fd\u786e\u5b9a\u60a8\u8981\u67e5\u8be2\u4ea7\u54c1\u3001BOM\u3001\u7269\u6599\u8fd8\u662f\u7248\u672c\u3002\u8bf7\u8865\u5145\u4ea7\u54c1\u7f16\u53f7\u3001\u89c4\u683c\u6216\u8981\u6bd4\u8f83\u7684\u5bf9\u8c61\u3002',
    'ai.intent.recognized': '\u5df2\u8bc6\u522b',
    'ai.trace.title': '\u8fd0\u884c\u8ffd\u8e2a',
    'ai.trace.empty': '\u6682\u65e0 AI \u8fd0\u884c\u8ffd\u8e2a\u3002',
    'ai.trace.events': '\u4e8b\u4ef6',
    'ai.trace.copy': '\u590d\u5236\u8ffd\u8e2a',
    'ai.trace.copied': '\u5df2\u590d\u5236',
    productBom: '产品 BOM',
    paginationTotal: '共',
    paginationItems: '条',
    paginationGoTo: '前往',
    paginationPage: '页',
    required: '必填',
    sharedScope: '通用',
    attrPart: '零件',
    attrHardware: '五金包',
    attrPackaging: '包材',
    notifications: '通知',
    notificationEmpty: '暂无通知',
    notificationMarkRead: '全部已读',
    notificationGithubSaveTitle: 'GitHub 数据已更新',
    notificationGithubSaveBody: 'Admin 已保存 BOM/物料数据，Viewer 可同步最新版本。',
    notificationChangedItems: '已修改',
    notificationMaterialAdded: '新增物料',
    notificationMaterialDeleted: '删除物料',
    notificationBomAdded: '新增 BOM 行',
    notificationBomDeleted: '删除 BOM 行',
    notificationBomQtyChanged: '更改数量',
    notificationProductAdded: '新增产品',
    notificationUpdatedTitle: 'PDM 数据已更新',
    notificationUpdatedBody: '检测到新的 PDM 数据版本。',
    notificationUnread: '未读通知',
    addProduct: '新增产品',
    addProductPromptCode: '产品编码',
    addProductPromptCodePlaceholder: '例: LGS999',
    addProductPromptName: '产品名称 (中文)',
    addProductPromptNameVi: '产品名称 (越文)',
    addProductPromptSize: '尺寸',
    addProductPromptSku: '默认 SKU',
    addProductPromptSkuPlaceholder: '例: LGS999K101S',
    addProductPromptColor: '默认颜色 (中文)',
    addProductPromptColorVi: '默认颜色 (越文)',
    productCodeExists: '该产品编码已存在',
    productAdded: '产品已创建',
    confirmBtn: '确认',
    deleteBomRowConfirm: '删除这行 BOM？',
    addBomRow: '添加物料',
    editRow: '编辑行',
    bomCompCode: '部件编号',
    bomQty: '数量',
    createRevision: '新建版本',
    currentRevision: '当前版本',
    newRevision: '新版本',
    changeReason: '变更原因',
    revisionCreated: '新版本已创建',
    revisionExists: '版本已存在',
    revisionCreateFailed: '新建版本失败',
    revisionDirtyBlocked: '请先保存或放弃当前更改',
    historicalRevisionReadOnly: '历史版本只读',
    releasedRevisionReadOnly: '\u5df2\u53d1\u5e03\u7248\u672c\u53ea\u8bfb',
    draftStatus: '\u8349\u7a3f',
    releasedStatus: '\u5df2\u53d1\u5e03',
    revisionSource: '\u7248\u672c\u6765\u6e90',
    revisionCreatedAt: '\u521b\u5efa\u65f6\u95f4',
    effectiveStatus: '\u4f7f\u7528\u4e2d',
    nonCurrentStatus: '\u975e\u73b0\u884c',
    effectiveRevision: '\u4f7f\u7528\u4e2d\u7248\u672c',
    releaseRevision: '\u53d1\u5e03\u7248\u672c',
    releaseRevisionReason: '\u53d1\u5e03\u539f\u56e0',
    withdrawRevision: '\u64a4\u9500\u53d1\u5e03',
    withdrawReasonPrompt: '\u64a4\u9500\u53d1\u5e03\u539f\u56e0',
    revisionWithdrawn: '\u5df2\u64a4\u9500\u53d1\u5e03\uff0c\u8bf7\u4fdd\u5b58\u66f4\u6539',
    revisionWithdrawReasonRequired: '\u8bf7\u8f93\u5165\u64a4\u9500\u53d1\u5e03\u539f\u56e0',
    revisionWithdrawCurrentOnly: '\u53ea\u80fd\u64a4\u9500\u6700\u65b0\u7248\u672c',
    revisionWithdrawReleasedOnly: '\u53ea\u80fd\u64a4\u9500\u5df2\u53d1\u5e03\u7248\u672c',
    revisionWithdrawFailed: '\u64a4\u9500\u53d1\u5e03\u5931\u8d25',
    revisionReleased: '\u7248\u672c\u5df2\u53d1\u5e03',
    revisionReleaseDirtyBlocked: '\u8bf7\u5148\u4fdd\u5b58\u6216\u653e\u5f03\u5f53\u524d\u66f4\u6539',
    revisionReleaseReasonRequired: '\u8bf7\u8f93\u5165\u53d1\u5e03\u539f\u56e0',
    revisionReleaseCurrentOnly: '\u53ea\u80fd\u53d1\u5e03\u6700\u65b0\u7248\u672c',
    revisionReleaseDraftOnly: '\u53ea\u80fd\u53d1\u5e03\u8349\u7a3f\u7248\u672c',
    revisionReleaseFailed: '\u53d1\u5e03\u7248\u672c\u5931\u8d25',
    uploadAsset: '\u4e0a\u4f20\u6587\u4ef6',
    replaceAsset: '\u66ff\u6362\u6587\u4ef6',
    selectExistingAsset: '\u9009\u62e9\u5df2\u6709',
    selectExisting2D: '\u9009\u62e9\u5176\u4ed6\u7269\u6599\u7684 2D \u56fe\u7eb8',
    selectExisting3D: '\u9009\u62e9\u5176\u4ed6\u7269\u6599\u7684 3D \u6a21\u578b',
    noReusableAssets: '\u6ca1\u6709\u53ef\u590d\u7528\u7684\u5176\u4ed6\u7269\u6599\u6587\u4ef6',
    assetReused: '\u5df2\u9009\u62e9\u5df2\u6709\u6587\u4ef6\uff0c\u8bf7\u4fdd\u5b58\u7269\u6599',
    assetUploaded: '\u6587\u4ef6\u5df2\u4e0a\u4f20\u5230 GitHub\uff0c\u8bf7\u4fdd\u5b58\u7269\u6599',
    assetTokenRequired: '\u8bf7\u5148\u8fde\u63a5 GitHub \u518d\u4e0a\u4f20\u6587\u4ef6',
    assetPendingUpload: '\u5f85\u4e0a\u4f20',
    assetFileQueued: '\u6587\u4ef6\u5df2\u52a0\u5165\u5f85\u4e0a\u4f20\u961f\u5217',
    invalidAssetFile: '\u6587\u4ef6\u683c\u5f0f\u65e0\u6548',
    assetFileTooLarge: '\u6587\u4ef6\u4e0d\u5f97\u8d85\u8fc7 20 MB',
    invalidPdfFile: '\u65e0\u6548\u7684 PDF \u6587\u4ef6',
    invalidGlbFile: '\u65e0\u6548\u7684 GLB \u6587\u4ef6',
    invalidGltfFile: '\u65e0\u6548\u7684 GLTF \u6587\u4ef6\u6216\u5305\u542b\u975e HTTPS \u5916\u90e8\u8d44\u6e90',
    pendingAssetMissing: '\u5f85\u4e0a\u4f20\u6587\u4ef6\u5df2\u4e22\u5931\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9',
    uploadingAssets: '\u6b63\u5728\u4e0a\u4f20 2D/3D \u6587\u4ef6...',
    assetUploadFailed: '\u6587\u4ef6\u4e0a\u4f20\u5931\u8d25'
  });

  Object.assign(TEXT.vi, {
    'ai.localFallback.notice': 'Dịch vụ model tạm thời không khả dụng; dưới đây là kết quả xác định từ công cụ PDM cục bộ:',
    'ai.localFallback.scope': 'Phạm vi',
    'ai.localFallback.currentRevision': 'Phiên bản hiện tại',
    'ai.localFallback.effectiveRevision': 'Phiên bản đang hiệu lực',
    'ai.localFallback.added': 'Thêm',
    'ai.localFallback.removed': 'Xóa',
    'ai.localFallback.modified': 'Sửa đổi',
    'ai.localFallback.matches': 'Kết quả khớp',
    'ai.localFallback.usedProducts': 'Sản phẩm sử dụng',
    'ai.localFallback.recentChanges': 'Thay đổi gần đây',
    'ai.localFallback.interpretation': 'Giải thích',
    'ai.localFallback.clarificationPrompt': 'Cần xác nhận',
    'ai.localFallback.totalMatches': 'Tổng số/Số lượng',
    'ai.localFallback.exactCommon': 'Khớp hoàn toàn',
    'ai.localFallback.probableCommon': 'Có khả năng trùng',
    'ai.localFallback.dataQualityWarnings': 'Cảnh báo chất lượng dữ liệu',
    'ai.localFallback.onlyProduct': 'Chỉ có ở',
    'ai.localFallback.clarifyComponent': 'Ch\u01b0a x\u00e1c \u0111\u1ecbnh \u0111\u01b0\u1ee3c linh ki\u1ec7n c\u1ee5 th\u1ec3 t\u1eeb c\u00e2u h\u1ecfi. Vui l\u00f2ng cho bi\u1ebft lo\u1ea1i, t\u00ean, quy c\u00e1ch, m\u00e0u ho\u1eb7c c\u00f4ng d\u1ee5ng c\u1ee7a linh ki\u1ec7n c\u1ea7n t\u00ecm.',
    'ai.localFallback.noScopedData': 'Kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u BOM c\u00f3 th\u1ec3 t\u00ecm ki\u1ebfm trong ph\u1ea1m vi s\u1ea3n ph\u1ea9m hi\u1ec7n t\u1ea1i. Vui l\u00f2ng x\u00e1c nh\u1eadn s\u1ea3n ph\u1ea9m, m\u00e0u ho\u1eb7c phi\u00ean b\u1ea3n.',
    'ai.localFallback.mappingConflict': '\u0110\u00e3 t\u00ecm th\u1ea5y mapping t\u00ean c\u00f3 th\u1ec3 ph\u00f9 h\u1ee3p, nh\u01b0ng v\u1eadt li\u1ec7u \u0111\u01b0\u1ee3c mapping kh\u00f4ng thu\u1ed9c BOM s\u1ea3n ph\u1ea9m hi\u1ec7n t\u1ea1i. Vui l\u00f2ng x\u00e1c nh\u1eadn t\u00ean linh ki\u1ec7n, s\u1ea3n ph\u1ea9m ho\u1eb7c phi\u00ean b\u1ea3n.',
    'ai.localFallback.attributeConflict': 'thuộc tính BOM xung đột, cần kiểm tra thủ công',
    'ai.localFallback.confirmProduct': 'Ý của bạn là',
    'ai.localFallback.noExactDimension': 'Không tìm thấy kích thước chính xác',
    'ai.localFallback.nearDimensions': 'Kích thước gần nhất',
    'ai.localFallback.choosePartsMetric': 'Vui lòng chọn xếp hạng theo số loại vật liệu duy nhất hoặc tổng số lượng BOM.',
    'ai.localFallback.materialTypes': 'loại vật liệu',
    'ai.localFallback.totalQuantity': 'tổng số lượng',
    'ai.localFallback.colorNotDefined': 'biến thể màu này chưa được định nghĩa cho sản phẩm hiện tại',
    'ai.localFallback.availableColors': 'Màu hiện có',
    'ai.intent.clarification': 'T\u00f4i ch\u01b0a x\u00e1c \u0111\u1ecbnh b\u1ea1n mu\u1ed1n tra c\u1ee9u s\u1ea3n ph\u1ea9m, BOM, v\u1eadt li\u1ec7u hay phi\u00ean b\u1ea3n. H\u00e3y b\u1ed5 sung m\u00e3 s\u1ea3n ph\u1ea9m, quy c\u00e1ch ho\u1eb7c c\u00e1c \u0111\u1ed1i t\u01b0\u1ee3ng c\u1ea7n so s\u00e1nh.',
    'ai.intent.recognized': '\u0110\u00e3 nh\u1eadn di\u1ec7n',
    'ai.trace.title': 'Nh\u1eadt k\u00fd v\u1eadn h\u00e0nh',
    'ai.trace.empty': 'Ch\u01b0a c\u00f3 nh\u1eadt k\u00fd v\u1eadn h\u00e0nh AI.',
    'ai.trace.events': 'S\u1ef1 ki\u1ec7n',
    'ai.trace.copy': 'Sao ch\u00e9p nh\u1eadt k\u00fd',
    'ai.trace.copied': '\u0110\u00e3 sao ch\u00e9p',
    productBom: 'BOM sản phẩm',
    paginationTotal: 'Tổng',
    paginationItems: 'mục',
    paginationGoTo: 'Đến',
    paginationPage: 'trang',
    required: 'Bắt buộc',
    sharedScope: 'Dùng chung',
    attrPart: 'Linh kiện',
    attrHardware: 'Túi ngũ kim',
    attrPackaging: 'Bao bì',
    notifications: 'Thông báo',
    notificationEmpty: 'Chưa có thông báo',
    notificationMarkRead: 'Đã đọc tất cả',
    notificationGithubSaveTitle: 'Dữ liệu GitHub đã cập nhật',
    notificationGithubSaveBody: 'Admin đã lưu dữ liệu BOM/vật liệu, Viewer có thể đồng bộ bản mới nhất.',
    notificationChangedItems: 'Đã sửa',
    notificationMaterialAdded: 'Thêm vật tư mới',
    notificationMaterialDeleted: 'Xóa vật tư',
    notificationBomAdded: 'Thêm dòng BOM',
    notificationBomDeleted: 'Xóa dòng BOM',
    notificationBomQtyChanged: 'Đổi số lượng',
    notificationProductAdded: 'Thêm sản phẩm',
    notificationUpdatedTitle: 'Dữ liệu PDM đã cập nhật',
    notificationUpdatedBody: 'Phát hiện phiên bản dữ liệu PDM mới.',
    notificationUnread: 'Thông báo chưa đọc',
    addProduct: 'Thêm sản phẩm',
    addProductPromptCode: 'Mã sản phẩm',
    addProductPromptCodePlaceholder: 'Ví dụ: LGS999',
    addProductPromptName: 'Tên sản phẩm (tiếng Trung)',
    addProductPromptNameVi: 'Tên sản phẩm (tiếng Việt)',
    addProductPromptSize: 'Kích thước',
    addProductPromptSku: 'SKU mặc định',
    addProductPromptSkuPlaceholder: 'Ví dụ: LGS999K101S',
    addProductPromptColor: 'Màu mặc định (tiếng Trung)',
    addProductPromptColorVi: 'Màu mặc định (tiếng Việt)',
    productCodeExists: 'Mã sản phẩm đã tồn tại',
    productAdded: 'Đã tạo sản phẩm',
    confirmBtn: 'Xác nhận',
    deleteBomRowConfirm: 'Xóa dòng BOM này?',
    addBomRow: 'Thêm vật liệu',
    editRow: 'Sửa dòng',
    bomCompCode: 'Mã linh kiện',
    bomQty: 'Số lượng',
    createRevision: 'Tạo phiên bản',
    currentRevision: 'Phiên bản hiện tại',
    newRevision: 'Phiên bản mới',
    changeReason: 'Lý do thay đổi',
    revisionCreated: 'Đã tạo phiên bản mới',
    revisionExists: 'Phiên bản đã tồn tại',
    revisionCreateFailed: 'Không thể tạo phiên bản',
    revisionDirtyBlocked: 'Hãy lưu hoặc bỏ các thay đổi hiện tại trước',
    historicalRevisionReadOnly: 'Phiên bản cũ chỉ đọc',
    releasedRevisionReadOnly: 'Phi\u00ean b\u1ea3n \u0111\u00e3 ph\u00e1t h\u00e0nh ch\u1ec9 \u0111\u1ecdc',
    draftStatus: 'B\u1ea3n nh\u00e1p',
    releasedStatus: '\u0110\u00e3 ph\u00e1t h\u00e0nh',
    revisionSource: 'Ngu\u1ed3n phi\u00ean b\u1ea3n',
    revisionCreatedAt: 'Th\u1eddi gian t\u1ea1o',
    effectiveStatus: '\u0110ang s\u1eed d\u1ee5ng',
    nonCurrentStatus: 'Kh\u00f4ng hi\u1ec7n h\u00e0nh',
    effectiveRevision: 'Phi\u00ean b\u1ea3n s\u1eed d\u1ee5ng',
    releaseRevision: 'Ph\u00e1t h\u00e0nh phi\u00ean b\u1ea3n',
    releaseRevisionReason: 'L\u00fd do ph\u00e1t h\u00e0nh',
    withdrawRevision: 'T\u1ea1m ng\u01b0ng ph\u00e1t h\u00e0nh',
    withdrawReasonPrompt: 'L\u00fd do t\u1ea1m ng\u01b0ng',
    revisionWithdrawn: '\u0110\u00e3 t\u1ea1m ng\u01b0ng ph\u00e1t h\u00e0nh, h\u00e3y l\u01b0u thay \u0111\u1ed5i',
    revisionWithdrawReasonRequired: 'H\u00e3y nh\u1eadp l\u00fd do t\u1ea1m ng\u01b0ng',
    revisionWithdrawCurrentOnly: 'Ch\u1ec9 c\u00f3 th\u1ec3 t\u1ea1m ng\u01b0ng phi\u00ean b\u1ea3n m\u1edbi nh\u1ea5t',
    revisionWithdrawReleasedOnly: 'Ch\u1ec9 c\u00f3 th\u1ec3 t\u1ea1m ng\u01b0ng phi\u00ean b\u1ea3n \u0111\u00e3 ph\u00e1t h\u00e0nh',
    revisionWithdrawFailed: 'Kh\u00f4ng th\u1ec3 t\u1ea1m ng\u01b0ng ph\u00e1t h\u00e0nh',
    revisionReleased: '\u0110\u00e3 ph\u00e1t h\u00e0nh phi\u00ean b\u1ea3n',
    revisionReleaseDirtyBlocked: 'H\u00e3y l\u01b0u ho\u1eb7c b\u1ecf c\u00e1c thay \u0111\u1ed5i hi\u1ec7n t\u1ea1i tr\u01b0\u1edbc',
    revisionReleaseReasonRequired: 'H\u00e3y nh\u1eadp l\u00fd do ph\u00e1t h\u00e0nh',
    revisionReleaseCurrentOnly: 'Ch\u1ec9 c\u00f3 th\u1ec3 ph\u00e1t h\u00e0nh phi\u00ean b\u1ea3n m\u1edbi nh\u1ea5t',
    revisionReleaseDraftOnly: 'Ch\u1ec9 c\u00f3 th\u1ec3 ph\u00e1t h\u00e0nh b\u1ea3n nh\u00e1p',
    revisionReleaseFailed: 'Kh\u00f4ng th\u1ec3 ph\u00e1t h\u00e0nh phi\u00ean b\u1ea3n',
    uploadAsset: 'T\u1ea3i t\u1ec7p l\u00ean',
    replaceAsset: 'Thay th\u1ebf t\u1ec7p',
    selectExistingAsset: 'Ch\u1ecdn t\u1ec7p c\u00f3 s\u1eb5n',
    selectExisting2D: 'Ch\u1ecdn b\u1ea3n v\u1ebd 2D c\u1ee7a v\u1eadt li\u1ec7u kh\u00e1c',
    selectExisting3D: 'Ch\u1ecdn m\u00f4 h\u00ecnh 3D c\u1ee7a v\u1eadt li\u1ec7u kh\u00e1c',
    noReusableAssets: 'Kh\u00f4ng c\u00f3 t\u1ec7p c\u1ee7a v\u1eadt li\u1ec7u kh\u00e1c \u0111\u1ec3 t\u00e1i s\u1eed d\u1ee5ng',
    assetReused: '\u0110\u00e3 ch\u1ecdn t\u1ec7p c\u00f3 s\u1eb5n, h\u00e3y l\u01b0u v\u1eadt li\u1ec7u',
    assetUploaded: 'T\u1ec7p \u0111\u00e3 \u0111\u01b0\u1ee3c t\u1ea3i l\u00ean GitHub, h\u00e3y l\u01b0u v\u1eadt li\u1ec7u',
    assetTokenRequired: 'H\u00e3y k\u1ebft n\u1ed1i GitHub tr\u01b0\u1edbc khi t\u1ea3i t\u1ec7p l\u00ean',
    assetPendingUpload: 'Ch\u1edd t\u1ea3i l\u00ean',
    assetFileQueued: 'T\u1ec7p \u0111\u00e3 \u0111\u01b0\u1ee3c th\u00eam v\u00e0o h\u00e0ng \u0111\u1ee3i',
    invalidAssetFile: 'T\u1ec7p kh\u00f4ng h\u1ee3p l\u1ec7',
    assetFileTooLarge: 'T\u1ec7p kh\u00f4ng \u0111\u01b0\u1ee3c v\u01b0\u1ee3t qu\u00e1 20 MB',
    invalidPdfFile: 'T\u1ec7p PDF kh\u00f4ng h\u1ee3p l\u1ec7',
    invalidGlbFile: 'T\u1ec7p GLB kh\u00f4ng h\u1ee3p l\u1ec7',
    invalidGltfFile: 'T\u1ec7p GLTF kh\u00f4ng h\u1ee3p l\u1ec7 ho\u1eb7c c\u00f3 t\u00e0i nguy\u00ean ngo\u00e0i kh\u00f4ng d\u00f9ng HTTPS',
    pendingAssetMissing: 'T\u1ec7p ch\u1edd t\u1ea3i l\u00ean \u0111\u00e3 b\u1ecb m\u1ea5t, h\u00e3y ch\u1ecdn l\u1ea1i',
    uploadingAssets: '\u0110ang t\u1ea3i t\u1ec7p 2D/3D l\u00ean...',
    assetUploadFailed: 'T\u1ea3i t\u1ec7p l\u00ean th\u1ea5t b\u1ea1i'
  });

  const EDIT_FIELDS = ['mat_code', 'comp_code', 'name', 'spec', 'material', 'color', 'attr', 'qty'];

  function describePayloadChanges(previousPayload, nextPayload) {
    return describeNormalizedPayloadChanges(
      normalizePayload(previousPayload),
      normalizePayload(nextPayload),
    );
  }

  function appendNotificationEvent(payload, event) {
    return appendNormalizedNotificationEvent(normalizePayload(payload), event);
  }



  function emptyInitialPayload() {
    return normalizePayload({});
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
      this.githubData = options.githubData || createGithubShardedDataAdapter({ config: this.config, writerFactory: createGithubGitDataWriter });
      this.githubAssetStorage = options.githubAssetStorage
        || (this.mode === 'admin' ? createGithubAssetStorageAdapter({ config: ASSET_STORAGE_CONFIG }) : null);
      this.materialAssetUploadVersions = new Map();
      this.notificationToastTimer = null;
      this.state = this.initialState();
    }

    initialState() {
      const payload = emptyInitialPayload();
      return {
        lang: 'zh',
        payload,
        bom: payload.bom,
        drawings: payload.drawings,
        manuals: payload.manuals,
        models3d: payload.models3d,
        productImages: payload.productImages,
        materialDb: payload.materialDb,
        materialDraft: null,
        pendingMaterialAssets: {},
        loadedPayload: clone(payload),
        currentSku: '',
        currentColor: '',
        selectedRevision: '',
        bomDetailOpen: false,
        currentAttr: 'all',
        selectedMaterialId: '',
        selectedEntryId: '',
        selectedParentId: '',
        adminView: 'bom',
        dbFilters: { attr: 'all', material: 'all', color: 'all', has2D: 'all', has3D: 'all' },
        searchQuery: '',
        sidebarQuery: '',
        replaceQuery: '',
        sortCol: 'attr',
        sortAsc: true,
        editMode: false,
        dirty: false,
        lastRows: [],
        lastLoadAt: '',
        notificationOpen: false,
        notificationToast: null
      };
    }

    start() {
      if (!global.document) return;
      this.pickFirstProduct();
      this.ensureInspectorPanel();
      this.bindEvents();
      this.renderAll();
      this.loadCloud({ silent: true });
      global.setInterval(() => this.loadCloud({ silent: true }), this.isAdmin() ? REFRESH_MS : NOTIFICATION_REFRESH_MS);

      // R2.4 AI Integration (safe init)
      try {
        this._initAiAssistant();
      } catch (err) {
        console.warn('AI Assistant initialization failed (Core PDM continues):', err);
      }
    }

    _initAiAssistant() {
      // Clean up previous event listeners if re-initializing
      if (this.aiFeature && typeof this.aiFeature.destroy === 'function') {
        this.aiFeature.destroy();
      }
      if (this._handleAiDocClick) {
        document.removeEventListener('click', this._handleAiDocClick);
      }
      if (this._handleAiKeydown) {
        document.removeEventListener('keydown', this._handleAiKeydown);
      }

      if (this._handleAiFabClick) {
        this.query('#aiFab')?.removeEventListener('click', this._handleAiFabClick);
      }
      if (this._handleAiDrawerCloseClick) {
        this.query('#aiDrawerClose')?.removeEventListener('click', this._handleAiDrawerCloseClick);
      }

      this.aiLocalStore ||= createLocalAiStore();
      this.memoryManager ||= createMemoryManager({ localStore: this.aiLocalStore });
      this.aiFeature = createAiAssistantFeature({
        getSnapshot: () => this.getSnapshot(),
        t: (key) => this.label(key),
        localStore: this.aiLocalStore,
        runTool: async (call, snapshot) => {
          if (call.name === 'apply_mutation') {
            try {
              const { payload, changes } = applyMutationTransaction(snapshot, call.arguments);
            
            // Render the proposal directly into the chat and pause execution
            this.aiFeature.ui.renderMessage({
              role: 'assistant',
              text: this.label('ai.proposal.prepared') || 'Proposal prepared for review.',
              proposal: call.arguments,
              approval: { mutation: call.arguments, payload, changes },
              diff: changes,
              onApprove: (approvalState) => {
                try {
                  this.applyAiMutation({
                     mutation: approvalState.mutation,
                     changes: approvalState.changes,
                     payload: approvalState.payload,
                     sourceCommit: snapshot.sourceMetadata?.commitSha
                  });
                } catch (e) {
                  this.aiFeature.ui.renderMessage({ role: 'assistant', text: this.label('ai.proposal.applyError') || 'Error applying proposal' });
                }
              }
            });

            return 'Mutation presented to user for review. Stop using tools and wait for authorization.';
            } catch (error) {
              throw error;
            }
          }

          if (call.name === 'store_memory') {
            try {
              const res = this.memoryManager.storeMemory(call.arguments.key, call.arguments.value, snapshot);
              this.memoryManager.decayMemories();
              return res;
            } catch (err) {
              return { error: err.message };
            }
          }
          if (call.name === 'retrieve_memory') {
            return this.memoryManager.retrieveMemory(call.arguments.key, snapshot);
          }
          if (call.name === 'get_marketplace_insights') {
            const productCode = call.arguments.productId;
            return {
              ...getMarketplaceInsights({ productCode, evidence: [] }),
              webSearchRequest: validateMarketplaceSearch({
                domain: 'amazon.com',
                query: `${productCode} Amazon product reviews customer feedback`,
                maxResults: 5,
              }),
            };
          }

          const discovery = new PdmDiscovery(snapshot);
          const discoveryMethodName = call.name.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
          if (typeof discovery[discoveryMethodName] === 'function') {
            return discovery[discoveryMethodName](call.arguments);
          }

          const knowledge = new PdmKnowledge(snapshot, { aliasMap: CONFIRMED_MARKETPLACE_ALIASES });
          const methodName = call.name.replace(/_([a-z])/g, g => g[1].toUpperCase());
          if (typeof knowledge[methodName] === 'function') {
            return knowledge[methodName](call.arguments);
          }
          throw new Error('Tool not implemented locally: ' + call.name);
        }
      });

      const chatWidgetContent = this.query('#aiDrawerContent');
      const settingsModalContent = this.query('#settingsModalContent');
      if (chatWidgetContent) {
        chatWidgetContent.replaceChildren(this.aiFeature.ui.workspaceElement);
      }
      if (settingsModalContent) {
        settingsModalContent.replaceChildren(this.aiFeature.ui.settingsElement);
      }

      const chatWidget = this.query('#aiChatWidget');
      const aiFab = this.query('#aiFab');

      const toggleChat = (open) => {
        if (!chatWidget) return;
        const isOpen = open !== undefined ? open : !chatWidget.classList.contains('is-open');
        if (isOpen) {
          chatWidget.classList.add('is-open');
          aiFab?.classList.add('is-hidden');
          chatWidget.setAttribute('aria-modal', 'true');
          const firstFocusable = chatWidget.querySelector('textarea, button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
          if (firstFocusable) firstFocusable.focus();
        } else {
          chatWidget.classList.remove('is-open');
          aiFab?.classList.remove('is-hidden');
          chatWidget.removeAttribute('aria-modal');
          aiFab?.focus();
        }
      };

      this._handleAiFabClick = (e) => {
        e.stopPropagation();
        toggleChat();
      };
      aiFab?.addEventListener('click', this._handleAiFabClick);

      this._handleAiDrawerCloseClick = () => {
        toggleChat(false);
      };
      this.query('#aiDrawerClose')?.addEventListener('click', this._handleAiDrawerCloseClick);

      this._handleAiDocClick = (e) => {
        if (chatWidget && chatWidget.classList.contains('is-open') && !chatWidget.contains(e.target) && !aiFab.contains(e.target)) {
          toggleChat(false);
        }
      };
      document.addEventListener('click', this._handleAiDocClick);

      this._handleAiKeydown = (e) => {
        if (!chatWidget || !chatWidget.classList.contains('is-open')) return;

        if (e.key === 'Escape') {
          toggleChat(false);
          return;
        }

        if (e.key === 'Tab') {
          const focusables = [...chatWidget.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      document.addEventListener('keydown', this._handleAiKeydown);

      this.query('#btnSettings')?.addEventListener('click', () => {
        settingsModal.setAttribute('aria-hidden', 'false');
        settingsModal.classList.add('open');
      });
      this.query('#closeSettingsModal')?.addEventListener('click', () => {
        settingsModal.setAttribute('aria-hidden', 'true');
        settingsModal.classList.remove('open');
      });
    }

    applyAiMutation({ mutation, changes, payload, sourceCommit }) {
      const evt = {
        type: 'ai-mutation',
        actor: 'ai',
        changes: changes,
        sourceCommit: sourceCommit,
        operationType: mutation.operationType,
        targetId: mutation.targetId,
        createdAt: new Date().toISOString(),
      };
      this.state.payload = appendNormalizedNotificationEvent(payload, evt);

      // Update references
      this.state.bom = this.state.payload.bom;
      this.state.drawings = this.state.payload.drawings;
      this.state.manuals = this.state.payload.manuals;
      this.state.models3d = this.state.payload.models3d;
      this.state.productImages = this.state.payload.productImages;
      this.state.materialDb = this.state.payload.materialDb;

      this.markDirty();
      this.renderAll();

      this.aiFeature.ui.renderMessage({ role: 'assistant', text: this.label('ai.proposal.applied') || 'Local draft mutated successfully.' });
    }

    getSnapshot() {
        const currentView = this.state.adminView === 'bom' && !this.state.bomDetailOpen ? 'ProductList'
                     : this.state.adminView === 'bom' && this.state.bomDetailOpen ? 'BomDetail'
                     : this.state.adminView === 'materials' ? 'MaterialDatabase'
                     : this.state.adminView === 'structure' ? 'ParentChildStructure'
                     : this.state.adminView;
        return {
          isAdmin: this.isAdmin(),
          canEditRevision: this.canEditProductRevision(),
          dirty: this.state.dirty,
          payload: clone(this.state.payload),
          sourceMetadata: this.githubData.getSourceMetadata ? this.githubData.getSourceMetadata() : null,
          selection: {
            currentView,
            productCode: currentView !== 'ProductList' ? this.state.currentSku : null,
            color: currentView !== 'ProductList' ? this.state.currentColor : null,
            revision: currentView !== 'ProductList' ? this.selectedProductRevision() : null,
            materialId: this.state.selectedMaterialId
          },
          lang: this.state.lang
        };
    }

    label(key) {
      return (TEXT[this.state.lang] && TEXT[this.state.lang][key]) || TEXT.zh[key] || key;
    }

    dataSourceUrl() {
      const clean = normalizeConfig(this.config);
      return `https://github.com/${encodeURIComponent(clean.owner)}/${encodeURIComponent(clean.repo)}/tree/${encodeURIComponent(clean.branch)}/bom-viewer-sync/data`;
    }

    isAdmin() {
      return this.mode === 'admin';
    }

    productRevisionOptions(productCode) {
      return revisionOptionsForProduct(this.state.payload, productCode || this.state.currentSku);
    }

    selectedProductRevision(productCode) {
      const code = productCode || this.state.currentSku;
      const options = this.productRevisionOptions(code);
      const selected = code === this.state.currentSku ? this.state.selectedRevision : '';
      return options.some((item) => item.revision === selected)
        ? selected
        : (options[0]?.revision || 'V1');
    }

    selectedProductRevisionInfo(productCode) {
      const code = productCode || this.state.currentSku;
      const selectedRevision = this.selectedProductRevision(code);
      return this.productRevisionOptions(code).find((item) => item.revision === selectedRevision) || null;
    }

    activeProductPayload(productCode) {
      const code = productCode || this.state.currentSku;
      return payloadForProductRevision(this.state.payload, code, this.selectedProductRevision(code));
    }

    isHistoricalRevision() {
      return isHistoricalProductRevision(
        this.state.payload,
        this.state.currentSku,
        this.selectedProductRevision(),
      );
    }

    canEditProductRevision() {
      const revisionInfo = this.selectedProductRevisionInfo();
      return this.isAdmin() &&
        Boolean(revisionInfo?.current) &&
        revisionInfo.workflowState === 'draft';
    }

    canCreateProductRevision() {
      const revisionInfo = this.selectedProductRevisionInfo();
      return this.isAdmin() &&
        Boolean(revisionInfo?.current) &&
        revisionInfo.workflowState === 'released';
    }

    canWithdrawProductRevision() {
      const revisionInfo = this.selectedProductRevisionInfo();
      return this.isAdmin() &&
        Boolean(revisionInfo?.current) &&
        revisionInfo.workflowState === 'released';
    }

    canReleaseProductRevision() {
      const revisionInfo = this.selectedProductRevisionInfo();
      return this.isAdmin() &&
        !this.state.dirty &&
        Boolean(revisionInfo?.current) &&
        revisionInfo.workflowState === 'draft';
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
      return this.activeProductPayload().bom?.[this.state.currentSku] || null;
    }

    colorData() {
      const product = this.product();
      return product && product.color_info ? product.color_info[this.state.currentColor] : null;
    }

    bomRows(productCode, colorName) {
      const code = productCode || this.state.currentSku;
      return buildBomTreeRows(this.activeProductPayload(code), code, colorName || this.state.currentColor);
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
      this.bindNotifications();
      this.bindLanguage();
    }

    bindSearch() {
      this.query('#searchInput').addEventListener('input', (event) => {
        this.state.searchQuery = event.target.value.trim();
        this.state.materialDbPage = 1;
        this.query('#searchClear').classList.toggle('visible', this.state.searchQuery.length > 0);
        if (this.state.adminView !== 'bom' || !this.state.bomDetailOpen) {
          this.renderContent();
          this.renderInspector();
          return;
        }
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
      this.state.materialDbPage = 1;
      this.query('#searchInput').value = '';
      this.query('#searchClear').classList.remove('visible');
      if (this.state.adminView !== 'bom' || !this.state.bomDetailOpen) {
        this.renderContent();
        this.renderInspector();
        return;
      }
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
      this.query('.content').addEventListener('change', (event) => {
        const jumpInput = event.target.closest('[data-action="mdb-jump-page"]');
        if (jumpInput) {
          let p = parseInt(jumpInput.value, 10);
          if (p >= 1 && p <= parseInt(jumpInput.max, 10)) {
            this.state.materialDbPage = p;
            this.renderContent();
          }
        }
      });
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
        const editBomMaterial = event.target.closest('[data-edit-bom-material]');
        const editDbMaterial = event.target.closest('[data-edit-db-material]');
        const editStructureParent = event.target.closest('[data-edit-structure-parent]');
        const editStructureChild = event.target.closest('[data-edit-structure-child]');
        const openBomProduct = event.target.closest('[data-open-bom-product]');
        const bomRow = event.target.closest('[data-bom-entry]');
        const materialRow = event.target.closest('[data-material-row]');
        const drawing = event.target.closest('[data-drawing-row]');
        const model3d = event.target.closest('[data-model3d-row]');
        const levelToggle = event.target.closest('[data-level-toggle]');
        if (levelToggle) {
          const entryId = levelToggle.dataset.levelToggle;
          const tbody = levelToggle.closest('tbody');
          const icon = levelToggle.querySelector('.level-expand-icon');
          const isExpanded = levelToggle.classList.toggle('expanded');
          const setChildRows = (parentEntryId, visible) => {
            const childRows = tbody ? Array.from(tbody.querySelectorAll(`[data-child-level="${CSS.escape(parentEntryId)}"]`)) : [];
            childRows.forEach((row) => {
              row.style.display = visible ? '' : 'none';
              if (!visible) {
                const childToggle = row.querySelector('[data-level-toggle]');
                if (childToggle) {
                  childToggle.classList.remove('expanded');
                  const childIcon = childToggle.querySelector('.level-expand-icon');
                  if (childIcon) childIcon.textContent = '▸';
                }
                if (row.dataset.bomEntry) setChildRows(row.dataset.bomEntry, false);
              }
            });
          };
          if (icon) icon.textContent = isExpanded ? '▾' : '▸';
          setChildRows(entryId, isExpanded);
          return;
        }
        if (openBomProduct) {
          this.selectProduct(openBomProduct.dataset.openBomProduct);
          return;
        }
        if (editBomMaterial) {
          if (!this.canEditProductRevision()) return;
          this.openMaterialMasterEditor(editBomMaterial.dataset.editBomMaterial);
          return;
        }
        if (editDbMaterial) {
          this.openMaterialMasterEditor(editDbMaterial.dataset.editDbMaterial);
          return;
        }
        if (editStructureParent) {
          this.openMaterialMasterEditor(editStructureParent.dataset.editStructureParent);
          return;
        }
        if (editStructureChild) {
          this.openMaterialMasterEditor(editStructureChild.dataset.editStructureChild);
          return;
        }
        if (deleteDbMaterial) {
          this.deleteDatabaseMaterial(deleteDbMaterial.dataset.deleteDbMaterial);
          return;
        }
        if (deleteBom) {
          if (!this.canEditProductRevision()) return;
          this.deleteBomRow(Number(deleteBom.dataset.deleteBomRow));
          return;
        }
        const editBomRow = event.target.closest('[data-edit-bom-row]');
        if (editBomRow) {
          if (!this.canEditProductRevision()) return;
          this.editBomRowFromPrompt(Number(editBomRow.dataset.editBomRow));
          return;
        }
        if (replaceBom) {
          if (!this.canEditProductRevision()) return;
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

        const filterChip = event.target.closest('.db-filter-chip');
        if (filterChip) {
          const type = filterChip.dataset.filterType;
          const val = filterChip.dataset.filterVal;
          if (this.state.dbFilters[type] !== val) {
            this.state.dbFilters[type] = val;
            this.state.materialDbPage = 1;
            this.renderContent();
          }
          return;
        }

        if (action && action.dataset.action === 'clear-db-filters') {
          this.state.dbFilters = { attr: 'all', material: 'all', color: 'all', has2D: 'all', has3D: 'all' };
          this.renderContent();
          return;
        }
        if (action) this.runAction(action.dataset.action, action);
        if (sort) this.sortBy(sort.dataset.sort);
        if (drawing) { this.openDrawing(Number(drawing.dataset.drawingRow)); return; }
        if (model3d) { this.openModel3d(Number(model3d.dataset.model3dRow)); return; }
        const drawingMat = event.target.closest('[data-drawing-material]');
        if (drawingMat) {
          this.openMaterialDrawing(drawingMat.dataset.drawingMaterial);
          return;
        }
        const model3dMat = event.target.closest('[data-model3d-material]');
        if (model3dMat) {
          this.openMaterialModel3d(model3dMat.dataset.model3dMaterial);
          return;
        }
        if (
          materialRow &&
          !materialRow.closest('.material-db-view') &&
          !event.target.closest('button,input,a,select,textarea')
        ) {
          this.openMaterialRecord(materialRow.dataset.materialRow);
        }
        const parentToggle = event.target.closest('[data-parent-toggle]');
        if (parentToggle) {
          this.openStructureDetail(parentToggle.dataset.parentToggle);
          return;
        }
      };
      this.query('.content').addEventListener('click', handleClick);
      this.query('#inspectorPanel').addEventListener('click', handleClick);

      this.query('.content').addEventListener('change', (event) => {
        const select = event.target.closest('.db-filter-select');
        if (select) {
          const type = select.dataset.filterType;
          if (type) {
            this.state.dbFilters[type] = select.value;
            this.state.materialDbPage = 1;
            this.renderContent();
          }
        }
      });
    }

    bindEditing() {
      this.query('#contentHeader').addEventListener('input', (event) => this.handleProductInput(event, false));
      this.query('#contentHeader').addEventListener('change', (event) => {
        const revisionSelect = event.target.closest('[data-product-revision]');
        if (revisionSelect) {
          this.selectProductRevision(revisionSelect.value);
          return;
        }
        this.handleProductInput(event, true);
      });
      this.query('.content').addEventListener('input', (event) => this.handleMaterialInput(event, false));
      this.query('.content').addEventListener('change', (event) => this.handleMaterialInput(event, true));
      this.query('.content').addEventListener('change', (event) => {
        const input = event.target.closest?.('[data-asset-file-input]');
        if (input) void this.handleMaterialAssetFileInput(input);
      });
      this.query('.content').addEventListener('input', (event) => this.handleMaterialDbInput(event));
      this.query('.content').addEventListener('input', (event) => {
        if (event.target.matches('[data-material-master-edit], [data-asset-edit]')) {
          this.syncMaterialMasterFormToDraft();
        }
      });
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

    bindNotifications() {
      const button = this.query('#notificationButton');
      const readButton = this.query('#notificationReadBtn');
      if (!button) return;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.state.notificationOpen = !this.state.notificationOpen;
        if (this.state.notificationOpen) this.markNotificationsRead();
        this.renderNotifications();
      });
      if (readButton) {
        readButton.addEventListener('click', (event) => {
          event.stopPropagation();
          this.markNotificationsRead();
          this.renderNotifications();
        });
      }
      global.document.addEventListener('click', (event) => {
        if (!this.state.notificationOpen) return;
        const center = this.query('#notificationCenter');
        if (center && !center.contains(event.target)) {
          this.state.notificationOpen = false;
          this.renderNotifications();
        }
      });
      global.document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !this.state.notificationOpen) return;
        this.state.notificationOpen = false;
        this.renderNotifications();
      });
    }

    bindLanguage() {
      this.queryAll('.lang-btn').forEach((button) => {
        button.addEventListener('click', () => {
          this.state.lang = button.dataset.lang;
          if (global.document) global.document.documentElement.lang = this.state.lang;
          this.state.dbFilters = { attr: 'all', material: 'all', color: 'all', has2D: 'all', has3D: 'all' };
          this.renderAll();
        });
      });
    }

    runAction(action, actionElement) {
      if (action === 'toggle-edit' && this.canEditProductRevision()) this.toggleEdit();
      if (action === 'save' && this.isAdmin()) this.saveCloud();
      if (action === 'view-changes' && this.isAdmin()) this.showDiffModal(actionElement);
      if (action === 'reload') this.loadCloud({ silent: false });
      if (action === 'discard' && this.isAdmin()) this.discard();
      if (action === 'material-db' && this.isAdmin()) { this.state.materialDbPage = 1; this.openMaterialDatabase(); }
      if (action === 'mdb-prev-page') {
        this.state.materialDbPage = Math.max(1, (this.state.materialDbPage || 1) - 1);
        this.renderContent();
      }
      if (action === 'mdb-next-page') {
        this.state.materialDbPage = (this.state.materialDbPage || 1) + 1;
        this.renderContent();
      }
      if (action === 'mdb-go-page') {
        if (actionElement?.dataset.page) {
          this.state.materialDbPage = parseInt(actionElement.dataset.page, 10);
          this.renderContent();
        }
      }
      if (action === 'bom-view' && this.isAdmin()) this.openBomView();
      if (action === 'replace-selected-bom' && this.isAdmin()) this.replaceSelectedBomRow();
      if (action === 'add-db-material' && this.isAdmin()) this.addDatabaseMaterial();
      if (action === 'add-parent-material' && this.isAdmin()) this.addParentMaterial();
      if (action === 'save-structure-draft' && this.isAdmin()) this.saveStructureDraft();
      if (action === 'delete-parent-structure' && this.isAdmin()) this.deleteParentStructure();
      if (action === 'add-bom-row' && this.isAdmin()) this.addBomRowFromPrompt();
      if (action === 'add-child-material' && this.isAdmin()) this.addChildMaterialFromPrompt();
      if (action === 'back-material-list' && this.isAdmin()) this.backMaterialList();
      if (action === 'save-material-master' && this.isAdmin()) this.saveMaterialMaster();
      if (action === 'delete-material-master' && this.isAdmin()) this.deleteSelectedMaterialMaster();
      if (action === 'add-2d-asset' && this.isAdmin()) this.addMaterialAssetRow('drawings');
      if (action === 'add-3d-asset' && this.isAdmin()) this.addMaterialAssetRow('models3d');
      if (action === 'delete-asset-row' && this.isAdmin()) this.deleteMaterialAssetRow(actionElement);
      if (action === 'open-asset') this.openAsset(actionElement);
      if (action === 'upload-asset-file' && this.isAdmin()) this.openMaterialAssetFilePicker(actionElement);
      if (action === 'select-existing-asset' && this.isAdmin()) this.selectExistingMaterialAsset(actionElement);
      if (action === 'copy') this.copyTable();
      if (action === 'exportExcel') this.exportExcel();
      if (action === 'add-product' && this.isAdmin()) this.addProduct();
      if (action === 'create-product-revision' && this.isAdmin()) this.createProductRevisionFromPrompt();
      if (action === 'release-product-revision' && this.isAdmin()) this.releaseProductRevisionFromPrompt();
      if (action === 'withdraw-revision' && this.isAdmin()) this.withdrawProductRevisionFromPrompt();
    }

    addChildMaterialFromPrompt() {
      this.openMaterialSelector(this.label('addChildMaterial'), (material) => {
        const parentId = this.state.selectedParentId;
        if (hasChildMaterialRelation(this.state.materialDb.bomEntries, parentId, material.id)) {
          this.setStatus(this.label('childMaterialExists'), 'error');
          return;
        }
        const newEntry = {
          id: stableId('bomc', `${Date.now()}|${parentId}|${material.id}`),
          parentType: 'material',
          parentId: parentId,
          productCode: '',
          color: '',
          materialId: material.id,
          childMaterialId: material.id,
          stt: '',
          comp_code: '',
          qty: '1',
          color_ver: '',
          color_ver_vi: '',
          order: Date.now()
        };
        this.state.materialDb.bomEntries.push(newEntry);
        this.markDirty();
        this.renderStructureDetail();
      });
    }

    bindStructureDetailControls(content) {
      // Back button click
      const backBtn = this.query('[data-action-back-structure]');
      if (backBtn) backBtn.addEventListener('click', () => this.backToStructureList());

      if (this.isAdmin()) {
        // Edit qty input (grouped)
        content.querySelectorAll('input[data-structure-edit-group]').forEach((input) => {
          input.addEventListener('change', (e) => {
            const childId = e.target.dataset.structureEditGroup;
            const originalQty = e.target.dataset.originalQty;
            const newQty = e.target.value;

            const matchingEntries = this.state.materialDb.bomEntries.filter(ent =>
              ent.parentType === 'material' &&
              ent.parentId === this.state.selectedParentId &&
              (ent.childMaterialId || ent.materialId) === childId &&
              (ent.qty || '') === originalQty
            );

            if (matchingEntries.length > 0) {
              matchingEntries.forEach(ent => ent.qty = newQty);
              this.markDirty();
              this.renderContent();
            }
          });
        });

        // Delete child entry
        content.querySelectorAll('[data-delete-child-entry]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const entryId = btn.dataset.deleteChildEntry;
            this.state.materialDb.bomEntries = this.state.materialDb.bomEntries.filter((e) => e.id !== entryId);
            this.state.payload.materialDb = this.state.materialDb;
            this.markDirty();
            this.renderContent();
          });
        });
      }
    }

    openModuleView(view) {
      const nextView = ['bom', 'materials', 'structure'].includes(view) ? view : 'bom';
      this.state.adminView = nextView;
      this.state.materialDraft = null;
      this.prunePendingMaterialAssets();
      this.state.selectedMaterialId = '';
      this.state.selectedEntryId = '';
      this.state.selectedParentId = '';
      this.state.bomDetailOpen = false;
      this.state.selectedRevision = '';
      this._clearSearchBar();
      this.renderProductList();
      this.renderFilterBar();
      this.renderContent();
      this.renderInspector();
    }

    _clearSearchBar() {
      this.state.searchQuery = '';
      this.state.materialDbPage = 1;
      const searchInput = this.query('#searchInput');
      if (searchInput) searchInput.value = '';
      const searchClear = this.query('#searchClear');
      if (searchClear) searchClear.classList.remove('visible');
    }

    selectProduct(sku) {
      if (!this.state.bom[sku]) return;
      this.state.currentSku = sku;
      this.state.selectedRevision = '';
      this.state.materialDraft = null;
      this.prunePendingMaterialAssets();
      this.state.selectedMaterialId = '';
      this.state.selectedEntryId = '';
      this.state.adminView = 'bom';
      this.state.bomDetailOpen = true;
      this._clearSearchBar();
      this.ensureColor();
      this.renderProductList();
      this.renderFilterBar();
      this.renderContent();
      this.renderInspector();
    }

    selectProductRevision(revision) {
      const option = this.productRevisionOptions().find((item) => item.revision === revision);
      if (!option) return;
      this.state.selectedRevision = option.revision;
      this.state.selectedMaterialId = '';
      this.state.selectedEntryId = '';
      this.state.editMode = false;
      this.ensureColor();
      this.renderContent();
      this.renderInspector();
    }

    openMaterialDatabase() {
      this.openModuleView('materials');
    }

    openMaterialRecord(materialId) {
      this.openMaterialMasterEditor(materialId);
    }

    openMaterialMasterEditor(materialId) {
      if (!this.isAdmin()) return;
      if (!this.state.materialDb?.materials?.[materialId]) return;
      this.state.adminView = 'materials';
      this.state.materialDraft = null;
      this.prunePendingMaterialAssets();
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

    selectedMaterialRecord() {
      const materialId = this.state.selectedMaterialId;
      if (!materialId) return null;
      if (this.state.materialDraft?.id === materialId) return this.state.materialDraft;
      return this.state.materialDb?.materials?.[materialId] || null;
    }

    isNewMaterialDraft(record) {
      return Boolean(record && this.state.materialDraft?.id === record.id && !this.state.materialDb?.materials?.[record.id]);
    }

    backMaterialList() {
      this.state.materialDraft = null;
      this.prunePendingMaterialAssets();
      this.state.selectedMaterialId = '';
      this.renderProductList();
      this.renderFilterBar();
      this.renderContent();
      this.renderInspector();
    }

    openBomView() {
      this.openModuleView('bom');
    }

    toggleEdit() {
      if (!this.canEditProductRevision()) return;
      this.state.editMode = !this.state.editMode;
      this.renderContent();
      this.renderInspector();
    }

    renderAll() {
      this.ensureInspectorPanel();
      this.renderStaticText();
      this.renderStatus();
      this.renderStats();
      this.renderNotifications();
      this.renderFilterBar();
      this.renderProductList();
      this.renderContent();
      this.renderInspector();
      this.syncDirtyVisibility();
      if (this.aiFeature && this.aiFeature.updateLanguage) {
        this.aiFeature.updateLanguage();
      }
    }

    notifications() {
      return normalizeNotifications(this.state.payload?.notifications || []);
    }

    notificationReadKey() {
      return `bom_notifications_read_at_v1_${this.mode}`;
    }

    notificationReadAt() {
      try {
        return global.localStorage ? global.localStorage.getItem(this.notificationReadKey()) || '' : '';
      } catch (error) {
        return '';
      }
    }

    setNotificationReadAt(value) {
      try {
        if (global.localStorage) global.localStorage.setItem(this.notificationReadKey(), value || '');
      } catch (error) {
        this.setStatus(error.message, 'error');
      }
    }

    unreadNotifications() {
      const readAt = Date.parse(this.notificationReadAt()) || 0;
      return this.notifications().filter((item) => (Date.parse(item.createdAt) || 0) > readAt);
    }

    markNotificationsRead() {
      const newest = this.notifications()[0];
      if (newest) this.setNotificationReadAt(newest.createdAt);
    }

    notificationTitle(notification) {
      return notification?.type === 'github-save'
        ? this.label('notificationGithubSaveTitle')
        : this.label('notificationUpdatedTitle');
    }

    notificationFieldLabel(field) {
      const labelKeys = {
        code: 'materialCode',
        name: 'materialName',
        spec: 'specification',
        material: 'materialComposition',
        color: 'materialColor',
        attr: 'materialAttribute'
      };
      return this.label(labelKeys[field] || field);
    }

    notificationChangeText(change) {
      const before = change.before || '-';
      const after = change.after || '-';
      switch (change.kind) {
        case 'material_added':
          return `${change.code} · ${this.label('notificationMaterialAdded')}`;
        case 'material_deleted':
          return `${change.code} · ${this.label('notificationMaterialDeleted')}`;
        case 'product_added':
          return `${change.code} · ${this.label('notificationProductAdded')}`;
        case 'bom_added':
          return `${change.code} · ${this.label('notificationBomAdded')}: ${change.field}`;
        case 'bom_deleted':
          return `${change.code} · ${this.label('notificationBomDeleted')}: ${change.field}`;
        case 'bom_qty_changed':
          return `${change.code} · ${this.label('notificationBomQtyChanged')} (${change.field}): ${before} → ${after}`;
        case 'material':
        default:
          return `${change.code} · ${this.notificationFieldLabel(change.field)}: ${before} → ${after}`;
      }
    }

    notificationBody(notification) {
      const body = notification?.type === 'github-save'
        ? this.label('notificationGithubSaveBody')
        : this.label('notificationUpdatedBody');
      const changes = normalizeNotificationChanges(notification?.changes || []);
      if (!changes.length) return body;
      const visible = changes.slice(0, 5).map((change) => this.notificationChangeText(change)).join('; ');
      const more = changes.length > 5 ? ` +${changes.length - 5}` : '';
      return `${body} ${this.label('notificationChangedItems')}: ${visible}${more}`;
    }

    newNotifications(previousNotifications, nextNotifications) {
      const previousIds = new Set(normalizeNotifications(previousNotifications).map((item) => item.id));
      return normalizeNotifications(nextNotifications).filter((item) => !previousIds.has(item.id));
    }

    showNotificationToast(notification) {
      if (!global.document || !notification) return;
      let toast = this.query('#notificationToast');
      if (!toast) {
        toast = global.document.createElement('div');
        toast.id = 'notificationToast';
        toast.className = 'notification-toast';
        global.document.body.appendChild(toast);
      }
      toast.innerHTML = `<strong>${escapeHTML(this.notificationTitle(notification))}</strong>
        <span>${escapeHTML(this.notificationBody(notification))}</span>`;
      toast.classList.add('visible');
      if (this.notificationToastTimer) global.clearTimeout(this.notificationToastTimer);
      this.notificationToastTimer = global.setTimeout(() => {
        toast.classList.remove('visible');
      }, 6000);
    }

    collectAttrs() {
      const predefinedOrder = ['零件', '五金包', '包材'];
      const predefinedLabels = [this.label('attrPart'), this.label('attrHardware'), this.label('attrPackaging')];
      const attrs = new Map();
      predefinedOrder.forEach((val, index) => {
        attrs.set(val, {
          value: val,
          label: predefinedLabels[index]
        });
      });
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

    renderContent() {
      const content = this.query('.content');
      const existingFilterBars = content?.querySelectorAll('.pdm-module-filter-bar');
      if (existingFilterBars) existingFilterBars.forEach(el => el.remove());

      if (this.state.adminView === 'materials') {
        this.renderMaterialDatabase();
        return;
      }
      if (this.state.adminView === 'structure') {
        if (this.state.selectedParentId) {
          this.renderStructureDetail();
        } else {
          this.renderStructureView();
        }
        return;
      }
      if (this.state.adminView === 'assets') {
        this.renderAssetsView();
        return;
      }
      if (!this.state.bomDetailOpen) {
        this.renderProductCatalog();
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

    openStructureDetail(parentId) {
      if (!this.state.materialDb?.materials?.[parentId]) return;
      this.state.selectedParentId = parentId;
      this.state.draftBomEntries = JSON.stringify(this.state.materialDb.bomEntries || []);
      this.renderProductList();
      this.renderContent();
      this.renderInspector();
    }

    backToStructureList() {
      if (this.state.draftBomEntries) {
        this.state.materialDb.bomEntries = JSON.parse(this.state.draftBomEntries);
        this.state.payload.materialDb.bomEntries = this.state.materialDb.bomEntries;
        this.state.draftBomEntries = null;
      }
      this.state.selectedParentId = '';
      this.renderProductList();
      this.renderContent();
      this.renderInspector();
    }

    saveStructureDraft() {
      this.state.draftBomEntries = null;
      this.state.dirty = true;
      this.setStatus(this.label('materialSaved'), 'dirty');
      this.backToStructureList();
    }

    deleteParentStructure() {
      this.openPdmConfirm(this.label('deleteParentStructureConfirm'), () => {
        const parentId = this.state.selectedParentId;
        this.state.materialDb.bomEntries = (this.state.materialDb.bomEntries || []).filter(e =>
          !(e.parentType === 'material' && e.parentId === parentId)
        );
        this.state.payload.materialDb.bomEntries = this.state.materialDb.bomEntries;
        this.state.dirty = true;
        this.state.draftBomEntries = null;
        this.setStatus(this.label('parentStructureDeleted'), 'dirty');
        this.backToStructureList();
      });
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
      if (!this.canEditProductRevision()) return;
      const material = this.state.lastRows[index];
      if (!material?._entryId) return;
      this.state.selectedEntryId = material._entryId;
      this.state.selectedMaterialId = material._materialId || '';
      this.openMaterialSelector(this.label('replaceMaterialPrompt'), (record) => {
        const entry = replaceBomEntryMaterial(this.state.payload, material._entryId, record.id);
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
      });
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
      if (!this.canEditProductRevision()) return;
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
      if (!input || !this.canEditProductRevision()) return;
      const colorData = this.colorData();
      const key = input.dataset.productEdit === 'name' ? (this.state.lang === 'vi' ? 'name_vi' : 'name_zh') : input.dataset.productEdit;
      colorData[key] = input.value;
      if (key === 'name_zh') colorData.name = input.value;
      this.markDirty();
      if (refresh) this.renderProductList();
    }

    handleMaterialInput(event, refresh) {
      const input = event.target.closest('[data-edit-field]');
      if (!input || !this.canEditProductRevision()) return;
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

    openAsset(actionElement) {
      const typeKey = actionElement.dataset.assetType;
      const index = parseInt(actionElement.dataset.assetIndex, 10);
      this.syncMaterialMasterFormToDraft();
      const asset = this.state.materialDraft?.[typeKey]?.[index];
      if (!asset || !asset.url) return;
      const url = asset.url;
      const fallbackName = this.label(typeKey === 'models3d' ? 'add3D' : 'add2D');
      const name = asset.name || fallbackName;
      if (typeKey === 'drawings') {
        this.showModal(url, '2D', name);
      } else if (typeKey === 'models3d') {
        this.showModel3dModal({ previewUrl: url, name, path: url }, '3D');
      }
    }

    syncMaterialMasterFormToDraft() {
      const record = this.selectedMaterialRecord();
      if (!record) return;

      if (!this.state.materialDraft || this.state.materialDraft.id !== record.id) {
        this.state.materialDraft = clone(record);
      }

      this.queryAll('[data-material-master-edit]').forEach((input) => {
        const field = input.dataset.materialMasterEdit;
        const lang = input.dataset.lang || 'zh';
        if (field === 'code') {
          this.state.materialDraft.code = input.value.trim();
          return;
        }
        this.state.materialDraft[field] = this.state.materialDraft[field] || {};
        this.state.materialDraft[field][lang] = input.value;
      });

      ['drawings', 'models3d'].forEach(typeKey => {
        const arr = [];
        this.queryAll(`#${typeKey}-container .material-asset-edit-row`).forEach((row, i) => {
           const nameInput = row.querySelector('[data-asset-edit="name"]');
           const urlInput = row.querySelector('[data-asset-edit="url"]');
           const orig = (this.state.materialDraft[typeKey] || [])[i] || {};
           const nextAsset = { ...orig, name: nameInput.value.trim(), url: urlInput.value.trim() };
           if (nextAsset.url && nextAsset.pendingAssetId) delete nextAsset.pendingAssetId;
           arr.push(nextAsset);
         });
         this.state.materialDraft[typeKey] = arr;
       });
      this.prunePendingMaterialAssets();
    }

    prunePendingMaterialAssets() {
      const referenced = new Set();
      const collect = (record) => {
        ['drawings', 'models3d'].forEach((typeKey) => {
          (record?.[typeKey] || []).forEach((asset) => {
            if (asset?.pendingAssetId) referenced.add(asset.pendingAssetId);
          });
        });
      };
      collect(this.state.materialDraft);
      Object.values(this.state.materialDb?.materials || {}).forEach(collect);
      Object.keys(this.state.pendingMaterialAssets || {}).forEach((pendingId) => {
        if (!referenced.has(pendingId)) delete this.state.pendingMaterialAssets[pendingId];
      });
    }

    materialAssetErrorLabel(error) {
      const labels = {
        INVALID_ASSET_FILE: 'invalidAssetFile',
        ASSET_FILE_TOO_LARGE: 'assetFileTooLarge',
        INVALID_PDF_FILE: 'invalidPdfFile',
        INVALID_GLB_FILE: 'invalidGlbFile',
        INVALID_GLTF_FILE: 'invalidGltfFile',
        ASSET_TOKEN_REQUIRED: 'assetTokenRequired',
        PENDING_ASSET_MISSING: 'pendingAssetMissing',
        ASSET_UPLOAD_FAILED: 'assetUploadFailed',
      };
      return this.label(labels[error?.code] || 'invalidAssetFile');
    }

    openMaterialAssetFilePicker(button) {
      const input = button?.closest('.material-asset-edit-row')?.querySelector('[data-asset-file-input]');
      if (input) input.click();
    }

    async handleMaterialAssetFileInput(input) {
      if (!this.isAdmin()) return;
      const file = input?.files?.[0];
      const typeKey = input?.dataset?.assetType;
      const index = Number.parseInt(input?.dataset?.assetIndex, 10);
      if (!file || !['drawings', 'models3d'].includes(typeKey) || !Number.isInteger(index)) return;
      this.syncMaterialMasterFormToDraft();
      const draftAsset = this.state.materialDraft?.[typeKey]?.[index];
      if (!draftAsset) return;
      const materialId = this.state.materialDraft.id;
      const uploadKey = `${materialId}:${typeKey}:${index}`;
      const uploadVersion = (this.materialAssetUploadVersions.get(uploadKey) || 0) + 1;
      this.materialAssetUploadVersions.set(uploadKey, uploadVersion);
      try {
        const validated = await validateMaterialAssetFile({ file, typeKey });
        const token = this.readToken();
        if (!token) throw new MaterialAssetUploadError('ASSET_TOKEN_REQUIRED');
        const contentHash = await sha256Hex(validated.bytes);
        const path = buildAssetPath({
          kind: validated.kind,
          materialCode: this.state.materialDraft.code || this.state.materialDraft.id,
          originalName: validated.originalName,
          contentHash,
        });
        this.setStatus(this.label('uploadingAssets'), '');
        const resolved = await this.githubAssetStorage.uploadAsset({
          token,
          path,
          contentType: validated.contentType,
          bytes: validated.bytes,
        });
        if (this.materialAssetUploadVersions.get(uploadKey) !== uploadVersion
          || this.state.materialDraft?.id !== materialId) return;
        this.syncMaterialMasterFormToDraft();
        const currentAsset = this.state.materialDraft?.[typeKey]?.[index];
        if (!currentAsset) return;
        const previousPendingId = currentAsset.pendingAssetId;
        const nextAsset = {
          ...currentAsset,
          name: currentAsset.name || validated.originalName,
          url: resolved.url,
          path: resolved.path,
          contentHash: resolved.contentHash,
          commitSha: resolved.commitSha,
        };
        delete nextAsset.pendingAssetId;
        if (typeKey === 'models3d') nextAsset.previewUrl = resolved.url;
        this.state.materialDraft[typeKey][index] = nextAsset;
        if (previousPendingId) delete this.state.pendingMaterialAssets[previousPendingId];
        this.prunePendingMaterialAssets();
        this.renderContent();
        this.setStatus(this.label('assetUploaded'), 'saved');
      } catch (error) {
        if (this.materialAssetUploadVersions.get(uploadKey) !== uploadVersion) return;
        const validationError = error instanceof MaterialAssetUploadError
          ? error
          : new MaterialAssetUploadError('ASSET_UPLOAD_FAILED');
        this.setStatus(this.materialAssetErrorLabel(validationError), 'error');
      } finally {
        input.value = '';
      }
    }

    selectExistingMaterialAsset(button) {
      if (!this.isAdmin()) return;
      const typeKey = button?.dataset?.assetType;
      const index = Number.parseInt(button?.dataset?.assetIndex, 10);
      if (!['drawings', 'models3d'].includes(typeKey) || !Number.isInteger(index)) return;
      this.syncMaterialMasterFormToDraft();
      const materialId = this.state.materialDraft?.id;
      if (!materialId || !this.state.materialDraft?.[typeKey]?.[index]) return;
      this.openMaterialAssetSelector(typeKey, (selected) => {
        if (this.state.materialDraft?.id !== materialId) return;
        const previousPendingId = this.state.materialDraft[typeKey][index]?.pendingAssetId;
        const nextAsset = clone(selected.asset);
        delete nextAsset.pendingAssetId;
        if (typeKey === 'models3d') nextAsset.previewUrl = nextAsset.url || nextAsset.previewUrl || '';
        this.state.materialDraft[typeKey][index] = nextAsset;
        if (previousPendingId) delete this.state.pendingMaterialAssets[previousPendingId];
        this.prunePendingMaterialAssets();
        this.renderContent();
        this.setStatus(this.label('assetReused'), 'saved');
      });
    }

    addMaterialAssetRow(typeKey) {
      if (!this.selectedMaterialRecord()) return;
      this.syncMaterialMasterFormToDraft();
      this.state.materialDraft[typeKey] = this.state.materialDraft[typeKey] || [];
      if (this.state.materialDraft[typeKey].length) return;
      this.state.materialDraft[typeKey].push({ url: '', name: '' });
      this.renderContent();
    }

    deleteMaterialAssetRow(button) {
      if (!this.selectedMaterialRecord()) return;
      this.syncMaterialMasterFormToDraft();
      const typeKey = button.dataset.assetType;
      const index = parseInt(button.dataset.assetIndex, 10);
      if (this.state.materialDraft[typeKey]) {
        this.state.materialDraft[typeKey].splice(index, 1);
      }
      this.prunePendingMaterialAssets();
      this.renderContent();
    }

    saveMaterialMaster() {
      if (!this.isAdmin()) return;
      const record = this.selectedMaterialRecord();
      if (!record) return;
      const patch = {};
      this.queryAll('[data-material-master-edit]').forEach((input) => {
        const field = input.dataset.materialMasterEdit;
        const lang = input.dataset.lang || 'zh';
        if (field === 'code') {
          patch.code = input.value.trim();
          return;
        }
        patch[field] = patch[field] || {};
        patch[field][lang] = input.value;
      });

      this.syncMaterialMasterFormToDraft();

      let validationError = null;
      const validate2D = (urlStr) => {
        if (!urlStr) return false;
        try {
          const u = new URL(urlStr);
          if (u.protocol !== 'https:') return false;
          if (u.hostname === 'drive.google.com' || u.pathname.toLowerCase().endsWith('.pdf')) return true;
        } catch(e) {}
        return false;
      };
      const validate3D = (urlStr) => {
        if (!urlStr) return false;
        try {
          const u = new URL(urlStr);
          if (u.protocol !== 'https:') return false;
          if (u.hostname === 'drive.google.com') return false;
          if (u.pathname.toLowerCase().endsWith('.glb') || u.pathname.toLowerCase().endsWith('.gltf')) return true;
        } catch(e) {}
        return false;
      };

      const seenUrls = new Set();
      const processAssets = (typeKey, validator, errorLabel) => {
        const arr = [];
        (this.state.materialDraft[typeKey] || []).slice(0, 1).forEach((asset) => {
           if (asset.pendingAssetId) {
             if (!this.state.pendingMaterialAssets[asset.pendingAssetId]) {
               validationError = this.label('pendingAssetMissing');
             }
             arr.push(asset);
             return;
           }
           const url = asset.url;
           if (!url) {
             validationError = this.label(errorLabel);
             return;
           }
           if (!validator(url)) {
             validationError = this.label(errorLabel);
           }
           if (seenUrls.has(url)) {
             validationError = this.label('duplicateUrl');
           }
           seenUrls.add(url);
           if (typeKey === 'models3d') {
             asset.previewUrl = url;
           }
           arr.push(asset);
        });
        return arr;
      };

      patch.drawings = processAssets('drawings', validate2D, 'invalid2DUrl');
      patch.models3d = processAssets('models3d', validate3D, 'invalid3DUrl');

      if (validationError) {
        this.setStatus(validationError, 'error');
        return;
      }

      if (this.state.materialDraft?.id === record.id) {
        this.state.materialDb.materials[record.id] = clone(record);
        this.state.payload.materialDb = this.state.materialDb;
      }
      updateMaterialRecord(this.state.payload, record.id, patch);
      this.state.materialDb = this.state.payload.materialDb;
      this.state.payload.materialDb = this.state.materialDb;
      this.state.materialDraft = null;
      this.prunePendingMaterialAssets();
      this.state.selectedMaterialId = record.id;
      this.markDirty();
      this.renderProductList();
      this.renderContent();
      this.renderInspector();
      this.setStatus(this.label('saveLocalOnly'), 'dirty');
    }

    deleteSelectedMaterialMaster() {
      if (!this.isAdmin()) return;
      const record = this.selectedMaterialRecord();
      if (!record) return;
      if (this.isNewMaterialDraft(record)) {
        this.backMaterialList();
        return;
      }
      this.deleteDatabaseMaterial(record.id);
    }
    deleteMaterialAsset(index, collectionName) {
      if (!this.canEditProductRevision()) return;
      const material = this.state.lastRows[index];
      if (!material) return;
      const collection = collectionName === 'models3d' ? this.state.models3d : this.state.drawings;
      if (material._materialRecord) {
        const assetField = collectionName === 'models3d' ? 'models3d' : 'drawings';
        const confirmKey = collectionName === 'models3d'
          ? 'deleteModel3dConfirm'
          : 'deleteDrawingConfirm';
        this.openPdmConfirm(this.deleteAssetConfirmText(confirmKey), () => {
          updateMaterialRecord(this.state.payload, material._materialId, { [assetField]: [] });
          this.state.materialDb = this.state.payload.materialDb;
          this.markDirty();
          this.renderTable();
          this.renderInspector();
        });
        return;
      }
      const skuAssets = collection[this.state.currentSku] || {};
      const entry = findBomAssetEntry(skuAssets, material);
      if (!entry) return;
      const confirmKey = collectionName === 'models3d'
        ? 'deleteModel3dConfirm'
        : 'deleteDrawingConfirm';
      this.openPdmConfirm(this.deleteAssetConfirmText(confirmKey), () => {
        delete skuAssets[entry.key];
        collection[this.state.currentSku] = skuAssets;
        this.markDirty();
        this.renderTable();
        this.renderInspector();
      });
    }

    deleteBomRow(index) {
      if (!this.canEditProductRevision()) return;
      const material = this.state.lastRows[index];
      if (!material?._entryId) return;
      this.openPdmConfirm(this.label('deleteBomRowConfirm'), () => {
        this.state.materialDb.bomEntries = this.state.materialDb.bomEntries.filter((entry) => entry.id !== material._entryId);
        this.state.payload.materialDb = this.state.materialDb;
        if (this.state.selectedEntryId === material._entryId) this.state.selectedEntryId = '';
        this.markDirty();
        this.renderTable();
        this.renderInspector();
      });
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

    addProduct() {
      if (!this.isAdmin()) return;
      this.openPdmPrompt(this.label('addProduct'), [
        { key: 'code', label: this.label('addProductPromptCode'), placeholder: this.label('addProductPromptCodePlaceholder'), required: true },
        { key: 'name', label: this.label('addProductPromptName'), required: true },
        { key: 'name_vi', label: this.label('addProductPromptNameVi') },
        { key: 'size', label: this.label('addProductPromptSize') },
        { key: 'sku', label: this.label('addProductPromptSku'), placeholder: this.label('addProductPromptSkuPlaceholder'), required: true },
        { key: 'color', label: this.label('addProductPromptColor'), defaultValue: '\u9ed8\u8ba4' },
        { key: 'color_vi', label: this.label('addProductPromptColorVi') }
      ], (values) => {
        const code = values.code.trim().toUpperCase();
        if (!code) return;
        if (this.state.bom[code]) {
          this.setStatus(this.label('productCodeExists'), 'error');
          return;
        }
        const nameZh = values.name.trim();
        if (!nameZh) return;
        const colorName = (values.color || '\u9ed8\u8ba4').trim();
        const sku = (values.sku || '').trim().toUpperCase();
        if (!sku) return;
        const product = {
          code,
          colors: [colorName],
          color_info: {
            [colorName]: {
              sku,
              name: nameZh,
              name_zh: nameZh,
              name_vi: (values.name_vi || '').trim(),
              size: (values.size || '').trim(),
              color_ver: colorName,
              color_ver_vi: (values.color_vi || '').trim(),
              materials: []
            }
          }
        };
        this.state.bom[code] = product;
        this.state.payload.bom[code] = product;
        this.markDirty();
        this.selectProduct(code);
        this.setStatus(this.label('productAdded'), 'saved');
      });
    }

    editBomRowFromPrompt(index) {
      if (!this.canEditProductRevision()) return;
      const material = this.state.lastRows[index];
      if (!material?._entryId) return;
      this.openPdmPrompt(this.label('editRow'), [
        { key: 'comp_code', label: this.label('bomCompCode'), defaultValue: material.comp_code || '' },
        { key: 'qty', label: this.label('bomQty'), defaultValue: material.qty || '1', required: true }
      ], (values) => {
        const entry = this.state.payload.materialDb.bomEntries.find(e => e.id === material._entryId);
        if (entry) {
          entry.comp_code = values.comp_code || '';
          entry.qty = values.qty || '1';
          this.state.materialDb = this.state.payload.materialDb;
          this.markDirty();
          this.renderContent();
        }
      });
    }

    addBomRowFromPrompt() {
      if (!this.canEditProductRevision()) return;
      this.openMaterialSelector(this.label('addBomRow'), (record) => {
        this.openPdmPrompt(this.label('addBomRow'), [
          { key: 'comp_code', label: this.label('bomCompCode') },
          { key: 'qty', label: this.label('bomQty'), defaultValue: '1', required: true }
        ], (values) => {
          const rows = this.bomRows();
          const entry = {
            id: stableId('bom', `${this.state.currentSku}|${this.state.currentColor}|${Date.now()}|${record.id}`),
            parentType: 'product',
            parentId: this.state.currentSku,
            productCode: this.state.currentSku,
            color: this.state.currentColor,
            materialId: record.id,
            stt: String(rows.length + 1),
            comp_code: values.comp_code || '',
            qty: values.qty || '1',
            color_ver: this.state.currentColor,
            color_ver_vi: this.state.currentColor,
            order: rows.length
          };
          this.state.materialDb.bomEntries.push(entry);
          this.state.payload.materialDb = this.state.materialDb;
          this.markDirty();
          this.renderContent();
        });
      });
    }

    withdrawProductRevisionFromPrompt() {
      const revisionInfo = this.selectedProductRevisionInfo();
      if (!this.isAdmin() || !revisionInfo?.current || revisionInfo.workflowState !== 'released') return;
      this.openPdmPrompt(this.label('withdrawRevision'), [{
        key: 'withdrawReason',
        label: this.label('withdrawReasonPrompt'),
        required: true,
      }], (values) => {
        try {
          withdrawProductRevision(
            this.state.payload,
            this.state.currentSku,
            this.selectedProductRevision(),
            { reason: values.withdrawReason },
          );
          this.markDirty();
          this.renderAll();
          this.setStatus(this.label('revisionWithdrawn'), 'dirty');
        } catch (error) {
          const errorKeys = {
            WITHDRAW_REASON_REQUIRED: 'revisionWithdrawReasonRequired',
            REVISION_NOT_CURRENT: 'revisionWithdrawCurrentOnly',
            REVISION_NOT_RELEASED: 'revisionWithdrawReleasedOnly',
          };
          this.setStatus(this.label(errorKeys[error.message] || 'revisionWithdrawFailed'), 'error');
        }
      });
    }

    createProductRevisionFromPrompt() {
      if (!this.canCreateProductRevision()) return;
      if (this.state.dirty) {
        this.setStatus(this.label('revisionDirtyBlocked'), 'error');
        return;
      }
      const fields = [];
      if (!this.state.payload.productRevisions?.[this.state.currentSku]) {
        fields.push({
          key: 'currentRevision',
          label: this.label('currentRevision'),
          defaultValue: this.selectedProductRevision(),
          required: true,
        });
      }
      fields.push(
        {
          key: 'revision',
          label: this.label('newRevision'),
          placeholder: 'V4.1',
          required: true,
        },
        {
          key: 'changeReason',
          label: this.label('changeReason'),
          required: true,
        },
      );
      this.openPdmPrompt(this.label('createRevision'), fields, (values) => {
        try {
          createProductRevision(this.state.payload, this.state.currentSku, values.revision, {
            currentRevision: values.currentRevision,
            changeReason: values.changeReason,
          });
          this.state.bom = this.state.payload.bom;
          this.state.selectedRevision = values.revision.trim();
          this.state.selectedMaterialId = '';
          this.state.selectedEntryId = '';
          this.markDirty();
          this.renderAll();
          this.setStatus(this.label('revisionCreated'), 'dirty');
        } catch (error) {
          const key = error.message === 'REVISION_EXISTS' ? 'revisionExists' : 'revisionCreateFailed';
          this.setStatus(this.label(key), 'error');
        }
      });
    }

    releaseProductRevisionFromPrompt() {
      const revisionInfo = this.selectedProductRevisionInfo();
      if (!this.isAdmin() || !revisionInfo?.current || revisionInfo.workflowState !== 'draft') return;
      if (this.state.dirty) {
        this.setStatus(this.label('revisionReleaseDirtyBlocked'), 'error');
        return;
      }
      this.openPdmPrompt(this.label('releaseRevision'), [{
        key: 'releaseReason',
        label: this.label('releaseRevisionReason'),
        required: true,
      }], (values) => {
        try {
          releaseProductRevision(
            this.state.payload,
            this.state.currentSku,
            this.selectedProductRevision(),
            { reason: values.releaseReason },
          );
          this.markDirty();
          this.renderAll();
          this.setStatus(this.label('revisionReleased'), 'dirty');
        } catch (error) {
          const errorKeys = {
            RELEASE_REASON_REQUIRED: 'revisionReleaseReasonRequired',
            REVISION_NOT_CURRENT: 'revisionReleaseCurrentOnly',
            REVISION_NOT_DRAFT: 'revisionReleaseDraftOnly',
          };
          this.setStatus(this.label(errorKeys[error.message] || 'revisionReleaseFailed'), 'error');
        }
      });
    }

    addDatabaseMaterial() {
      this.state.materialDraft = null;
      this.prunePendingMaterialAssets();
      const id = stableId('mat', `manual|${Date.now()}|${Math.random()}`);
      this.state.materialDraft = {
        id,
        code: '',
        name: { zh: '\u65b0\u7269\u6599', vi: 'v\u1eadt li\u1ec7u m\u1edbi' },
        spec: { zh: '', vi: '' },
        material: { zh: '', vi: '' },
        color: { zh: '', vi: '' },
        attr: { zh: '\u96f6\u4ef6', vi: 'linh ki\u1ec7n' },
        drawings: [],
        models3d: []
      };
      this.state.adminView = 'materials';
      this.state.selectedMaterialId = id;
      this.renderProductList();
      this.renderFilterBar();
      this.renderContent();
      this.renderInspector();
    }

    addParentMaterial() {
      this.openMaterialSelector(this.label('addParentMaterial'), (material) => {
        this.state.selectedParentId = material.id;
        this.state.draftBomEntries = JSON.stringify(this.state.materialDb.bomEntries || []);
        this.state.adminView = 'structure';
        this.renderProductList();
        this.renderFilterBar();
        this.renderContent();
        this.renderInspector();
      });
    }

    deleteDatabaseMaterial(materialId) {
      if (!this.isAdmin()) return;
      const whereUsed = materialWhereUsed(this.state.payload, materialId);
      const usedCount = whereUsed.productEntries.length + whereUsed.parentEntries.length + whereUsed.childEntries.length;
      if (usedCount > 0) {
        this.setStatus(`${this.label('materialDeleteBlocked')}: ${usedCount}`, 'error');
        return;
      }
      this.openPdmConfirm(this.label('deleteMaterialConfirm'), () => {
        this._doDeleteMaterial(materialId);
      });
      return;
    }

    _doDeleteMaterial(materialId) {
      delete this.state.materialDb.materials[materialId];
      this.state.payload.materialDb = this.state.materialDb;
      if (this.state.selectedMaterialId === materialId) this.state.selectedMaterialId = '';
      this.state.materialDraft = null;
      this.prunePendingMaterialAssets();
      this.markDirty();
      this.renderProductList();
      this.renderFilterBar();
      this.renderContent();
      this.renderInspector();
      this.setStatus(this.label('materialDeleted'), 'dirty');
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
      this.syncDirtyVisibility();
    }

    pendingPayloadChanges() {
      return describePayloadChanges(this.state.loadedPayload, this.state.payload);
    }

    discard() {
      this.openPdmConfirm(this.label('discardConfirm'), () => {
        this.applyPayload(this.state.loadedPayload);
        this.state.editMode = false;
        this.state.dirty = false;
        this.renderAll();
      });
    }

    async loadCloud(options) {
      const silent = Boolean(options?.silent);
      if ((this.state.dirty || this.state.materialDraft) && silent) return false;
      try {
        const previousNotifications = this.notifications();
        const firstLoad = !this.state.lastLoadAt;
        const payload = await this.githubData.loadPublic();
        if ((this.state.dirty || this.state.materialDraft) && silent) return false;
        const incoming = this.newNotifications(previousNotifications, payload.notifications);
        this.applyPayload(payload, { preserveView: silent });
        this.state.lastLoadAt = new Date().toISOString();
        this.renderAll();
        if (silent && !firstLoad && incoming.length && !this.isAdmin()) this.showNotificationToast(incoming[0]);
        if (!options.silent) this.setStatus(this.label('loaded'), 'saved');
        return true;
      } catch (error) {
        if (!options.silent) this.setStatus(`${this.label('loadFailed')}: ${error.message}`, 'error');
        return false;
      }
    }

    applyPayload(payload, options) {
      const preserved = options?.preserveView ? {
        currentSku: this.state.currentSku,
        currentColor: this.state.currentColor,
        selectedRevision: this.state.selectedRevision,
        currentAttr: this.state.currentAttr,
        adminView: this.state.adminView,
        bomDetailOpen: this.state.bomDetailOpen,
        searchQuery: this.state.searchQuery,
        sidebarQuery: this.state.sidebarQuery,
        dbFilters: clone(this.state.dbFilters),
        selectedMaterialId: this.state.selectedMaterialId,
        selectedEntryId: this.state.selectedEntryId,
        selectedParentId: this.state.selectedParentId
      } : null;
      this.state.payload = normalizePayload(payload);
      this.state.bom = this.state.payload.bom;
      this.state.drawings = this.state.payload.drawings;
      this.state.manuals = this.state.payload.manuals;
      this.state.models3d = this.state.payload.models3d;
      this.state.productImages = this.state.payload.productImages;
      this.state.materialDb = this.state.payload.materialDb;
      this.state.materialDraft = null;
      this.state.pendingMaterialAssets = {};
      this.state.loadedPayload = clone(this.state.payload);
      this.state.dirty = false;
      this.state.selectedMaterialId = '';
      this.state.selectedEntryId = '';
      this.state.selectedRevision = '';
      this.state.bomDetailOpen = false;
      if (preserved) {
        this.state.currentSku = this.state.bom[preserved.currentSku] ? preserved.currentSku : '';
        this.state.currentColor = preserved.currentColor;
        this.state.selectedRevision = preserved.selectedRevision;
        this.state.currentAttr = preserved.currentAttr;
        this.state.adminView = preserved.adminView;
        this.state.bomDetailOpen = preserved.bomDetailOpen;
        this.state.searchQuery = preserved.searchQuery;
        this.state.sidebarQuery = preserved.sidebarQuery;
        this.state.dbFilters = preserved.dbFilters;
        this.state.selectedMaterialId = this.state.materialDb?.materials?.[preserved.selectedMaterialId] ? preserved.selectedMaterialId : '';
        this.state.selectedEntryId = preserved.selectedEntryId;
        this.state.selectedParentId = this.state.materialDb?.materials?.[preserved.selectedParentId] ? preserved.selectedParentId : '';
      }
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
        const message = error instanceof MaterialAssetUploadError
          ? this.materialAssetErrorLabel(error)
          : error.message;
        this.setStatus(`${this.label('saveFailed')}: ${message}`, 'error');
      }
    }

    async writeGithubData(token) {
      this.setStatus(this.label('saving'), '');
      const updatedAt = new Date().toISOString();
      this.syncLegacyBom();
      const localPayload = normalizePayload({
        version: this.state.payload.version,
        updatedAt,
        bom: this.state.bom,
        drawings: this.state.drawings,
        manuals: this.state.manuals,
        models3d: this.state.models3d,
        productImages: this.state.productImages,
        productRevisions: this.state.payload.productRevisions,
        materialDb: this.state.materialDb,
        notifications: this.state.payload.notifications
      });
      syncLegacyBomFromMaterialDb(localPayload);
      this.state.pendingMaterialAssets = this.state.pendingMaterialAssets || {};
      if (Object.keys(this.state.pendingMaterialAssets).length) {
        this.setStatus(this.label('uploadingAssets'), '');
      }
      let resolution;
      try {
        resolution = await resolvePendingMaterialAssets({
          payload: localPayload,
          pendingAssets: this.state.pendingMaterialAssets,
          upload: (pending) => this.githubAssetStorage.uploadAsset({
            token,
            path: pending.path,
            contentType: pending.contentType,
            bytes: pending.bytes,
          }),
        });
      } catch (error) {
        if (error instanceof MaterialAssetUploadError) throw error;
        throw new MaterialAssetUploadError('ASSET_UPLOAD_FAILED');
      }
      let payload = resolution.payload;
      const remoteFile = await this.githubData.loadForWrite(token);
      const changes = describePayloadChanges(remoteFile.payload, payload);
      payload.notifications = normalizeNotifications(
        remoteFile.expectedHeadSha ? remoteFile.payload?.notifications : payload.notifications
      );
      payload = appendNotificationEvent(payload, { type: 'github-save', actor: 'admin', createdAt: updatedAt, changes });
      await this.githubData.write({ token, expectedHeadSha: remoteFile.expectedHeadSha, payload, message: `chore: update sharded bom data ${updatedAt}` });
      resolution.completedPendingIds.forEach((pendingId) => {
        delete this.state.pendingMaterialAssets[pendingId];
      });
      this.state.loadedPayload = clone(payload);
      this.state.payload = payload;
      this.state.bom = payload.bom;
      this.state.drawings = payload.drawings;
      this.state.manuals = payload.manuals;
      this.state.models3d = payload.models3d;
      this.state.productImages = payload.productImages;
      this.state.materialDb = payload.materialDb;
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
        productImages: this.state.productImages,
        materialDb: this.state.materialDb
      };
      syncLegacyBomFromMaterialDb(payload);
      this.state.bom = payload.bom;
      this.state.payload.bom = payload.bom;
      this.state.payload.materialDb = this.state.materialDb;
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

    openMaterialDrawing(materialId) {
      const material = this.state.materialDb?.materials?.[materialId];
      const drawing = material && material.drawings ? material.drawings[0] : null;
      if (drawing) this.showModal(drawing.url, drawing.name, drawing.path || localizedValue(material.name, this.state.lang));
    }

    openMaterialModel3d(materialId) {
      const material = this.state.materialDb?.materials?.[materialId];
      const model = material && material.models3d ? material.models3d[0] : null;
      if (model) this.showModel3dModal(model, localizedValue(material.name, this.state.lang));
    }

    openProductModel3d(index) {
      const model = this.productModels3d()[index];
      const colorData = this.colorData();
      if (model) this.showModel3dModal(model, this.localizedProductName(colorData || {}));
    }

    rowsForExport() {
      const rows = [['层级', '物料编码', '部件编号', '物料名称', '规格型号', '材质', '颜色', '属性', '数量']];
      this.filteredRows().forEach((material) => {
        rows.push([material._level || 1, material.mat_code || '', material.comp_code || '', materialText(material, 'name', this.state.lang),
        materialText(material, 'spec', this.state.lang), materialText(material, 'material', this.state.lang),
        materialText(material, 'color', this.state.lang), materialText(material, 'attr', this.state.lang),
        material.qty || '']);
      });
      return rows;
    }

    copyTable() {
      const textValue = this.rowsForExport().map((row) => row.join('\t')).join('\n');
      if (global.navigator && global.navigator.clipboard) {
        global.navigator.clipboard.writeText(textValue).then(() => this.setStatus(this.label('copied'), 'saved'));
      }
    }

    exportExcel() {
      if (!global.XLSX) { this.setStatus('SheetJS not loaded', 'error'); return; }
      let rows, filename;
      if (this.state.adminView === 'materials') {
        const records = this.filteredMaterialRecords();
        const lang = this.state.lang;
        const loc = (pair) => lang === 'vi' ? (pair?.vi || pair?.zh || '') : (pair?.zh || pair?.vi || '');
        rows = [['物料编码', '物料名称', '规格型号', '材质', '颜色', '使用于']];
        records.forEach((r) => {
          const whereUsed = materialWhereUsed(this.state.payload, r.id);
          const usedProducts = [...new Set(whereUsed.productEntries.map((e) => e.productCode))].sort();
          rows.push([
            r.code || '', loc(r.name), loc(r.spec), loc(r.material), loc(r.color),
            usedProducts.join(', ')
          ]);
        });
        filename = `MaterialDB_${this.state.lang}_${this.state.searchQuery || 'all'}.xlsx`;
      } else {
        rows = this.rowsForExport();
        filename = `BOM_${this.state.currentSku}_${this.state.currentColor}_${this.state.lang}.xlsx`;
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      // Auto-width columns
      const colWidths = rows[0].map((_, c) => {
        let max = 10;
        rows.forEach((row) => { const len = String(row[c] || '').length; if (len > max) max = len; });
        return Math.min(max + 2, 40);
      });
      ws['!cols'] = colWidths.map((w) => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Materials');
      XLSX.writeFile(wb, filename);
      this.setStatus(this.label('exportExcel') + ' ✓', 'saved');
    }


  }

Object.assign(
  BomApplication.prototype,
  sharedViewMethods,
  catalogViewMethods,
  bomViewMethods,
  materialViewMethods,
  structureViewMethods,
);

export const coreUtils = {
  appendNotificationEvent,
  createPdmNavigation,
  createSidebarIndex,
  describePayloadChanges,
  createMaterialDatabase,
  findBomAssets,
  filterMaterials,
  materialWhereUsed,
  normalizePayload,
  normalizeConfig,
  buildBomTreeRows,
  groupMaterialChildRows,
  hasChildMaterialRelation,
  replaceBomEntryMaterial,
  resolveBomRows,
  syncLegacyBomFromMaterialDb,
  updateMaterialRecord,
  stripProductColorName,
};

global.BomApp = { createApp, start: createApp };
global.BomCoreUtils = coreUtils;

export { BomApplication, createApp };
