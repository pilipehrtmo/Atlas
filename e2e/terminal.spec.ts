import { expect, test, type Page } from '@playwright/test';

const command = (page: Page) => page.getByRole('textbox', { name: 'Command' });
// Panes are numbered 1-4 on screen; DOM order follows the column layout, so match the label.
const pane = (page: Page, n: number) => page.locator('.pane').filter({ has: page.locator('.pane-no', { hasText: String(n) }) });

async function run(page: Page, cmd: string) {
  await command(page).fill(cmd);
  await command(page).press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.mode')).toHaveText('DEMO · SYNTHETIC DATA');
});

test('boots into the four-pane workspace with no horizontal overflow', async ({ page }) => {
  await expect(page.locator('.pane')).toHaveCount(4);
  await expect(page.locator('.pane-title').first()).toHaveText('MKT');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a command opens in the active pane and back/forward navigate its history', async ({ page }) => {
  await pane(page, 2).click({ position: { x: 5, y: 5 } });
  await run(page, 'NOVA FA');
  await expect(pane(page, 2).locator('.pane-title')).toHaveText('NOVA FA');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(pane(page, 2).locator('.pane-title')).toHaveText('NOVA DES');
  await page.keyboard.press('Alt+ArrowRight');
  await expect(pane(page, 2).locator('.pane-title')).toHaveText('NOVA FA');
});

test('typing anywhere starts a command and invalid commands show an error', async ({ page }) => {
  await page.locator('body').press('h');
  await expect(command(page)).toBeFocused();
  await expect(command(page)).toHaveValue('H');
  await run(page, 'NOTAFUNCTION XYZ');
  await expect(page.locator('.cmd-error')).toBeVisible();
});

test('the company page labels its data as synthetic', async ({ page }) => {
  await pane(page, 2).click({ position: { x: 5, y: 5 } });
  await run(page, 'NOVA');
  await expect(pane(page, 2).getByText('Key statistics')).toBeVisible();
  await expect(pane(page, 2).locator('.prov').first()).toContainText(/synthetic/i);
});

test('recording a buy updates portfolio holdings, and overselling is rejected', async ({ page }) => {
  const port = pane(page, 4);
  await expect(port.getByText('Record transaction')).toBeVisible();
  const form = port.locator('form', { has: page.getByRole('button', { name: 'Save' }) });
  await form.getByPlaceholder('Symbol').fill('NOVA');
  await form.getByPlaceholder('Quantity').fill('10');
  await form.getByPlaceholder('Price / share').fill('100');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(port.locator('table').filter({ hasText: 'NOVA' }).first()).toBeVisible();

  await form.locator('select').selectOption('SELL');
  await form.getByPlaceholder('Symbol').fill('NOVA');
  await form.getByPlaceholder('Quantity').fill('1000');
  await form.getByPlaceholder('Price / share').fill('100');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(port.locator('.down').first()).toBeVisible();
});

test('the workspace layout is restored after a reload', async ({ page }) => {
  await pane(page, 3).click({ position: { x: 5, y: 5 } });
  await run(page, 'YC');
  await expect(pane(page, 3).locator('.pane-title')).toHaveText('YC');
  await page.waitForTimeout(1000); // layout save is debounced
  await page.reload();
  await expect(pane(page, 3).locator('.pane-title')).toHaveText('YC');
});

test('a pane can be maximized and restored', async ({ page }) => {
  await pane(page, 2).click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Alt+Enter');
  await expect(page.locator('.pane')).toHaveCount(1);
  await expect(page.locator('.pane .pane-no')).toHaveText('2');
  await page.keyboard.press('Alt+Digit4');
  await expect(page.locator('.pane .pane-no')).toHaveText('4');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pane')).toHaveCount(4);
  await pane(page, 1).locator('.pane-title').dblclick();
  await expect(page.locator('.pane')).toHaveCount(1);
  await page.getByRole('button', { name: 'Restore pane' }).click();
  await expect(page.locator('.pane')).toHaveCount(4);
});

test('portfolio performance compares against a benchmark', async ({ page }) => {
  const port = pane(page, 4);
  await expect(port.getByText('Time-weighted return 1Y')).toBeVisible();
  await expect(port.getByText('DM500 over the same dates')).toBeVisible();
  await expect(port.locator('svg[aria-label="Portfolio chart"]')).toBeVisible();
  await port.getByRole('button', { name: '3M' }).click();
  await expect(port.getByText('Time-weighted return 3M')).toBeVisible();
  await port.getByRole('textbox', { name: 'Benchmark' }).fill('DMTECH');
  await port.getByRole('textbox', { name: 'Benchmark' }).press('Enter');
  await expect(port.getByText('DMTECH over the same dates')).toBeVisible();
});
