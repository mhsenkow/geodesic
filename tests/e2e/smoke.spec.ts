import { test, expect, type Page } from '@playwright/test';

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getElementById('stat-faces')?.textContent !== '—', {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => document.getElementById('loading-overlay')?.getAttribute('aria-busy') !== 'true',
    { timeout: 60_000 }
  );
}

test.describe('Geodesic app smoke', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => localStorage.clear());
  });

  test('loads and renders dome stats', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const faces = await page.locator('#stat-faces').textContent();
    expect(Number(faces)).toBeGreaterThan(0);
  });

  test('toggles timber material', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.locator('label[for="mat-rect"]').click();
    await expect(page.locator('#grp-lum-w')).toBeVisible();
    const hubTypes = await page.locator('#stat-hub-types').textContent();
    expect(Number(hubTypes)).toBeGreaterThan(0);
  });

  test('toggles unit system', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.locator('label[for="unit-imperial"]').click();
    await expect(page.locator('#label-diameter')).toHaveText(/ft/, { timeout: 15_000 });
    await expect(page.locator('#diameter')).toHaveValue(/^\d/);
    await page.locator('label[for="unit-metric"]').click();
    await expect(page.locator('#label-diameter')).toHaveText(/\(m\)/, { timeout: 15_000 });
  });

  test('applies preset', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.selectOption('#preset-select', 'shed-timber-organic');
    await waitForAppReady(page);
    await expect(page.locator('#mat-rect')).toBeChecked();
    await expect(page.locator('#diameter')).toHaveValue('3');
  });

  test('opens hub inspector with keyboard', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.keyboard.press('i');
    await expect(page.locator('#hub-inspector')).toHaveClass(/visible/);
  });

  test('exports strut CSV triggers download', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-export-struts'),
    ]);
    expect(download.suggestedFilename()).toMatch(/strut_lengths.*\.csv/);
  });

  test('hub list matches stat count', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const hubTypes = Number(await page.locator('#stat-hub-types').textContent());
    const badges = await page.locator('.hub-badge').count();
    expect(badges).toBe(hubTypes);
  });
});
