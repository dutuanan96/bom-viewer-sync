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
  validateMutation
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

test('validateToolCall rejects missing required arguments', () => {
  assert.throws(() => validateToolCall({ name: 'search_products' }), /arguments.*object/i);
  assert.throws(() => validateToolCall({ name: 'search_products', arguments: {} }), /query.*required/i);
  assert.throws(() => validateToolCall({ name: 'compare_boms', arguments: { productId1: 'LGS031' } }), /productId2.*required/i);
  assert.throws(() => validateToolCall({ name: 'analyze_pdm', arguments: {} }), /query.*required/i);
});

test('validateToolCall rejects blank queries and malformed product IDs', () => {
  assert.throws(() => validateToolCall({ name: 'search_products', arguments: { query: '   ' } }), /query.*empty/i);
  assert.throws(() => validateToolCall({ name: 'get_revision_history', arguments: { productId: '032' } }), /productId.*LGS/i);
  assert.throws(() => validateToolCall({ name: 'get_bom', arguments: { productId: 'LGS032', color: 42 } }), /color.*string/i);
});

test('validateToolCall rejects unexpected argument fields', () => {
  assert.throws(
    () => validateToolCall({ name: 'search_products', arguments: { query: 'LGS', extra: true } }),
    /unexpected argument field.*extra/i
  );
});

test('validateToolCall accepts a valid canonical product ID', () => {
  const valid = validateToolCall({ name: 'get_product', arguments: { productId: 'LGS032' } });
  assert.equal(valid.arguments.productId, 'LGS032');
});

test('validateToolCall accepts all read-only discovery tools with exact arguments', () => {
  assert.doesNotThrow(() => validateToolCall({
    name: 'compare_revisions',
    arguments: { productId: 'LGS032', revision1: 'V3', revision2: 'V3.1' }
  }));
  assert.doesNotThrow(() => validateToolCall({
    name: 'search_pdm',
    arguments: { query: 'handle', productId: 'LGS043', materialId: 'mat_vz636a' },
  }));
  assert.throws(
    () => validateToolCall({ name: 'search_pdm', arguments: { query: 'drawer', productId: '043' } }),
    /productId.*LGS/i,
  );
  assert.throws(
    () => validateToolCall({ name: 'search_pdm', arguments: { query: 'handle', materialId: 'mat_vz636a' } }),
    /materialId.*productId/i,
  );
  assert.doesNotThrow(() => validateToolCall({ name: 'list_recent_changes', arguments: {} }));
  assert.doesNotThrow(() => validateToolCall({ name: 'inspect_pdm_schema', arguments: {} }));
  assert.doesNotThrow(() => validateToolCall({ name: 'get_pdm_help', arguments: { topic: 'revision' } }));
  assert.throws(
    () => validateToolCall({ name: 'inspect_pdm_schema', arguments: { includeSecrets: true } }),
    /unexpected argument field/i,
  );
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

// ── R1.1-H: validateMutation ─────────────────────────────────────────────────

test('validateMutation rejects empty object', () => {
  assert.throws(() => validateMutation({}), /missing/);
});

test('validateMutation rejects missing operationType', () => {
  assert.throws(() => validateMutation({ targetId: 'P1' }), /missing operationType/);
});

test('validateMutation rejects disallowed operationType', () => {
  assert.throws(
    () => validateMutation({ targetId: 'P1', operationType: 'delete_product' }),
    /disallowed operationType/
  );
});

test('validateMutation accepts allowed operations', () => {
  const p = validateMutation({ targetId: 'P1', operationType: 'update_material_field', payload: { field: 'name_zh', value: 'test' } });
  assert.equal(p.operationType, 'update_material_field');
});

test('apply_mutation accepts a bounded batch of button-equivalent operations', () => {
  const call = validateToolCall({
    name: 'apply_mutation',
    arguments: {
      summary: 'Update material and BOM',
      operations: [
        {
          operationType: 'update_material_field',
          targetId: 'M1',
          payload: { field: 'unit', value: 'pcs' }
        },
        {
          operationType: 'update_bom_quantity',
          targetId: 'P1',
          payload: {
            color: 'Black',
            childId: 'M1',
            quantity: 2
          }
        }
      ]
    }
  });

  assert.equal(call.arguments.operations.length, 2);
});

test('apply_mutation rejects arbitrary code and unexpected payload fields', () => {
  assert.throws(() => validateToolCall({
    name: 'apply_mutation',
    arguments: {
      operations: [{
        operationType: 'execute_code',
        targetId: 'admin',
        payload: { code: 'delete everything' }
      }]
    }
  }), /disallowed operationType/);

  assert.throws(() => validateToolCall({
    name: 'apply_mutation',
    arguments: {
      operations: [{
        operationType: 'update_material_field',
        targetId: 'M1',
        payload: { field: 'unit', value: 'pcs', code: 'delete everything' }
      }]
    }
  }), /missing or extra fields/);
});

test('apply_mutation validates product, revision, structure, and asset patterns', () => {
  const operations = [
    {
      operationType: 'create_product',
      targetId: 'LGS999',
      payload: {
        name: { zh: '测试', vi: 'Thử nghiệm' },
        color: { zh: '黑色', vi: 'Đen' },
        size: '100mm',
        sku: 'LGS999-B',
      },
    },
    {
      operationType: 'create_product_revision',
      targetId: 'LGS999',
      payload: { revision: 'V2', changeReason: 'Change' },
    },
    {
      operationType: 'add_material_child',
      targetId: 'M1',
      payload: { materialId: 'M2', quantity: 2 },
    },
    {
      operationType: 'update_material',
      targetId: 'M1',
      payload: {
        patch: {
          drawings: [{ name: 'drawing', url: 'https://example.com/drawing.pdf' }],
          models3d: [{ name: 'model', url: 'https://example.com/model.glb' }],
        },
      },
    },
  ];
  assert.doesNotThrow(() => validateToolCall({
    name: 'apply_mutation',
    arguments: { operations },
  }));
  assert.throws(() => validateToolCall({
    name: 'apply_mutation',
    arguments: {
      operations: [{
        operationType: 'update_material',
        targetId: 'M1',
        payload: { patch: { drawings: [{ url: 'http://example.com/not-a-pdf' }] } },
      }],
    },
  }), /https|PDF/i);
});
