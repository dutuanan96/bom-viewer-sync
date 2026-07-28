import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  compareBilingualPair,
  evaluatePdmCase,
  summarizePdmEvaluation,
} from './lib/pdm-ai-evaluator.mjs';

const apiKey = process.env.OPENROUTER_API_KEY;
const modelId = process.env.PDM_EVAL_MODEL || 'xiaomi/mimo-v2.5';
const suiteName = process.env.PDM_EVAL_SUITE || 'smoke';
const repeatCount = Math.max(1, Number(process.env.PDM_EVAL_REPEAT || 1));
const startAt = Math.max(1, Number(process.env.PDM_EVAL_START || 1));
const limit = Math.max(1, Number(process.env.PDM_EVAL_LIMIT || Number.MAX_SAFE_INTEGER));
const requestedIds = new Set(
  String(process.env.PDM_EVAL_IDS || '').split(',').map(value => value.trim()).filter(Boolean),
);

if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');

const corpusPath = resolve('knowledge', 'ai', 'pdm-eval-corpus.json');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const caseById = new Map(corpus.cases.map(testCase => [testCase.id, testCase]));
const suiteIds = suiteName === 'smoke' ? corpus.smokeIds : corpus.cases.map(testCase => testCase.id);
const selectedIds = requestedIds.size > 0
  ? suiteIds.filter(id => requestedIds.has(id))
  : suiteIds;
const selectedCases = selectedIds
  .map(id => caseById.get(id))
  .filter(Boolean)
  .slice(startAt - 1, startAt - 1 + limit);
const scheduledCases = Array.from({ length: repeatCount }, (_, repeatIndex) => (
  selectedCases.map(testCase => ({ testCase, repeatIndex: repeatIndex + 1 }))
)).flat();

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractEvidence(messages = []) {
  for (const message of [...messages].reverse()) {
    const content = String(message?.content || '');
    if (content.startsWith('TRUSTED_LOCAL_PDM_RESULT')) {
      const jsonStart = content.indexOf('\n', content.indexOf('\n') + 1) + 1;
      const jsonEnd = content.indexOf('\nPDM_GROUNDING_REQUIREMENTS');
      if (jsonStart > 0 && jsonEnd > jsonStart) {
        const parsed = parseJson(content.slice(jsonStart, jsonEnd));
        if (parsed) return parsed;
      }
    }
    if (message?.role === 'tool') {
      const parsed = parseJson(content);
      if (parsed) return parsed;
    }
  }
  return null;
}

const outputDir = resolve('test-results', 'pdm-ai-eval');
mkdirSync(outputDir, { recursive: true });
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = resolve(outputDir, `${runId}.${suiteName}.json`);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(190_000);
let currentEvidence = null;
const browserErrors = [];

page.on('pageerror', error => browserErrors.push(String(error?.message || error)));
page.on('request', request => {
  if (request.url() !== 'https://openrouter.ai/api/v1/chat/completions') return;
  const body = request.postDataJSON();
  const evidence = extractEvidence(body?.messages);
  if (evidence) currentEvidence = evidence;
});

const results = [];
try {
  await page.goto(`file://${resolve('viewer.html')}`);
  await page.locator('.product-catalog-view').waitFor({ state: 'visible', timeout: 30_000 });
  await page.click('#aiFab');
  await page.click('#btnSettings');
  await page.fill('.ai-settings input[type="password"]', apiKey);
  await page.click('.ai-settings > button.btn-primary');
  await page.locator('.ai-status-text.connected').waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('.ai-settings select').selectOption(modelId);
  await page.click('#closeSettingsModal');
  await page.click('#aiFab');

  for (const scheduled of scheduledCases) {
    const { testCase, repeatIndex } = scheduled;
    await page.click('.ai-clear-btn');
    currentEvidence = null;
    const assistantMessages = page.locator('.ai-message-row.assistant .ai-message-text');
    const previousCount = await assistantMessages.count();
    const startedAt = Date.now();
    let answer = '';
    let error = '';

    try {
      await page.fill('.ai-chat-input', testCase.input);
      await page.click('.ai-send-btn');
      await page.waitForFunction(
        count => document.querySelectorAll('.ai-message-row.assistant .ai-message-text').length > count,
        previousCount,
      );
      answer = await assistantMessages.last().innerText();
    } catch (caught) {
      error = String(caught?.message || caught).slice(0, 2000);
    }

    const fact = corpus.facts[testCase.expectedRef];
    const evaluation = error
      ? {
          score: 0,
          result: 'fail',
          criteria: {},
          missingFields: testCase.assertFields,
          forbiddenFound: [],
          noDataDisclosed: false,
          confirmationDisclosed: false,
        }
      : evaluatePdmCase({ testCase, fact, answer, evidence: currentEvidence });
    const result = {
      testCase,
      fact,
      repeatIndex,
      modelId,
      answer,
      evidence: currentEvidence,
      error,
      durationMs: Date.now() - startedAt,
      evaluation,
    };
    results.push(result);
    process.stdout.write(
      `${testCase.id} repeat=${repeatIndex} score=${evaluation.score} ${evaluation.result} ${result.durationMs}ms\n`,
    );
  }
} finally {
  await browser.close();
}

const latestResultById = new Map(results.map(result => [result.testCase.id, result]));
const bilingualResults = corpus.bilingualPairs
  .map(pair => {
    const left = latestResultById.get(pair.vi);
    const right = latestResultById.get(pair.zh);
    if (!left || !right) return null;
    return { pairId: pair.id, ...compareBilingualPair(left, right) };
  })
  .filter(Boolean);
const summary = summarizePdmEvaluation(results, bilingualResults);
const report = {
  schemaVersion: 1,
  modelId,
  suiteName,
  repeatCount,
  corpusPath,
  selectedCaseCount: selectedCases.length,
  scheduledCaseCount: scheduledCases.length,
  summary,
  bilingualResults,
  browserErrors,
  results,
};
writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ reportPath, summary }));
