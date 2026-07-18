export const DICT = {
  zh: {
    'ai.title': 'AI 助手',
    'ai.settings.title': 'AI 设置',
    'ai.settings.connection': '连接',
    'ai.settings.privacy': '隐私',
    'ai.settings.diagnostics': '诊断',
    'ai.settings.apiKey': 'OpenRouter API 密钥',
    'ai.settings.connect': '连接',
    'ai.settings.disconnect': '断开连接',
    'ai.settings.consentLabel': '允许回退到付费模型',
    'ai.settings.statusConnected': '已连接',
    'ai.settings.statusDisconnected': '未连接',
    'ai.workspace.placeholder': '输入您的问题...',
    'ai.workspace.send': '发送',
    'ai.workspace.clear': '清除对话',
    'ai.message.fallback': 'AI 助手暂时不可用。请稍后再试。',
    'ai.message.error': '发生错误',
    'ai.workspace.greeting': '👋 您好！我是 JinTai PDM 的 AI 助手。\n\n请在下方输入您的问题，我随时准备为您提供帮助！🤩'
  },
  vi: {
    'ai.title': 'Trợ lý AI',
    'ai.settings.title': 'Cài đặt AI',
    'ai.settings.connection': 'Kết nối',
    'ai.settings.privacy': 'Quyền riêng tư',
    'ai.settings.diagnostics': 'Chẩn đoán',
    'ai.settings.apiKey': 'Khóa API OpenRouter',
    'ai.settings.connect': 'Kết nối',
    'ai.settings.disconnect': 'Ngắt kết nối',
    'ai.settings.consentLabel': 'Cho phép chuyển sang mô hình trả phí',
    'ai.settings.statusConnected': 'Đã kết nối',
    'ai.settings.statusDisconnected': 'Chưa kết nối',
    'ai.workspace.placeholder': 'Nhập câu hỏi của bạn...',
    'ai.workspace.send': 'Gửi',
    'ai.workspace.clear': 'Xóa trò chuyện',
    'ai.message.fallback': 'Trợ lý AI tạm thời không khả dụng. Vui lòng thử lại sau.',
    'ai.message.error': 'Đã xảy ra lỗi',
    'ai.workspace.greeting': '👋 Xin chào! Tôi là Trợ lý AI của JinTai PDM.\n\nHãy nhập câu hỏi của bạn xuống bên dưới, tôi đã sẵn sàng hỗ trợ bạn bất cứ lúc nào! 🤩'
  }
};

export function t(key) {
  const isVi = typeof document !== 'undefined' && document.documentElement && document.documentElement.lang.startsWith('vi');
  const lang = isVi ? 'vi' : 'zh';
  const dict = DICT[lang] || DICT['zh'];
  return dict[key] || key;
}
