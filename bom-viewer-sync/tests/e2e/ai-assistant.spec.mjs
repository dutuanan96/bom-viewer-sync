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
      const json = { data: [
        { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', supported_parameters: ['tools', 'tool_choice', 'structured_outputs'] },
        { id: 'xiaomi/mimo-v2.5', supported_parameters: ['tools', 'tool_choice', 'structured_outputs'] },
      ] };
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

    await page.fill('.ai-input-area textarea', '火星架是什么意思?');
    await page.press('.ai-input-area textarea', 'Enter');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('请告诉我这个问题应如何理解');

    await page.fill('.ai-input-area textarea', '火星架是内部测试名称');
    await page.press('.ai-input-area textarea', 'Enter');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('已记住您的说明');

    await page.click('#btnSettings', { force: true });
    await expect(page.locator('.ai-memory-row')).toContainText('[confirmed] 火星架是什么意思?');
  });

  test('viewer exports candidates while only admin receives review and approval controls', async ({ page }) => {
    const capturedAt = '2026-07-27T00:00:00.000Z';
    await page.addInitScript(({ capturedAt }) => {
      localStorage.setItem('jintai.pdm.ai.local.v1', JSON.stringify({
        schemaVersion: 1,
        memories: [],
        audit: [],
        settings: {},
        improvementCandidates: [{
          schemaVersion: 1,
          id: 'improvement_e2e',
          status: 'reviewed',
          issueType: 'user-teaching',
          userQuestion: 'Which product uses this component?',
          userCorrection: 'LGS433',
          assistantAnswer: '',
          route: { intent: 'search', preferredTool: 'search_pdm', confidence: 'ambiguous' },
          context: { productIds: ['LGS433'], materialIds: [] },
          evidence: { sourceCommit: '', evidenceIds: [] },
          occurrences: 1,
          capturedAt,
          lastSeenAt: capturedAt,
          review: {
            schemaVersion: 1,
            decision: 'recommend-approve',
            evidenceStatus: 'supported',
            confidence: 0.9,
            category: 'terminology',
            summary: 'Supported by current PDM evidence.',
            proposedKnowledge: 'This component is used by LGS433.',
            risks: [],
            reviewerModel: 'reviewer/model',
            reviewedAt: capturedAt,
          },
          approvedAt: null,
          rejectedAt: null,
        }],
      }));
    }, { capturedAt });

    await blockRemotePdmData(page);
    await page.goto(VIEWER_URL);
    await page.click('#btnSettings');
    await expect(page.locator('.ai-improvement-settings')).toContainText('Which product uses this component?');
    await expect(page.locator('.ai-improvement-settings input[type="file"]')).toHaveCount(0);
    await expect(page.locator('.ai-improvement-settings').getByText('批准', { exact: true })).toHaveCount(0);

    await page.goto(ADMIN_URL);
    await page.click('#btnSettings');
    await expect(page.locator('.ai-improvement-settings input[type="file"]')).toHaveCount(1);
    await expect(page.locator('.ai-improvement-settings')).toContainText('AI 对照审核');
    await expect(page.locator('.ai-improvement-settings')).toContainText('批准');
    await expect(page.locator('.ai-improvement-settings')).toContainText('拒绝');
  });

  test('engineering drawing skill sends exact front/rear PDFs to MiMo and preserves engineering approval', async ({ page }) => {
    test.setTimeout(90000);
    const payload = loadCanonicalPayload();
    await blockRemotePdmData(page);
    const pdfRequests = [];
    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      const body = route.request().postDataJSON();
      const fileParts = (body.messages || []).flatMap(message => (
        Array.isArray(message.content) ? message.content.filter(part => part.type === 'file') : []
      ));
      if (fileParts.length > 0) {
        pdfRequests.push({
          model: body.model,
          files: fileParts.map(part => part.file),
          plugins: body.plugins,
        });
        const comparisons = [
          'geometry',
          'dimensions',
          'holes',
          'material',
          'surface_finish',
          'tolerance',
          'welding',
          'orientation',
          'revision',
        ].map(check => ({
          check,
          status: ['tolerance', 'revision'].includes(check) ? 'UNVERIFIED' : 'MATCH',
          left_value: check === 'dimensions' ? '198x15x15mm' : 'left',
          right_value: check === 'dimensions' ? '198x15x15mm' : 'right',
          confidence: 0.95,
          evidence: ['tolerance', 'revision'].includes(check) ? [] : [{
            side: 'left',
            page: 1,
            view: 'main view',
            observation: `${check} is visible in the drawing`,
          }],
        }));
        await route.fulfill({
          json: {
            choices: [{ message: {
              role: 'assistant',
              content: JSON.stringify({
                documents_analyzed: true,
                title_blocks: { left: {}, right: {} },
                comparisons,
                summary_zh: '主要几何和孔位一致，但公差与版本仍需工程确认。',
                summary_vi: 'Hình học và vị trí lỗ chính giống nhau, nhưng vẫn cần xác nhận dung sai và revision.',
              }),
            } }],
          },
        });
        return;
      }

      const messages = JSON.stringify(body.messages);
      expect(messages).toContain('check_drawing_commonality');
      expect(messages).toContain('LIKELY_COMMON_NEEDS_CONFIRMATION');
      expect(messages).toContain('engineering_confirmation_required');
      await route.fulfill({
        json: { choices: [{ message: {
          role: 'assistant',
          content: JSON.stringify({
            text: '图纸已核对：前件 LGS043XZQSLBH 与 LGS723XZQSLBH、后件 LGS043XZHSLBH 与 LGS723XZHSLBH 的主要几何和孔位相符，但公差与版本未完全确认。结论：LIKELY_COMMON_NEEDS_CONFIRMATION，合并物料编码或 BOM 前仍需工程负责人确认。',
            citations: [],
          }),
        } }] },
      });
    });

    await page.goto(VIEWER_URL);
    await page.evaluate(canonicalPayload => {
      document.body.replaceWith(document.body.cloneNode(true));
      const githubData = {
        loadPublic: async () => canonicalPayload,
        getSourceMetadata: () => ({ commitSha: 'a'.repeat(40) }),
      };
      window.__aiDrawingTestApp = window.BomApp.createApp({ mode: 'viewer', githubData });
    }, payload);
    await page.waitForFunction(() => Boolean(window.__aiDrawingTestApp?.state.lastLoadAt));
    await waitForViewerReady(page);
    await page.click('#btnSettings');
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings > button.btn-primary');
    await page.click('#closeSettingsModal');
    await page.click('#aiFab');
    await page.fill('.ai-input-area textarea', '检查 LGS043-S 底部竖杆前后和 LGS723/733 中竖梁前后的图纸能不能共用');
    await page.press('.ai-input-area textarea', 'Enter');

    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('LIKELY_COMMON_NEEDS_CONFIRMATION');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('工程负责人确认');
    expect(pdfRequests).toHaveLength(2);
    expect(pdfRequests.every(request => request.model === 'xiaomi/mimo-v2.5')).toBe(true);
    expect(pdfRequests.flatMap(request => request.files).map(file => file.filename)).toEqual([
      'LGS043-S-底部竖杆前.pdf',
      'LGS723_733中竖梁-前.pdf',
      'LGS043-S-底部竖杆后.pdf',
      'LGS723_733中竖梁-后.pdf',
    ]);
    expect(pdfRequests.every(request => request.plugins?.[0]?.pdf?.engine === 'native')).toBe(true);
  });

  test('single drawing analysis sends one exact PDF to MiMo and keeps unreadable dimensions unverified', async ({ page }) => {
    test.setTimeout(90000);
    const payload = loadCanonicalPayload();
    await blockRemotePdmData(page);
    const pdfRequests = [];
    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      const body = route.request().postDataJSON();
      const fileParts = (body.messages || []).flatMap(message => (
        Array.isArray(message.content) ? message.content.filter(part => part.type === 'file') : []
      ));
      if (fileParts.length === 1) {
        pdfRequests.push({
          model: body.model,
          file: fileParts[0].file,
          plugins: body.plugins,
        });
        const evidence = [{
          page: 1,
          view: 'main view',
          region: 'lower right',
          observation: 'Visible drawing annotation',
        }];
        await route.fulfill({
          json: {
            choices: [{ message: {
              role: 'assistant',
              content: JSON.stringify({
                documents_analyzed: true,
                document: {
                  drawing_number: '043-FRONT',
                  revision: '',
                  pages: 1,
                  title_block_evidence: evidence,
                },
                overall_dimensions: {
                  length_mm: { value_mm: 198, source_type: 'drawing_text', confidence: 0.98, evidence },
                  width_mm: { value_mm: 15, source_type: 'drawing_text', confidence: 0.98, evidence },
                  height_mm: { value_mm: 15, source_type: 'drawing_text', confidence: 0.98, evidence },
                },
                material: { value: 'Q195', source_type: 'drawing_text', confidence: 0.95, evidence },
                surface_finish: { value: null, source_type: 'drawing_text', confidence: 0, evidence: [] },
                features: [{
                  type: 'hole',
                  quantity: 2,
                  diameter_mm: null,
                  positions: [],
                  details: 'Two circular features are visible; through condition is unverified',
                  source_type: 'drawing_geometry',
                  confidence: 0.72,
                  evidence,
                }],
                tolerances: [],
                manufacturing_notes: [],
                warnings: ['Hole diameter is unreadable'],
                unreadable_regions: [],
                inferences: [],
                summary_zh: '\u5b54\u5f84\u65e0\u6cd5\u786e\u8ba4\u3002',
                summary_vi: 'Kh\u00f4ng \u0111\u1ecdc r\u00f5 \u0111\u01b0\u1eddng k\u00ednh l\u1ed7.',
              }),
            } }],
          },
        });
        return;
      }

      const messages = JSON.stringify(body.messages);
      const trustedMessage = body.messages.find(message => message.content?.startsWith('TRUSTED_LOCAL_PDM_RESULT'));
      expect(messages).toContain('analyze_engineering_drawing');
      expect(messages).toContain('SUCCESS_WITH_WARNINGS');
      expect(trustedMessage?.content).toContain('"diameter_mm":null');
      await route.fulfill({
        json: { choices: [{ message: {
          role: 'assistant',
          content: JSON.stringify({
            text: '\u5df2\u5206\u6790 LGS043XZQSLBH \u56fe\u7eb8\uff1a\u5916\u5f62\u5c3a\u5bf8 198 x 15 x 15 mm\uff0c\u53ef\u89c1 2 \u4e2a\u5706\u5f62\u7279\u5f81\uff0c\u4f46\u5b54\u5f84\u65e0\u6cd5\u4ece\u5f53\u524d\u56fe\u7eb8\u786e\u8ba4\u3002\u72b6\u6001\uff1aSUCCESS_WITH_WARNINGS\u3002\u751f\u4ea7\u51b3\u7b56\u524d\u9700\u5de5\u7a0b\u8d1f\u8d23\u4eba\u786e\u8ba4\u3002',
            citations: [],
          }),
        } }] },
      });
    });

    await page.goto(VIEWER_URL);
    await page.evaluate(canonicalPayload => {
      document.body.replaceWith(document.body.cloneNode(true));
      const githubData = {
        loadPublic: async () => canonicalPayload,
        getSourceMetadata: () => ({ commitSha: 'a'.repeat(40) }),
      };
      window.__aiSingleDrawingTestApp = window.BomApp.createApp({ mode: 'viewer', githubData });
    }, payload);
    await page.waitForFunction(() => Boolean(window.__aiSingleDrawingTestApp?.state.lastLoadAt));
    await waitForViewerReady(page);
    await page.click('#btnSettings');
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings > button.btn-primary');
    await page.click('#closeSettingsModal');
    await page.click('#aiFab');
    await page.fill('.ai-input-area textarea', '\u5e2e\u6211\u770b\u4e00\u4e0bLGS043-S\u5e95\u90e8\u524d\u7ad6\u6746\u7684\u56fe\u7eb8\u3002');
    await page.press('.ai-input-area textarea', 'Enter');

    const answer = page.locator('.ai-message-row.assistant .ai-message-text').last();
    await expect(answer).toContainText('SUCCESS_WITH_WARNINGS');
    await expect(answer).toContainText('LGS043XZQSLBH');
    expect(pdfRequests).toHaveLength(1);
    expect(pdfRequests[0].model).toBe('xiaomi/mimo-v2.5');
    expect(pdfRequests[0].file.filename).toBe('LGS043-S-\u5e95\u90e8\u7ad6\u6746\u524d.pdf');
    expect(pdfRequests[0].plugins?.[0]?.pdf?.engine).toBe('native');
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

  test('shorthand confirmation and shared-component expansion remain local across follow-ups', async ({ page }) => {
    const payload = loadCanonicalPayload();
    await page.route('https://openrouter.ai/api/v1/chat/completions', route => (
      route.fulfill({ status: 503, json: { error: { message: 'Overloaded' } } })
    ));

    await blockRemotePdmData(page);
    await page.goto(VIEWER_URL);
    await page.evaluate(canonicalPayload => {
      document.body.replaceWith(document.body.cloneNode(true));
      const githubData = {
        loadPublic: async () => canonicalPayload,
        getSourceMetadata: () => ({ commitSha: 'a'.repeat(40) }),
      };
      window.__aiFollowUpTestApp = window.BomApp.createApp({ mode: 'viewer', githubData });
    }, payload);
    await page.waitForFunction(() => Boolean(window.__aiFollowUpTestApp?.state.lastLoadAt));
    await waitForViewerReady(page);
    await page.click('#btnSettings');
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings > button.btn-primary');
    await page.click('#closeSettingsModal');
    await page.click('#aiFab');

    await page.fill('.ai-input-area textarea', '那个834上横梁有和哪一个产品共用吗？还是只有它独用');
    await page.press('.ai-input-area textarea', 'Enter');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('LGS834');

    await page.fill('.ai-input-area textarea', '是的');
    await page.press('.ai-input-area textarea', 'Enter');
    const confirmedAnswer = page.locator('.ai-message-row.assistant .ai-message-text').last();
    await expect(confirmedAnswer).toContainText('本地 PDM');
    await expect(confirmedAnswer).toContainText('LGS834QSYHL');
    await expect(confirmedAnswer).not.toContainText('当前没有兼容的模型服务端点');

    await page.fill('.ai-input-area textarea', 'LGS433和LGS434那个竖梁有共用吗?');
    await page.press('.ai-input-area textarea', 'Enter');
    await expect(page.locator('.ai-message-row.assistant .ai-message-text').last()).toContainText('LGS333');

    await page.fill('.ai-input-area textarea', '除外那个两产品还有什么产品也用吗?');
    await page.press('.ai-input-area textarea', 'Enter');
    const expandedAnswer = page.locator('.ai-message-row.assistant .ai-message-text').last();
    await expect(expandedAnswer).toContainText('LGS333');
    await expect(expandedAnswer).toContainText('LGS334');
    await expect(expandedAnswer).toContainText('LGS733');
    await expect(expandedAnswer).not.toContainText('当前没有兼容的模型服务端点');
  });

  test('R4/R5 proposal review selects exact Admin actions and escapes model text', async ({ page }) => {
    await page.route('https://api.github.com/**', route => route.abort());
    await page.route('https://raw.githubusercontent.com/**', route => route.abort());
    await page.goto(ADMIN_URL);

    await page.evaluate(() => {
      // Replace the original app DOM so this deterministic fixture has only one
      // set of element-bound event listeners.
      document.body.replaceWith(document.body.cloneNode(true));
      const payload = window.BomCoreUtils.normalizePayload({
        bom: {
          LGS001: {
            code: 'LGS001',
            revision: 'V1.1',
            colors: ['Black'],
            color_info: {
              Black: {
                sku: 'LGS001-BK',
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
            },
            M2: {
              id: 'M2',
              code: 'M2',
              name: { zh: 'Material 2', vi: 'Material 2' },
              unit: 'pcs'
            }
          },
          bomEntries: [{
            id: 'E1',
            parentType: 'product',
            parentId: 'LGS001',
            productCode: 'LGS001',
            color: 'Black',
            materialId: 'M1',
            qty: '1'
          }]
        },
        productRevisions: {
          LGS001: {
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
    await page.evaluate(() => window.__aiTestApp.selectProduct('LGS001'));

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
                      summary: 'Update material and BOM',
                      operations: [
                        {
                          operationType: 'update_material_field',
                          targetId: 'M1',
                          payload: { field: 'unit', value: untrustedValue }
                        },
                        {
                          operationType: 'update_bom_quantity',
                          targetId: 'LGS001',
                          payload: {
                            color: 'Black',
                            childId: 'M1',
                            quantity: 2
                          }
                        },
                        {
                          operationType: 'update_product',
                          targetId: 'LGS001',
                          payload: {
                            color: 'Black',
                            patch: { name: { zh: 'Updated product' }, size: '200mm', sku: 'LGS001-NEW' }
                          }
                        },
                        {
                          operationType: 'add_material_child',
                          targetId: 'M1',
                          payload: { materialId: 'M2', quantity: 3 }
                        },
                        {
                          operationType: 'release_product_revision',
                          targetId: 'LGS001',
                          payload: { reason: 'E2E approved' }
                        }
                      ]
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
    await expect(proposalCard.locator('.ai-proposal-verification.is-valid')).toBeVisible();
    await expect(proposalCard.locator('.ai-proposal-category')).toHaveCount(5);
    await expect(proposalCard.locator('.ai-proposal-operation')).toHaveCount(5);

    await proposalCard.locator('[data-proposal-operation-id="change-2"] .ai-proposal-delete-change').click();
    await expect(proposalCard.locator('.ai-proposal-operation')).toHaveCount(4);
    await proposalCard.locator('.ai-proposal-actions button').last().evaluate((button) => button.click());
    await expect.poll(() => page.evaluate(() => window.__aiTestApp.state.dirty)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__aiTestApp.state.materialDb.materials.M1.unit)).toBe(untrustedValue);
    await expect.poll(() => page.evaluate(() => (
      window.__aiTestApp.state.bom.LGS001.color_info.Black.materials[0].qty
    ))).toBe('1');
    await expect.poll(() => page.evaluate(() => (
      window.__aiTestApp.state.bom.LGS001.color_info.Black.name_zh
    ))).toBe('Updated product');
    await expect.poll(() => page.evaluate(() => (
      window.__aiTestApp.state.materialDb.bomEntries.some(entry => (
        entry.parentType === 'material' && entry.parentId === 'M1' && entry.childMaterialId === 'M2'
      ))
    ))).toBe(true);
    await expect.poll(() => page.evaluate(() => (
      window.__aiTestApp.state.payload.productRevisions.LGS001.currentRevisionInfo.workflowState
    ))).toBe('released');
    await expect(page.locator('#syncStatus[data-state="dirty"]')).toBeVisible();
  });

});
