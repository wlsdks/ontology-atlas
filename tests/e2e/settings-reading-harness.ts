import { expect, type Page } from '@playwright/test';
import { installDesktopRailRuntime } from './desktop-rail-arrival-harness';

export async function openSettings(page: Page, locale: 'en' | 'ko', textSize?: 'larger') {
  if (textSize) {
    await page.addInitScript((value) => window.localStorage.setItem('atlas.appearance.text-size', value), textSize);
  }
  await installDesktopRailRuntime(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/${locale}/?guides=off`);
  await page.getByTestId('first-run-open').click();
  await page.locator('[data-testid="app-settings-trigger"]:visible').click();
  await expect(page.getByTestId('app-settings-popover')).toBeVisible();
}
