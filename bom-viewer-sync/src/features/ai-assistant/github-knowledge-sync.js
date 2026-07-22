import { validateSkill } from './contracts.js';
import { validateEntityMapping } from './entity-mapping.js';

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const REPO_PART_PATTERN = /^[A-Za-z0-9_.-]+$/;
const FORBIDDEN_JS_CODE_PATTERNS = [
  /eval\s*\(/i,
  /Function\s*\(/i,
  /<script\b/i,
  /javascript:/i,
  /import\s*\(/i,
  /\bprocess\./i,
  /\bwindow\./i,
  /\bdocument\./i,
];

function sanitizeToken(error, token) {
  if (!token || typeof token !== 'string') return error;
  const redact = (text) => (typeof text === 'string' ? text.replaceAll(token, '***') : text);
  const err = new Error(redact(error?.message || 'Sync error'));
  err.name = error?.name || 'Error';
  if (error?.status) err.status = error.status;
  if (error?.code) err.code = error.code;
  return err;
}

export function validateGithubSyncTarget(config = {}, allowlist = []) {
  const owner = String(config.owner || '').trim();
  const repo = String(config.repo || '').trim();
  const path = String(config.path || '').trim();
  const ref = String(config.ref || '').trim();

  if (!owner || !REPO_PART_PATTERN.test(owner) || owner === '.' || owner === '..') {
    throw new Error('Invalid GitHub owner config');
  }
  if (!repo || !REPO_PART_PATTERN.test(repo) || repo === '.' || repo === '..') {
    throw new Error('Invalid GitHub repository config');
  }
  if (!ref || ref.includes('..') || ref.includes('//') || /[\x00-\x20\x7f~^:?*[\\]/.test(ref)) {
    throw new Error('Invalid GitHub ref config');
  }
  if (path.includes('..') || path.startsWith('/') || path.startsWith('\\')) {
    throw new Error('Invalid GitHub path config');
  }

  const targetSlug = `${owner}/${repo}`.toLowerCase();
  const normalizedAllowlist = (Array.isArray(allowlist) ? allowlist : [])
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);

  if (normalizedAllowlist.length > 0) {
    const isAllowed = normalizedAllowlist.some((allowed) => {
      if (allowed.endsWith('/*')) {
        const prefix = allowed.slice(0, -2);
        return targetSlug.startsWith(`${prefix}/`);
      }
      return targetSlug === allowed;
    });
    if (!isAllowed) {
      throw new Error(`Target repository ${owner}/${repo} is not in the allowlist`);
    }
  }

  return { owner, repo, path: path || 'knowledge/ai', ref };
}

function checkNoExecutableCode(rawText, label) {
  if (typeof rawText !== 'string') throw new Error(`${label} must be text`);
  for (const pattern of FORBIDDEN_JS_CODE_PATTERNS) {
    if (pattern.test(rawText)) {
      throw new Error(`Executable or unsafe code detected in ${label}`);
    }
  }
}

export function validatePackSchema(pack, label = 'Knowledge pack') {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    throw new Error(`${label} must be a valid JSON object`);
  }
  if (!Number.isInteger(pack.schemaVersion) || pack.schemaVersion <= 0) {
    throw new Error(`${label} missing or invalid schemaVersion`);
  }
  if (typeof pack.packVersion !== 'string' || !pack.packVersion.trim()) {
    throw new Error(`${label} missing or invalid packVersion`);
  }
  if (typeof pack.updatedAt !== 'string' || !pack.updatedAt.trim()) {
    throw new Error(`${label} missing or invalid updatedAt`);
  }
}

export function validatePromptPackSchema(promptPack) {
  validatePackSchema(promptPack, 'Prompt pack');
  if (!Array.isArray(promptPack.specialists) || promptPack.specialists.length === 0) {
    throw new Error('Prompt pack missing specialists array');
  }
  for (const specialist of promptPack.specialists) {
    if (!specialist || typeof specialist !== 'object' || Array.isArray(specialist)) {
      throw new Error('Specialist entry must be an object');
    }
    if (typeof specialist.id !== 'string' || !specialist.id.trim()) {
      throw new Error('Specialist entry missing id');
    }
    if (!Array.isArray(specialist.allowedTools) || specialist.allowedTools.length === 0) {
      throw new Error(`Specialist ${specialist.id} missing allowedTools`);
    }
    if (!Array.isArray(specialist.instructions) || specialist.instructions.length === 0) {
      throw new Error(`Specialist ${specialist.id} missing instructions`);
    }
    if (!Array.isArray(specialist.verification) || specialist.verification.length === 0) {
      throw new Error(`Specialist ${specialist.id} missing verification`);
    }
  }
  return promptPack;
}

export function validateSkillsPackSchema(skillsPack) {
  validatePackSchema(skillsPack, 'Skills pack');
  validateSkill(skillsPack);
  if (!Array.isArray(skillsPack.skills) || skillsPack.skills.length === 0) {
    throw new Error('Skills pack missing skills array');
  }
  for (const skill of skillsPack.skills) {
    if (!skill || typeof skill !== 'object' || Array.isArray(skill)) {
      throw new Error('Skill entry must be an object');
    }
    if (typeof skill.id !== 'string' || !skill.id.trim()) {
      throw new Error('Skill entry missing id');
    }
  }
  return skillsPack;
}

export function validateEntityAliasesPackSchema(entityAliasesPack) {
  validatePackSchema(entityAliasesPack, 'Entity aliases pack');
  if (!Array.isArray(entityAliasesPack.mappings)) {
    throw new Error('Entity aliases pack missing mappings array');
  }
  entityAliasesPack.mappings.forEach(mapping => validateEntityMapping(mapping));
  return entityAliasesPack;
}

function validateKnowledgePack(pack) {
  if (!pack?.provenance?.commitSha || !SHA_PATTERN.test(pack.provenance.commitSha)) {
    throw new Error('Knowledge pack provenance must contain a commit SHA');
  }
  validatePromptPackSchema(pack.files?.promptPack);
  validateSkillsPackSchema(pack.files?.skillsPack);
  if (pack.files?.entityAliases) validateEntityAliasesPackSchema(pack.files.entityAliases);
  return pack;
}

export function createGithubKnowledgeSync({
  config = {},
  allowlist = ['dutuanan96/bom-viewer-sync'],
  defaultPack = null,
  localStore = null,
  fetchImpl = globalThis.fetch,
  clock = () => new Date().toISOString(),
} = {}) {
  let activePack = defaultPack ? { ...defaultPack } : null;
  let lastKnownGoodPack = null;
  let syncStatus = 'idle'; // 'idle' | 'synced' | 'cached' | 'fallback' | 'error'
  let lastError = null;

  // Attempt to restore cached pack from localStore at init
  if (localStore?.getGithubSyncPack) {
    const cached = localStore.getGithubSyncPack();
    try {
      if (cached) {
        validateKnowledgePack(cached);
        lastKnownGoodPack = cached;
        activePack = cached;
        syncStatus = 'cached';
      }
    } catch {
      localStore.clearGithubSyncPack?.();
    }
  }

  async function resolveCommitSha({ owner, repo, ref, token }) {
    if (SHA_PATTERN.test(ref)) {
      return ref.toLowerCase();
    }
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`;
    const headers = { Accept: 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetchImpl(url, { headers, cache: 'no-store' });
    if (!response.ok) {
      const err = new Error(`Failed to resolve commit SHA for ref ${ref} (status ${response.status})`);
      err.status = response.status;
      throw err;
    }
    const data = await response.json();
    const sha = data?.sha;
    if (!sha || !SHA_PATTERN.test(sha)) {
      throw new Error(`GitHub API returned invalid commit SHA for ref ${ref}`);
    }
    return sha.toLowerCase();
  }

  async function fetchRawFile({ owner, repo, commitSha, path, fileName, token }) {
    const filePath = path ? `${path}/${fileName}` : fileName;
    const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${commitSha}/${filePath}`;
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetchImpl(url, { headers, cache: 'no-store' });
    if (!response.ok) {
      const err = new Error(`Failed to download ${fileName} from GitHub (status ${response.status})`);
      err.status = response.status;
      throw err;
    }
    const text = await response.text();
    checkNoExecutableCode(text, fileName);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Malformed JSON in downloaded ${fileName}`);
    }
    return { text, parsed };
  }

  async function sync(overrideConfig = {}) {
    const mergedConfig = { ...config, ...overrideConfig };
    const token = mergedConfig.token || null;
    try {
      const target = validateGithubSyncTarget(mergedConfig, allowlist);
      const commitSha = await resolveCommitSha({ owner: target.owner, repo: target.repo, ref: target.ref, token });

      // If commit SHA is unchanged and active pack is already synced at this SHA, return immediately
      if (
        syncStatus === 'synced' &&
        activePack?.provenance?.commitSha === commitSha &&
        activePack?.provenance?.owner === target.owner &&
        activePack?.provenance?.repo === target.repo
      ) {
        return {
          activated: false,
          reason: 'unchanged',
          commitSha,
          pack: activePack,
        };
      }

      // Download all required declarative files
      const promptPackResult = await fetchRawFile({
        owner: target.owner,
        repo: target.repo,
        commitSha,
        path: target.path,
        fileName: 'prompt-pack.json',
        token,
      });

      const skillsPackResult = await fetchRawFile({
        owner: target.owner,
        repo: target.repo,
        commitSha,
        path: target.path,
        fileName: 'skills.json',
        token,
      });

      let entityAliasesResult = null;
      try {
        entityAliasesResult = await fetchRawFile({
          owner: target.owner,
          repo: target.repo,
          commitSha,
          path: target.path,
          fileName: 'entity-aliases.json',
          token,
        });
      } catch (error) {
        if (error?.status !== 404) throw error;
        // entity-aliases.json is optional when it is not present.
      }

      // Validate all declarative schemas BEFORE activation
      validatePromptPackSchema(promptPackResult.parsed);
      validateSkillsPackSchema(skillsPackResult.parsed);
      if (entityAliasesResult) validateEntityAliasesPackSchema(entityAliasesResult.parsed);

      const capturedAt = clock();
      const packVersion = promptPackResult.parsed.packVersion;
      const schemaVersion = promptPackResult.parsed.schemaVersion;

      const newPack = {
        provenance: {
          owner: target.owner,
          repo: target.repo,
          path: target.path,
          ref: target.ref,
          commitSha,
          capturedAt,
          packVersion,
          schemaVersion,
        },
        files: {
          promptPack: promptPackResult.parsed,
          skillsPack: skillsPackResult.parsed,
          entityAliases: entityAliasesResult?.parsed || null,
        },
      };

      // Atomic activation
      activePack = newPack;
      lastKnownGoodPack = newPack;
      syncStatus = 'synced';
      lastError = null;

      if (localStore?.setGithubSyncPack) {
        localStore.setGithubSyncPack(newPack);
      }
      if (localStore?.appendAudit) {
        localStore.appendAudit({
          action: 'github-sync-success',
          commitSha,
          packVersion,
        });
      }

      return {
        activated: true,
        commitSha,
        pack: activePack,
      };
    } catch (err) {
      const safeErr = sanitizeToken(err, token);
      lastError = safeErr.message;

      if (localStore?.appendAudit) {
        localStore.appendAudit({
          action: 'github-sync-failed',
          error: safeErr.message,
        });
      }

      // Keep last known good / default pack without crashing AI
      if (!activePack && lastKnownGoodPack) {
        activePack = lastKnownGoodPack;
      }
      syncStatus = activePack ? (activePack === lastKnownGoodPack ? 'cached' : 'fallback') : 'error';

      return {
        activated: false,
        error: safeErr.message,
        commitSha: activePack?.provenance?.commitSha || null,
        pack: activePack,
      };
    }
  }

  function rollback() {
    if (defaultPack) {
      activePack = { ...defaultPack };
      syncStatus = 'fallback';
    } else {
      activePack = null;
      syncStatus = 'idle';
    }
    lastError = null;
    if (localStore?.clearGithubSyncPack) {
      localStore.clearGithubSyncPack();
    }
    if (localStore?.appendAudit) {
      localStore.appendAudit({ action: 'github-sync-rollback' });
    }
    return activePack;
  }

  function getStatus() {
    return {
      status: syncStatus,
      activeCommitSha: activePack?.provenance?.commitSha || null,
      capturedAt: activePack?.provenance?.capturedAt || null,
      packVersion: activePack?.files?.promptPack?.packVersion || activePack?.provenance?.packVersion || null,
      lastError,
    };
  }

  function getActivePack() {
    return activePack;
  }

  return {
    sync,
    rollback,
    getStatus,
    getActivePack,
  };
}
