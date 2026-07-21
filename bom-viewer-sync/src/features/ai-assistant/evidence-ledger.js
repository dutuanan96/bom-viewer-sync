// src/features/ai-assistant/evidence-ledger.js

import { validateEvidence } from './contracts.js';

export function createEvidenceLedger(localStore) {
  let evidenceList = [];

  function mapProvenance(sourceType, sourceRef) {
    if (sourceType === 'pdm' || sourceType === 'pdm-tool' || sourceType === 'search_products' || sourceType === 'get_product' || sourceType === 'get_bom') {
      return 'canonical-pdm';
    }
    if (sourceType === 'memory' || sourceType === 'retrieve_memory') {
      return 'personal-memory';
    }
    if (sourceType === 'web-search' || sourceType === 'search_web') {
      if (/jintai-official\.com/.test(sourceRef)) return 'official-web';
      if (/marketplace|alibaba|taobao|amazon/.test(sourceRef)) return 'marketplace';
      return 'community-web';
    }
    return sourceType;
  }

  function trackEvidence(evidence) {
    const valid = validateEvidence({ ...evidence, sourceType: mapProvenance(evidence.sourceType, evidence.sourceRef) });
    const existing = evidenceList.find(e => e.id === valid.id);
    if (!existing) {
      evidenceList.push(valid);
      if (localStore) {
        localStore.appendAudit({ action: 'evidence-tracked', evidenceId: valid.id });
      }
      return valid;
    }
    return existing;
  }

  function getEvidence() {
    return [...evidenceList];
  }

  function clear() {
    evidenceList = [];
  }

  return { trackEvidence, getEvidence, clear };
}
