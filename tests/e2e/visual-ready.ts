import { expect, type Page } from '@playwright/test';

/** Wait for real paint dependencies; never advance or disable the page's animation clock. */
export async function waitForDocumentPaint(page: Page) {
  await page.waitForLoadState('load');
  await expect(page.locator('main').first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  await expect(page.getByTestId('vault-route-identity-pending')).toHaveCount(0);
  await waitForFiniteAnimations(page);
}

/** Hover-in/out and entrance transitions finish; continuous decorative motion keeps running. */
export async function waitForFiniteAnimations(page: Page) {
  await page.evaluate(async () => {
    // Flush style changes before collecting the transitions they create.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const animations = document.getAnimations().filter((animation) =>
      animation.playState === 'running' &&
      Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)),
    );
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}
