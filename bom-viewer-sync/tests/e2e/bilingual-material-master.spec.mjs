import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const ADMIN_URL = `file://${resolve('admin.html')}`;

function material(id, code, nameZh, nameVi, materialZh, materialVi) {
  return {
    id,
    code,
    name: { zh: nameZh, vi: nameVi },
    spec: { zh: '', vi: '' },
    material: { zh: materialZh, vi: materialVi },
    color: { zh: '纸色', vi: 'Màu giấy' },
    attr: { zh: '包材', vi: 'Vật liệu đóng gói' },
    drawings: [],
    models3d: [],
  };
}

test('Admin reuses canonical bilingual values without blocking a new code or overwriting user text', async ({ page }) => {
  await page.route('https://api.github.com/**', route => route.abort());
  await page.route('https://raw.githubusercontent.com/**', route => route.abort());
  await page.goto(ADMIN_URL);

  await page.evaluate(({ paper, cotton }) => {
    document.body.replaceWith(document.body.cloneNode(true));
    const payload = window.BomCoreUtils.normalizePayload({
      materialDb: {
        version: 1,
        materials: { M1: paper, M2: cotton },
        bomEntries: [],
      },
    });
    const githubData = {
      loadPublic: async () => payload,
      getSourceMetadata: () => ({ commitSha: 'a'.repeat(40) }),
    };
    window.__bilingualTestApp = window.BomApp.createApp({ mode: 'admin', githubData });
  }, {
    paper: material('M1', 'PAPER-1', '纸卡', 'Giấy lót', '瓦楞纸', 'Giấy carton'),
    cotton: material('M2', 'COTTON-1', '棉布', 'Vải cotton', '棉布', 'Vải cotton'),
  });
  await page.waitForFunction(() => Boolean(window.__bilingualTestApp?.state.lastLoadAt));
  await page.evaluate(() => window.__bilingualTestApp.addDatabaseMaterial());

  const nameZh = page.locator('[data-material-master-edit="name"][data-lang="zh"]');
  const nameVi = page.locator('[data-material-master-edit="name"][data-lang="vi"]');
  await page.fill('[data-material-master-edit="code"]', 'PAPER-2');
  await nameVi.fill('');
  await nameZh.fill('纸卡');
  await nameZh.blur();
  await expect(nameVi).toHaveValue('Giấy lót');

  await nameVi.fill('Bản dịch do Admin sửa');
  await nameZh.fill('棉布');
  await nameZh.blur();
  await expect(nameVi).toHaveValue('Bản dịch do Admin sửa');

  const materialButton = page.locator('[data-action="open-field-picker"][data-field="material"][data-lang="zh"]');
  await materialButton.click();
  const option = page.locator('.field-picker-option', { hasText: '瓦楞纸' }).first();
  await expect(option).toContainText('Giấy carton');
  await option.click();
  await expect(page.locator('[data-material-master-edit="material"][data-lang="zh"]')).toHaveValue('瓦楞纸');
  await expect(page.locator('[data-material-master-edit="material"][data-lang="vi"]')).toHaveValue('Giấy carton');

  await nameZh.fill('纸卡');
  await page.click('[data-action="save-material-master"]');
  const savedId = await page.evaluate(() => window.__bilingualTestApp.state.selectedMaterialId);
  const saved = await page.evaluate((id) => window.__bilingualTestApp.state.materialDb.materials[id], savedId);
  expect(saved.code).toBe('PAPER-2');
  expect(saved.name.zh).toBe('纸卡');
  expect(saved.name.vi).toBe('Bản dịch do Admin sửa');

  await page.evaluate(() => window.__bilingualTestApp.addDatabaseMaterial());
  await page.fill('[data-material-master-edit="code"]', ' paper-1 ');
  await page.click('[data-action="save-material-master"]');
  await expect(page.locator('#syncStatus')).toContainText('该物料编码已存在');
  const duplicateWasStored = await page.evaluate(() => {
    const app = window.__bilingualTestApp;
    return Boolean(app.state.materialDb.materials[app.state.selectedMaterialId]);
  });
  expect(duplicateWasStored).toBe(false);
});

test('ambiguous bilingual values require an explicit picker selection', async ({ page }) => {
  await page.route('https://api.github.com/**', route => route.abort());
  await page.route('https://raw.githubusercontent.com/**', route => route.abort());
  await page.goto(ADMIN_URL);

  await page.evaluate(({ left, right }) => {
    document.body.replaceWith(document.body.cloneNode(true));
    const payload = window.BomCoreUtils.normalizePayload({
      materialDb: {
        version: 1,
        materials: { M1: left, M2: right },
        bomEntries: [],
      },
    });
    const githubData = {
      loadPublic: async () => payload,
      getSourceMetadata: () => ({ commitSha: 'b'.repeat(40) }),
    };
    window.__ambiguousTestApp = window.BomApp.createApp({ mode: 'admin', githubData });
  }, {
    left: material('M1', 'PAPER-A', '纸卡', 'Giấy lót', '纸', 'Giấy'),
    right: material('M2', 'PAPER-B', '纸卡', 'Thẻ giấy', '纸', 'Giấy'),
  });
  await page.waitForFunction(() => Boolean(window.__ambiguousTestApp?.state.lastLoadAt));
  await page.evaluate(() => window.__ambiguousTestApp.addDatabaseMaterial());

  const nameZh = page.locator('[data-material-master-edit="name"][data-lang="zh"]');
  const nameVi = page.locator('[data-material-master-edit="name"][data-lang="vi"]');
  await nameVi.fill('');
  await nameZh.fill('纸卡');
  await nameZh.blur();

  await expect(nameVi).toHaveValue('');
  await expect(page.locator('.bilingual-hint')).toContainText('存在多个双语映射');
});
