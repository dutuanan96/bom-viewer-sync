import test from 'node:test';
import assert from 'node:assert/strict';

import { createConversationSession } from '../src/features/ai-assistant/conversation-session.js';

test('conversation session retains only the newest bounded turns', () => {
  const session = createConversationSession({ maxTurns: 2, maxChars: 100 });
  session.record({ userText: 'u1', assistantText: 'a1' });
  session.record({ userText: 'u2', assistantText: 'a2' });
  session.record({ userText: 'u3', assistantText: 'a3' });

  assert.deepEqual(session.contextFor('next'), [
    { role: 'user', content: 'u2' },
    { role: 'assistant', content: 'a2' },
    { role: 'user', content: 'u3' },
    { role: 'assistant', content: 'a3' }
  ]);
  assert.equal(session.diagnostics().turnCount, 2);
});

test('conversation session evicts oldest turns to satisfy the character budget', () => {
  const session = createConversationSession({ maxTurns: 8, maxChars: 12 });
  session.record({ userText: '1111', assistantText: 'aaaa' });
  session.record({ userText: '22', assistantText: 'bb' });
  session.record({ userText: '3', assistantText: 'c' });

  assert.deepEqual(session.contextFor(''), [
    { role: 'user', content: '22' },
    { role: 'assistant', content: 'bb' },
    { role: 'user', content: '3' },
    { role: 'assistant', content: 'c' }
  ]);
});

test('conversation session returns immutable cloned messages', () => {
  const session = createConversationSession();
  session.record({ userText: 'why?', assistantText: 'because' });
  const context = session.contextFor('follow-up');

  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context[0]), true);
  assert.throws(() => { context[0].content = 'changed'; }, TypeError);
  assert.equal(session.contextFor('follow-up')[0].content, 'why?');
});

test('conversation session omits empty turns and clears all retained context', () => {
  const session = createConversationSession();
  assert.equal(session.record({ userText: '', assistantText: 'answer' }), false);
  assert.equal(session.record({ userText: 'question', assistantText: '  ' }), false);
  session.record({ userText: 'question', assistantText: 'answer' });
  session.clear();

  assert.deepEqual(session.contextFor('next'), []);
  assert.equal(session.diagnostics().turnCount, 0);
});

test('conversation session rejects secret-like text instead of retaining it', () => {
  for (const secretText of ['apiKey', 'authorization', 'sk-test-secret-1234567890']) {
    const session = createConversationSession();
    assert.throws(
      () => session.record({ userText: secretText, assistantText: 'not stored' }),
      /secret|credential/i
    );
    assert.equal(session.diagnostics().turnCount, 0);
  }
});

test('conversation session retains only allowlisted tool event metadata', () => {
  const session = createConversationSession();
  assert.throws(
    () => session.record({
      userText: 'question',
      assistantText: 'answer',
      toolEvents: [{ name: 'get_bom', status: 'success', rawResult: 'forbidden' }]
    }),
    /tool event.*field/i
  );
});

test('conversation session retains bounded structured PDM context across vague turns and clears it explicitly', () => {
  const session = createConversationSession();
  session.record({
    userText: 'Why is LGS032 a draft?',
    assistantText: 'Current V3.1; effective V3.',
    context: { productIds: ['LGS032'], revisions: ['V3', 'V3.1'], searchQuery: '460x282x187' },
  });
  session.record({ userText: 'Thanks', assistantText: 'You are welcome.' });

  assert.deepEqual(session.latestContext(), {
    productIds: ['LGS032'],
    revisions: ['V3', 'V3.1'],
    searchQuery: '460x282x187',
  });
  assert.equal(Object.isFrozen(session.latestContext()), true);
  assert.throws(
    () => session.record({ userText: 'x', assistantText: 'y', context: { apiKey: ['secret'] } }),
    /non-allowlisted/i,
  );

  session.clear();
  assert.deepEqual(session.latestContext(), {});
});
