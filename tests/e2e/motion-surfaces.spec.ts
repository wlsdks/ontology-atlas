import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { waitForAnimationsDone, waitFrames } from './settle';

interface Frame {
  t: number;
  opacity: number | null;
}

async function startSampling(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __tooltipFrames: { t: number; opacity: number | null }[]; __tooltipStop: boolean };
    w.__tooltipFrames = [];
    w.__tooltipStop = false;
    const tick = (t: number) => {
      const el = document.querySelector('.atlas-tooltip');
      w.__tooltipFrames.push({ t, opacity: el ? Number.parseFloat(getComputedStyle(el).opacity) : null });
      if (!w.__tooltipStop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopSampling(page: Page): Promise<Frame[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __tooltipFrames: { t: number; opacity: number | null }[]; __tooltipStop: boolean };
    w.__tooltipStop = true;
    return w.__tooltipFrames;
  });
}

function fadeShape(frames: Frame[], direction: 'in' | 'out') {
  const values = frames.map((f) => f.opacity ?? 0);
  const intervals = frames.slice(1).map((f, i) => f.t - frames[i].t).sort((a, b) => a - b);
  const frameMs = intervals[Math.floor(intervals.length / 2)] ?? 16.7;
  let maxShare = 0;
  let firstShare: number | null = null;
  for (let i = 1; i < values.length; i += 1) {
    const step = direction === 'in' ? values[i] - values[i - 1] : values[i - 1] - values[i];
    if (step <= 0) continue;
    const share = step * (16.7 / Math.max(frames[i].t - frames[i - 1].t, frameMs));
    if (firstShare === null) firstShare = share;
    maxShare = Math.max(maxShare, share);
  }
  const between = values.filter((v) => v > 0.01 && v < 0.99).length;
  return { firstShare: firstShare ?? 0, maxShare, between };
}

async function measureTooltip(page: Page) {
  const control = page
    .locator('[data-testid="topology-fit-control"]:is(button), [data-testid="topology-fit-control"] button')
    .first();
  await startSampling(page);
  await control.hover();
  const open = page.locator('.atlas-tooltip[data-state$="open"]');
  await expect(open).toBeVisible();
  await waitForAnimationsDone(open);
  await waitFrames(page, 2);
  const enter = fadeShape(await stopSampling(page), 'in');

  await startSampling(page);
  await page.mouse.move(700, 450, { steps: 8 });
  await expect(page.locator('.atlas-tooltip')).toHaveCount(0);
  await waitFrames(page, 2);
  const exit = fadeShape(await stopSampling(page), 'out');
  return { enter, exit };
}

test.describe('tooltip fades in and out', () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`crossfades with ${reducedMotion} motion`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.goto('/en/topology?guides=off&e2e=1');
      await expect(page.getByTestId('topology-fit-control')).toBeVisible();
      const { enter, exit } = await measureTooltip(page);
      test.info().annotations.push({ type: 'motion', description: JSON.stringify({ reducedMotion, enter, exit }) });

      expect(enter.between, 'entering frames between hidden and shown').toBeGreaterThanOrEqual(1);
      expect(enter.firstShare).toBeGreaterThan(0);
      expect(enter.maxShare, 'no hard cut on enter').toBeLessThan(0.6);
      expect(exit.between, 'leaving frames between shown and gone').toBeGreaterThanOrEqual(1);
      expect(exit.maxShare, 'no hard cut on exit').toBeLessThan(0.6);
    });
  }
});
