export function createWorkspaceView({ onSend, onClear, t = (k) => k }) {
  const container = document.createElement('div');
  container.className = 'ai-workspace';
  
  const messagesDiv = document.createElement('div');
  messagesDiv.className = 'ai-messages';
  
  const inputDiv = document.createElement('div');
  inputDiv.className = 'ai-input-area';
  
  const input = document.createElement('textarea');
  input.placeholder = t('ai.workspace.placeholder');
  input.className = 'ai-chat-input';
  input.setAttribute('aria-label', t('ai.workspace.placeholder'));
  input.rows = 2;
  
  const charCounter = document.createElement('div');
  charCounter.className = 'ai-char-counter';
  charCounter.textContent = '0/500';

  const sendBtn = document.createElement('button');
  sendBtn.className = 'ai-send-btn';
  const sendIcon = document.createElement('span');
  sendIcon.className = 'material-symbols-outlined';
  sendIcon.textContent = 'send';
  sendBtn.appendChild(sendIcon);
  
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'ai-loading-indicator';
  loadingIndicator.textContent = 'AI is typing...';
  loadingIndicator.style.display = 'none';

  input.addEventListener('input', () => {
    const len = input.value.length;
    charCounter.textContent = `${len}/500`;
    if (len > 0) {
      sendBtn.classList.add('active');
    } else {
      sendBtn.classList.remove('active');
    }
  });

  const handleSend = () => {
    const text = input.value.trim();
    if (text) {
      onSend(text);
      input.value = '';
      charCounter.textContent = '0/500';
      sendBtn.classList.remove('active');
      input.focus();
    }
  };

  sendBtn.addEventListener('click', handleSend);
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'ai-input-wrapper';
  inputWrapper.appendChild(input);

  const inputFooter = document.createElement('div');
  inputFooter.className = 'ai-input-footer';
  inputFooter.appendChild(charCounter);
  inputFooter.appendChild(sendBtn);

  inputWrapper.appendChild(inputFooter);
  inputDiv.appendChild(inputWrapper);
  
  container.appendChild(messagesDiv);
  container.appendChild(loadingIndicator);
  container.appendChild(inputDiv);
  
  function renderMessage(msg) {
    const rowEl = document.createElement('div');
    rowEl.className = `ai-message-row ${msg.role}`;
    
    if (msg.role === 'ai' || msg.role === 'assistant') {
      const avatar = document.createElement('div');
      avatar.className = 'ai-avatar';
      avatar.innerHTML = '<span class="material-symbols-outlined">smart_toy</span>';
      rowEl.appendChild(avatar);
    }
    
    const msgEl = document.createElement('div');
    msgEl.className = 'ai-message';
    
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
    
    rowEl.appendChild(msgEl);
    messagesDiv.appendChild(rowEl);
    messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });
  }
  
  // Add a default greeting message so the chat is never completely empty
  renderMessage({
    role: 'ai',
    text: t('ai.workspace.greeting')
  });
  
  function toggleLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? 'block' : 'none';
    sendBtn.disabled = isLoading;
    input.disabled = isLoading;
  }
  
  function clear() {
    messagesDiv.replaceChildren();
  }
  
  return {
    element: container,
    renderMessage,
    clear,
    toggleLoading,
    messagesContainer: messagesDiv // exposed for testing
  };
}

export function createSettingsView({ onConnect, onDisconnect, getDiagnostics, t = (k) => k }) {
  const container = document.createElement('div');
  container.className = 'ai-settings';
  
  const keyInput = document.createElement('input');
  keyInput.type = 'password';
  keyInput.placeholder = t('ai.settings.apiKey');
  keyInput.className = 'edit-input';
  keyInput.setAttribute('aria-label', t('ai.settings.apiKey'));
  
  const connectBtn = document.createElement('button');
  connectBtn.textContent = t('ai.settings.connect');
  connectBtn.className = 'btn btn-primary';
  
  const disconnectBtn = document.createElement('button');
  disconnectBtn.textContent = t('ai.settings.disconnect');
  disconnectBtn.className = 'btn';
  
  const statusEl = document.createElement('div');
  statusEl.textContent = t('ai.settings.statusDisconnected');
  statusEl.className = 'ai-status-text';
  
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
