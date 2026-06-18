import { test, expect } from '@playwright/test';

test.describe('Visual regression', () => {
  test('main viewport renders consistently', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForFunction(() => document.getElementById('stat-faces')?.textContent !== '—', {
      timeout: 30000,
    });
    await page.waitForFunction(
      () => document.getElementById('loading-overlay')?.getAttribute('aria-busy') !== 'true',
      { timeout: 30000 }
    );
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('main-viewport.png', {
      maxDiffPixelRatio: 0.08,
      animations: 'disabled',
      timeout: 30000,
    });
  });

  test('hub inspector renders consistently', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/');
    await page.waitForFunction(() => document.getElementById('stat-faces')?.textContent !== '—', {
      timeout: 30000,
    });
    await page.click('#btn-open-inspector');
    await expect(page.locator('#hub-inspector')).toHaveClass(/visible/, { timeout: 15000 });
    await page.waitForFunction(
      () => document.getElementById('loading-overlay')?.getAttribute('aria-busy') !== 'true',
      { timeout: 45000 }
    );
    await page.waitForTimeout(500);
    await expect(page.locator('#hub-inspector')).toHaveScreenshot('hub-inspector.png', {
      maxDiffPixelRatio: 0.12,
      animations: 'disabled',
      timeout: 30000,
    });
  });
});
