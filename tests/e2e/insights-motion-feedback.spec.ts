import { expect, test } from '@playwright/test';
import { installHarnessRuntime, mountHarnessVault } from './harness-tab-fixture';
import { motionShares, startSampling, stopSampling, translateY } from './motion-sampler';
import { waitFrames } from './settle';

test.beforeEach(async ({ page }) => {
  await installHarnessRuntime(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => undefined } });
  });
  await mountHarnessVault(page);
});

test('the insights copy control interpolates press travel and draws its result', async ({ page }) => {
  await page.goto('/en/ontology/insights/?tab=flow&guides=off');
  const button = page.getByTestId('flow-copy');
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await waitFrames(page, 5);
  await startSampling(page, { tracks: [{ name: 'copy', selector: '[data-testid="flow-copy"]' }] });
  await waitFrames(page, 2);
  const t0 = await page.evaluate(() => performance.now());
  await page.mouse.down();
  await waitFrames(page, 30);
  const rec = await stopSampling(page);
  await page.mouse.up();
  const measured = motionShares(rec.tracks.copy.map((v) => translateY(v!.translate)), rec.frames, t0);
  test.info().annotations.push({ type: 'copy-motion', description: JSON.stringify(measured) });
  expect(measured.intermediate).toBeGreaterThan(2);
  expect(measured.mfs).toBeLessThan(0.35);
  await expect(button.locator('[data-feedback-glyph="copied"] [data-drawn="draw"]')).toHaveCount(1);
  const settled = await button.boundingBox();
  expect(settled!.width).toBe(box.width);
});
