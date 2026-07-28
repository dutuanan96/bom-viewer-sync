import { chromium } from '@playwright/test';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const apiKey = process.env.OPENROUTER_API_KEY;
const promptsPath = process.env.PDM_EVAL_PROMPTS_FILE;
const modelId = process.env.PDM_EVAL_MODEL || 'xiaomi/mimo-v2.5';
const startAt = Math.max(1, Number(process.env.PDM_EVAL_START || 1));
const limit = Math.max(1, Number(process.env.PDM_EVAL_LIMIT || Number.MAX_SAFE_INTEGER));

if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
if (!promptsPath) throw new Error('PDM_EVAL_PROMPTS_FILE is required');

function parseCases(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const cases = [];
  let section = '';
  let heading = '';
  let body = [];

  const flush = () => {
    if (!heading) return;
    const prompt = body.join('\n').trim().replace(/\n{3,}/g, '\n\n');
    if (prompt && (/^\d+$/.test(heading) || /^第\d+句$/.test(heading))) {
      cases.push({
        sourceIndex: cases.length + 1,
        label: heading,
        section,
        sessionId: /^\d+$/.test(heading) ? `isolated-${heading}` : `conversation-${section}`,
        prompt,
      });
    }
    heading = '';
    body = [];
  };

  for (const line of lines) {
    const sectionMatch = line.match(/^#\s+(.+)$/);
    const itemMatch = line.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      flush();
      section = sectionMatch[1].trim();
      continue;
    }
    if (itemMatch) {
      flush();
      heading = itemMatch[1].trim();
      continue;
    }
    if (heading && line.trim() !== '---') body.push(line);
  }
  flush();
  return cases;
}

const allCases = parseCases(readFileSync(promptsPath, 'utf8'));
const selectedCases = allCases.slice(startAt - 1, startAt - 1 + limit);
const outputDir = resolve('test-results', 'live-stability');
mkdirSync(outputDir, { recursive: true });
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const jsonlPath = resolve(outputDir, `${runId}.jsonl`);
const summaryPath = resolve(outputDir, `${runId}.summary.json`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(120_000);
const browserErrors = [];
const compatibilityCalls = [];
page.on('pageerror', error => browserErrors.push(String(error?.message || error)));

const results = [];
let activeSessionId = '';
try {
  await page.goto(`file://${resolve('viewer.html')}`);
  await page.locator('.product-catalog-view').waitFor({ state: 'visible', timeout: 30_000 });
  await page.click('#aiFab');
  await page.click('#btnSettings');
  await page.fill('.ai-settings input[type="password"]', apiKey);
  await page.click('.ai-settings > button.btn-primary');
  await page.locator('.ai-status-text.connected').waitFor({ state: 'visible', timeout: 60_000 });
  const modelSelect = page.locator('.ai-settings select');
  await modelSelect.selectOption(modelId);
  await page.click('#closeSettingsModal');
  await page.click('#aiFab');

  for (const testCase of selectedCases) {
    if (activeSessionId !== testCase.sessionId) {
      await page.click('.ai-clear-btn');
      activeSessionId = testCase.sessionId;
    }

    const assistantMessages = page.locator('.ai-message-row.assistant .ai-message-text');
    const previousAssistantCount = await assistantMessages.count();
    const startedAt = Date.now();
    let answer = '';
    let status = 'ok';
    let error = '';

    try {
      await page.fill('.ai-chat-input', testCase.prompt);
      await page.click('.ai-send-btn');
      await page.waitForFunction(
        count => document.querySelectorAll('.ai-message-row.assistant .ai-message-text').length > count,
        previousAssistantCount,
        { timeout: 190_000 },
      );
      answer = await assistantMessages.last().innerText();
    } catch (caught) {
      status = 'error';
      error = String(caught?.message || caught).slice(0, 2000);
    }

    const result = {
      ...testCase,
      modelId,
      status,
      answer,
      error,
      durationMs: Date.now() - startedAt,
      completedAt: new Date().toISOString(),
    };
    results.push(result);
    appendFileSync(jsonlPath, `${JSON.stringify(result)}\n`, 'utf8');
    process.stdout.write(
      `${result.sourceIndex}/${allCases.length} ${result.label} ${status} ${result.durationMs}ms\n`,
    );
  }
} finally {
  await browser.close();
  writeFileSync(summaryPath, JSON.stringify({
    modelId,
    promptsPath,
    totalParsed: allCases.length,
    selected: selectedCases.length,
    completed: results.length,
    ok: results.filter(result => result.status === 'ok').length,
    errors: results.filter(result => result.status !== 'ok').length,
    compatibilityCallCount: compatibilityCalls.length,
    compatibilityCalls,
    browserErrors,
    jsonlPath,
  }, null, 2), 'utf8');
}

console.log(JSON.stringify({ jsonlPath, summaryPath, completed: results.length }));
