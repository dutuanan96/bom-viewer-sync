import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const VIEWER_URL = `file://${resolve('viewer.html')}`;

test.describe('R2.5 AI Assistant UI Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock OpenRouter key validation
    await page.route('https://openrouter.ai/api/v1/key', async route => {
      const json = { data: { label: 'mock-key', usage: 0, limit: 100, is_free_tier: false } };
      await route.fulfill({ json });
    });
    
    // Mock OpenRouter model list
    await page.route('https://openrouter.ai/api/v1/models?supported_parameters=tools', async route => {
      const json = { data: [{ id: 'openrouter/auto', supported_parameters: ['tools', 'tool_choice'] }] };
      await route.fulfill({ json });
    });
  });

  test('Connect, Run 1 Tool Loop, Citations, and Core App Survival', async ({ page }) => {
    await page.goto(VIEWER_URL);
    
    // Open Drawer via AI Button
    await page.click('#btnAiWorkspace');
    await expect(page.locator('#aiDrawer')).toBeVisible();

    // Connect Settings
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings button:has-text("连接")');
    await expect(page.locator('.ai-settings div:has-text("已连接")')).toBeVisible();

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
                content: '{"text": "Found it."}'
              }
            }]
          }
        });
      }
    });

    // Run query
    await page.fill('.ai-input-area textarea', 'Find LGS');
    await page.click('.ai-input-area button:has-text("发送")');

    // Wait for the final answer
    await expect(page.locator('.ai-message.assistant .ai-message-text').last()).toContainText('Found it.');
    
    // Disconnect and Verify Core App Survival
    await page.click('.ai-settings button:has-text("断开连接")');
    await expect(page.locator('.ai-settings div:has-text("未连接")')).toBeVisible();

    // Core PDM is still alive, we can close the drawer and interact
    await page.click('#aiDrawerClose');
    await expect(page.locator('#aiDrawer')).toHaveAttribute('hidden', '');
    
    // Verify product list is intact
    await expect(page.locator('.product-list')).toBeVisible();
  });

  test('Provider Error triggers local fallback', async ({ page }) => {
    await page.goto(VIEWER_URL);
    await page.click('#btnAiWorkspace');
    
    await page.fill('.ai-settings input', 'sk-or-mock-1234');
    await page.click('.ai-settings button:has-text("连接")');

    // Mock 503 error
    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      await route.fulfill({ status: 503, json: { error: { message: 'Overloaded' } } });
    });

    await page.fill('.ai-input-area textarea', 'Hello');
    await page.click('.ai-input-area button:has-text("发送")');

    // Expect fallback message
    await expect(page.locator('.ai-message.assistant .ai-message-text').last()).toContainText('AI assistant is currently unavailable');
  });
});
