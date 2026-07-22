const SECRET_KEY_PATTERN = /api.?key|authorization|password|secret|token|credential/i;
const SECRET_VALUE_PATTERN = /\b(?:sk-or-|sk-|ghp_|github_pat_|bearer\s+)[a-z0-9._-]{10,}/i;

function assertNoSecrets(value, path = 'value') {
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERN.test(value)) {
      throw new Error(`Secret or credential is not allowed at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new Error(`Secret or credential field is not allowed at ${path}.${key}`);
      }
      assertNoSecrets(nested, `${path}.${key}`);
    }
  }
}

export function validateAndRedactCandidate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Candidate must be a non-null object');
  }

  assertNoSecrets(input);

  const sourceCommit = input.sourceCommit || null;
  if (sourceCommit && !/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    throw new Error('Candidate sourceCommit must be a 40-character SHA or null');
  }

  const fact = String(input.fact || '').trim();
  if (!fact) {
    throw new Error('Candidate fact is required');
  }

  const provenance = Array.isArray(input.provenance) ? input.provenance : [];
  if (provenance.length === 0) {
    throw new Error('Candidate provenance is required');
  }

  return {
    id: input.id || `candidate_${Date.now()}`,
    status: input.status || 'candidate',
    scope: { project: 'jintai-pdm', ...(input.scope || {}) },
    fact,
    provenance,
    sourceCommit,
    entityMapping: input.entityMapping || null,
    exportedAt: new Date().toISOString(),
  };
}

export function exportDeclarativeCandidate({ memoryRecord, sourceCommit = null }) {
  if (!memoryRecord || memoryRecord.status !== 'confirmed') {
    throw new Error('Only user-confirmed memories can be exported for learning promotion');
  }

  const sanitized = validateAndRedactCandidate({
    ...memoryRecord,
    sourceCommit: sourceCommit || memoryRecord.sourceCommit || null,
  });

  return {
    schemaVersion: 1,
    exportType: 'pdm-knowledge-candidate',
    provenance: {
      memoryId: memoryRecord.id,
      confirmedAt: memoryRecord.confirmedAt || null,
      sourceCommit: sanitized.sourceCommit,
      provenanceHistory: sanitized.provenance,
    },
    candidateData: {
      fact: sanitized.fact,
      scope: sanitized.scope,
      entityMapping: sanitized.entityMapping,
    },
    reviewRequirements: [
      'Must be reviewed by a human domain expert before PR creation.',
      'Do not push automatically to GitHub.',
      'Verify target materialId or productCode exists in canonical PDM schema.',
    ],
  };
}

export function createEvalCandidateFromCorrection({ query, expectedTarget, actualTarget = null, sourceCommit = null }) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('Query is required for eval candidate');
  }
  if (!expectedTarget || typeof expectedTarget !== 'object') {
    throw new Error('Expected target object is required');
  }

  const candidate = {
    id: `eval_case_${Date.now()}`,
    query: query.trim(),
    expectedTarget,
    actualTarget,
    provenance: {
      sourceCommit: sourceCommit || null,
      createdFrom: 'user-correction',
      capturedAt: new Date().toISOString(),
    },
  };

  assertNoSecrets(candidate);
  return candidate;
}
