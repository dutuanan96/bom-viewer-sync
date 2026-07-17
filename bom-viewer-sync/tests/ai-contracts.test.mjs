import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ERROR_CODES,
  validateToolCall,
  validateEvidence,
  validateAnswer,
  validateSkill,
  validateMemory,
  validateAudit,
  validateProposal
} from '../src/features/ai-assistant/contracts.js';

/**
 * Assert that fn throws, capturing the error for inspection.
 * Returns the caught error.
 */
function catchErr(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new assert.AssertionError({ message: 'Expected function to throw, but it did not' });
}

// ── R1.1-A: Error codes ──────────────────────────────────────────────────────

test('AI error codes are frozen and complete', () => {
  assert.equal(ERROR_CODES.AI_MODEL_INCOMPATIBLE, 'AI_MODEL_INCOMPATIBLE');
  assert.equal(ERROR_CODES.AI_POLICY_BLOCKED, 'AI_POLICY_BLOCKED');
  assert.equal(ERROR_CODES.AI_TOOL_LIMIT, 'AI_TOOL_LIMIT');
  assert.equal(ERROR_CODES.AI_STALE_SOURCE, 'AI_STALE_SOURCE');
  // Must be frozen — no mutation allowed
  assert.throws(() => { ERROR_CODES.NEW_CODE = 'x'; }, TypeError);
});

// ── R1.1-B: validateToolCall ─────────────────────────────────────────────────

test('validateToolCall rejects missing/null/non-object', () => {
  assert.throws(() => validateToolCall(null), /missing tool name/);
  assert.throws(() => validateToolCall(undefined), /missing tool name/);
  assert.throws(() => validateToolCall('search_products'), /missing tool name/);
  assert.throws(() => validateToolCall({}), /missing tool name/);
  assert.throws(() => validateToolCall({ name: '' }), /missing tool name/);
});

test('validateToolCall rejects unknown tools with stable code', () => {
  const err = catchErr(() => validateToolCall({ name: 'delete_database' }));
  assert.match(err.message, /unknown tool/);
  assert.equal(err.code, 'AI_POLICY_BLOCKED');
});

test('validateToolCall rejects extra fields', () => {
  const err = catchErr(() => validateToolCall({ name: 'search_products', arguments: {}, extra: 'bad' }));
  assert.match(err.message, /extra fields/);
});

test('validateToolCall rejects oversized string arguments (>5000 chars)', () => {
  const err = catchErr(() => validateToolCall({ name: 'search_products', arguments: 'x'.repeat(5001) }));
  assert.match(err.message, /oversized/);
  assert.equal(err.code, 'AI_TOOL_LIMIT');
});

test('validateToolCall rejects oversized nested string in object (>1000 chars)', () => {
  // Blocker 4: oversized nested strings must also be caught
  const err = catchErr(() => validateToolCall({ name: 'search_products', arguments: { query: 'x'.repeat(10001) } }));
  assert.match(err.message, /oversized/);
  assert.equal(err.code, 'AI_TOOL_LIMIT');
});

test('validateToolCall rejects oversized array in object', () => {
  const err = catchErr(() => validateToolCall({ name: 'search_products', arguments: { ids: new Array(1001).fill('x') } }));
  assert.match(err.message, /oversized/);
  assert.equal(err.code, 'AI_TOOL_LIMIT');
});

test('validateToolCall accepts valid tool with object args', () => {
  const valid = validateToolCall({ name: 'search_products', arguments: { query: 'test' } });
  assert.equal(valid.name, 'search_products');
});

test('validateToolCall accepts valid tool without args', () => {
  const valid = validateToolCall({ name: 'search_products' });
  assert.equal(valid.name, 'search_products');
});

// ── R1.1-C: validateEvidence ─────────────────────────────────────────────────

test('validateEvidence rejects empty object', () => {
  assert.throws(() => validateEvidence({}), /missing id/);
});

test('validateEvidence rejects id-only object — missing required fields', () => {
  // Blocker 5: only-id must be rejected
  const err = catchErr(() => validateEvidence({ id: 'only-id' }));
  assert.match(err.message, /missing/);
});

test('validateEvidence rejects missing sourceType', () => {
  assert.throws(() => validateEvidence({ id: 'E1', sourcePath: 'x', recordId: 'P1', sourceCommit: 'a'.repeat(40), capturedAt: '2026-01-01T00:00:00Z' }), /missing sourceType/);
});

test('validateEvidence rejects missing sourceCommit', () => {
  assert.throws(() => validateEvidence({ id: 'E1', sourceType: 'pdm', sourcePath: 'x', recordId: 'P1', capturedAt: '2026-01-01T00:00:00Z' }), /missing sourceCommit/);
});

test('validateEvidence rejects short sourceCommit (not 40 hex chars)', () => {
  assert.throws(() => validateEvidence({ id: 'E1', sourceType: 'pdm', sourcePath: 'x', recordId: 'P1', sourceCommit: 'abc123', capturedAt: '2026-01-01T00:00:00Z' }), /invalid sourceCommit/);
});

test('validateEvidence accepts fully-specified evidence', () => {
  const e = validateEvidence({
    id: 'PDM-1',
    sourceType: 'pdm',
    sourcePath: 'data/products/LGS433.json',
    recordId: 'LGS433',
    sourceCommit: 'a'.repeat(40),
    capturedAt: '2026-07-17T00:00:00Z'
  });
  assert.equal(e.id, 'PDM-1');
});

// ── R1.1-D: validateAnswer ───────────────────────────────────────────────────

test('validateAnswer rejects missing text', () => {
  assert.throws(() => validateAnswer({}), /missing text/);
  assert.throws(() => validateAnswer({ text: 123 }), /missing text/);
});

test('validateAnswer rejects oversized text', () => {
  const err = catchErr(() => validateAnswer({ text: 'x'.repeat(5001) }));
  assert.match(err.message, /oversized/);
  assert.equal(err.code, 'AI_TOOL_LIMIT');
});

test('validateAnswer accepts valid answer with citation evidence', () => {
  const a = validateAnswer({ text: 'hello', evidenceIds: ['PDM-1'] });
  assert.equal(a.text, 'hello');
});

// ── R1.1-E: validateSkill ────────────────────────────────────────────────────

test('validateSkill rejects missing schemaVersion', () => {
  assert.throws(() => validateSkill({}), /missing schemaVersion/);
});

test('validateSkill rejects missing packVersion', () => {
  assert.throws(() => validateSkill({ schemaVersion: 1 }), /missing packVersion/);
});

test('validateSkill rejects missing updatedAt', () => {
  assert.throws(() => validateSkill({ schemaVersion: 1, packVersion: '1.0.0' }), /missing updatedAt/);
});

test('validateSkill accepts valid skill pack', () => {
  const s = validateSkill({ schemaVersion: 1, packVersion: '1.0.0', updatedAt: '2026-07-17T00:00:00Z' });
  assert.equal(s.schemaVersion, 1);
});

// ── R1.1-F: validateMemory ───────────────────────────────────────────────────

const VALID_MEMORY_STATUSES = ['candidate', 'confirmed', 'rejected', 'stale'];

test('validateMemory rejects missing status', () => {
  assert.throws(() => validateMemory({}), /missing status/);
});

test('validateMemory rejects invalid status values', () => {
  assert.throws(() => validateMemory({ status: 'verified' }), /invalid status/);
  assert.throws(() => validateMemory({ status: 'active' }), /invalid status/);
});

test('validateMemory rejects missing provenance', () => {
  assert.throws(() => validateMemory({ status: 'candidate' }), /missing provenance/);
});

test('validateMemory accepts all valid statuses', () => {
  for (const status of VALID_MEMORY_STATUSES) {
    const m = validateMemory({ status, provenance: 'user-confirmed' });
    assert.equal(m.status, status);
  }
});

// ── R1.1-G: validateAudit ───────────────────────────────────────────────────

test('validateAudit rejects empty object', () => {
  assert.throws(() => validateAudit({}), /missing/);
});

test('validateAudit rejects missing productId', () => {
  assert.throws(() => validateAudit({ materialCount: 3 }), /missing productId/);
});

test('validateAudit accepts valid audit', () => {
  const a = validateAudit({ productId: 'LGS433', materialCount: 5, colors: ['黑色'] });
  assert.equal(a.productId, 'LGS433');
});

// ── R1.1-H: validateProposal ─────────────────────────────────────────────────

test('validateProposal rejects empty object', () => {
  assert.throws(() => validateProposal({}), /missing/);
});

test('validateProposal rejects missing operationType', () => {
  assert.throws(() => validateProposal({ targetId: 'P1' }), /missing operationType/);
});

test('validateProposal rejects disallowed operationType', () => {
  assert.throws(
    () => validateProposal({ targetId: 'P1', operationType: 'delete_product' }),
    /disallowed operationType/
  );
});

test('validateProposal accepts allowed operations', () => {
  const p = validateProposal({ targetId: 'P1', operationType: 'update_material_field', field: 'name_zh', value: 'test' });
  assert.equal(p.operationType, 'update_material_field');
});
