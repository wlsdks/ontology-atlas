import { expect, test } from '@playwright/test';

import { waitForAnimationsDone } from './settle';

/**
 * "Recent changes" must **not be a dead end on the sample.**
 *
 * ## Why this spec exists
 *
 * Owner report, 2026-08-03: *"On the normal screen, pressing 'recent changes' does nothing."* There
 * were two causes: ① it was disabled without looking disabled (owned by
 * `tests/contract/disabled-affordance.contract.test.ts`), and ② on the sample it
 * **should not have been disabled at all.**
 *
 * Recent changes is 0 on the sample not because nothing has been changed yet but
 * because **the sample's dates are when this repository last touched the fixture.**
 * Waiting does not turn it on — it only gains meaning once a folder is opened. When
 * the reason is "your next action" rather than "none", the next action must be
 * offered: that is `surfaces.md`'s degradation contract (why plus where) and the
 * **0 dead CTAs** the web smoke test requires.
 *
 * Why e2e rather than jsdom: modality (the scrim), centring, focus, and Esc can only
 * be shown true **on a rendered screen.**
 */

/*
 * One page load walks the whole contract. It used to be six tests that each paid for the map's
 * load to check one property of the same dialog.
 */
test('최근 변경 — 샘플에서 폴더로 가는 길이 모달로 열리고 닫힌다', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  // The page's scripts have loaded (so the chip answers a press) and its toolbar is at rest.
  await page.goto('/ko/topology/?guides=off', { waitUntil: 'networkidle' });
  const chip = page.getByTestId('topology-spotlight-toggle');
  await expect(chip).toBeVisible();
  await waitForAnimationsDone(page.locator('body'));

  // On the sample it presses — it is not blocked as disabled.
  await expect(chip).toBeEnabled();
  const before = page.url();

  await chip.click();
  const dialog = page.getByTestId('recent-changes-needs-vault-dialog');
  await expect(dialog).toBeVisible();
  // Both the why and the where must be present — one alone is either an apology or an order.
  await expect(dialog).toContainText('폴더');
  await expect(page.getByTestId('recent-changes-needs-vault-open')).toBeVisible();
  // Opening it moves focus to the next action.
  await expect(page.getByTestId('recent-changes-needs-vault-open')).toBeFocused();
  // It does not switch the lens on: a lens with nothing to highlight would be left on.
  expect(page.url(), '`?recent=` 가 붙으면 안 된다').toBe(before);

  // `design.md`: a modal must **prove** a dim/scrim or blocked interaction.
  const scrim = page.getByTestId('recent-changes-needs-vault-scrim');
  await expect(scrim).toBeVisible();
  const alpha = await scrim.evaluate((el) => {
    const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor);
    const parts = m ? m[1].split(',').map(Number) : [];
    return parts.length > 3 ? parts[3] : 1;
  });
  expect(alpha, 'scrim 이 투명하면 모달이 아니라 떠 있는 카드다').toBeGreaterThan(0.2);

  // Escape and a press on the scrim both close it.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await chip.click();
  await expect(dialog).toBeVisible();
  // Press the scrim's edge, not the card.
  await page.mouse.click(40, 40);
  await expect(dialog).toBeHidden();
});
