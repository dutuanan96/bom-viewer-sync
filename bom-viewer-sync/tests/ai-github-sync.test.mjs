import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGithubKnowledgeSync,
  validateGithubSyncTarget,
  validatePackSchema,
  validatePromptPackSchema,
  validateSkillsPackSchema,
  validateEntityAliasesPackSchema,
} from '../src/features/ai-assistant/github-knowledge-sync.js';
import { createLocalAiStore } from '../src/features/ai-assistant/local-store.js';
import { createPdmSkillRegistry } from '../src/features/ai-assistant/pdm-skill-registry.js';
import {
  validateAndRedactCandidate,
  exportDeclarativeCandidate,
  createEvalCandidateFromCorrection,
} from '../src/features/ai-assistant/learning-pipeline.js';

const MOCK_SHA = '1234567890abcdef1234567890abcdef12345678';
const MOCK_SHA_2 = 'abcdef1234567890abcdef1234567890abcdef12';

const VALID_PROMPT_PACK = {
  schemaVersion: 1,
  packVersion: '2.0.0',
  updatedAt: '2026-07-22T00:00:00Z',
  description: 'Updated prompt pack',
  specialists: [
    {
      id: 'revision',
      allowedTools: ['get_revision_history', 'get_product'],
      evidenceRequired: true,
      doNotUse: 'Do not infer revision status',
      instructions: ['Read revision history'],
      verification: ['Name product and revision'],
    },
  ],
};

const VALID_SKILLS_PACK = {
  schemaVersion: 1,
  packVersion: '2.0.0',
  updatedAt: '2026-07-22T00:00:00Z',
  description: 'Updated skills pack',
  skills: [
    {
      id: 'get_revision_history',
      description: 'Get revision history',
      readonly: true,
    },
    {
      id: 'get_product',
      description: 'Get product',
      readonly: true,
    },
  ],
};

const VALID_ENTITY_ALIASES_PACK = {
  schemaVersion: 1,
  packVersion: '2.0.0',
  updatedAt: '2026-07-22T00:00:00Z',
  mappings: [{
    schemaVersion: 1,
    id: 'mapping_company_lgs433',
    mappingType: 'entity-alias',
    scope: 'company',
    phrase: 'cabinet alpha',
    normalizedPhrase: 'cabinet alpha',
    target: { type: 'product', productCode: 'LGS433' },
    status: 'confirmed',
    confidence: 1,
    provenance: [{ sourceType: 'user-confirmed', sourceRef: 'company-review', capturedAt: '2026-07-22T00:00:00Z' }],
    sourceCommit: MOCK_SHA,
    promotedFrom: 'personal',
  }],
};

function createMockFetch(responses = {}) {
  return async (url, options = {}) => {
    const authHeader = options.headers?.Authorization;
    const authQuery = new URL(url).searchParams.get('access_token');

    // Check if secret token was leaked in URL query or path
    if (authQuery?.includes('secret_token_123') || url.includes('secret_token_123')) {
      throw new Error('Token leaked in URL');
    }

    if (responses[url]) {
      const res = responses[url];
      if (res.error) throw res.error;
      return {
        ok: res.ok !== false,
        status: res.status || (res.ok !== false ? 200 : 404),
        json: async () => res.json || JSON.parse(res.text || '{}'),
        text: async () => res.text || JSON.stringify(res.json || {}),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not Found' }),
      text: async () => 'Not Found',
    };
  };
}

describe('GitHub Skill/Knowledge Sync', () => {
  test('1. Valid pack at commit SHA is activated', async () => {
    const localStore = createLocalAiStore();
    const commitUrl = 'https://api.github.com/repos/dutuanan96/bom-viewer-sync/commits/main';
    const promptUrl = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/prompt-pack.json`;
    const skillsUrl = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/skills.json`;

    const fetchImpl = createMockFetch({
      [commitUrl]: { json: { sha: MOCK_SHA } },
      [promptUrl]: { json: VALID_PROMPT_PACK },
      [skillsUrl]: { json: VALID_SKILLS_PACK },
    });

    const sync = createGithubKnowledgeSync({
      config: { owner: 'dutuanan96', repo: 'bom-viewer-sync', path: 'knowledge/ai', ref: 'main' },
      allowlist: ['dutuanan96/bom-viewer-sync'],
      localStore,
      fetchImpl,
    });

    const result = await sync.sync();
    assert.equal(result.activated, true);
    assert.equal(result.commitSha, MOCK_SHA);
    assert.equal(result.pack.files.promptPack.packVersion, '2.0.0');

    const status = sync.getStatus();
    assert.equal(status.status, 'synced');
    assert.equal(status.activeCommitSha, MOCK_SHA);
  });

  test('2. Unchanged SHA does not re-download/re-activate unnecessarily', async () => {
    let promptFetchCount = 0;
    const commitUrl = 'https://api.github.com/repos/dutuanan96/bom-viewer-sync/commits/main';
    const promptUrl = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/prompt-pack.json`;
    const skillsUrl = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/skills.json`;

    const fetchImpl = async (url, options) => {
      if (url === promptUrl) promptFetchCount++;
      return createMockFetch({
        [commitUrl]: { json: { sha: MOCK_SHA } },
        [promptUrl]: { json: VALID_PROMPT_PACK },
        [skillsUrl]: { json: VALID_SKILLS_PACK },
      })(url, options);
    };

    const sync = createGithubKnowledgeSync({
      config: { owner: 'dutuanan96', repo: 'bom-viewer-sync', path: 'knowledge/ai', ref: 'main' },
      allowlist: ['dutuanan96/bom-viewer-sync'],
      fetchImpl,
    });

    const res1 = await sync.sync();
    assert.equal(res1.activated, true);
    assert.equal(promptFetchCount, 1);

    const res2 = await sync.sync();
    assert.equal(res2.activated, false);
    assert.equal(res2.reason, 'unchanged');
    assert.equal(promptFetchCount, 1);
  });

  test('3. Malformed JSON is rejected', async () => {
    const commitUrl = 'https://api.github.com/repos/dutuanan96/bom-viewer-sync/commits/main';
    const promptUrl = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/prompt-pack.json`;
    const skillsUrl = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/skills.json`;

    const fetchImpl = createMockFetch({
      [commitUrl]: { json: { sha: MOCK_SHA } },
      [promptUrl]: { text: '{ invalid json ... ' },
      [skillsUrl]: { json: VALID_SKILLS_PACK },
    });

    const sync = createGithubKnowledgeSync({
      config: { owner: 'dutuanan96', repo: 'bom-viewer-sync', path: 'knowledge/ai', ref: 'main' },
      allowlist: ['dutuanan96/bom-viewer-sync'],
      fetchImpl,
    });

    const result = await sync.sync();
    assert.equal(result.activated, false);
    assert.match(result.error, /Malformed JSON/);
  });

  test('4. Unknown fields/schema mismatch is rejected', () => {
    assert.throws(() => validatePackSchema(null), /must be a valid JSON object/);
    assert.throws(() => validatePromptPackSchema({ schemaVersion: 1 }), /missing or invalid packVersion/);
    assert.throws(
      () => validateSkillsPackSchema({ schemaVersion: 1, packVersion: '1.0', updatedAt: 'now', skills: [] }),
      /Skills pack missing skills array/
    );
  });

  test('4b. Entity aliases are schema-validated before activation', () => {
    assert.equal(validateEntityAliasesPackSchema(VALID_ENTITY_ALIASES_PACK), VALID_ENTITY_ALIASES_PACK);
    assert.throws(
      () => validateEntityAliasesPackSchema({ ...VALID_ENTITY_ALIASES_PACK, mappings: [{ target: { productCode: 'LGS433' } }] }),
      /Entity mapping/,
    );
  });

  test('5. Partial download does not replace active pack', async () => {
    const commitUrl = 'https://api.github.com/repos/dutuanan96/bom-viewer-sync/commits/main';
    const promptUrl = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/prompt-pack.json`;

    const fetchImpl = createMockFetch({
      [commitUrl]: { json: { sha: MOCK_SHA } },
      [promptUrl]: { json: VALID_PROMPT_PACK },
      // skills.json returns 404
    });

    const defaultPack = {
      provenance: { commitSha: 'default-sha-00000000000000000000000000000' },
      files: { promptPack: VALID_PROMPT_PACK, skillsPack: VALID_SKILLS_PACK },
    };

    const sync = createGithubKnowledgeSync({
      config: { owner: 'dutuanan96', repo: 'bom-viewer-sync', path: 'knowledge/ai', ref: 'main' },
      allowlist: ['dutuanan96/bom-viewer-sync'],
      defaultPack,
      fetchImpl,
    });

    const result = await sync.sync();
    assert.equal(result.activated, false);
    assert.equal(sync.getActivePack().provenance.commitSha, 'default-sha-00000000000000000000000000000');
  });

  test('6. Malicious instruction (JS code / eval) is not executed as code', async () => {
    const commitUrl = 'https://api.github.com/repos/dutuanan96/bom-viewer-sync/commits/main';
    const promptUrl = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/prompt-pack.json`;
    const skillsUrl = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/skills.json`;

    const maliciousPrompt = {
      ...VALID_PROMPT_PACK,
      specialists: [
        {
          id: 'revision',
          allowedTools: ['get_revision_history'],
          instructions: ['eval("console.log(process.env)")'],
          verification: ['Verify'],
        },
      ],
    };

    const fetchImpl = createMockFetch({
      [commitUrl]: { json: { sha: MOCK_SHA } },
      [promptUrl]: { text: JSON.stringify(maliciousPrompt) },
      [skillsUrl]: { json: VALID_SKILLS_PACK },
    });

    const sync = createGithubKnowledgeSync({
      config: { owner: 'dutuanan96', repo: 'bom-viewer-sync', path: 'knowledge/ai', ref: 'main' },
      allowlist: ['dutuanan96/bom-viewer-sync'],
      fetchImpl,
    });

    const result = await sync.sync();
    assert.equal(result.activated, false);
    assert.match(result.error, /Executable or unsafe code detected/);
  });

  test('7. Non-allowlisted repo/path is rejected', () => {
    assert.throws(
      () => validateGithubSyncTarget({ owner: 'attacker', repo: 'malicious-repo', ref: 'main' }, ['dutuanan96/bom-viewer-sync']),
      /Target repository attacker\/malicious-repo is not in the allowlist/
    );
  });

  test('8. Branch name is not used as immutable provenance (exact SHA required)', async () => {
    const commitUrl = 'https://api.github.com/repos/dutuanan96/bom-viewer-sync/commits/my-branch';
    const promptUrl = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/prompt-pack.json`;
    const skillsUrl = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/skills.json`;

    const fetchImpl = createMockFetch({
      [commitUrl]: { json: { sha: MOCK_SHA } },
      [promptUrl]: { json: VALID_PROMPT_PACK },
      [skillsUrl]: { json: VALID_SKILLS_PACK },
    });

    const sync = createGithubKnowledgeSync({
      config: { owner: 'dutuanan96', repo: 'bom-viewer-sync', path: 'knowledge/ai', ref: 'my-branch' },
      allowlist: ['dutuanan96/bom-viewer-sync'],
      fetchImpl,
    });

    const result = await sync.sync();
    assert.equal(result.activated, true);
    assert.equal(result.commitSha, MOCK_SHA); // SHA resolved from branch
    assert.notEqual(result.commitSha, 'my-branch');
  });

  test('9. Offline startup uses last-known-good cached pack', async () => {
    const localStore = createLocalAiStore();
    const cachedPack = {
      provenance: { commitSha: MOCK_SHA, packVersion: '2.0.0' },
      files: { promptPack: VALID_PROMPT_PACK, skillsPack: VALID_SKILLS_PACK },
    };
    localStore.setGithubSyncPack(cachedPack);

    const sync = createGithubKnowledgeSync({
      config: { owner: 'dutuanan96', repo: 'bom-viewer-sync', path: 'knowledge/ai', ref: 'main' },
      localStore,
      fetchImpl: async () => { throw new Error('Network offline'); },
    });

    const active = sync.getActivePack();
    assert.equal(active.provenance.commitSha, MOCK_SHA);
    assert.equal(sync.getStatus().status, 'cached');

    const result = await sync.sync();
    assert.equal(result.activated, false);
    assert.equal(sync.getActivePack().provenance.commitSha, MOCK_SHA); // retains cached
  });

  test('10. Failed update retains active pack', async () => {
    const commitUrl1 = 'https://api.github.com/repos/dutuanan96/bom-viewer-sync/commits/main';
    const promptUrl1 = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/prompt-pack.json`;
    const skillsUrl1 = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA}/knowledge/ai/skills.json`;

    const commitUrl2 = 'https://api.github.com/repos/dutuanan96/bom-viewer-sync/commits/main';
    const promptUrl2 = `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/${MOCK_SHA_2}/knowledge/ai/prompt-pack.json`;

    let step = 1;
    const fetchImpl = async (url, options) => {
      if (step === 1) {
        return createMockFetch({
          [commitUrl1]: { json: { sha: MOCK_SHA } },
          [promptUrl1]: { json: VALID_PROMPT_PACK },
          [skillsUrl1]: { json: VALID_SKILLS_PACK },
        })(url, options);
      }
      return createMockFetch({
        [commitUrl2]: { json: { sha: MOCK_SHA_2 } },
        [promptUrl2]: { text: 'invalid json' }, // fails step 2
      })(url, options);
    };

    const sync = createGithubKnowledgeSync({
      config: { owner: 'dutuanan96', repo: 'bom-viewer-sync', path: 'knowledge/ai', ref: 'main' },
      fetchImpl,
    });

    await sync.sync();
    assert.equal(sync.getActivePack().provenance.commitSha, MOCK_SHA);

    step = 2;
    const res2 = await sync.sync();
    assert.equal(res2.activated, false);
    assert.equal(sync.getActivePack().provenance.commitSha, MOCK_SHA); // Retained SHA 1
  });

  test('11. Secret/token does not appear in logs or errors', async () => {
    const token = 'secret_token_12345';
    const commitUrl = 'https://api.github.com/repos/dutuanan96/bom-viewer-sync/commits/main';

    const fetchImpl = async () => {
      const err = new Error(`Unauthorized access with ${token}`);
      throw err;
    };

    const sync = createGithubKnowledgeSync({
      config: { owner: 'dutuanan96', repo: 'bom-viewer-sync', path: 'knowledge/ai', ref: 'main', token },
      fetchImpl,
    });

    const result = await sync.sync();
    assert.equal(result.activated, false);
    assert.equal(result.error.includes(token), false);
    assert.equal(result.error.includes('***'), true);
  });

  test('12. Clear cache or rollback has clear behavior', () => {
    const localStore = createLocalAiStore();
    const defaultPack = { provenance: { commitSha: 'default-sha' }, files: { promptPack: VALID_PROMPT_PACK, skillsPack: VALID_SKILLS_PACK } };

    const sync = createGithubKnowledgeSync({
      config: { owner: 'dutuanan96', repo: 'bom-viewer-sync', path: 'knowledge/ai', ref: 'main' },
      defaultPack,
      localStore,
    });

    const rolled = sync.rollback();
    assert.equal(rolled.provenance.commitSha, 'default-sha');
    assert.equal(localStore.getGithubSyncPack(), null);
  });

  test('13. Learning pipeline: candidate validation, secret redaction, and export formatting', () => {
    const localStore = createLocalAiStore();
    const candidate = localStore.createCandidate({
      scope: { project: 'jintai-pdm', key: 'test_key' },
      fact: 'LGS433 color 01 uses mat_wood_01',
      provenance: [{ sourceType: 'user-proposed', sourceRef: 'unit-test', capturedAt: new Date().toISOString() }],
      sourceCommit: MOCK_SHA,
    });

    const confirmed = localStore.confirm(candidate.id);
    const exported = exportDeclarativeCandidate({ memoryRecord: confirmed, sourceCommit: MOCK_SHA });

    assert.equal(exported.exportType, 'pdm-knowledge-candidate');
    assert.equal(exported.provenance.sourceCommit, MOCK_SHA);
    assert.equal(exported.candidateData.fact, 'LGS433 color 01 uses mat_wood_01');

    const evalCase = createEvalCandidateFromCorrection({
      query: 'What material does LGS433 color 01 use?',
      expectedTarget: { productCode: 'LGS433', color: '01', materialId: 'mat_wood_01' },
      sourceCommit: MOCK_SHA,
    });

    assert.equal(evalCase.query, 'What material does LGS433 color 01 use?');
    assert.equal(evalCase.provenance.sourceCommit, MOCK_SHA);

    // Secret redaction assertion
    assert.throws(
      () => validateAndRedactCandidate({ fact: 'sk-or-v1-secret1234567890', provenance: [{ sourceType: 'test' }] }),
      /Secret or credential is not allowed/
    );
  });
});
