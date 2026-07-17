export const DICT = {
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
  'ai.message.error': '发生错误'
};

export function t(key) {
  return DICT[key] || key;
}
