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
  const cleanBomEntries = (materialData.materialDb?.bomEntries || []).filter(entry => {
    if (entry.parentType === 'material') return true;
    const pid = entry.productCode || entry.parentId;
    return Boolean(bom[pid]?.color_info?.[entry.color]);
  });
  return {
    bom,
    productRevisions: manifest.productRevisions || {},
    notifications: manifest.notifications || [],
    ...materialData,
    materialDb: {
      ...materialData.materialDb,
      bomEntries: cleanBomEntries,
    },
  };
}

async function setupAdminAppWithCanonicalData(page) {
  const canonicalPayload = loadCanonicalPayload();
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

test.describe('ECN-2026-0710-LGS Admin Proposal UI Flow', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.text()));
    page.on('pageerror', err => console.log('[BROWSER ERROR]', err));
    await page.route('https://api.github.com/**', route => route.abort());
    await page.route('https://raw.githubusercontent.com/**', route => route.abort());
    await page.route('https://openrouter.ai/api/v1/**', route => route.abort());
  });

  test('button is Admin-only: visible in admin.html and absent in viewer.html', async ({ page }) => {
    await page.goto(VIEWER_URL);
    await expect(page.locator('#btn-load-ecn-proposal')).toHaveCount(0);

    await setupAdminAppWithCanonicalData(page);
    await expect(page.locator('#btn-load-ecn-proposal')).toHaveCount(1);
    await expect(page.locator('#btn-load-ecn-proposal')).toBeVisible();
  });

  test('dirty guard blocks proposal creation when admin has unsaved changes', async ({ page }) => {
    await setupAdminAppWithCanonicalData(page);
    await expect(page.locator('#btn-load-ecn-proposal')).toBeVisible();

    // Mark dirty via app state
    await page.evaluate(() => {
      window.app.markDirty();
    });
    await expect(page.locator('#syncStatus')).toHaveAttribute('data-state', 'dirty');

    // Click load ECN proposal
    await page.click('#btn-load-ecn-proposal');

    // Verify error status and error message
    await expect(page.locator('#syncStatus')).toHaveAttribute('data-state', 'error');
    const statusText = await page.locator('#syncStatus').textContent();
    expect(statusText).toContain('无法在存在未保存更改时加载 ECN 方案');

    // Verify no proposal card was rendered in the chat
    await expect(page.locator('.ai-proposal-card')).toHaveCount(0);
  });

  test('ECN proposal review has no Save GitHub button, locks button during active flow, and loads next batch on approve', async ({ page }) => {
    await setupAdminAppWithCanonicalData(page);
    await expect(page.locator('#btn-load-ecn-proposal')).toBeVisible();

    // Click ECN proposal button
    await page.click('#btn-load-ecn-proposal');

    // Proposal card should be visible in the open AI drawer
    const proposalCard = page.locator('.ai-proposal-card').first();
    await expect(proposalCard).toBeVisible({ timeout: 15000 });

    // Verify button is disabled during active flow
    await expect(page.locator('#btn-load-ecn-proposal')).toBeDisabled();

    // Clicking disabled button should not generate duplicate proposal
    await page.click('#btn-load-ecn-proposal', { force: true });
    await expect(page.locator('.ai-proposal-card')).toHaveCount(1);

    // Verify proposal review card does NOT contain any Save to GitHub button
    await expect(proposalCard.locator('button:has-text("Save"), button:has-text("Lưu"), button:has-text("保存")')).toHaveCount(0);

    // Verify Approve button exists
    const approveBtn = proposalCard.locator('button.btn-primary').first();
    await expect(approveBtn).toBeVisible();

    // Approve Batch 1
    await approveBtn.dispatchEvent('click');

    // After approval, state becomes dirty (local only)
    await expect(page.locator('#syncStatus')).toHaveAttribute('data-state', 'dirty');

    // Next batch or final completion message rendered
    const chatWidget = page.locator('#aiChatWidget');
    await expect(chatWidget).toContainText(/批次|ECN 变更方案已全部执行完成/, { timeout: 15000 });
  });

  test('B201 proposal flow creates all 11 shanwenhei SKU variants as local Draft changes', async ({ page }) => {
    test.setTimeout(120000);
    await setupAdminAppWithCanonicalData(page);
    await page.click('#btn-load-ecn-proposal');

    for (let batchIndex = 0; batchIndex < 10; batchIndex += 1) {
      await page.waitForFunction(() => (
        !window.app.state.ecnProposalActive
        || Array.from(document.querySelectorAll('.ai-proposal-card button.btn-primary'))
          .some((button) => !button.disabled)
      ));
      if (!await page.evaluate(() => window.app.state.ecnProposalActive)) break;
      const approveButton = page.locator('.ai-proposal-card button.btn-primary:not([disabled])').last();
      await approveButton.dispatchEvent('click');
    }

    await expect.poll(() => page.evaluate(() => window.app.state.ecnProposalActive)).toBe(false);
    await expect(page.locator('#btn-load-ecn-proposal')).toBeEnabled();
    const result = await page.evaluate(() => {
      const expectedSkus = [
        'LGS032B201S', 'LGS132B201S', 'LGS233B201S', 'LGS333B201S',
        'LGS334B201S', 'LGS723B201S', 'LGS733B201S', 'LGS833B201S',
        'LGS834B201S', 'LGS101B201S', 'LGS111B201S',
      ];
      const payload = window.app.getSnapshot().payload;
      const variants = Object.values(payload.bom).flatMap((product) => (
        Object.entries(product.color_info || {}).map(([color, info]) => ({ color, sku: info.sku }))
      ));
      return {
        shanwenheiSkus: variants
          .filter((variant) => expectedSkus.includes(variant.sku) && variant.color === '山纹黑')
          .map((variant) => variant.sku)
          .sort(),
        draftProducts: Object.entries(payload.productRevisions || {})
          .filter(([, revision]) => revision.currentRevisionInfo?.workflowState === 'draft')
          .map(([productCode]) => productCode),
      };
    });

    expect(result.shanwenheiSkus).toEqual([
      'LGS032B201S', 'LGS101B201S', 'LGS111B201S', 'LGS132B201S',
      'LGS233B201S', 'LGS333B201S', 'LGS334B201S', 'LGS723B201S',
      'LGS733B201S', 'LGS833B201S', 'LGS834B201S',
    ]);
    expect(result.draftProducts).toEqual(expect.arrayContaining([
      'LGS032', 'LGS132', 'LGS233', 'LGS333', 'LGS334', 'LGS723',
      'LGS733', 'LGS833', 'LGS834', 'LGS101', 'LGS111',
    ]));
  });

  test('discard invalidates active proposal run token and blocks approving stale proposal card', async ({ page }) => {
    await setupAdminAppWithCanonicalData(page);
    await expect(page.locator('#btn-load-ecn-proposal')).toBeVisible();

    // Click ECN proposal button
    await page.click('#btn-load-ecn-proposal');

    const proposalCard = page.locator('.ai-proposal-card').first();
    await expect(proposalCard).toBeVisible({ timeout: 15000 });
    const approveBtn = proposalCard.locator('button.btn-primary').first();
    await expect(approveBtn).toBeVisible();

    // Admin discards / resets state
    await page.evaluate(() => {
      window.app.applyPayload(window.app.state.loadedPayload);
    });

    // Verify button is re-enabled
    await expect(page.locator('#btn-load-ecn-proposal')).toBeEnabled();

    // Click Approve on the stale proposal card
    await approveBtn.dispatchEvent('click');

    // Verify state remains clean (not dirty)
    await expect(page.locator('#syncStatus')).not.toHaveAttribute('data-state', 'dirty');

    // Verify cancellation warning message is shown in the chat
    await expect(page.locator('#aiChatWidget')).toContainText('ECN 方案流程已取消或失效。');

    // Verify no 2nd proposal card was spawned
    await expect(page.locator('.ai-proposal-card')).toHaveCount(1);
  });

  test('clicking ECN button when orphan BOM entries exist guides admin to cleanup first', async ({ page }) => {
    // Setup with raw payload containing orphans
    const manifest = JSON.parse(readFileSync(resolve('data/manifest.json'), 'utf8'));
    const materialData = JSON.parse(readFileSync(resolve('data/materials.json'), 'utf8'));
    const bom = Object.fromEntries(manifest.products.map(productCode => [
      productCode,
      JSON.parse(readFileSync(resolve(`data/products/${productCode}.json`), 'utf8')),
    ]));
    const rawPayload = {
      bom,
      productRevisions: manifest.productRevisions || {},
      notifications: manifest.notifications || [],
      ...materialData,
    };
    const existingOrphans = (rawPayload.materialDb?.bomEntries || []).filter(e => e.parentType === 'product' && !rawPayload.bom[e.parentId]?.color_info?.[e.color]);
    if (existingOrphans.length === 0) {
      const sampleMatId = Object.keys(rawPayload.materialDb.materials)[0];
      const samplePid = Object.keys(rawPayload.bom)[0];
      for (let i = 0; i < 183; i++) {
        rawPayload.materialDb.bomEntries.push({
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

    await page.goto(ADMIN_URL);
    await page.evaluate(({ rawPayload }) => {
      document.body.replaceWith(document.body.cloneNode(true));
      const payload = window.BomCoreUtils.normalizePayload(rawPayload);
      const githubData = {
        loadPublic: async () => payload,
        getSourceMetadata: () => ({ commitSha: 'a'.repeat(40) }),
      };
      window.app = window.BomApp.createApp({ mode: 'admin', githubData });
    }, { rawPayload });
    await page.waitForFunction(() => Boolean(window.app?.state.lastLoadAt));

    // Click load ECN proposal button
    await page.click('#btn-load-ecn-proposal');

    // Verify guidance status and assistant message
    await expect(page.locator('#syncStatus')).toHaveAttribute('data-state', 'error');
    const statusText = await page.locator('#syncStatus').textContent();
    expect(statusText).toContain('检测到数据库中存在 183 项历史无主 BOM 行');

    // Verify direct action button to run cleanup
    const runOrphanBtn = page.locator('#btn-run-orphan-first');
    await expect(runOrphanBtn).toBeVisible();
    await expect(runOrphanBtn).toContainText('清理无主 BOM 行 (183)');
  });
});
