import { expect, test } from '@playwright/test';

import { openLibraryWorkScenario } from './library-work-harness';

/**
 * **The button that writes may not look like the button that refuses.**
 *
 * Measured on the rendered card in both locales (2026-09-20). With the meaning review open the
 * decision row draws four buttons of exactly 210x32, and two of them came back byte-identical in
 * paint:
 *
 * ```
 * task-review-correct   Reject and edit  bg rgba(255,255,255,0.02)  border rgba(255,255,255,0.1)
 * acp-permission-allow  Allow once       bg rgba(255,255,255,0.02)  border rgba(255,255,255,0.1)
 * ```
 *
 * One of those refuses the write. The other performs it, on the person's own files, and nothing on
 * this card undoes it. The two-button branch had always given allow the filled `primary`; the
 * review branch had quietly demoted it to `outline`, which is what `Reject and edit` wears.
 *
 * ⚠️ **This gate is about the pair, not about a colour.** It does not pin indigo or any token — it
 * asserts that the writing decision does not share its paint with any decision that writes nothing,
 * which stays true through a re-theme and fails the moment the two are flattened together again.
 */

/** Background, border, ink and weight — what a person tells two buttons apart by. */
const PAINT = `(el) => {
  const s = getComputedStyle(el);
  return [s.backgroundColor, s.borderColor, s.color, s.fontWeight].join('|');
}`;

test('the write decision is painted unlike every decision that writes nothing', async ({ page }) => {
  const harness = await openLibraryWorkScenario(page, { permissionKind: 'ontology-patch' });
  await harness.read(page);
  await harness.wait(page);
  const card = page.getByTestId('acp-permission-card');
  await expect(card).toBeVisible();

  const allow = card.getByTestId('acp-permission-allow');
  const allowPaint = await allow.evaluate(new Function('el', `return (${PAINT})(el);`) as (el: SVGElement | HTMLElement) => string);

  // Everything else on this row leaves the folder untouched.
  for (const id of ['task-review-correct', 'task-review-defer', 'acp-permission-reject']) {
    const other = card.getByTestId(id);
    if ((await other.count()) === 0) continue;
    const paint = await other.evaluate(new Function('el', `return (${PAINT})(el);`) as (el: SVGElement | HTMLElement) => string);
    expect(paint, `${id} is painted exactly like the button that writes`).not.toBe(allowPaint);
  }
});

test('the keyboard does not open on the decision that writes', async ({ page }) => {
  /*
   * The fill invites the eye; it must not put the keyboard on the irreversible button, where a
   * stray Enter would land on it. Measured rather than assumed: this card moves focus to its own
   * heading (`task-review-heading`, "Current task") rather than to any decision, so the keyboard
   * opens on none of the four. That is stronger than parking it on reject and the assertion is
   * written to survive either choice — what it forbids is focus opening on allow.
   */
  const harness = await openLibraryWorkScenario(page, { permissionKind: 'ontology-patch' });
  await harness.read(page);
  await harness.wait(page);
  const card = page.getByTestId('acp-permission-card');
  await expect(card).toBeVisible();
  // The card's mount moves focus inside it (the alertdialog contract); read where it opened.
  await expect.poll(() => card.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null),
  ).not.toBe('acp-permission-allow');
});
