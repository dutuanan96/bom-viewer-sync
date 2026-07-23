import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VIEWER_URL = `file://${resolve('viewer.html')}`;
const ADMIN_URL = `file://${resolve('admin.html')}`;

function loadCanonicalPayload() {
  const manifest = JSON.parse(readFileSync(resolve('data/manifest.json'), 'utf8'));
  const materialData = JSON.parse(readFileSync(resolve('data/materials.json'), 'utf8'));
  const bom = Object.fromEntries(manifest.products.map(productCode => [
    productCode,
    JSON.parse(readFileSync(resolve(`data/products/${productCode}.json`), 'utf8')),
  ]));
  return {
    bom,
    productRevisions: manifest.productRevisions || {},
    notifications: manifest.notifications || [],
    ...materialData,
  };
}

async function waitForViewerReady(page) {
  await expect(page.locator('.product-catalog-view')).toContainText('LGS032', { timeout: 30000 });
}

async function blockRemotePdmData(page) {
  await page.route('https://api.github.com/**', route => route.abort());
  await page.route('https://raw.githubusercontent.com/**', route => route.abort());
}

test.describe('R2.5 AI Assistant UI Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock OpenRouter key validation
    await page.route('https://openrouter.ai/api/v1/key', async route => {
      const json = { data: { label: 'mock-key', usage: 0, limit: 100, is_free_tier: false } };
      await route.fulfill({ json });
    });

    // Mock OpenRouter model list
    await page.route('https://openrouter.ai/api/v1/models?supported_parameters=tools', async route => {
      const json = { data: [{ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', supported_parameters: ['tools', 'tool_choice', 'structured_outputs'] }] };
      await route.fulfill({ json });
    });
  });

  test('Connect, Run 1 Tool Loop, Citations, and Core App Survival', async ({ page }) => {
    test.setTimeout(90000);
    await blockRemotePdmData(page);
    await page.goto(VIEWER_URL);

    // Open Drawer via AI Button
    await page.click('#aiFab');
    await expect(page.locator('#aiChatWidget')).toBeVisible();

    // Connect Settings
    await page.click('#btnSettings');
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings > button.btn-primary');
    await expect(page.locator('.ai-status-text.connected')).toBeVisible();
    await page.click('#closeSettingsModal');

    // Re-open chat widget as clicking outside closed it
    await page.click('#aiFab');

    // Mock chat completion (1 tool loop)
    let chatCallCount = 0;
    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      chatCallCount++;
      if (chatCallCount === 1) {
        // Turn 1: Model calls search_products tool
        await route.fulfill({
          json: {
            choices: [{
              message: {
                role: 'assistant',
                tool_calls: [{
                  id: 'call_123',
                  type: 'function',
                  function: { name: 'search_products', arguments: '{"query": "LGS"}' }
                }]
              }
            }]
          }
        });
      } else {
        // Turn 2: Model provides final answer
        await route.fulfill({
          json: {
            choices: [{
              message: {
                role: 'assistant',
                content: '{"text": "Found it.", "citations": []}'
              }
            }]
          }
        });
      }
    });

    // Run query
    await page.fill('.ai-input-area textarea', 'Find LGS');
    await page.press('.ai-input-area textarea', 'Enter');

    // Wait for the final answer
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('Found it.');

    // Disconnect and Verify Core App Survival
    await page.click('#btnSettings', { force: true });
    await page.click('.ai-settings > button.btn:not(.btn-primary)');
    await expect(page.locator('.ai-status-text.disconnected')).toBeVisible();
    await page.click('#closeSettingsModal');

    // Core PDM is still alive, and the drawer should be closed (because clicking outside closed it)
    await expect(page.locator('#aiChatWidget')).not.toHaveClass(/is-open/);

    // Verify product list is intact
    await expect(page.locator('.product-list')).toBeVisible();
  });

  test('Provider Error triggers local fallback', async ({ page }) => {
    test.setTimeout(90000);
    await blockRemotePdmData(page);
    await page.goto(VIEWER_URL);
    await page.click('#aiFab');

    await page.click('#btnSettings', { force: true });
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings > button.btn-primary');
    await page.click('#closeSettingsModal');

    // Re-open chat widget
    await page.click('#aiFab');

    // Mock 503 error
    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      await route.fulfill({ status: 503, json: { error: { message: 'Overloaded' } } });
    });

    await page.fill('.ai-input-area textarea', 'Find LGS');
    await page.press('.ai-input-area textarea', 'Enter');

    // Expect fallback message
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('模型服务发生错误');
  });

  test('LGS032 revision question is prefetched and Clear Chat removes follow-up context', async ({ page }) => {
    test.setTimeout(90000);
    const firstQuery = '为什么LGS032有状态是草稿呢？';
    let requestCount = 0;

    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      requestCount += 1;
      const body = route.request().postDataJSON();
      const messagesText = JSON.stringify(body.messages);

      if (requestCount === 1) {
        const trustedMessage = body.messages.find(message => message.content?.startsWith('TRUSTED_LOCAL_PDM_RESULT'));
        expect(body.messages.some(message => message.role === 'user' && message.content === firstQuery)).toBe(true);
        expect(trustedMessage?.content).toContain('get_revision_history');
        expect(trustedMessage?.content).toContain('V3.1');
        expect(trustedMessage?.content).toContain('"effectiveRevision":"V3"');
        expect(messagesText).not.toContain('22 products');
        await route.fulfill({
          json: {
            choices: [{ message: {
              role: 'assistant',
              content: '{"text":"LGS032 的最新设计修订版 V3.1 仍是草稿，因此不是现行生产版本；当前生效且已发布的是 V3。","citations":[]}'
            } }]
          }
        });
        return;
      }

      if (requestCount === 2) {
        expect(messagesText).toContain(firstQuery);
        expect(messagesText).toContain('最新设计修订版 V3.1');
        expect(messagesText).toContain('为什么它不是现行版？');
        await route.fulfill({
          json: { choices: [{ message: { role: 'assistant', content: '{"text":"因为 V3.1 尚未发布，生产仍使用 V3。","citations":[]}' } }] }
        });
        return;
      }

      expect(messagesText).not.toContain(firstQuery);
      expect(messagesText).not.toContain('为什么它不是现行版？');
      await route.fulfill({
        json: { choices: [{ message: { role: 'assistant', content: '{"text":"请说明要继续查询的产品编号。","citations":[]}' } }] }
      });
    });

    await page.goto(VIEWER_URL);
    await waitForViewerReady(page);
    await page.click('#btnSettings');
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings > button.btn-primary');
    await expect(page.locator('.ai-status-text.connected')).toBeVisible();
    await page.click('#closeSettingsModal');
    await page.click('#aiFab');

    await page.fill('.ai-input-area textarea', firstQuery);
    await page.press('.ai-input-area textarea', 'Enter');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('V3.1');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('V3');

    await page.fill('.ai-input-area textarea', '为什么它不是现行版？');
    await page.press('.ai-input-area textarea', 'Enter');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('尚未发布');

    await page.click('.ai-clear-btn');
    await expect(page.locator('.ai-message-row.user')).toHaveCount(0);

    await page.fill('.ai-input-area textarea', '继续');
    await page.press('.ai-input-area textarea', 'Enter');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('产品编号');
    expect(requestCount).toBe(3);
  });

  test('natural two-revision follow-up uses structured context and keeps local facts when provider fails', async ({ page }) => {
    test.setTimeout(90000);
    let requestCount = 0;
    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      requestCount += 1;
      if (requestCount === 1) {
        const body = route.request().postDataJSON();
        expect(JSON.stringify(body.messages)).toContain('get_revision_history');
        await route.fulfill({
          json: { choices: [{ message: { role: 'assistant', content: '{"text":"LGS032 当前版本 V3.1 是草稿，生效版本是 V3。","citations":[]}' } }] },
        });
        return;
      }
      const body = route.request().postDataJSON();
      expect(JSON.stringify(body.messages)).toContain('compare_revisions');
      await route.fulfill({ status: 503, json: { error: { message: 'Overloaded' } } });
    });

    await page.goto(VIEWER_URL);
    await waitForViewerReady(page);
    await page.click('#btnSettings');
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings > button.btn-primary');
    await expect(page.locator('.ai-status-text.connected')).toBeVisible();
    await page.click('#closeSettingsModal');
    await page.click('#aiFab');

    await page.fill('.ai-input-area textarea', '为什么LGS032状态是草稿非现行');
    await page.press('.ai-input-area textarea', 'Enter');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('V3.1');

    await page.fill('.ai-input-area textarea', '两个版本有什么区别');
    await page.press('.ai-input-area textarea', 'Enter');
    const answer = page.locator('.ai-message-row.assistant .ai-message-text').last();
    await expect(answer).toContainText('本地 PDM');
    await expect(answer).toContainText('LGS032 V3 → V3.1');
    await expect(answer).toContainText('新增');
    await expect(answer).not.toContainText('currently unavailable');
    expect(requestCount).toBeGreaterThanOrEqual(2);
  });

  test('search follow-ups preserve global and product-scoped result sets when the provider fails', async ({ page }) => {
    test.setTimeout(90000);
    const payload = loadCanonicalPayload();
    const firstQuery = '\u6211\u95ee\u4e00\u4e0b\u662f\u5e03\u62bd\u89c4\u683c460x282\u00d7187\u54ea\u4e00\u4e2a\u4ea7\u54c1\u7528\u7684?';
    const followUp = '\u53ea\u6709LGS723\u7528\u5417?';
    const scopedQuery = '\u597d\uff0c\u90a3LGS043\u7528\u4ec0\u4e48\u5e03\u62bd?';
    let requestCount = 0;

    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      requestCount += 1;
      const body = route.request().postDataJSON();
      const trustedMessage = body.messages.find(message => message.content?.startsWith('TRUSTED_LOCAL_PDM_RESULT'));
      expect(trustedMessage?.content).toContain('search_pdm');
      if (trustedMessage?.content.includes('LGS043')) {
        expect(trustedMessage.content).toContain('\u5e03\u62bd');
        expect(trustedMessage.content).not.toContain('LGS031');
      } else {
        expect(trustedMessage?.content).toContain('460x282\u00d7187');
        expect(trustedMessage?.content).toContain('LGS723');
      }

      if (requestCount === 1) {
        await route.fulfill({
          json: {
            choices: [{ message: {
              role: 'assistant',
              content: '{"text":"\u8be5\u89c4\u683c\u5339\u914d\u5230 LGS723\u3002","citations":[]}',
            } }],
          },
        });
        return;
      }
      await route.fulfill({ status: 503, json: { error: { message: 'Overloaded' } } });
    });

    await blockRemotePdmData(page);
    await page.goto(VIEWER_URL);
    await page.evaluate(canonicalPayload => {
      document.body.replaceWith(document.body.cloneNode(true));
      const githubData = {
        loadPublic: async () => canonicalPayload,
        getSourceMetadata: () => ({ commitSha: 'a'.repeat(40) }),
      };
      window.__aiSearchTestApp = window.BomApp.createApp({ mode: 'viewer', githubData });
    }, payload);
    await page.waitForFunction(() => Boolean(window.__aiSearchTestApp?.state.lastLoadAt));
    await waitForViewerReady(page);
    await page.click('#btnSettings');
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings > button.btn-primary');
    await expect(page.locator('.ai-status-text.connected')).toBeVisible();
    await page.click('#closeSettingsModal');
    await page.click('#aiFab');

    await page.fill('.ai-input-area textarea', firstQuery);
    await page.press('.ai-input-area textarea', 'Enter');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('LGS723');

    await page.fill('.ai-input-area textarea', followUp);
    await page.press('.ai-input-area textarea', 'Enter');
    const answer = page.locator('.ai-message-row.assistant .ai-message-text').last();
    await expect(answer).toContainText('\u672c\u5730 PDM');
    await expect(answer).toContainText('\u4f7f\u7528\u4ea7\u54c1: LGS723');
    await expect(answer).not.toContainText('No compatible model endpoint');

    await page.fill('.ai-input-area textarea', scopedQuery);
    await page.press('.ai-input-area textarea', 'Enter');
    const scopedAnswer = page.locator('.ai-message-row.assistant .ai-message-text').last();
    await expect(scopedAnswer).toContainText('\u672c\u5730 PDM');
    await expect(scopedAnswer).toContainText('LGS043');
    await expect(scopedAnswer).toContainText('BC300327148');
    await expect(scopedAnswer).not.toContainText('LGS031');
    await expect(scopedAnswer).not.toContainText('LGS723');

    await page.fill('.ai-input-area textarea', 'Which frobnicator does LGS043 use?');
    await page.press('.ai-input-area textarea', 'Enter');
    const clarification = page.locator('.ai-message-row.assistant .ai-message-text').last();
    await expect(clarification).toContainText('\u672a\u80fd\u4ece\u95ee\u9898\u4e2d\u786e\u5b9a\u5177\u4f53\u96f6\u90e8\u4ef6');
    await expect(clarification).toContainText('LGS043');
    await expect(clarification).not.toContainText('BCLS129228BH');
    expect(requestCount).toBeGreaterThanOrEqual(2);
  });

  test('LGS723/LGS733 comparison is scoped, categorized, and reusable in a follow-up', async ({ page }) => {
    test.setTimeout(90000);
    const firstQuery = '\u5e2e\u6211\u770b\u4e00\u4e0bLGS723\u548cLGS733\u6709\u4ec0\u4e48\u94c1\u4ef6\u5171\u7528';
    const followUp = '\u5de6/\u53f3\u4fa7\u6846\u5171\u7528\u4e3a\u4ec0\u4e48\u4f60\u6709\u7edf\u8ba1\u5462\uff1f\uff0c\u8fd8\u6709\u591a\u7684\u5176\u4ed6';
    let requestCount = 0;

    await page.unroute('https://openrouter.ai/api/v1/models?supported_parameters=tools');
    await page.route('https://openrouter.ai/api/v1/models?supported_parameters=tools', async route => {
      await route.fulfill({
        json: { data: [{ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', supported_parameters: ['tools', 'tool_choice'] }] }
      });
    });

    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      requestCount += 1;
      const body = route.request().postDataJSON();
      const trustedMessage = body.messages.find(message => message.content?.startsWith('TRUSTED_LOCAL_PDM_RESULT'));
      expect(body.tools || []).toHaveLength(0);
      expect(trustedMessage?.content).toContain('compare_boms');
      expect(trustedMessage?.content).toContain('"commonCount":22');
      expect(trustedMessage?.content).toContain('"\u4e94\u91d1\u5305":11');
      expect(trustedMessage?.content).toContain('"\u5305\u6750":5');
      expect(trustedMessage?.content).toContain('"\u96f6\u4ef6":6');

      if (requestCount === 1) {
        await route.fulfill({
          json: { choices: [{ message: { role: 'assistant', content: '\u8303\u56f4\uff1a\u590d\u53e4\u8272\uff0c\u517122\u4e2a\u76f8\u540cmaterialId\uff1b\u4e94\u91d1\u530511\u3001\u5305\u67505\u3001\u96f6\u4ef66\u3002' } }] }
        });
        return;
      }

      expect(JSON.stringify(body.messages)).toContain(firstQuery);
      expect(JSON.stringify(body.messages)).toContain(followUp);
      await route.fulfill({
        json: { choices: [{ message: { role: 'assistant', content: '\u5de6\u53f3\u5e03\u62bd\u6761\u662f\u4e24\u4e2a\u4e0d\u540cmaterialId\uff0c\u5747\u5c5e\u4e8e\u96f6\u4ef6\uff0c\u4e0d\u662f\u4e94\u91d1\u5305\u3002' } }] }
      });
    });

    await page.goto(VIEWER_URL);
    await waitForViewerReady(page);
    await page.click('#btnSettings');
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings > button.btn-primary');
    await expect(page.locator('.ai-status-text.connected')).toBeVisible();
    await page.click('#closeSettingsModal');
    await page.click('#aiFab');

    await page.fill('.ai-input-area textarea', firstQuery);
    await page.press('.ai-input-area textarea', 'Enter');
    const firstAnswer = page.locator('.ai-message-row.assistant .ai-message-text').last();
    await expect(firstAnswer).toContainText('\u4e94\u91d1\u530511');
    await expect(firstAnswer).not.toContainText('**');

    await page.fill('.ai-input-area textarea', followUp);
    await page.press('.ai-input-area textarea', 'Enter');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('\u4e24\u4e2a\u4e0d\u540cmaterialId');
    expect(requestCount).toBe(2);
  });

  test('explicit LGS433 color reaches deterministic BOM while an unavailable color stays local', async ({ page }) => {
    test.setTimeout(90000);
    let requestCount = 0;

    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      requestCount += 1;
      const body = route.request().postDataJSON();
      const trustedMessage = body.messages.find(message => message.content?.startsWith('TRUSTED_LOCAL_PDM_RESULT'));
      expect(trustedMessage?.content).toContain('get_bom');
      expect(trustedMessage?.content).toContain('"productCode":"LGS433"');
      expect(trustedMessage?.content).toContain('"color":"黑色"');
      await route.fulfill({
        json: { choices: [{ message: { role: 'assistant', content: '{"text":"LGS433 黑色 BOM 已按指定颜色读取。","citations":[]}' } }] }
      });
    });

    await page.goto(VIEWER_URL);
    await waitForViewerReady(page);
    await page.click('#btnSettings');
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings > button.btn-primary');
    await page.click('#closeSettingsModal');
    await page.click('#aiFab');

    await page.fill('.ai-input-area textarea', '查看 LGS433 黑色 BOM');
    await page.press('.ai-input-area textarea', 'Enter');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('LGS433 黑色');
    expect(requestCount).toBe(1);

    await page.fill('.ai-input-area textarea', '查看 LGS433 blue BOM');
    await page.press('.ai-input-area textarea', 'Enter');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('请选择');
    expect(requestCount).toBe(1);
  });

  test('R4/R5 proposal preview escapes model text and approval marks the draft dirty', async ({ page }) => {
    await page.route('https://api.github.com/**', route => route.abort());
    await page.route('https://raw.githubusercontent.com/**', route => route.abort());
    await page.goto(ADMIN_URL);

    await page.evaluate(() => {
      // Replace the original app DOM so this deterministic fixture has only one
      // set of element-bound event listeners.
      document.body.replaceWith(document.body.cloneNode(true));
      const payload = window.BomCoreUtils.normalizePayload({
        bom: {
          P1: {
            code: 'P1',
            revision: 'V1.1',
            colors: ['Black'],
            color_info: {
              Black: {
                sku: 'P1-BK',
                name_zh: 'Test product',
                name_vi: 'Test product',
                materials: [{ mat_code: 'M1', qty: '1' }]
              }
            }
          }
        },
        materialDb: {
          version: 1,
          materials: {
            M1: {
              id: 'M1',
              code: 'M1',
              name: { zh: 'Material 1', vi: 'Material 1' },
              unit: 'pcs'
            }
          },
          bomEntries: []
        },
        productRevisions: {
          P1: {
            currentRevision: 'V1.1',
            effectiveRevision: 'V1',
            currentRevisionInfo: {
              sourceRevision: 'V1',
              workflowState: 'draft',
              createdAt: '2026-07-20T00:00:00.000Z',
              changeReason: 'E2E test'
            },
            revisions: [],
            effectivityEvents: []
          }
        }
      });
      const githubData = {
        loadPublic: async () => payload,
        getSourceMetadata: () => ({ commitSha: 'a'.repeat(40) })
      };
      window.__aiTestApp = window.BomApp.createApp({ mode: 'admin', githubData });
    });
    await page.waitForFunction(() => Boolean(window.__aiTestApp?.state.lastLoadAt));

    await page.click('#btnSettings');
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings > button.btn-primary');
    await expect(page.locator('.ai-status-text.connected')).toBeVisible();
    await page.click('#closeSettingsModal');
    await page.click('#aiFab');

    const untrustedValue = '<img src=x onerror="window.__proposalInjected=true">';
    let chatCallCount = 0;
    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      chatCallCount += 1;
      if (chatCallCount === 1) {
        await route.fulfill({
          json: {
            choices: [{
              message: {
                role: 'assistant',
                tool_calls: [{
                  id: 'proposal_1',
                  type: 'function',
                  function: {
                    name: 'apply_mutation',
                    arguments: JSON.stringify({
                      operationType: 'update_material_field',
                      targetId: 'M1',
                      payload: { field: 'unit', value: untrustedValue }
                    })
                  }
                }]
              }
            }]
          }
        });
        return;
      }
      await route.fulfill({
        json: {
          choices: [{ message: { role: 'assistant', content: '{"text":"Review the proposal.","citations":[]}' } }]
        }
      });
    });

    await page.fill('.ai-input-area textarea', 'Update material M1 unit');
    await page.press('.ai-input-area textarea', 'Enter');

    const proposalCard = page.locator('.ai-proposal-card');
    await expect(proposalCard).toContainText(untrustedValue);
    await expect(proposalCard.locator('img')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__proposalInjected || false)).toBe(false);

    await proposalCard.locator('.ai-proposal-actions button').last().click();
    await expect.poll(() => page.evaluate(() => window.__aiTestApp.state.dirty)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__aiTestApp.state.materialDb.materials.M1.unit)).toBe(untrustedValue);
    await expect(page.locator('#syncStatus[data-state="dirty"]')).toBeVisible();
  });

});
