import { expect, test, type Page } from '@playwright/test';

const STAGES = [
  { route: '/ko/planning/', loops: ['.planning-sheet-drift'] },
  { route: '/ko/automations/', loops: ['.automation-dial-hand'] },
] as const;

const TOGGLE = '[data-testid="feature-stage-motion-toggle"]';

/** Title, sentence and action boxes, which the pause must never move. */
function chromeBoxes(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-feature-stage]')!;
    return [stage.querySelector('h1,h2'), stage.querySelector('p'), stage.querySelector('a, button')].map((element) => {
      const box = element!.getBoundingClientRect();
      return [box.x, box.y, box.width, box.height];
    });
  });
}

const playStates = (page: Page, selector: string) =>
  page.locator(`[data-feature-stage-art] ${selector}`).evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationPlayState));

for (const { route, loops } of STAGES) {
  test(`the stage pause holds every loop of ${route} in place and plays it again`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(route);
    await expect(page.locator('[data-feature-stage-art] [data-scene-motion="running"]')).toHaveCount(1);
    const toggle = page.locator(TOGGLE);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.locator('[data-feature-stage]').evaluate((stage) => getComputedStyle(stage).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    const before = await chromeBoxes(page);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-feature-stage-art]')).toHaveAttribute('data-motion-paused', 'true');
    for (const loop of [...loops, '[data-testid="brand-waiting-mark"]']) {
      expect(await playStates(page, loop)).toEqual(expect.arrayContaining(['paused']));
      expect(await playStates(page, loop)).not.toContain('running');
    }
    expect(await chromeBoxes(page)).toEqual(before);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    for (const loop of loops) expect(await playStates(page, loop)).not.toContain('paused');
    expect(await chromeBoxes(page)).toEqual(before);
  });
}

test('the paused dial hand stands still and moves again when played', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/ko/automations/');
  await expect(page.locator('[data-automation-artwork][data-scene-motion="running"]')).toHaveCount(1);
  const hand = page.locator('[data-automation-hand]');
  const angle = () => hand.evaluate((element) => getComputedStyle(element).rotate);
  await page.locator(TOGGLE).click();
  const held = await angle();
  // measurement window: the hand must not move across half a second while paused.
  await page.waitForTimeout(500);
  expect(await angle()).toBe(held);
  await page.locator(TOGGLE).click();
  await expect.poll(angle).not.toBe(held);
});

test('reduced motion offers no stage pause, since nothing loops', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ko/automations/');
  await expect(page.locator('[data-feature-stage][data-reduced-motion="true"]')).toBeVisible();
  await expect(page.locator(TOGGLE)).toHaveCount(0);
});
