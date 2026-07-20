// scripts/audit-ai-security.mjs — R1.5 AI security audit.
//
// Checks for forbidden patterns in all AI feature source files:
//   - No provider/network/storage/key imports
//   - No full-payload leakage
//   - Knowledge-pack schema and provenance
//   - No mutation/GitHub writer reachability from AI modules
//
// Exits 0 if all checks pass, 1 otherwise.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

// ── Config ────────────────────────────────────────────────────────────────────

const AI_SOURCE_DIR = resolve('src/features/ai-assistant');
const KNOWLEDGE_DIR = resolve('knowledge');

// Forbidden imports/patterns in AI source files
const FORBIDDEN_IMPORT_PATTERNS = [
  { pattern: /import.*['"]openrouter['"]/i, reason: 'No OpenRouter/provider import in AI modules' },
  { pattern: /import.*fetch.*from/i, reason: 'No raw fetch import in AI modules (use injected fetchImpl)' },
  { pattern: /localStorage/i, reason: 'No localStorage in AI modules' },
  { pattern: /sessionStorage/i, reason: 'No sessionStorage in AI modules' },
  { pattern: /IndexedDB/i, reason: 'No IndexedDB in AI modules' },
  { pattern: /githubWriter|writerFactory|write\s*\(/i, reason: 'No GitHub writer reachability from AI modules' },
  { pattern: /process\.env\./i, reason: 'No env var access in AI modules (no key storage)' },
];

// Forbidden content in knowledge pack files
const FORBIDDEN_KNOWLEDGE_PATTERNS = [
  { pattern: /\bsk-[a-zA-Z0-9]{20,}\b/, reason: 'No API key in knowledge packs' },
  { pattern: /\bghp_[a-zA-Z0-9]{20,}\b/, reason: 'No GitHub token in knowledge packs' },
  { pattern: /\bbearer\s+[a-zA-Z0-9]{20,}/i, reason: 'No bearer token in knowledge packs' },
];

// Required knowledge pack schema fields
const REQUIRED_SCHEMA_FIELDS = ['schemaVersion', 'packVersion', 'updatedAt'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function walkDir(dir, ext) {
  const results = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      results.push(...walkDir(full, ext));
    } else if (!ext || extname(name) === ext) {
      results.push(full);
    }
  }
  return results;
}

const findings = [];
let checkCount = 0;

function check(description, fn) {
  checkCount++;
  try {
    fn();
  } catch (e) {
    findings.push({ severity: 'P1', description, error: e.message });
  }
}

// ── Source file audit ─────────────────────────────────────────────────────────

const aiSourceFiles = walkDir(AI_SOURCE_DIR, '.js');
check(`AI source dir exists and has files: ${AI_SOURCE_DIR}`, () => {
  if (aiSourceFiles.length === 0) throw new Error('No .js files found in AI source dir');
});

for (const filePath of aiSourceFiles) {
  const content = readFileSync(filePath, 'utf-8');
  for (const { pattern, reason } of FORBIDDEN_IMPORT_PATTERNS) {
    check(`${filePath}: ${reason}`, () => {
      const isGovernedLocalStore = filePath.endsWith(`${join('ai-assistant', 'local-store.js')}`);
      if (isGovernedLocalStore && /localStorage|sessionStorage|IndexedDB/i.test(pattern.source)) return;
      if (pattern.test(content)) {
        throw new Error(`Forbidden pattern found: ${pattern} — ${reason}`);
      }
    });
  }

  // Check that no file exports a function that takes a GitHub token
  check(`${filePath}: no exported GitHub token consumer`, () => {
    // Allow token parameter ONLY in github-sharded-data.js (infrastructure layer)
    if (!filePath.includes('github-sharded-data') && /loadForWrite|writeFiles/.test(content)) {
      throw new Error('AI module appears to reference write operations');
    }
  });
}

const workspaceViewContent = readFileSync(resolve('src/features/ai-assistant/workspace-view.js'), 'utf-8');
check('AI workspace has no HTML parsing sinks', () => {
  if (/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(/.test(workspaceViewContent)) {
    throw new Error('AI workspace must build untrusted content with textContent and DOM nodes only');
  }
});

check('AI trace diagnostics render only through textContent', () => {
  if (!workspaceViewContent.includes('traceOutput.textContent')) {
    throw new Error('AI trace output must render through textContent');
  }
  if (/traceOutput\.(?:innerHTML|outerHTML)|traceOutput\.insertAdjacentHTML/.test(workspaceViewContent)) {
    throw new Error('AI trace output must not use HTML parsing sinks');
  }
});

// ── UI layer audit (R3 extension) ─────────────────────────────────────────────
// Verify no innerHTML sink in src/ui/ receives unescaped dynamic content.

const uiSourceFiles = walkDir(resolve('src/ui'), '.js');
for (const filePath of uiSourceFiles) {
  const content = readFileSync(filePath, 'utf-8');
  check(`${filePath}: no unsafe innerHTML assignment`, () => {
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (line.includes('innerHTML') && line.includes('=')) {
        // Dynamic assignment (template literal or concatenation) must use escapeHTML.
        if ((line.includes('${') || (line.includes(' + ') && !line.includes('= ""') && !line.includes("= ''"))) && !line.includes('escapeHTML')) {
          // Allowlist known safe internal DOM builders that handle escaping internally
          if (!line.includes('moduleButtonHtml') && !line.includes('changePreviewHtml')) {
            throw new Error(`Unsafe innerHTML at line ${i + 1}: ${line.trim()}`);
          }
        }
      }
    });
  });
}

// ── Knowledge pack audit ──────────────────────────────────────────────────────

const knowledgeFiles = walkDir(KNOWLEDGE_DIR, '.json');
check('knowledge/ directory has JSON files', () => {
  if (knowledgeFiles.length === 0) throw new Error('No JSON files found in knowledge/');
});

for (const filePath of knowledgeFiles) {
  const content = readFileSync(filePath, 'utf-8');

  // No secrets
  for (const { pattern, reason } of FORBIDDEN_KNOWLEDGE_PATTERNS) {
    check(`${filePath}: ${reason}`, () => {
      if (pattern.test(content)) {
        throw new Error(`Forbidden pattern in knowledge pack: ${pattern} — ${reason}`);
      }
    });
  }

  // Schema fields
  let parsed;
  check(`${filePath}: valid JSON`, () => {
    parsed = JSON.parse(content);
  });

  if (parsed) {
    for (const field of REQUIRED_SCHEMA_FIELDS) {
      check(`${filePath}: has '${field}'`, () => {
        if (!parsed[field]) throw new Error(`Missing required field: ${field}`);
      });
    }
  }
}

// ── Contracts alignment ───────────────────────────────────────────────────────

const contractsContent = readFileSync(resolve('src/features/ai-assistant/contracts.js'), 'utf-8');
const skillsContent = readFileSync(resolve('knowledge/ai/skills.json'), 'utf-8');
const skillsPack = JSON.parse(skillsContent);

check('ERROR_CODES is frozen in contracts.js', () => {
  if (!contractsContent.includes('Object.freeze')) {
    throw new Error('ERROR_CODES must be frozen in contracts.js');
  }
});

check('All skills.json tool IDs are in contracts.js ALLOWED_TOOLS', () => {
  for (const skill of skillsPack.skills || []) {
    if (!contractsContent.includes(`'${skill.id}'`)) {
      throw new Error(`Skill '${skill.id}' not in contracts.js ALLOWED_TOOLS`);
    }
  }
});

// ── Marketplace alias audit ───────────────────────────────────────────────────

const aliasContent = readFileSync(resolve('knowledge/marketplace-aliases.json'), 'utf-8');
check('marketplace-aliases.json does not contain B0GTZDGNGN ASIN', () => {
  if (aliasContent.includes('B0GTZDGNGN')) {
    throw new Error('Unconfirmed ASIN B0GTZDGNGN found in marketplace-aliases.json');
  }
});

check('marketplace-aliases.json all aliases have confirmedBy field', () => {
  const aliases = JSON.parse(aliasContent).aliases || {};
  for (const [key, entry] of Object.entries(aliases)) {
    if (!entry.confirmedBy) throw new Error(`Alias '${key}' missing confirmedBy`);
  }
});

// ── Full-payload leakage audit ────────────────────────────────────────────────

check('pdm-knowledge.js does not send full bom payload in results', () => {
  const knowledgeContent = readFileSync(resolve('src/features/ai-assistant/pdm-knowledge.js'), 'utf-8');
  // The function toProductSummary must be defined and used — full color_info should not be included
  if (!knowledgeContent.includes('toProductSummary')) {
    throw new Error('pdm-knowledge.js must use toProductSummary to avoid full payload in results');
  }
  if (!knowledgeContent.includes('MAX_SEARCH_RESULTS') && !knowledgeContent.includes('MAX_BOM_ROWS')) {
    throw new Error('pdm-knowledge.js must bound results with MAX constants');
  }
});

// ── Report ────────────────────────────────────────────────────────────────────

const report = {
  timestamp: new Date().toISOString(),
  checksRun: checkCount,
  findings,
  pass: findings.length === 0,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
