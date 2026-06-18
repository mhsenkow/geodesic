import { test, expect } from '@playwright/test';

test.describe('Geodesic app smoke', () => {
  test('loads and renders dome stats', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#stat-faces')).not.toHaveText('—', { timeout: 15000 });
    const faces = await page.locator('#stat-faces').textContent();
    expect(Number(faces)).toBeGreaterThan(0);
  });

  test('toggles timber material', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.getElementById('stat-faces')?.textContent !== '—');
    await page.click('label[for="mat-rect"]');
    await expect(page.locator('#grp-lum-w')).toBeVisible();
    const hubTypes = await page.locator('#stat-hub-types').textContent();
    expect(Number(hubTypes)).toBeGreaterThan(0);
  });

  test('applies preset', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.getElementById('stat-faces')?.textContent !== '—');
    await page.selectOption('#preset-select', 'shed-timber');
    await expect(page.locator('#mat-rect')).toBeChecked();
    await expect(page.locator('#diameter')).toHaveValue('3');
  });

  test('opens hub inspector with keyboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.getElementById('stat-faces')?.textContent !== '—');
    await page.keyboard.press('i');
    await expect(page.locator('#hub-inspector')).toHaveClass(/visible/);
  });

  test('exports strut CSV triggers download', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.getElementById('stat-faces')?.textContent !== '—');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-export-struts'),
    ]);
    expect(download.suggestedFilename()).toMatch(/strut_lengths.*\.csv/);
  });

  test('hub list matches stat count', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.getElementById('stat-faces')?.textContent !== '—');
    const hubTypes = Number(await page.locator('#stat-hub-types').textContent());
    const badges = await page.locator('.hub-badge').count();
    expect(badges).toBe(hubTypes);
  });
});
