import { buildMutationProposalReview } from './mutation-engine.js';
import { materialWhereUsed } from '../../domain/materials.js';

function swapError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function replacementKey(operation) {
  return `${operation.operationType}|${operation.targetId}|${operation.payload?.materialId || ''}`;
}

function cloneOperation(operation) {
  return JSON.parse(JSON.stringify(operation));
}

export function buildRegeneratedSwapOperations({ proposal, snapshot, swaps }) {
  const sourceOperations = proposal?.operations || proposal?.proposedActions || [];
  const sourceIndexes = new Set();
  const replacements = [];
  const affectedProducts = new Set();

  for (const swap of swaps || []) {
    const sourceIndex = swap?.operation?.sourceIndex;
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= sourceOperations.length) {
      throw swapError('AI_SWAP_SOURCE_MISSING', 'The selected proposal operation has no stable source index.');
    }
    if (!swap.duplicateId) {
      throw swapError('AI_SWAP_DUPLICATE_MISSING', 'The selected duplicate material is missing.');
    }

    sourceIndexes.add(sourceIndex);
    const sourceMaterialId = swap.operation?.mutation?.targetId;
    const usage = materialWhereUsed(snapshot?.payload, sourceMaterialId);
    const replacementCountBefore = replacements.length;

    for (const entry of usage.productEntries || []) {
      const productCode = entry.productCode || entry.parentId;
      if (productCode) affectedProducts.add(productCode);
      replacements.push({
        operationType: 'replace_bom_item',
        targetId: entry.id,
        payload: { materialId: swap.duplicateId },
      });
    }
    for (const entry of usage.parentEntries || []) {
      replacements.push({
        operationType: 'replace_bom_item',
        targetId: entry.id,
        payload: { materialId: swap.duplicateId },
      });
    }
    if (replacements.length === replacementCountBefore) {
      throw swapError('AI_SWAP_NO_USAGES', 'The selected material has no BOM usages to replace.');
    }
  }

  const retainedOperations = sourceOperations
    .filter((_, index) => !sourceIndexes.has(index))
    .map(cloneOperation);
  const seenReplacements = new Set();
  const uniqueReplacements = replacements.filter((operation) => {
    const key = replacementKey(operation);
    if (seenReplacements.has(key)) return false;
    seenReplacements.add(key);
    return true;
  });

  return {
    operations: [...retainedOperations, ...uniqueReplacements],
    affectedProducts: [...affectedProducts],
  };
}

export function findProductsNeedingDraft(payload, productCodes) {
  return [...new Set(productCodes || [])].filter((productCode) => {
    const revisionRecord = payload?.productRevisions?.[productCode];
    return revisionRecord && revisionRecord.currentRevisionInfo?.workflowState !== 'draft';
  });
}

export function buildDraftRevisionOperations(productCodes, values) {
  return [...new Set(productCodes || [])].map((productCode) => ({
    operationType: 'create_product_revision',
    targetId: productCode,
    payload: {
      revision: String(values?.[`revision_${productCode}`] || '').trim(),
      changeReason: String(values?.[`reason_${productCode}`] || '').trim(),
    },
  }));
}

export function buildWithdrawRevisionOperations(productCodes, values) {
  return [...new Set(productCodes || [])].map((productCode) => ({
    operationType: 'withdraw_product_revision',
    targetId: productCode,
    payload: {
      reason: String(values?.[`withdrawReason_${productCode}`] || '').trim(),
    },
  }));
}

export function createWorkspaceView({ onSend, onClear, onStop, t = (k) => k, openPdmPrompt, openPdmConfirm }) {
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
  charCounter.setAttribute('aria-live', 'polite');
  charCounter.setAttribute('aria-atomic', 'true');

  const sendBtn = document.createElement('button');
  sendBtn.className = 'ai-send-btn';
  const sendIcon = document.createElement('span');
  sendIcon.className = 'material-symbols-outlined';
  sendIcon.textContent = 'send';
  sendBtn.appendChild(sendIcon);

  const stopBtn = document.createElement('button');
  stopBtn.className = 'ai-stop-btn';
  stopBtn.style.display = 'none';
  const stopIcon = document.createElement('span');
  stopIcon.className = 'material-symbols-outlined';
  stopIcon.textContent = 'stop_circle';
  stopBtn.appendChild(stopIcon);
  stopBtn.addEventListener('click', () => {
    if (typeof onStop === 'function') onStop();
  });

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
  inputFooter.appendChild(stopBtn);

  inputWrapper.appendChild(inputFooter);
  inputDiv.appendChild(inputWrapper);

  container.appendChild(messagesDiv);
  container.appendChild(loadingIndicator);
  container.appendChild(inputDiv);

  function startStreamingMessage() {
    const rowEl = document.createElement('div');
    rowEl.className = 'ai-message-row assistant';
    const avatar = document.createElement('div');
    avatar.className = 'ai-avatar';
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = 'smart_toy';
    avatar.appendChild(icon);
    rowEl.appendChild(avatar);

    const msgEl = document.createElement('div');
    msgEl.className = 'ai-message streaming-message';

    const statusContainer = document.createElement('div');
    statusContainer.className = 'ai-message-status';
    statusContainer.style.display = 'none';
    msgEl.appendChild(statusContainer);

    const textContainer = document.createElement('div');
    textContainer.className = 'ai-message-text';
    msgEl.appendChild(textContainer);

    rowEl.appendChild(msgEl);
    messagesDiv.appendChild(rowEl);
    messagesDiv.scrollTo({ top: messagesDiv.scrollHeight });

    let currentText = '';
    let isFinished = false;

    return {
      updateStatus: (text) => {
        if (isFinished || !text) return;
        statusContainer.textContent = text;
        statusContainer.style.display = 'flex';
        messagesDiv.scrollTo({ top: messagesDiv.scrollHeight });
      },
      updateText: (delta) => {
        if (isFinished) return;
        currentText += delta;
        textContainer.textContent = String(currentText)
          .split('\n')
          .map(line => line
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/^(\s*)\*\s+/, '$1- ')
            .replace(/^(\s*)#{1,6}\s+/, '$1'))
          .join('\n');
        messagesDiv.scrollTo({ top: messagesDiv.scrollHeight });
      },
      finish: (finalMsg) => {
        isFinished = true;
        rowEl.remove();
        renderMessage(finalMsg);
      }
    };
  }
  function handleMultipleSwaps(msg, swaps, propEl, t) {
    const snapshot = msg.snapshot;
    if (!snapshot) {
      renderMessage({ role: 'assistant', text: t('ai.proposal.regenerateFailed') });
      return;
    }

    let regenerated;
    try {
      regenerated = buildRegeneratedSwapOperations({ proposal: msg.proposal, snapshot, swaps });
    } catch (error) {
      const key = error?.code === 'AI_SWAP_NO_USAGES'
        ? 'ai.proposal.swapNoUsages'
        : 'ai.proposal.regenerateFailed';
      renderMessage({ role: 'assistant', text: t(key) });
      return;
    }

    const productsNeedingDraft = findProductsNeedingDraft(
      snapshot.payload,
      regenerated.affectedProducts,
    );

    function chooseReleasedRevisionAction(onCreateDraft, onWithdraw) {
      const overlay = document.createElement('div');
      overlay.className = 'pdm-modal-overlay open';
      const modal = document.createElement('div');
      modal.className = 'pdm-modal-content pdm-modal-sm';
      const title = document.createElement('h2');
      title.textContent = t('ai.proposal.releasedRevisionChoiceTitle');
      const description = document.createElement('p');
      description.textContent = t('ai.proposal.releasedRevisionChoiceMessage');
      const actions = document.createElement('div');
      actions.className = 'pdm-modal-footer';

      const cancel = document.createElement('button');
      cancel.className = 'btn';
      cancel.textContent = t('cancelBtn');
      const createDraft = document.createElement('button');
      createDraft.className = 'btn btn-primary';
      createDraft.textContent = t('ai.proposal.createDraftOption');
      const withdraw = document.createElement('button');
      withdraw.className = 'btn btn-danger';
      withdraw.textContent = t('ai.proposal.withdrawOption');

      const close = () => overlay.remove();
      cancel.onclick = close;
      createDraft.onclick = () => {
        close();
        onCreateDraft();
      };
      withdraw.onclick = () => {
        close();
        onWithdraw();
      };
      actions.append(cancel, withdraw, createDraft);
      modal.append(title, description, actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    }

    if (productsNeedingDraft.length > 0) {
      if (typeof openPdmPrompt !== 'function' || typeof openPdmConfirm !== 'function') {
        renderMessage({ role: 'assistant', text: t('ai.proposal.regenerateFailed') });
        return;
      }
      chooseReleasedRevisionAction(() => {
        const fields = productsNeedingDraft.flatMap((productCode) => [
          {
            key: `revision_${productCode}`,
            label: t('ai.proposal.swapRevisionField').replace('{product}', productCode),
            required: true,
          },
          {
            key: `reason_${productCode}`,
            label: t('ai.proposal.swapRevisionReasonField').replace('{product}', productCode),
            required: true,
          },
        ]);
        openPdmPrompt(t('ai.proposal.createDraftForSwap'), fields, (values) => {
          const revisionOperations = buildDraftRevisionOperations(productsNeedingDraft, values);
          finishHandleMultipleSwaps([...revisionOperations, ...regenerated.operations]);
        });
      }, () => {
        const fields = productsNeedingDraft.map((productCode) => ({
          key: `withdrawReason_${productCode}`,
          label: t('ai.proposal.withdrawReasonField').replace('{product}', productCode),
          required: true,
        }));
        openPdmPrompt(t('ai.proposal.withdrawReleasedForSwap'), fields, (values) => {
          const products = productsNeedingDraft.join(', ');
          openPdmConfirm(
            t('ai.proposal.withdrawConfirmForSwap').replace('{products}', products),
            () => {
              const revisionOperations = buildWithdrawRevisionOperations(productsNeedingDraft, values);
              finishHandleMultipleSwaps([...revisionOperations, ...regenerated.operations]);
            },
          );
        });
      });
      return;
    }
    finishHandleMultipleSwaps(regenerated.operations);
    
    function finishHandleMultipleSwaps(operations) {
      const nextProposal = {
        ...msg.proposal,
        operations,
        ...(msg.proposal?.proposedActions ? { proposedActions: operations } : {}),
      };

      try {
        const review = buildMutationProposalReview(snapshot, nextProposal, t);
        if (typeof msg.onRegenerate === 'function') {
          msg.onRegenerate(operations);
        } else {
          renderMessage({
            ...msg,
            role: 'assistant',
            text: t('ai.proposal.prepared') || 'Proposal prepared for review.',
            proposal: nextProposal,
            proposalReview: review,
            diff: review.finalDiff,
            snapshot: snapshot
          });
        }
        if (propEl) {
          propEl.style.opacity = '0.5';
          propEl.style.pointerEvents = 'none';
        }
      } catch (error) {
        if (propEl) {
          propEl.style.opacity = '1';
          propEl.style.pointerEvents = 'auto';
        }
        renderMessage({ role: 'assistant', text: t('ai.proposal.regenerateFailed') });
      }
    }
  }

  function createPaginatedDiffTable(diffArray, t, revision = '') {
    const container = document.createElement('div');
    container.className = 'ai-diff-table-container';
    
    if (!diffArray || diffArray.length === 0) {
      const noDiff = document.createElement('div');
      noDiff.className = 'ai-diff-empty';
      noDiff.textContent = t('ai.proposal.noChanges') || 'No changes detected.';
      container.appendChild(noDiff);
      return container;
    }

    const hasRevision = !!revision;

    const diffTable = document.createElement('table');
    diffTable.className = 'ai-diff-table diff-table';
    
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    [
      t('ai.proposal.type'),
      t('ai.proposal.code'),
      ...(hasRevision ? [t('ai.proposal.version') || 'Version'] : []),
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
    diffTable.appendChild(tbody);
    container.appendChild(diffTable);

    const PAGE_SIZE = 8;
    let currentPage = 1;
    const totalPages = Math.ceil(diffArray.length / PAGE_SIZE);

    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'ai-diff-pagination';
    paginationDiv.style.display = totalPages > 1 ? 'flex' : 'none';
    paginationDiv.style.justifyContent = 'center';
    paginationDiv.style.alignItems = 'center';
    paginationDiv.style.gap = '8px';
    paginationDiv.style.marginTop = '8px';
    paginationDiv.style.fontSize = '12px';
    container.appendChild(paginationDiv);

    function renderPage(page) {
      currentPage = page;
      tbody.textContent = '';
      const start = (page - 1) * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      const visibleDiffs = diffArray.slice(start, end);
      
      visibleDiffs.forEach(d => {
        const tr = document.createElement('tr');
        
        const fieldParts = String(d.field || '').split('.');
        const fieldSuffix = fieldParts.pop();
        const translatedSuffix = fieldSuffix ? (t('ai.proposal.field.' + fieldSuffix) || fieldSuffix) : '';
        const translatedField = fieldParts.length > 0 ? `${fieldParts.join('.')} - ${translatedSuffix}` : translatedSuffix;

        for (const [value, className] of [
          [t('ai.proposal.kind.' + d.kind) || d.kind, ''],
          [d.code, ''],
          ...(hasRevision ? [[revision, '']] : []),
          [translatedField, ''],
          [d.before, 'diff-removed'],
          [d.after, 'diff-added'],
        ]) {
          const td = document.createElement('td');
          td.className = className;
          td.textContent = value;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      });

      if (totalPages > 1) {
        paginationDiv.textContent = '';
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn small outline';
        prevBtn.textContent = '<';
        prevBtn.disabled = currentPage === 1;
        prevBtn.onclick = () => renderPage(currentPage - 1);
        paginationDiv.appendChild(prevBtn);
        
        for (let i = 1; i <= totalPages; i++) {
          if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            const pageBtn = document.createElement('button');
            pageBtn.className = 'btn small ' + (i === currentPage ? 'btn-primary' : 'outline');
            pageBtn.textContent = i;
            pageBtn.onclick = () => renderPage(i);
            paginationDiv.appendChild(pageBtn);
          } else if (i === currentPage - 2 || i === currentPage + 2) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            paginationDiv.appendChild(dots);
          }
        }
        
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn small outline';
        nextBtn.textContent = '>';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.onclick = () => renderPage(currentPage + 1);
        paginationDiv.appendChild(nextBtn);
      }
    }

    renderPage(1);
    
    return container;
  }

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
      
      const pendingSwaps = new Map();
      let approveBtn; // Forward declaration
      function updateApproveButtonState() {
        if (!approveBtn) return;
        if (selectedOperationIds.size === 0) {
          approveBtn.disabled = true;
          approveBtn.textContent = t('ai.proposal.approve');
        } else if (pendingSwaps.size > 0) {
          approveBtn.disabled = false;
          approveBtn.textContent = t('ai.proposal.regenerateProposal') || 'Tạo mới phương án';
        } else {
          approveBtn.disabled = false;
          approveBtn.textContent = t('ai.proposal.approve');
        }
      }

      const title = document.createElement('strong');
      title.textContent = t('ai.proposal.title');
      propEl.appendChild(title);

      const reviewOperations = Array.isArray(msg.proposalReview?.operations)
        ? msg.proposalReview.operations
        : [];
      const selectedOperationIds = new Set(reviewOperations.map(operation => operation.id));

      if (reviewOperations.length > 0) {
        const totalChanges = reviewOperations.length;
        let highestRiskLevel = 'low';
        const riskOrder = { 'low': 1, 'medium': 2, 'high': 3 };
        let duplicatesCount = 0;
        
        reviewOperations.forEach(op => {
          if (riskOrder[op.risk] > riskOrder[highestRiskLevel]) highestRiskLevel = op.risk;
          (op.warnings || []).forEach(w => {
             if (w?.action?.type === 'swap') duplicatesCount++;
          });
        });
        
        const summaryDash = document.createElement('div');
        summaryDash.className = 'ai-proposal-summary';
        
        const summaryItems = [
          { label: t('ai.proposal.totalChanges') || 'Total Changes', value: totalChanges },
          { label: t('ai.proposal.duplicates') || 'Duplicates', value: duplicatesCount, valueClass: duplicatesCount > 0 ? 'warning' : '' },
          { label: t('ai.proposal.highestRisk') || 'Highest Risk', value: t(`ai.proposal.risk.${highestRiskLevel}`), valueClass: highestRiskLevel === 'high' ? 'error' : (highestRiskLevel === 'medium' ? 'warning' : 'success') }
        ];
        
        summaryItems.forEach(item => {
          const itemEl = document.createElement('div');
          itemEl.className = 'ai-proposal-summary-item';
          
          const labelEl = document.createElement('span');
          labelEl.className = 'ai-proposal-summary-label';
          labelEl.textContent = item.label;
          
          const valueEl = document.createElement('span');
          valueEl.className = `ai-proposal-summary-value ${item.valueClass || ''}`;
          valueEl.textContent = item.value;
          
          itemEl.append(labelEl, valueEl);
          summaryDash.appendChild(itemEl);
        });
        
        propEl.appendChild(summaryDash);
      }

      const verification = msg.proposalReview?.verification;
      if (verification) {
        const verificationEl = document.createElement('div');
        verificationEl.className = `ai-proposal-verification ${verification.valid ? 'is-valid' : 'is-invalid'}`;
        verificationEl.textContent = verification.valid
          ? t('ai.proposal.verified')
          : t('ai.proposal.verifyFailed');
        propEl.appendChild(verificationEl);
        (verification.warnings || []).forEach((warning) => {
          const warningEl = document.createElement('div');
          warningEl.className = verification.valid ? 'ai-proposal-warning-box' : 'ai-proposal-error-box';
          warningEl.textContent = warning;
          propEl.appendChild(warningEl);
        });
      }

      if (reviewOperations.length > 0) {
        const categories = [
          ['product', t('ai.proposal.categoryProduct')],
          ['revision', t('ai.proposal.categoryRevision')],
          ['material', t('ai.proposal.categoryMaterial')],
          ['bom', t('ai.proposal.categoryBom')],
          ['structure', t('ai.proposal.categoryStructure')],
        ];
        for (const [category, label] of categories) {
          const categoryOperations = reviewOperations.filter(operation => operation.category === category);
          if (categoryOperations.length === 0) continue;
          const section = document.createElement('section');
          section.className = 'ai-proposal-category';
          const heading = document.createElement('h4');
          heading.textContent = label;
          section.appendChild(heading);
          for (const operation of categoryOperations) {
            const operationEl = document.createElement('div');
            operationEl.className = 'ai-proposal-operation';
            operationEl.dataset.proposalOperationId = operation.id;

            const operationHeader = document.createElement('div');
            operationHeader.className = 'ai-proposal-operation-header';
            const operationName = document.createElement('span');
            operationName.className = 'ai-proposal-operation-title';
            // Show material code from diff, fall back to targetId if not available
            const materialCode = operation.diff?.[0]?.code || operation.mutation.targetId;
            const opTypeLabel = operation.mutation.operationType.replace(/_/g, ' ');
            operationName.textContent = `${opTypeLabel} · ${materialCode}`;

            const risk = document.createElement('span');
            risk.className = `ai-proposal-risk risk-${operation.risk}`;
            const riskIcon = document.createElement('span');
            riskIcon.className = 'material-symbols-outlined';
            riskIcon.textContent = operation.risk === 'high' ? 'warning' : (operation.risk === 'medium' ? 'info' : 'check_circle');
            const riskText = document.createTextNode(` ${t(`ai.proposal.risk.${operation.risk}`)}`);
            risk.append(riskIcon, riskText);
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn ai-proposal-delete-change';
            deleteButton.textContent = t('ai.proposal.deleteChange');
            deleteButton.addEventListener('click', (e) => {
              e.stopPropagation();
              selectedOperationIds.delete(operation.id);
              operationEl.remove();
              if (!section.querySelector('.ai-proposal-operation')) section.remove();
              for (const [checkbox, swap] of pendingSwaps.entries()) {
                if (swap.operation.id === operation.id) {
                  pendingSwaps.delete(checkbox);
                }
              }
              updateApproveButtonState();
              messagesDiv.scrollTo({ top: messagesDiv.scrollHeight });
            });
            operationHeader.append(operationName, risk, deleteButton);
            operationEl.appendChild(operationHeader);

            for (const warning of operation.warnings || []) {
              const warningEl = document.createElement('div');
              warningEl.className = 'ai-proposal-warning-box';
              
              if (typeof warning === 'string') {
                warningEl.textContent = warning;
              } else {
                warningEl.textContent = warning.message;
                if (warning.action?.type === 'swap') {
                  const swapLabel = document.createElement('label');
                  swapLabel.className = 'ai-proposal-swap-label';
                  swapLabel.style.marginLeft = '12px';
                  swapLabel.style.cursor = 'pointer';
                  swapLabel.style.display = 'inline-flex';
                  swapLabel.style.alignItems = 'center';
                  
                  const swapCheckbox = document.createElement('input');
                  swapCheckbox.type = 'checkbox';
                  swapCheckbox.className = 'ai-proposal-swap-checkbox';
                  swapCheckbox.style.marginRight = '6px';
                  
                  const swapText = document.createTextNode(t('ai.proposal.swapToReplaceCheckbox') || 'Đồng ý hoán đổi phương án');
                  swapLabel.append(swapCheckbox, swapText);
                  
                  swapCheckbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    if (swapCheckbox.checked) {
                      pendingSwaps.set(swapCheckbox, { operation, duplicateId: warning.action.duplicateId });
                    } else {
                      pendingSwaps.delete(swapCheckbox);
                    }
                    updateApproveButtonState();
                  });
                  warningEl.appendChild(swapLabel);
                }
              }
              operationEl.appendChild(warningEl);
            }

            let opRevision = msg.snapshot?.selection?.revision;
            if (!opRevision && (operation.category === 'bom' || operation.category === 'revision')) {
              const productCode = operation.diff?.[0]?.code || operation.mutation.targetId;
              const prodRevs = msg.snapshot?.payload?.productRevisions || {};
              let spu = productCode;
              if (spu && !prodRevs[spu]) {
                const spuMatch = Object.keys(prodRevs).find(k => spu.startsWith(k));
                if (spuMatch) spu = spuMatch;
              }
              const prodRevData = prodRevs[spu] || {};
              opRevision = prodRevData.currentRevision || 'V1';
            }

            const tableContainer = createPaginatedDiffTable(operation.diff || [], t, opRevision);
            operationEl.appendChild(tableContainer);
            section.appendChild(operationEl);
          }
          propEl.appendChild(section);
        }
      } else if (msg.diff.length === 0) {
        const noDiff = document.createElement('div');
        noDiff.className = 'ai-diff-empty';
        noDiff.textContent = t('ai.proposal.noChanges');
        propEl.appendChild(noDiff);
      } else {
        const tableContainer = createPaginatedDiffTable(msg.diff || [], t, msg.snapshot?.selection?.revision);
        propEl.appendChild(tableContainer);
      }

      const actionRowWrapper = document.createElement('div');
      actionRowWrapper.className = 'ai-proposal-actions-wrapper';

      const actionRow = document.createElement('div');
      actionRow.className = 'ai-proposal-actions';
      actionRow.style.display = 'flex';
      actionRow.style.gap = '8px';
      actionRow.style.justifyContent = 'flex-end';

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn';
      rejectBtn.textContent = t('ai.proposal.reject');
      rejectBtn.onclick = () => {
        rejectBtn.disabled = true;
        approveBtn.disabled = true;
        renderMessage({ role: 'user', text: t('ai.proposal.rejected') });
        if (msg.onReject) msg.onReject();
      };

      approveBtn = document.createElement('button');
      approveBtn.className = 'btn btn-primary';
      approveBtn.textContent = t('ai.proposal.approve');
      approveBtn.onclick = (e) => {
        if (e) e.stopPropagation();
        if (pendingSwaps.size > 0) {
          handleMultipleSwaps(msg, Array.from(pendingSwaps.values()), propEl, t);
          return;
        }
        rejectBtn.disabled = true;
        approveBtn.disabled = true;

        renderMessage({ role: 'user', text: t('ai.proposal.approved') });
        const selectedOperations = reviewOperations
          .filter(operation => selectedOperationIds.has(operation.id))
          .map(operation => operation.mutation);
        const selectedProposal = reviewOperations.length > 0
          ? { summary: msg.proposalReview?.summary || '', operations: selectedOperations }
          : msg.approval || msg.proposal;
          
        if (msg.onApprove) {
          msg.onApprove(selectedProposal);
        }
        
        // Transform UI to Success State
        actionRowWrapper.textContent = '';
        const successBanner = document.createElement('div');
        successBanner.className = 'ai-proposal-success-banner';
        successBanner.style.display = 'flex';
        successBanner.style.alignItems = 'center';
        successBanner.style.gap = '8px';
        successBanner.style.padding = '12px';
        successBanner.style.backgroundColor = 'rgba(46, 160, 67, 0.1)';
        successBanner.style.border = '1px solid var(--success, #2ea043)';
        successBanner.style.borderRadius = '6px';
        successBanner.style.marginTop = '12px';
        
        const successIcon = document.createElement('span');
        successIcon.className = 'material-symbols-outlined';
        successIcon.textContent = 'check_circle';
        successIcon.style.color = 'var(--success, #2ea043)';
        
        const successText = document.createElement('span');
        successText.textContent = t('ai.proposal.appliedSuccess') || 'Đã áp dụng thành công';
        successText.style.flex = '1';
        successText.style.fontWeight = '500';
        
        successBanner.appendChild(successIcon);
        successBanner.appendChild(successText);
        
        if (msg.onViewChanges) {
          const viewBtn = document.createElement('button');
          viewBtn.className = 'btn small';
          viewBtn.textContent = t('viewChanges') || 'Xem thay đổi';
          viewBtn.onclick = (e) => {
            if (e) e.stopPropagation();
            msg.onViewChanges();
          };
          successBanner.appendChild(viewBtn);
        }
        if (msg.onSave) {
          const saveBtn = document.createElement('button');
          saveBtn.className = 'btn btn-primary small';
          saveBtn.textContent = t('save') || 'Lưu';
          saveBtn.onclick = async (e) => {
            if (e) e.stopPropagation();
            
            const originalText = saveBtn.textContent;
            saveBtn.disabled = true;
            saveBtn.textContent = '...';
            
            try {
              const savePromise = msg.onSave();
              if (savePromise && typeof savePromise.then === 'function') {
                await savePromise;
              }
              saveBtn.textContent = t('ai.proposal.appliedSuccess') || 'Thành công';
              saveBtn.style.backgroundColor = 'var(--success, #2ea043)';
              saveBtn.style.borderColor = 'var(--success, #2ea043)';
              saveBtn.style.color = '#fff';
            } catch (err) {
              saveBtn.disabled = false;
              saveBtn.textContent = originalText;
              console.error(err);
            }
          };
          successBanner.appendChild(saveBtn);
        }
        
        actionRowWrapper.appendChild(successBanner);
        
        const diffTable = propEl.querySelector('.ai-diff-table-container') || propEl.querySelector('.ai-diff-table');
        if (diffTable) {
          diffTable.style.display = 'none';
        }
      };

      actionRow.appendChild(rejectBtn);
      actionRow.appendChild(approveBtn);
      actionRowWrapper.appendChild(actionRow);
      propEl.appendChild(actionRowWrapper);

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
    sendBtn.appendChild(sendIconSpan);
    sendBtn.setAttribute('aria-label', t('ai.workspace.send'));

    loadingIndicator.textContent = t('ai.workspace.loading');

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
    sendBtn.style.display = isLoading ? 'none' : '';
    stopBtn.style.display = isLoading ? '' : 'none';
    input.disabled = isLoading;
  }

  function clear() {
    messagesDiv.replaceChildren();
    if (typeof onClear === 'function') onClear();
  }

  function destroy() {
    container.remove();
  }

  return {
    element: container,
    renderMessage,
    startStreamingMessage,
    clear,
    toggleLoading,
    updateLanguage,
    destroy,
    messagesContainer: messagesDiv // exposed for testing
  };
}

export function createSettingsView({
  mode = 'viewer',
  onConnect,
  onDisconnect,
  onModelChange,
  getDiagnostics,
  localStore,
  onKnowledgeImport,
  onMarketplaceWebChange,
  onExportMapping,
  onGithubSync,
  onGithubRollback,
  getGithubSyncStatus,
  onImprovementImport,
  onImprovementReview,
  onImprovementApprove,
  onImprovementReject,
  onImprovementExport,
  onApprovedKnowledgeExport,
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
    { value: 'inclusionai/ling-3.0-flash:free', label: 'InclusionAI Ling 3.0 Flash (Free)' },
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

  const improvementSection = document.createElement('section');
  improvementSection.className = 'ai-improvement-settings';
  const improvementTitle = document.createElement('h3');
  const improvementDescription = document.createElement('div');
  improvementDescription.className = 'ai-settings-warning';
  const improvementStatus = document.createElement('div');
  improvementStatus.className = 'ai-settings-warning';
  const improvementList = document.createElement('div');
  improvementList.className = 'ai-memory-list';
  const improvementImport = document.createElement('input');
  improvementImport.type = 'file';
  improvementImport.accept = '.json';
  improvementImport.className = 'edit-input';
  const improvementExport = document.createElement('button');
  improvementExport.type = 'button';
  improvementExport.className = 'btn';
  const approvedKnowledgeExport = document.createElement('button');
  approvedKnowledgeExport.type = 'button';
  approvedKnowledgeExport.className = 'btn';

  function downloadJson(serialized, filename) {
    const blob = new Blob([serialized], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function refreshImprovements() {
    improvementList.replaceChildren();
    const records = localStore?.listImprovementCandidates?.() || [];
    improvementStatus.textContent = `${t('ai.improvement.count')}: ${records.length}`;
    records.forEach((record) => {
      const row = document.createElement('div');
      row.className = 'ai-improvement-row';
      const summary = document.createElement('span');
      summary.textContent = `[${record.status}] ${record.userQuestion}`;
      row.appendChild(summary);
      if (record.userCorrection) {
        const correction = document.createElement('div');
        correction.className = 'ai-mapping-details';
        correction.textContent = record.userCorrection;
        row.appendChild(correction);
      }
      if (record.review) {
        const review = document.createElement('div');
        review.className = 'ai-mapping-details';
        review.textContent = `${record.review.decision} · ${record.review.evidenceStatus} · ${record.review.summary}`;
        row.appendChild(review);
      }
      if (mode === 'admin') {
        const reviewButton = document.createElement('button');
        reviewButton.type = 'button';
        reviewButton.className = 'btn';
        reviewButton.textContent = t('ai.improvement.review');
        reviewButton.disabled = record.status === 'approved' || record.status === 'rejected';
        reviewButton.addEventListener('click', async () => {
          if (!onImprovementReview) return;
          reviewButton.disabled = true;
          improvementStatus.textContent = t('ai.improvement.reviewing');
          try {
            await onImprovementReview(record.id);
            improvementStatus.textContent = t('ai.improvement.reviewed');
          } catch {
            improvementStatus.textContent = t('ai.improvement.reviewFailed');
          } finally {
            refreshImprovements();
          }
        });
        row.appendChild(reviewButton);
        const approveButton = document.createElement('button');
        approveButton.type = 'button';
        approveButton.className = 'btn';
        approveButton.textContent = t('ai.improvement.approve');
        approveButton.disabled = !record.review || record.status === 'approved' || record.status === 'rejected';
        approveButton.addEventListener('click', () => {
          onImprovementApprove?.(record.id);
          refreshImprovements();
        });
        row.appendChild(approveButton);
        const rejectButton = document.createElement('button');
        rejectButton.type = 'button';
        rejectButton.className = 'btn';
        rejectButton.textContent = t('ai.improvement.reject');
        rejectButton.disabled = record.status === 'approved' || record.status === 'rejected';
        rejectButton.addEventListener('click', () => {
          onImprovementReject?.(record.id);
          refreshImprovements();
        });
        row.appendChild(rejectButton);
      }
      improvementList.appendChild(row);
    });
  }

  improvementImport.addEventListener('change', async () => {
    const file = improvementImport.files?.[0];
    if (!file || !onImprovementImport) return;
    try {
      await onImprovementImport(file);
      improvementStatus.textContent = t('ai.improvement.imported');
    } catch {
      improvementStatus.textContent = t('ai.improvement.importFailed');
    } finally {
      improvementImport.value = '';
      refreshImprovements();
    }
  });

  improvementExport.addEventListener('click', () => {
    const serialized = onImprovementExport?.();
    if (serialized) downloadJson(serialized, 'jintai-pdm-improvement-candidates.json');
  });

  approvedKnowledgeExport.addEventListener('click', () => {
    const serialized = onApprovedKnowledgeExport?.();
    if (serialized) downloadJson(serialized, 'reviewed-improvements.json');
  });

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
    const records = (localStore?.listMemories?.() || [])
      .filter(record => record.scope?.memoryType !== 'procedure');
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

  const syncSection = document.createElement('section');
  syncSection.className = 'ai-sync-settings';
  const syncTitle = document.createElement('h3');
  const syncStatusEl = document.createElement('div');
  syncStatusEl.className = 'ai-settings-warning';
  const syncRefreshBtn = document.createElement('button');
  syncRefreshBtn.type = 'button';
  syncRefreshBtn.className = 'btn';
  const syncRollbackBtn = document.createElement('button');
  syncRollbackBtn.type = 'button';
  syncRollbackBtn.className = 'btn';

  function renderSyncStatus() {
    const info = getGithubSyncStatus?.() || { status: 'fallback', activeCommitSha: null };
    const statusText = t(`ai.sync.${info.status}`) || info.status;
    const shaText = info.activeCommitSha ? ` (${info.activeCommitSha.slice(0, 7)})` : '';
    syncStatusEl.textContent = `${t('ai.sync.status')}: ${statusText}${shaText}${info.lastError ? ` - ${info.lastError}` : ''}`;
  }

  syncRefreshBtn.addEventListener('click', async () => {
    if (!onGithubSync) return;
    syncRefreshBtn.disabled = true;
    try {
      await onGithubSync();
    } catch {
      // Handled internally by sync module
    } finally {
      syncRefreshBtn.disabled = false;
      renderSyncStatus();
    }
  });

  syncRollbackBtn.addEventListener('click', () => {
    if (!onGithubRollback) return;
    onGithubRollback();
    renderSyncStatus();
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
    improvementTitle.textContent = t('ai.improvement.title');
    improvementDescription.textContent = t(mode === 'admin'
      ? 'ai.improvement.adminDescription'
      : 'ai.improvement.viewerDescription');
    improvementImport.setAttribute('aria-label', t('ai.improvement.import'));
    improvementExport.textContent = t('ai.improvement.export');
    approvedKnowledgeExport.textContent = t('ai.improvement.exportApproved');
    traceTitle.textContent = t('ai.trace.title');
    traceCopyButton.textContent = t('ai.trace.copy');
    syncTitle.textContent = t('ai.sync.title');
    syncRefreshBtn.textContent = t('ai.sync.refresh');
    syncRollbackBtn.textContent = t('ai.sync.rollback');
    renderTrace();
    refreshMemories();
    refreshImprovements();
    renderSyncStatus();
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
  improvementSection.appendChild(improvementTitle);
  improvementSection.appendChild(improvementDescription);
  if (mode === 'admin') improvementSection.appendChild(improvementImport);
  improvementSection.appendChild(improvementStatus);
  improvementSection.appendChild(improvementExport);
  if (mode === 'admin') improvementSection.appendChild(approvedKnowledgeExport);
  improvementSection.appendChild(improvementList);
  container.appendChild(improvementSection);
  syncSection.appendChild(syncTitle);
  syncSection.appendChild(syncStatusEl);
  syncSection.appendChild(syncRefreshBtn);
  syncSection.appendChild(syncRollbackBtn);
  container.appendChild(syncSection);

  return {
    element: container,
    updateState,
    updateLanguage,
    updateModels,
    refreshMemories,
    refreshImprovements,
    updateTrace
  };
}
