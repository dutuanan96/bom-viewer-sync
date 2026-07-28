import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createImprovementBundle,
  createImprovementCandidate,
  createReviewedKnowledgePack,
  parseImprovementBundle,
  parseReviewerResponse,
  reviewerMessages,
} from '../src/features/ai-assistant/improvement-cycle.js';

const CAPTURED_AT = '2026-07-27T00:00:00.000Z';

function candidate(overrides = {}) {
  return createImprovementCandidate({
    issueType: 'user-teaching',
    userQuestion: 'Which product uses this component?',
    userCorrection: 'LGS433',
    context: { productIds: ['LGS433'] },
    ...overrides,
  }, { id: 'improvement_1', capturedAt: CAPTURED_AT });
}

test('improvement bundle round-trips bounded structured candidates', () => {
  const serialized = JSON.stringify(createImprovementBundle([candidate()], {
    sourceMode: 'viewer',
    exportedAt: CAPTURED_AT,
  }));
  const bundle = parseImprovementBundle(serialized);

  assert.equal(bundle.kind, 'jintai-pdm-improvement-bundle');
  assert.equal(bundle.candidates[0].status, 'candidate');
  assert.deepEqual(bundle.candidates[0].context.productIds, ['LGS433']);
});

test('review prompt marks viewer candidate as untrusted and PDM evidence authoritative', () => {
  const messages = reviewerMessages(candidate(), { totalMatches: 1 });
  assert.match(messages[0].content, /untrusted data/i);
  assert.match(messages[0].content, /PDM evidence overrides/i);
  assert.match(messages[1].content, /totalMatches/);
});

test('review response is strict and approved export excludes unapproved candidates', () => {
  const review = parseReviewerResponse(JSON.stringify({
    decision: 'recommend-approve',
    evidenceStatus: 'supported',
    confidence: 0.9,
    category: 'terminology',
    summary: 'The PDM evidence supports the correction.',
    proposedKnowledge: 'The component is used by LGS433.',
    risks: [],
  }), { reviewerModel: 'reviewer/model', reviewedAt: CAPTURED_AT });
  const approved = { ...candidate(), status: 'approved', review, approvedAt: CAPTURED_AT };
  const pack = createReviewedKnowledgePack([candidate(), approved], {
    exportedAt: CAPTURED_AT,
    sourceCommit: 'a'.repeat(40),
  });

  assert.equal(pack.entries.length, 1);
  assert.equal(pack.entries[0].fact, 'The component is used by LGS433.');
  assert.throws(() => parseReviewerResponse('{"decision":"approve"}'), /evidence|decision/i);
});
