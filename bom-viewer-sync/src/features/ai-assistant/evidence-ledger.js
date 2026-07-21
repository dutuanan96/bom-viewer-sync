// src/features/ai-assistant/evidence-ledger.js
// R2.4 — Evidence Ledger
// Collects evidence produced during one turn and assigns provenance.
// Canonical PDM evidence always wins conflicts.

const VALID_PROVENANCES = new Set([
  'canonical-pdm',
  'company-knowledge',
  'personal-memory',
  'official-web',
  'marketplace',
  'community-web',
  'agent-inference'
]);

export function createEvidenceLedger() {
  const ledger = [];

  function addEvidence(provenance, data) {
    if (!VALID_PROVENANCES.has(provenance)) {
      provenance = 'agent-inference';
    }
    const items = Array.isArray(data) ? data : data ? [data] : [];
    for (const item of items) {
      ledger.push({ provenance, data: item });
    }
  }

  function getRaw() {
    return [...ledger];
  }

  function formatForPrompt() {
    if (ledger.length === 0) return '';
    
    let text = '=== ACCUMULATED EVIDENCE ===\n';
    text += 'Canonical PDM evidence always wins conflicts about BOM, material, revision, or workflow state.\n\n';

    const grouped = {};
    for (const prov of VALID_PROVENANCES) {
      grouped[prov] = [];
    }

    for (const entry of ledger) {
      grouped[entry.provenance].push(entry.data);
    }

    for (const prov of VALID_PROVENANCES) {
      if (grouped[prov].length > 0) {
        text += `--- ${prov.toUpperCase()} ---\n`;
        for (const item of grouped[prov]) {
          text += (typeof item === 'string' ? item : JSON.stringify(item)) + '\n';
        }
        text += '\n';
      }
    }

    return text.trim();
  }

  return { addEvidence, getRaw, formatForPrompt };
}
