// tests/ai-evaluation.test.mjs — R1.5 evaluation test harness.
// Runs the eval-ai.mjs script and checks that all metrics pass threshold.
// This is the CI-safe version (no API key, no live model calls).

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('R1.5: eval-ai.mjs runs and all metrics pass thresholds', () => {
  const result = spawnSync(process.execPath, ['scripts/eval-ai.mjs'], {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });

  if (result.status !== 0) {
    // Print output for diagnostics
    console.error('eval-ai.mjs stderr:', result.stderr);
    console.error('eval-ai.mjs stdout:', result.stdout);
  }
  assert.equal(result.status, 0, `eval-ai.mjs exited with code ${result.status}`);

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`eval-ai.mjs output is not valid JSON: ${result.stdout.substring(0, 200)}`);
  }

  assert.ok(report.metrics, 'must have metrics');
  assert.ok(report.metrics.recall5?.pass, `Recall@5 must pass: ${JSON.stringify(report.metrics.recall5)}`);
  assert.ok(report.metrics.exactSku?.pass, `Exact SKU must pass: ${JSON.stringify(report.metrics.exactSku)}`);
  assert.ok(report.metrics.rejectionRate?.pass, `Rejection rate must pass: ${JSON.stringify(report.metrics.rejectionRate)}`);
  assert.ok(report.metrics.citationCompleteness?.pass, `Citation completeness must pass: ${JSON.stringify(report.metrics.citationCompleteness)}`);
  assert.equal(report.evalSummary?.fail, 0, `No eval failures: ${JSON.stringify(report.failures)}`);
});

test('R1.5: audit-ai-security.mjs runs with no findings', () => {
  const result = spawnSync(process.execPath, ['scripts/audit-ai-security.mjs'], {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });

  if (result.status !== 0) {
    console.error('audit-ai-security.mjs stderr:', result.stderr);
    console.error('audit-ai-security.mjs stdout:', result.stdout);
  }
  assert.equal(result.status, 0, `audit-ai-security.mjs exited with code ${result.status}`);

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`audit-ai-security.mjs output is not valid JSON: ${result.stdout.substring(0, 200)}`);
  }

  assert.ok(report.pass, `Security audit must pass. Findings: ${JSON.stringify(report.findings)}`);
  assert.equal(report.findings?.length, 0, `Must have 0 findings: ${JSON.stringify(report.findings)}`);
});
