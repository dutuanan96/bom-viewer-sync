import { t } from './i18n.js';

export function createWorkspaceView({ onSend, onClear }) {
  const container = document.createElement('div');
  container.className = 'ai-workspace';
  
  const messagesDiv = document.createElement('div');
  messagesDiv.className = 'ai-messages';
  
  const inputDiv = document.createElement('div');
  inputDiv.className = 'ai-input-area';
  
  const input = document.createElement('textarea');
  input.placeholder = t('ai.workspace.placeholder');
  
  const sendBtn = document.createElement('button');
  sendBtn.textContent = t('ai.workspace.send');
  
  const clearBtn = document.createElement('button');
  clearBtn.textContent = t('ai.workspace.clear');
  
  sendBtn.addEventListener('click', () => {
    const text = input.value.trim();
    if (text) {
      onSend(text);
      input.value = '';
    }
  });
  
  clearBtn.addEventListener('click', () => {
    messagesDiv.replaceChildren();
    if (onClear) onClear();
  });
  
  inputDiv.appendChild(input);
  inputDiv.appendChild(sendBtn);
  inputDiv.appendChild(clearBtn);
  
  container.appendChild(messagesDiv);
  container.appendChild(inputDiv);
  
  function renderMessage(msg) {
    const msgEl = document.createElement('div');
    msgEl.className = `ai-message ${msg.role}`;
    
    // SAFE RENDERING: Only use textContent
    if (msg.text) {
      const textEl = document.createElement('div');
      textEl.className = 'ai-message-text';
      textEl.textContent = msg.text;
      msgEl.appendChild(textEl);
    }
    
    // Render citations safely
    if (msg.citations && msg.citations.length > 0) {
      const citEl = document.createElement('div');
      citEl.className = 'ai-citations';
      msg.citations.forEach(cit => {
        const span = document.createElement('span');
        span.className = 'ai-citation-badge';
        span.textContent = `[${cit}]`;
        citEl.appendChild(span);
      });
      msgEl.appendChild(citEl);
    }
    
    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
  
  function clear() {
    messagesDiv.replaceChildren();
  }
  
  return {
    element: container,
    renderMessage,
    clear,
    messagesContainer: messagesDiv // exposed for testing
  };
}

export function createSettingsView({ onConnect, onDisconnect, getDiagnostics }) {
  const container = document.createElement('div');
  container.className = 'ai-settings';
  
  const keyInput = document.createElement('input');
  keyInput.type = 'password';
  keyInput.placeholder = t('ai.settings.apiKey');
  
  const connectBtn = document.createElement('button');
  connectBtn.textContent = t('ai.settings.connect');
  
  const disconnectBtn = document.createElement('button');
  disconnectBtn.textContent = t('ai.settings.disconnect');
  
  const statusEl = document.createElement('div');
  statusEl.textContent = t('ai.settings.statusDisconnected');
  
  connectBtn.addEventListener('click', () => {
    const key = keyInput.value.trim();
    if (key) {
      onConnect(key);
      keyInput.value = ''; // Clear immediately from DOM
    }
  });
  
  disconnectBtn.addEventListener('click', () => {
    onDisconnect();
  });
  
  function updateState(connected) {
    statusEl.textContent = connected ? t('ai.settings.statusConnected') : t('ai.settings.statusDisconnected');
  }
  
  container.appendChild(statusEl);
  container.appendChild(keyInput);
  container.appendChild(connectBtn);
  container.appendChild(disconnectBtn);
  
  return {
    element: container,
    updateState
  };
}
