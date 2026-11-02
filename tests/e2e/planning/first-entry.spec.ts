import { expect, test } from '@playwright/test';
import planning from '../../../messages/ko/planning.json';
import { installDesktopRailRuntime } from '../desktop-rail-arrival-harness';
import { expectSmoothMotion, startSmoothness, stopSmoothness } from '../motion-sampler';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`planning entry keeps help and folder choice usable with ${reducedMotion} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await installDesktopRailRuntime(page);
    await page.addInitScript(() => {
      type Runtime = { __TAURI_INTERNALS__: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> }; releasePlanningSupport?: () => void };
      const runtime = window as unknown as Runtime;
      const original = runtime.__TAURI_INTERNALS__.invoke;
      let choices = 0;
      const supported = new Promise((resolve) => { runtime.releasePlanningSupport = () => resolve(true); });
      runtime.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command === 'planning_supported') return supported;
        if (command === 'planning_pick_folder') return ++choices === 1 ? null : { generation: 1, folder: 'docs', path: '/tmp/entry-proof/docs' };
        if (command === 'planning_scan') return { files: [{ path: 'plan.md', size: 1, modified_seconds: 1 }], skipped: 0, partial: false, visited: 1, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
        return original(command, args);
      };
    });
    await page.goto('/ko/planning/?guides=off');
    await expect(page.getByText(planning.checkingSupport)).toBeVisible();
    await expect(page.getByRole('navigation', { name: '주요 이동' }).getByRole('link')).toHaveCount(4);
    await startSmoothness(page);
    await page.evaluate(() => (window as unknown as { releasePlanningSupport: () => void }).releasePlanningSupport());
    const stage = page.locator('[data-planning-state="no-folder"]');
    await expect(stage).toBeVisible();
    await expect(stage).toHaveAttribute('data-reduced-motion', String(reducedMotion === 'reduce'));
    await expect(stage).toHaveCSS('opacity', '1');
    // measurement window: retain a quiet tail after the entrance in the frame sampler.
    await page.waitForTimeout(150);
    expectSmoothMotion(await stopSmoothness(page, '[data-planning-state="no-folder"]'), { still: reducedMotion === 'reduce' });

    const choose = page.getByRole('button', { name: planning.chooseFolder });
    const paper = page.locator('[data-planning-paper="document"]');
    const resting = await paper.evaluate((element) => getComputedStyle(element).transform);
    await choose.focus();
    if (reducedMotion === 'reduce') {
      // measurement window: observe reduced motion through a full focus-response interval.
      await page.waitForTimeout(300);
      expect(await paper.evaluate((element) => getComputedStyle(element).transform)).toBe(resting);
    } else {
      await expect.poll(() => paper.evaluate((element) => getComputedStyle(element).transform)).not.toBe(resting);
    }
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: planning.details })).toBeFocused();
    await expect(page.getByRole('tooltip')).toContainText(planning.limits);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await choose.focus();
    await page.keyboard.press('Enter');
    await expect(stage).toBeVisible();
    await expect(choose).toBeFocused();
    await choose.click();
    await expect(page.getByRole('button', { name: 'plan.md', exact: true })).toBeVisible();
    await expect(stage).toHaveCount(0);
  });
}
