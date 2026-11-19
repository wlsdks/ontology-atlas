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

/**
 * The gateway's own chrome is on screen. `/` exports a stand-in and chooses gateway or map in the
 * browser, after `load`, so a reader of the gateway at `/` waits for this first.
 */
export async function waitForGatewayDrawn(page: Page) {
  await expect(page.getByTestId('gateway-brand-mark').first()).toBeVisible();
}

/** Hover-in/out and entrance transitions finish; continuous decorative motion keeps running. */
export async function waitForFiniteAnimations(page: Page) {
  await page.evaluate(async () => {
    // Flush style changes before collecting the transitions they create.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const animations = document.getAnimations().filter((animation) => {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      return animation.playState === 'running' &&
        Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)) &&
        !target?.closest('[data-decorative-motion]');
    });
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}
