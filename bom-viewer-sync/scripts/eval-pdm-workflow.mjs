import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  scoreWorkflowVariant,
  validateWorkflowCorpus,
} from './eval-pdm-workflow-scorer.mjs';
import { semanticSchemaPrompt } from './semantic-schema-validator.mjs';

const { values: args } = parseArgs({
  options: {
    concurrency: { type: 'string' },
    'dry-run': { type: 'boolean' },
    filter: { type: 'string' },
    runs: { type: 'string' },
  },
  strict: true,
});

const apiKey = process.env.OPENROUTER_API_KEY;
const dryRun = args['dry-run'] === true;
const corpus = JSON.parse(readFileSync(
  resolve('knowledge', 'ai', 'pdm-workflow-eval-corpus.json'),
  'utf8',
));
const corpusValidation = validateWorkflowCorpus(corpus);
if (!corpusValidation.valid) {
  console.error(`Workflow corpus invalid:\n${corpusValidation.findings.join('\n')}`);
  process.exit(1);
}

if (!apiKey && !dryRun) {
  console.log('READY_FOR_LIVE_BASELINE: OPENROUTER_API_KEY not set.');
  process.exit(0);
}

const modelId = process.env.PDM_WORKFLOW_EVAL_MODEL
  || corpus.liveEvaluation.targetModel
  || 'xiaomi/mimo-v2.5';
const repeatEachVariant = positiveInteger(
  args.runs || process.env.PDM_WORKFLOW_EVAL_REPEAT,
  corpus.liveEvaluation.repeatEachVariant,
);
const concurrency = positiveInteger(
  args.concurrency || process.env.PDM_WORKFLOW_EVAL_CONCURRENCY,
  1,
);
const requestedIds = new Set(
  String(args.filter || process.env.PDM_WORKFLOW_EVAL_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
);

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function expectedOutput(scenario) {
  return { ...structuredClone(scenario.expectedSemanticDelta), confidence: 1 };
}

function decodePointerToken(token) {
  return token.replace(/~1/gu, '/').replace(/~0/gu, '~');
}

function pointerParent(document, pointer) {
  const tokens = pointer.split('/').slice(1).map(decodePointerToken);
  const finalToken = tokens.pop();
  let parent = document;
  for (const token of tokens) {
    parent = Array.isArray(parent) ? parent[Number(token)] : parent[token];
  }
  return { parent, finalToken };
}

function applyPatches(value, patches = []) {
  const output = structuredClone(value);
  for (const patch of patches) {
    const { parent, finalToken } = pointerParent(output, patch.path);
    if (patch.op === 'remove') {
      if (Array.isArray(parent)) parent.splice(Number(finalToken), 1);
      else delete parent[finalToken];
    } else if (patch.op === 'replace' || patch.op === 'add') {
      if (Array.isArray(parent) && finalToken === '-') parent.push(structuredClone(patch.value));
      else if (Array.isArray(parent)) parent[Number(finalToken)] = structuredClone(patch.value);
      else parent[finalToken] = structuredClone(patch.value);
    } else if (patch.op === 'reverse') {
      const target = finalToken === undefined
        ? parent
        : Array.isArray(parent)
          ? parent[Number(finalToken)]
          : parent[finalToken];
      if (!Array.isArray(target)) throw new Error(`Patch target is not an array: ${patch.path}`);
      target.reverse();
    } else {
      throw new Error(`Unsupported dry-run patch operation: ${patch.op}`);
    }
  }
  return output;
}

function parseModelJson(content) {
  const text = String(content || '').trim();
  const unwrapped = text
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
  return JSON.parse(unwrapped);
}

async function callModel({ scenario, variant }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/dutuanan96/bom-viewer-sync',
        'X-Title': 'JinTai PDM Workflow Evaluation',
      },
      body: JSON.stringify({
        model: modelId,
        temperature: 0,
        max_tokens: 1600,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are a semantic interpreter for a governed PDM workflow.',
              semanticSchemaPrompt(),
              'Canonical PDM evidence is not included in this classification turn.',
              'Use requestedEvidence to ask the deterministic runtime for facts before proposing an action.',
              'The user text may mix Vietnamese and Chinese. responseLanguage follows the dominant conversation language.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              authorityState: scenario.authorityState,
              priorState: scenario.priorState,
              userTurn: variant,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { error: `PROVIDER_HTTP_${response.status}` };
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return { error: 'PROVIDER_EMPTY_OUTPUT' };
    const parsed = parseModelJson(content);
    if (scenario.caseId === 'WF-001' && variant === scenario.userVariants[0]) {
      console.log('--- DEBUG MODEL OUTPUT WF-001 ---');
      console.log(content);
    }
    return { output: parsed };
  } catch (error) {
    if (error?.name === 'AbortError') return { error: 'PROVIDER_TIMEOUT' };
    return { error: 'PROVIDER_INVALID_OUTPUT' };
  } finally {
    clearTimeout(timeout);
  }
}

async function runDryGate() {
  const fixture = JSON.parse(readFileSync(
    resolve('tests', 'fixtures', 'pdm-workflow-eval-dryrun.json'),
    'utf8',
  ));
  const scenarioById = new Map(corpus.scenarios.map(scenario => [scenario.caseId, scenario]));
  let passed = 0;
  for (const testCase of fixture.cases || []) {
    const scenario = scenarioById.get(testCase.caseId);
    if (!scenario) {
      console.error(`${testCase.name}: missing scenario ${testCase.caseId}`);
      continue;
    }
    const actualOutput = applyPatches(expectedOutput(scenario), testCase.patches);
    const score = scoreWorkflowVariant(scenario, actualOutput);
    const metaPass = score.pass === testCase.expectedPass
      && (testCase.expectedFailure || []).every(code => score.failures.includes(code));
    if (metaPass) passed += 1;
    else {
      console.error(
        `${testCase.name}: expected pass=${testCase.expectedPass}; `
        + `actual pass=${score.pass}; failures=${score.failures.join(',')}`,
      );
    }
  }
  const total = fixture.cases?.length || 0;
  console.log(`Dry-run meta gate: ${passed}/${total}`);
  if (total === 0 || passed !== total) process.exit(1);
  console.log('Workflow evaluator dry-run passed.');
}

async function runPool(items, worker, size) {
  const results = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(size, items.length) },
    () => consume(),
  ));
  return results;
}

async function runLiveBaseline() {
  const selectedScenarios = requestedIds.size > 0
    ? corpus.scenarios.filter(scenario => requestedIds.has(scenario.caseId))
    : corpus.scenarios;
  const scheduled = [];
  for (const scenario of selectedScenarios) {
    for (const variant of scenario.userVariants) {
      for (let repeat = 1; repeat <= repeatEachVariant; repeat += 1) {
        scheduled.push({ scenario, variant, repeat });
      }
    }
  }
  if (scheduled.length === 0) {
    console.error('No workflow variants selected; total=0.');
    process.exit(1);
  }

  const results = await runPool(scheduled, async scheduledCase => {
    const startedAt = Date.now();
    const provider = await callModel(scheduledCase);
    if (provider.error) {
      return {
        caseId: scheduledCase.scenario.caseId,
        repeat: scheduledCase.repeat,
        durationMs: Date.now() - startedAt,
        pass: false,
        safetyPass: true,
        stateAdvanced: false,
        failures: [provider.error],
      };
    }
    const score = scoreWorkflowVariant(scheduledCase.scenario, provider.output);
    return {
      caseId: scheduledCase.scenario.caseId,
      repeat: scheduledCase.repeat,
      durationMs: Date.now() - startedAt,
      pass: score.pass,
      safetyPass: score.safetyPass,
      stateAdvanced: score.stateAdvanced,
      failures: score.failures,
    };
  }, concurrency);

  const clearTurnResults = results.filter(result => {
    const scenario = selectedScenarios.find(item => item.caseId === result.caseId);
    return scenario.expectedSemanticDelta.intent === 'workflow_update'
      && scenario.expectedSemanticDelta.taskUpdates.length > 0;
  });
  const passed = results.filter(result => result.pass).length;
  const safetyPassed = results.filter(result => result.safetyPass).length;
  const stateAdvanced = clearTurnResults.filter(result => result.stateAdvanced).length;
  const overallPassRate = passed / results.length;
  const safetyPassRate = safetyPassed / results.length;
  const clearTurnStateAdvanceRate = clearTurnResults.length > 0
    ? stateAdvanced / clearTurnResults.length
    : 1;
  const latencyMs = results.map(result => result.durationMs).sort((a, b) => a - b);
  const percentile = fraction => latencyMs[Math.min(
    latencyMs.length - 1,
    Math.floor(latencyMs.length * fraction),
  )];
  const summary = {
    modelId,
    selectedScenarioCount: selectedScenarios.length,
    scheduledRunCount: results.length,
    repeatEachVariant,
    overallPassRate,
    safetyPassRate,
    clearTurnStateAdvanceRate,
    latencyP50Ms: percentile(0.5),
    latencyP95Ms: percentile(0.95),
    failedCaseIds: [...new Set(results.filter(result => !result.pass).map(result => result.caseId))],
    failureCodes: [...new Set(results.flatMap(result => result.failures))].sort(),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (
    safetyPassRate < corpus.liveEvaluation.requiredSafetyPassRate
    || clearTurnStateAdvanceRate < corpus.liveEvaluation.requiredClearTurnStateAdvanceRate
    || overallPassRate < corpus.liveEvaluation.requiredOverallPassRate
  ) {
    process.exit(1);
  }
  console.log('LIVE_BASELINE_PASSED');
}

if (dryRun) await runDryGate();
else await runLiveBaseline();
