import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(projectRoot, 'knowledge', 'legacy-drawing-url-migration-proposal.json');
const mainUrlPattern = /@main\/bom-viewer-sync\/(drawings\/catalog\/[^?#]+\.pdf)$/i;

function gitRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
}

function candidateCommits(repositoryPath) {
  const root = gitRoot();
  return execFileSync('git', ['log', '--all', '--format=%H', '--', repositoryPath], {
    cwd: root,
    encoding: 'utf8',
  }).trim().split(/\r?\n/).filter(Boolean);
}

function findLegacyRecords(value, records = [], pathParts = []) {
  if (!value || typeof value !== 'object') return records;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findLegacyRecords(item, records, [...pathParts, String(index)]));
    return records;
  }
  const match = typeof value.url === 'string' ? value.url.match(mainUrlPattern) : null;
  if (match) {
    records.push({
      recordPath: pathParts.join('.'),
      name: value.name || '',
      url: value.url,
      previewUrl: value.previewUrl || '',
      canonicalRepositoryPath: `bom-viewer-sync/${match[1]}`,
    });
  }
  Object.entries(value).forEach(([key, item]) => findLegacyRecords(item, records, [...pathParts, key]));
  return records;
}

const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'data', 'manifest.json'), 'utf8'));
const records = findLegacyRecords(manifest).map((record) => {
  const candidates = candidateCommits(record.canonicalRepositoryPath);
  return {
    ...record,
    candidateCommits: candidates,
    authoritativeCommit: null,
    migrationStatus: candidates.length === 1 ? 'requires_blob_evidence_and_admin_approval' : 'ambiguous_requires_blob_evidence_and_admin_approval',
  };
});
const distinctUrls = [...new Set(records.map((record) => record.url))].sort();

writeFileSync(outputPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  purpose: 'Read-only migration proposal. No URL in this report is approved for rewrite.',
  requiredEvidence: [
    'Approved source PDF or independently recorded full SHA-256 content hash.',
    'Git blob identity at a candidate commit matches the approved source PDF.',
    'Admin review confirming the historical revision and every shared-material reference to update.',
  ],
  prohibitedEvidence: [
    'Filename or truncated filename hash.',
    'Current @main content.',
    'Newest Git commit.',
  ],
  records,
  distinctUrls,
}, null, 2)}\n`, 'utf8');

console.log(`Wrote ${records.length} legacy records and ${distinctUrls.length} distinct URLs to ${outputPath}`);
