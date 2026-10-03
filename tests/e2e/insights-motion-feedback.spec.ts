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

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`insight fills use a bounded arrival with ${reducedMotion} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/en/ontology/insights/?tab=connections&guides=off');
    const fills = page.locator('[data-insights-fill]');
    await expect(fills.first()).toBeVisible();
    const facts = await fills.evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        transition: style.transitionProperty,
        delay: parseFloat(style.transitionDelay) * 1000,
        width: (element as HTMLElement).style.width,
      };
    }));
    expect(facts.length).toBeGreaterThan(3);
    const step = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-stagger')));
    for (const fact of facts) {
      expect(fact.width).toBe('100%');
      expect(fact.transition).toBe(reducedMotion === 'reduce' ? 'none' : 'transform');
      expect(fact.delay).toBeLessThanOrEqual(reducedMotion === 'reduce' ? 0 : step * 3);
    }
    await expect.poll(() => fills.evaluateAll((elements) => elements.every((element) => {
      const target = Number((element as HTMLElement).dataset.insightsFill) / 100;
      return Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).a - target) < 0.001;
    }))).toBe(true);
  });
}
