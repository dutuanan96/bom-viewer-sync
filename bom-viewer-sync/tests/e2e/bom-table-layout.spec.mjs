import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { bomViewMethods } from '../../src/ui/bom-view.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = fs.readFileSync(path.join(root, 'src/styles/app.css'), 'utf8');
const colgroup = bomViewMethods.tableColgroupHtml.call({
  canEditProductRevision: () => false,
  state: { editMode: false },
});
const headings = ['Level', 'Material code', 'No.', 'Name', 'Specification', 'Material', 'Color', 'Attribute', 'Unit', 'Qty', 'Remarks', '2D图纸', '3D'];
const rows = [
  ['1', 'BC460327187KD', 'Y06', 'LGS布抽46x32.7x18.7', '460×327×187mm', 'MDF&纸板&无纺布', '复古色', '零件', '个', '9', '-', '2D', '-'],
  ['2', 'FG1515066150', '', '方管', '15×15×0.6Tmm，长度6150mm', 'Q195', '光亮', '原材料', '根', '0.132246', '760mm横杆用量：0.125根；44mm底脚用量：0.007246根。两种零件分别编程切割，禁止混切。', '-', '-'],
  ['1', 'LGS133XHZHLBHV5', 'J', 'LGS133-底部横杆左-后_组件（V5）', '760×62×15mm', 'Q195', '黑砂纹', '零件', '个', '1', '44mm底脚与横杆焊接成一体。', '2D', '3D'],
];
function cellHtml(value, index) {
  if (index === 1) return `<td><span class="mat-code">${value}</span></td>`;
  if (index === 6) return `<td><div class="color-dot-wrapper"><span class="color-dot"></span><span>${value}</span></div></td>`;
  if (index === 9) return `<td><span class="qty">${value}</span></td>`;
  if (index === 10) return `<td class="bom-remark"><span class="bom-remark-token">${value}</span></td>`;
  if (index >= 11 && value !== '-') {
    return `<td><div class="drawing-tools"><button class="drawing-btn primary">查看</button></div></td>`;
  }
  return `<td>${value}</td>`;
}
const markup = `<style>${css}</style><div class="table-container" style="width:calc(100vw - 380px);margin:24px"><table class="bom-table">${colgroup}<thead><tr>${headings.map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cellHtml).join('')}</tr>`).join('')}</tbody></table></div>`;

if (process.platform === 'win32') test.use({ channel: 'msedge' });

for (const width of [1920, 1440, 1024]) {
  test(`BOM name and specification columns remain readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.setContent(`<body class="pdm-shell">${markup}</body>`);
    const table = page.locator('.bom-table');
    await expect(table).toHaveCSS('table-layout', 'fixed');
    const name = await table.locator('tbody tr').first().locator('td').nth(3).boundingBox();
    const spec = await table.locator('tbody tr').first().locator('td').nth(4).boundingBox();
    expect(name.width).toBeGreaterThanOrEqual(width >= 1440 ? 140 : 85);
    expect(spec.width).toBeGreaterThanOrEqual(width >= 1440 ? 135 : 80);
    const headersOverflow = await table.locator('th').evaluateAll(elements =>
      elements.filter(element => getComputedStyle(element).display !== 'none')
        .some(element => element.scrollWidth > element.clientWidth + 1));
    expect(headersOverflow).toBe(false);
    const colorOverflow = await table.locator('.color-dot-wrapper').evaluateAll(elements =>
      elements.some(element => element.scrollWidth > element.parentElement.clientWidth - 12 + 1));
    expect(colorOverflow).toBe(false);
    const firstRow = await table.locator('tbody tr').first().boundingBox();
    expect(firstRow.height).toBeLessThan(width >= 1440 ? 90 : 110);
    await expect(table.locator('tbody tr').nth(1).locator('td').nth(9)).toHaveCSS('white-space', 'nowrap');
    const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(bodyOverflow).toBe(false);
    const tableOverflow = await page.locator('.table-container').evaluate(element => element.scrollWidth > element.clientWidth + 1);
    expect(tableOverflow).toBe(false);
    const quantityOverflow = await table.locator('tbody tr').nth(1).locator('td').nth(9)
      .evaluate(element => element.scrollWidth > element.clientWidth);
    expect(quantityOverflow).toBe(false);
    const codeOverflow = await table.locator('.mat-code').evaluateAll(elements =>
      elements.some(element => element.scrollWidth > element.clientWidth + 1));
    expect(codeOverflow).toBe(false);
    if (width >= 1440) {
      const material = table.locator('tbody tr').first().locator('td').nth(5);
      await expect(material).toHaveCSS('white-space', 'normal');
      expect(await material.evaluate(element => element.scrollWidth > element.clientWidth + 1)).toBe(false);
    }
    await page.screenshot({ path: testInfo.outputPath(`bom-table-${width}.png`) });
  });
}

