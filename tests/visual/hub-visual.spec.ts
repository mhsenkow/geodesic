import { test, expect } from '@playwright/test';

test.describe('Visual regression', () => {
  test('main viewport renders consistently', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.getElementById('stat-faces')?.textContent !== '—', {
      timeout: 15000,
    });
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('main-viewport.png', {
      maxDiffPixelRatio: 0.05,
      animations: 'disabled',
    });
  });

  test('hub inspector renders consistently', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.getElementById('stat-faces')?.textContent !== '—');
    await page.click('#btn-open-inspector');
    await expect(page.locator('#hub-inspector')).toHaveClass(/visible/);
    await page.waitForTimeout(2000);
    await expect(page.locator('#hub-inspector')).toHaveScreenshot('hub-inspector.png', {
      maxDiffPixelRatio: 0.08,
      animations: 'disabled',
    });
  });
});
