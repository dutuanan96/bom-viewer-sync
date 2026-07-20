export function createWorkspaceView({ onSend, onClear, t = (k) => k }) {
  const container = document.createElement('div');
  container.className = 'ai-workspace';

  const messagesDiv = document.createElement('div');
  messagesDiv.className = 'ai-messages';

  const toolbar = document.createElement('div');
  toolbar.className = 'ai-workspace-toolbar';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'ai-clear-btn';
  toolbar.appendChild(clearBtn);

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
  charCounter.setAttribute('aria-live', 'polite');
  charCounter.setAttribute('aria-atomic', 'true');

  const sendBtn = document.createElement('button');
  sendBtn.className = 'ai-send-btn';
  const sendIcon = document.createElement('span');
  sendIcon.className = 'material-symbols-outlined';
  sendIcon.textContent = 'send';
  sendBtn.appendChild(sendIcon);

  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'ai-loading-indicator';
  loadingIndicator.textContent = t('ai.workspace.loading');
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
  container.appendChild(toolbar);
  container.appendChild(loadingIndicator);
  container.appendChild(inputDiv);

  function renderMessage(msg) {
    const rowEl = document.createElement('div');
    rowEl.className = `ai-message-row ${msg.role}`;

    if (msg.role === 'ai' || msg.role === 'assistant') {
      const avatar = document.createElement('div');
      avatar.className = 'ai-avatar';
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.textContent = 'smart_toy';
      avatar.appendChild(icon);
      rowEl.appendChild(avatar);
    }

    const msgEl = document.createElement('div');
    msgEl.className = 'ai-message';

    // SAFE RENDERING: Only use textContent
    if (msg.text) {
      const textEl = document.createElement('div');
      textEl.className = 'ai-message-text';
      textEl.textContent = String(msg.text)
        .split('\n')
        .map(line => line
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/__([^_]+)__/g, '$1')
          .replace(/^(\s*)\*\s+/, '$1- ')
          .replace(/^(\s*)#{1,6}\s+/, '$1'))
        .join('\n');
      msgEl.appendChild(textEl);
    }

    // Render citations safely
    if (msg.citations && msg.citations.length > 0) {
      const citEl = document.createElement('div');
      citEl.className = 'ai-citations';
      msg.citations.forEach(cit => {
        try {
          const url = new URL(cit);
          if (url.protocol !== 'https:') throw new Error('Unsupported citation protocol');
          const link = document.createElement('a');
          link.className = 'ai-citation-badge';
          link.href = url.toString();
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = `[${url.hostname}]`;
          citEl.appendChild(link);
        } catch {
          const span = document.createElement('span');
          span.className = 'ai-citation-badge';
          span.textContent = `[${cit}]`;
          citEl.appendChild(span);
        }
      });
      msgEl.appendChild(citEl);
    }

    if (Array.isArray(msg.mappingCandidates) && msg.mappingCandidates.length > 0) {
      const mappingCard = document.createElement('div');
      mappingCard.className = 'ai-mapping-candidates';
      msg.mappingCandidates.slice(0, 3).forEach((candidate) => {
        const target = candidate?.target || {};
        const canonicalTarget = target.type === 'material'
          ? target.materialId
          : [target.productCode, target.color].filter(Boolean).join(' / ');
        const row = document.createElement('div');
        row.className = 'ai-mapping-candidate';
        row.textContent = `${canonicalTarget} · ${Number(candidate.confidence || 0).toFixed(2)} · ${candidate.source || ''}`;
        const chooseButton = document.createElement('button');
        chooseButton.type = 'button';
        chooseButton.className = 'btn';
        chooseButton.textContent = t('ai.mapping.choose');
        chooseButton.addEventListener('click', () => {
          chooseButton.disabled = true;
          msg.onSelectMapping?.(candidate);
        });
        row.appendChild(chooseButton);
        mappingCard.appendChild(row);
      });
      msgEl.appendChild(mappingCard);
    }

    // Render Proposal Card (R4.2)
    if (msg.proposal && msg.diff) {
      const propEl = document.createElement('div');
      propEl.className = 'ai-proposal-card';

      const title = document.createElement('strong');
      title.textContent = t('ai.proposal.title');
      propEl.appendChild(title);

      // Render Exact Diff
      if (msg.diff.length === 0) {
        const noDiff = document.createElement('div');
        noDiff.className = 'ai-diff-empty';
        noDiff.textContent = t('ai.proposal.noChanges');
        propEl.appendChild(noDiff);
      } else {
        const diffTable = document.createElement('table');
        diffTable.className = 'ai-diff-table diff-table';
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        [
          t('ai.proposal.type'),
          t('ai.proposal.code'),
          t('ai.proposal.field'),
          t('ai.proposal.before'),
          t('ai.proposal.after'),
        ].forEach((label) => {
          const th = document.createElement('th');
          th.textContent = label;
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        diffTable.appendChild(thead);

        const tbody = document.createElement('tbody');
        msg.diff.forEach(d => {
          const tr = document.createElement('tr');

          const tdKind = document.createElement('td');
          tdKind.textContent = d.kind;

          const tdCode = document.createElement('td');
          tdCode.textContent = d.code;

          const tdField = document.createElement('td');
          tdField.textContent = d.field;

          const tdBefore = document.createElement('td');
          tdBefore.className = 'diff-removed';
          tdBefore.textContent = d.before;

          const tdAfter = document.createElement('td');
          tdAfter.className = 'diff-added';
          tdAfter.textContent = d.after;

          tr.appendChild(tdKind);
          tr.appendChild(tdCode);
          tr.appendChild(tdField);
          tr.appendChild(tdBefore);
          tr.appendChild(tdAfter);

          tbody.appendChild(tr);
        });
        diffTable.appendChild(tbody);
        propEl.appendChild(diffTable);
      }

      const actionRow = document.createElement('div');
      actionRow.className = 'ai-proposal-actions';
      actionRow.style.marginTop = '12px';

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn';
      rejectBtn.textContent = t('ai.proposal.reject');
      rejectBtn.onclick = () => {
        rejectBtn.disabled = true;
        approveBtn.disabled = true;
        renderMessage({ role: 'user', text: t('ai.proposal.rejected') });
        if (msg.onReject) msg.onReject();
      };

      const approveBtn = document.createElement('button');
      approveBtn.className = 'btn btn-primary';
      approveBtn.textContent = t('ai.proposal.approve');
      approveBtn.style.marginLeft = '8px';
      approveBtn.onclick = () => {
        rejectBtn.disabled = true;
        approveBtn.disabled = true;
        renderMessage({ role: 'user', text: t('ai.proposal.approved') });
        if (msg.onApprove) msg.onApprove(msg.approval || msg.proposal);
      };

      actionRow.appendChild(rejectBtn);
      actionRow.appendChild(approveBtn);
      propEl.appendChild(actionRow);

      msgEl.appendChild(propEl);
    }

    rowEl.appendChild(msgEl);
    messagesDiv.appendChild(rowEl);

    // Cap messages to 100 to prevent memory leak
    while (messagesDiv.children.length > 100) {
      messagesDiv.removeChild(messagesDiv.firstChild);
    }

    messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });
  }

  function updateLanguage() {
    input.placeholder = t('ai.workspace.placeholder');
    input.setAttribute('aria-label', t('ai.workspace.placeholder'));

    sendBtn.replaceChildren();
    const sendIconSpan = document.createElement('span');
    sendIconSpan.className = 'material-symbols-outlined';
    sendIconSpan.setAttribute('aria-hidden', 'true');
    sendIconSpan.textContent = 'send';
    const srSpan = document.createElement('span');
    srSpan.className = 'sr-only';
    srSpan.textContent = t('ai.workspace.send');
    sendBtn.appendChild(sendIconSpan);
    sendBtn.appendChild(srSpan);

    loadingIndicator.textContent = t('ai.workspace.loading');
    clearBtn.textContent = t('ai.workspace.clear');

    messagesDiv.setAttribute('role', 'log');
    messagesDiv.setAttribute('aria-live', 'polite');
    messagesDiv.setAttribute('aria-label', t('ai.workspace.conversationLabel') || 'Conversation');
  }

  updateLanguage();

  // Add a default greeting message so the chat is never completely empty
  function renderGreeting() {
    renderMessage({
      role: 'ai',
      text: t('ai.workspace.greeting')
    });
  }

  renderGreeting();

  function toggleLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? 'block' : 'none';
    sendBtn.disabled = isLoading;
    input.disabled = isLoading;
  }

  function clear() {
    messagesDiv.replaceChildren();
    if (typeof onClear === 'function') onClear();
  }

  clearBtn.addEventListener('click', () => {
    clear();
    renderGreeting();
  });

  function destroy() {
    container.remove();
  }

  return {
    element: container,
    renderMessage,
    clear,
    toggleLoading,
    updateLanguage,
    destroy,
    messagesContainer: messagesDiv // exposed for testing
  };
}

export function createSettingsView({
  onConnect,
  onDisconnect,
  onModelChange,
  getDiagnostics,
  localStore,
  onKnowledgeImport,
  onMarketplaceWebChange,
  onExportMapping,
  t = (k) => k,
}) {
  const container = document.createElement('div');
  container.className = 'ai-settings';

  const keyInput = document.createElement('input');
  keyInput.type = 'password';
  keyInput.className = 'edit-input';
  keyInput.style.marginBottom = '12px';

  const modelLabel = document.createElement('label');
  modelLabel.className = 'ai-settings-warning';
  modelLabel.style.display = 'block';
  modelLabel.style.marginBottom = '4px';

  const modelSelect = document.createElement('select');
  modelSelect.className = 'edit-input';
  modelSelect.style.marginBottom = '12px';

  const marketplaceWebRow = document.createElement('label');
  marketplaceWebRow.className = 'ai-settings-warning';
  marketplaceWebRow.style.display = 'flex';
  marketplaceWebRow.style.gap = '8px';
  marketplaceWebRow.style.marginBottom = '12px';
  const marketplaceWebInput = document.createElement('input');
  marketplaceWebInput.type = 'checkbox';
  const marketplaceWebText = document.createElement('span');
  marketplaceWebRow.appendChild(marketplaceWebInput);
  marketplaceWebRow.appendChild(marketplaceWebText);
  marketplaceWebInput.addEventListener('change', () => {
    onMarketplaceWebChange?.(marketplaceWebInput.checked);
  });

  const initialModels = [
    { value: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'NVIDIA Nemotron-3 Ultra 550B (Free)' },
    { value: 'poolside/laguna-m.1:free', label: 'Poolside Laguna m.1 (Free)' },
    { value: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'NVIDIA Nemotron-3 Super 120B (Free)' },
    { value: 'cohere/north-mini-code:free', label: 'Cohere North Mini Code (Free)' },
    { value: 'tencent/hy3:free', label: 'Tencent HY3 (Free)' },
    { value: 'xiaomi/mimo-v2.5', label: 'Xiaomi MiMo v2.5' },
    { value: 'deepseek/deepseek-v4-flash', label: 'DeepSeek v4 Flash' }
  ];

  function updateModels(models) {
    const compatible = (models || []).filter((model) => model.grade === 'A' || model.grade === 'B');
    const options = compatible.length > 0
      ? compatible.map((model) => ({ value: model.id, label: `${model.name || model.id} (${model.grade})` }))
      : initialModels;
    const previous = modelSelect.value;
    modelSelect.replaceChildren();
    options.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = model.label;
      modelSelect.appendChild(option);
    });
    const selected = options.some((model) => model.value === previous) ? previous : options[0]?.value;
    if (selected) {
      modelSelect.value = selected;
      onModelChange?.(selected);
    }
  }

  updateModels([]);

  modelSelect.addEventListener('change', () => {
    if (onModelChange) onModelChange(modelSelect.value);
  });

  const connectBtn = document.createElement('button');
  connectBtn.className = 'btn btn-primary';

  const disconnectBtn = document.createElement('button');
  disconnectBtn.className = 'btn';

  const statusEl = document.createElement('div');
  statusEl.className = 'ai-status-text';

  const warningEl = document.createElement('div');
  warningEl.className = 'ai-settings-warning';
  warningEl.style.fontSize = '12px';
  warningEl.style.color = 'var(--text-secondary, #666)';
  warningEl.style.marginBottom = '12px';

  let isConnected = false;

  const memorySection = document.createElement('section');
  memorySection.className = 'ai-memory-settings';
  const memoryTitle = document.createElement('h3');
  const persistenceStatus = document.createElement('div');
  persistenceStatus.className = 'ai-settings-warning';
  const memoryList = document.createElement('div');
  memoryList.className = 'ai-memory-list';
  const knowledgeInput = document.createElement('input');
  knowledgeInput.type = 'file';
  knowledgeInput.accept = '.json,.csv,.txt,.md';
  knowledgeInput.className = 'edit-input';
  const importStatus = document.createElement('div');
  importStatus.className = 'ai-settings-warning';
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'btn';

  const traceSection = document.createElement('section');
  traceSection.className = 'ai-trace-settings';
  const traceTitle = document.createElement('h3');
  const traceSummary = document.createElement('div');
  traceSummary.className = 'ai-settings-warning';
  const traceOutput = document.createElement('pre');
  traceOutput.className = 'ai-trace-output';
  const traceCopyButton = document.createElement('button');
  traceCopyButton.type = 'button';
  traceCopyButton.className = 'btn';
  let latestTrace = [];

  function renderTrace() {
    const diagnostics = getDiagnostics?.() || {};
    traceSummary.textContent = latestTrace.length > 0
      ? `${t('ai.trace.events')}: ${latestTrace.length} · ${diagnostics.connected ? t('ai.settings.statusConnected') : t('ai.settings.statusDisconnected')}`
      : t('ai.trace.empty');
    traceOutput.textContent = latestTrace.length > 0 ? JSON.stringify(latestTrace, null, 2) : '';
  }

  function updateTrace(trace) {
    latestTrace = Array.isArray(trace) ? trace.slice(-32) : [];
    renderTrace();
  }

  traceCopyButton.addEventListener('click', async () => {
    if (!traceOutput.textContent) return;
    try {
      await navigator.clipboard.writeText(traceOutput.textContent);
      traceCopyButton.textContent = t('ai.trace.copied');
    } catch {
      traceCopyButton.textContent = t('ai.trace.copy');
    }
  });

  function refreshMemories() {
    memoryList.replaceChildren();
    const records = localStore?.listMemories?.() || [];
    records.forEach((record) => {
      const row = document.createElement('div');
      row.className = 'ai-memory-row';
      const fact = document.createElement('span');
      fact.textContent = `[${record.status}] ${record.fact}`;
      row.appendChild(fact);
      if (record.entityMapping) {
        const mapping = record.entityMapping;
        const canonicalTarget = mapping.target?.type === 'material'
          ? mapping.target.materialId
          : [mapping.target?.productCode, mapping.target?.color].filter(Boolean).join(' / ');
        const details = document.createElement('div');
        details.className = 'ai-mapping-details';
        details.textContent = `${mapping.phrase} → ${canonicalTarget} · ${Number(mapping.confidence || 0).toFixed(2)} · ${mapping.provenance?.[0]?.sourceType || ''}`;
        row.appendChild(details);
      }
      if (record.status === 'candidate' || record.status === 'stale') {
        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'btn';
        confirmButton.textContent = t('ai.memory.confirm');
        confirmButton.addEventListener('click', () => { localStore.confirm(record.id); refreshMemories(); });
        row.appendChild(confirmButton);
        const rejectButton = document.createElement('button');
        rejectButton.type = 'button';
        rejectButton.className = 'btn';
        rejectButton.textContent = t('ai.memory.reject');
        rejectButton.addEventListener('click', () => { localStore.reject(record.id); refreshMemories(); });
        row.appendChild(rejectButton);
      }
      if (record.entityMapping) {
        const promotionButton = document.createElement('button');
        promotionButton.type = 'button';
        promotionButton.className = 'btn';
        promotionButton.textContent = t('ai.mapping.exportPromotion');
        promotionButton.disabled = record.status !== 'confirmed';
        promotionButton.addEventListener('click', () => {
          if (promotionButton.disabled || !onExportMapping) return;
          const serialized = onExportMapping(record.entityMapping);
          const blob = new Blob([serialized], { type: 'application/json' });
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          link.href = url;
          link.download = 'jintai-company-entity-alias-candidate.json';
          link.click();
          URL.revokeObjectURL(url);
        });
        row.appendChild(promotionButton);
      }
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn';
      deleteButton.textContent = t('ai.memory.delete');
      deleteButton.addEventListener('click', () => { localStore.deleteMemory(record.id); refreshMemories(); });
      row.appendChild(deleteButton);
      memoryList.appendChild(row);
    });
    const mode = localStore?.diagnostics?.().persistence || 'session-only';
    persistenceStatus.textContent = mode === 'persistent'
      ? t('ai.memory.persistent')
      : t('ai.memory.sessionOnly');
  }

  knowledgeInput.addEventListener('change', async () => {
    const file = knowledgeInput.files?.[0];
    if (!file || !onKnowledgeImport) return;
    try {
      await onKnowledgeImport(file);
      importStatus.textContent = t('ai.knowledge.importedCandidate');
      refreshMemories();
    } catch (error) {
      importStatus.textContent = `${t('ai.knowledge.importFailed')}: ${error.message}`;
    } finally {
      knowledgeInput.value = '';
    }
  });

  exportButton.addEventListener('click', () => {
    if (!localStore?.exportData) return;
    const blob = new Blob([localStore.exportData()], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'jintai-ai-memory-audit.json';
    link.click();
    URL.revokeObjectURL(url);
  });

  function updateLanguage() {
    keyInput.placeholder = t('ai.settings.apiKey');
    keyInput.setAttribute('aria-label', t('ai.settings.apiKey'));
    connectBtn.textContent = t('ai.settings.connect');
    disconnectBtn.textContent = t('ai.settings.disconnect');
    statusEl.textContent = isConnected ? '✅ ' + t('ai.settings.statusConnected') : '❌ ' + t('ai.settings.statusDisconnected');
    statusEl.className = 'ai-status-text ' + (isConnected ? 'connected' : 'disconnected');
    warningEl.textContent = t('ai.settings.keyNotPersisted');
    modelLabel.textContent = t('ai.settings.modelLabel') || 'AI Model';
    marketplaceWebText.textContent = t('ai.marketplace.webConsent');
    memoryTitle.textContent = t('ai.memory.title');
    knowledgeInput.setAttribute('aria-label', t('ai.knowledge.import'));
    exportButton.textContent = t('ai.memory.export');
    traceTitle.textContent = t('ai.trace.title');
    traceCopyButton.textContent = t('ai.trace.copy');
    renderTrace();
    refreshMemories();
  }

  updateLanguage();

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
    isConnected = connected;
    updateLanguage();
  }

  container.appendChild(statusEl);
  container.appendChild(warningEl);
  container.appendChild(keyInput);
  container.appendChild(modelLabel);
  container.appendChild(modelSelect);
  container.appendChild(marketplaceWebRow);
  container.appendChild(connectBtn);
  container.appendChild(disconnectBtn);
  traceSection.appendChild(traceTitle);
  traceSection.appendChild(traceSummary);
  traceSection.appendChild(traceOutput);
  traceSection.appendChild(traceCopyButton);
  container.appendChild(traceSection);
  memorySection.appendChild(memoryTitle);
  memorySection.appendChild(persistenceStatus);
  memorySection.appendChild(knowledgeInput);
  memorySection.appendChild(importStatus);
  memorySection.appendChild(exportButton);
  memorySection.appendChild(memoryList);
  container.appendChild(memorySection);

  return {
    element: container,
    updateState,
    updateLanguage,
    updateModels,
    refreshMemories,
    updateTrace
  };
}
