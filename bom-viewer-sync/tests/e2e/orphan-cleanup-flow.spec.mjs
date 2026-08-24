import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VIEWER_URL = `file://${resolve('viewer.html')}`;
const ADMIN_URL = `file://${resolve('admin.html')}`;

function loadCanonicalPayloadWithOrphans() {
  const manifest = JSON.parse(readFileSync(resolve('data/manifest.json'), 'utf8'));
  const materialData = JSON.parse(readFileSync(resolve('data/materials.json'), 'utf8'));
  const bom = Object.fromEntries(manifest.products.map(productCode => [
    productCode,
    JSON.parse(readFileSync(resolve(`data/products/${productCode}.json`), 'utf8')),
  ]));
  const payload = {
    bom,
    productRevisions: manifest.productRevisions || {},
    notifications: manifest.notifications || [],
    ...materialData,
  };
  const existingOrphans = (payload.materialDb?.bomEntries || []).filter(e => e.parentType === 'product' && !payload.bom[e.parentId]?.color_info?.[e.color]);
  if (existingOrphans.length === 0) {
    const sampleMatId = Object.keys(payload.materialDb.materials)[0];
    const samplePid = Object.keys(payload.bom)[0];
    for (let i = 0; i < 183; i++) {
      payload.materialDb.bomEntries.push({
        id: `mat_test_orphan_${i}`,
        parentId: samplePid,
        parentType: 'product',
        productCode: samplePid,
        color: `NON_EXISTENT_COLOR_${i}`,
        materialId: sampleMatId,
        qty: 1,
      });
    }
  }
  return payload;
}

async function setupAdminAppWithOrphans(page) {
  const canonicalPayload = loadCanonicalPayloadWithOrphans();
  await page.goto(ADMIN_URL);
  await page.evaluate(({ canonicalPayload }) => {
    document.body.replaceWith(document.body.cloneNode(true));
    const payload = window.BomCoreUtils.normalizePayload(canonicalPayload);
    const githubData = {
      loadPublic: async () => payload,
      getSourceMetadata: () => ({ commitSha: 'a'.repeat(40) }),
    };
    window.app = window.BomApp.createApp({ mode: 'admin', githubData });
  }, { canonicalPayload });
  await page.waitForFunction(() => Boolean(window.app?.state.lastLoadAt));
  await expect(page.locator('.product-catalog-view')).toContainText('LGS032', { timeout: 15000 });
}

test.describe('Orphan BOM Remediation Admin Proposal UI Flow', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120000);
    page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.text()));
    page.on('pageerror', err => console.log('[BROWSER ERROR]', err));
    await page.route('https://api.github.com/**', route => route.abort());
    await page.route('https://raw.githubusercontent.com/**', route => route.abort());
    await page.route('https://openrouter.ai/api/v1/**', route => route.abort());
  });

  test('button is Admin-only: visible in admin.html and absent in viewer.html', async ({ page }) => {
    await page.goto(VIEWER_URL);
    await expect(page.locator('#btn-cleanup-orphan-bom')).toHaveCount(0);

    await setupAdminAppWithOrphans(page);
    const cleanupBtn = page.locator('#btn-cleanup-orphan-bom');
    await expect(cleanupBtn).toHaveCount(1);
    await expect(cleanupBtn).toBeVisible();
    await expect(cleanupBtn).toContainText('183');
  });

  test('dirty guard blocks orphan proposal creation when admin has unsaved changes', async ({ page }) => {
    await setupAdminAppWithOrphans(page);
    await expect(page.locator('#btn-cleanup-orphan-bom')).toBeVisible();

    // Mark dirty via app state
    await page.evaluate(() => {
      window.app.markDirty();
    });
    await expect(page.locator('#syncStatus')).toHaveAttribute('data-state', 'dirty');

    // Click cleanup button
    await page.click('#btn-cleanup-orphan-bom');

    // Verify error status and error message
    await expect(page.locator('#syncStatus')).toHaveAttribute('data-state', 'error');
    const statusText = await page.locator('#syncStatus').textContent();
    expect(statusText).toContain('无法在存在未保存更改时清理无主 BOM 行');

    // Verify no proposal card was rendered in the chat
    await expect(page.locator('.ai-proposal-card')).toHaveCount(0);
  });

  test('orphan proposal review displays batch details, locks button during flow, and loads next batch on approve', async ({ page }) => {
    await setupAdminAppWithOrphans(page);
    const cleanupBtn = page.locator('#btn-cleanup-orphan-bom');
    await expect(cleanupBtn).toBeVisible();

    // Click load orphan proposal
    await page.click('#btn-cleanup-orphan-bom');

    // Verify proposal card for Batch 1 is rendered in AI drawer
    const card = page.locator('.ai-proposal-card').first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#aiChatWidget')).toContainText('批次 1/5');

    // Verify button is disabled during active proposal
    await expect(cleanupBtn).toBeDisabled();

    // Approve Batch 1
    const approveBtn = card.locator('button.btn-primary').first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.dispatchEvent('click');

    // Verify next proposal card for remaining orphan items is loaded
    await expect(page.locator('.ai-proposal-card')).toHaveCount(2, { timeout: 15000 });
    await expect(page.locator('#syncStatus')).toHaveAttribute('data-state', 'dirty');
  });

  test('discard invalidates active proposal run token and blocks approving stale proposal card', async ({ page }) => {
    await setupAdminAppWithOrphans(page);
    await page.click('#btn-cleanup-orphan-bom');

    // Wait for Batch 1 proposal card to appear
    const card = page.locator('.ai-proposal-card').first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Admin discards pending changes
    await page.evaluate(() => {
      window.app.state.dirty = false;
      window.app.applyPayload(window.app.state.loadedPayload);
      window.app.state.orphanProposalActive = false;
      window.app.state.orphanProposalRunId = null;
      window.app.syncOrphanCleanupButtonState();
    });

    // Verify cleanup button is re-enabled
    const cleanupBtn = page.locator('#btn-cleanup-orphan-bom');
    await expect(cleanupBtn).toBeEnabled();

    // Try to click Approve on the stale proposal card
    const approveBtn = card.locator('button.btn-primary').first();
    await approveBtn.dispatchEvent('click');

    // Verify cancellation notice is rendered
    await expect(page.locator('#aiChatWidget')).toContainText('无主 BOM 行清理流程已取消或失效');

    // Verify no second proposal card is loaded
    await expect(page.locator('.ai-proposal-card')).toHaveCount(1);
  });

  test('completing all 5 batches presents handoff button and successfully launches ECN proposal', async ({ page }) => {
    await setupAdminAppWithOrphans(page);
    await page.click('#btn-cleanup-orphan-bom');

    // Approve all 5 batches in sequence
    for (let batch = 1; batch <= 5; batch++) {
      const card = page.locator('.ai-proposal-card').last();
      const approveBtn = card.locator('button.btn-primary').first();
      await expect(approveBtn).toBeAttached({ timeout: 15000 });
      await approveBtn.dispatchEvent('click');
      if (batch < 5) {
        await expect(page.locator('.ai-proposal-card')).toHaveCount(batch + 1, { timeout: 15000 });
      }
    }

    // Verify completion message and handoff button
    await expect(page.locator('#aiChatWidget')).toContainText('无主 BOM 行清理完毕，所有数据校验完全通过。', { timeout: 15000 });
    const handoffBtn = page.locator('#btn-handoff-load-ecn');
    await expect(handoffBtn).toBeAttached({ timeout: 15000 });
    await handoffBtn.scrollIntoViewIfNeeded();
    await expect(handoffBtn).toContainText('继续加载工程变更方案 (ECN)');

    // Verify app state is dirty with 0 orphans remaining
    const appState = await page.evaluate(() => ({
      dirty: window.app.state.dirty,
      remediationHandoffEligible: window.app.state.remediationHandoffEligible,
      isHandoffValid: window.app._isRemediationHandoffValid(),
    }));
    expect(appState.dirty).toBe(true);
    expect(appState.remediationHandoffEligible).toBe(true);
    expect(appState.isHandoffValid).toBe(true);

    // Click handoff button
    await handoffBtn.dispatchEvent('click');

    // Verify ECN Batch 1 proposal card is loaded on the current local snapshot
    const ecnCard = page.locator('.ai-proposal-card').last();
    await expect(ecnCard).toBeAttached({ timeout: 15000 });
    await expect(page.locator('#aiChatWidget')).toContainText('ECN-2026-0824-COLOR: 新增颜色 SKU 批次 1');
  });

  test('unrelated dirty change invalidates handoff and blocks loading ECN proposal', async ({ page }) => {
    await setupAdminAppWithOrphans(page);
    await page.click('#btn-cleanup-orphan-bom');

    // Approve all 5 batches
    for (let batch = 1; batch <= 5; batch++) {
      const card = page.locator('.ai-proposal-card').last();
      const approveBtn = card.locator('button.btn-primary').first();
      await expect(approveBtn).toBeAttached({ timeout: 15000 });
      await approveBtn.dispatchEvent('click');
      if (batch < 5) {
        await expect(page.locator('.ai-proposal-card')).toHaveCount(batch + 1, { timeout: 15000 });
      }
    }

    const handoffBtn = page.locator('#btn-handoff-load-ecn');
    await expect(handoffBtn).toBeAttached({ timeout: 15000 });

    // Introduce real manual edit through app methods (without manually mutating handoff state)
    await page.evaluate(() => {
      window.BomCoreUtils.updateMaterialRecord(window.app.state.payload, 'mat_0001', {
        code: 'MODIFIED_CODE',
      });
      window.app.markDirty();
    });

    // Verify eligibility was cleared by markDirty
    const isEligible = await page.evaluate(() => window.app.state.remediationHandoffEligible);
    expect(isEligible).toBe(false);

    // Try to load ECN proposal
    await page.evaluate(() => {
      window.app.loadEcnProposalBatch();
    });

    // Verify blocked by dirty guard
    await expect(page.locator('#syncStatus')).toHaveAttribute('data-state', 'error');
    const statusText = await page.locator('#syncStatus').textContent();
    expect(statusText).toContain('无法在存在未保存更改时加载 ECN 方案');
  });
});

