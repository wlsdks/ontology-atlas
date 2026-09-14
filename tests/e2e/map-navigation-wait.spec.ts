import { expect, test } from '@playwright/test';
import { installDesktopRailRuntime, mountDesktopVault } from './desktop-rail-arrival-harness';

test('Map announces preparation before leaving the current pane and reveals a drawn canvas', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  await page.getByTestId('app-nav-rail-item-mcp').click();
  await expect(page.getByRole('heading', { name: 'MCP', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const events: { type: string; pathname: string; inert: boolean; canvas: boolean }[] = [];
    (window as unknown as { mapWaitEvents: typeof events }).mapWaitEvents = events;
    let waiting = false;
    const observer = new MutationObserver(() => {
      const active = !!document.querySelector('[data-testid="map-navigation-wait"]:not([inert])');
      if (active === waiting) return;
      waiting = active;
      events.push({ type: active ? 'pending' : 'released', pathname: location.pathname,
        inert: document.querySelector('[data-app-shell-pane]')?.hasAttribute('inert') ?? false,
        canvas: !!document.querySelector('canvas[data-surface-role="map-canvas"]'),
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert'] });
  });
  await page.getByTestId('app-nav-rail-item-map').click();
  await expect(page).toHaveURL(/\/topology\//);
  await expect(page.getByTestId('map-navigation-wait')).toHaveCount(0);
  await expect(page.locator('[data-app-shell-pane]')).not.toHaveAttribute('inert');
  const events = await page.evaluate(() => (window as unknown as { mapWaitEvents: { type: string; pathname: string; inert: boolean; canvas: boolean }[] }).mapWaitEvents);
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({ type: 'pending', inert: true });
  expect(events[0].pathname).toContain('/mcp/');
  expect(events[1]).toMatchObject({ type: 'released', inert: false, canvas: true });

  await page.getByTestId('app-nav-rail-item-mcp').click();
  await expect(page.getByRole('heading', { name: 'MCP', exact: true })).toBeVisible();
  await page.keyboard.press('g');
  await page.keyboard.press('m');
  await expect(page.getByTestId('map-navigation-wait')).toHaveCount(0);
  await expect(page.locator('canvas[data-surface-role="map-canvas"]')).toBeFocused();
});

test('leaving during map preparation does not strand an overlay', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  await page.getByTestId('app-nav-rail-item-mcp').click();
  await expect(page.getByRole('heading', { name: 'MCP', exact: true })).toBeVisible();
  // Dispatch the second real navigation in the same task, before the two-frame
  // preparation boundary. The queued map push must not run afterwards.
  await page.evaluate(() => {
    (document.querySelector('[data-testid="app-nav-rail-item-map"]') as HTMLElement).click();
    (document.querySelector('[data-testid="app-nav-rail-item-architecture"]') as HTMLElement).click();
  });
  await expect(page).toHaveURL(/\/architecture\//);
  await expect(page.getByTestId('map-navigation-wait')).toHaveCount(0);
  await expect(page.locator('[data-app-shell-pane]')).not.toHaveAttribute('inert');
});

test('reduced motion keeps the waiting scene readable and still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  await page.getByTestId('app-nav-rail-item-mcp').click();
  await expect(page.getByRole('heading', { name: 'MCP', exact: true })).toBeVisible();
  // Defer the queued destination work, not the CSS or the feedback commit.
  // This makes the pending state inspectable without adding a product delay.
  await page.evaluate(() => {
    (window as unknown as { restoreFrame: typeof requestAnimationFrame }).restoreFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
  });
  await page.getByTestId('app-nav-rail-item-map').click();
  const pending = page.getByTestId('map-navigation-wait');
  await expect(pending).toBeVisible();
  await expect(pending.getByRole('status')).toContainText('map');
  expect(await pending.getByRole('status').evaluate(el => el.closest('[aria-busy="true"]') === null)).toBe(true);
  await expect(pending.getByTestId('brand-waiting-mark')).toHaveAttribute('data-waiting-motion', 'still');
  const motion = await pending.locator('.map-wait-point, .map-wait-signal, .map-wait-orbit').evaluateAll(elements => elements.map(el => ({
    animation: getComputedStyle(el).animationName,
    transform: getComputedStyle(el).transform,
  })));
  expect(motion).toHaveLength(6);
  expect(motion.every(item => item.animation === 'none' && item.transform === 'none')).toBe(true);
  await page.evaluate(() => {
    window.requestAnimationFrame = (window as unknown as { restoreFrame: typeof requestAnimationFrame }).restoreFrame;
  });
  await pending.getByRole('button', { name: 'Return to previous screen' }).click();
  await expect(pending).toHaveCount(0);
  await expect(page).toHaveURL(/\/mcp\//);
});
