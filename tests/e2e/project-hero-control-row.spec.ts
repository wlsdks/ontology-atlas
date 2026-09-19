import { expect, test } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";

/**
 * The project page's hero control row, measured in the state the owner saw it in.
 *
 * On 2026-09-19 the owner read the row as crooked: with a folder open it drew "View topology"
 * filled, "Open review result" outlined and the quick-edit trigger as a bare `ghost` label, so
 * three weights stood in one row and the third had no box at all. The fix gives the trigger the
 * same outline as its sibling, which is a rendered fact rather than a source one — a variant prop
 * reads correct in the diff and still lands wrong if a class wins over it.
 *
 * So this measures what a person sees: every control the same height, sharing one baseline, and
 * exactly one of them filled.
 */
test("the hero's controls are one filled action and outline siblings, on one line", async ({ page }) => {
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  await page.goto("/en/project/fallback/?slug=storefront&guides=off");

  const heroButtons = page.locator("main header button");
  await expect(heroButtons.first()).toBeVisible({ timeout: 30_000 });

  const row = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("main header button")].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    return controls.map((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        label: (element.textContent ?? "").trim().slice(0, 24),
        height: Math.round(box.height),
        top: Math.round(box.top),
        background: style.backgroundColor,
        borderWidth: style.borderTopWidth,
      };
    });
  });

  expect(row.length, "the editable hero draws its three controls").toBeGreaterThanOrEqual(3);
  // One height, one baseline: a row whose members differ on either is the shape that reads as crooked.
  expect(new Set(row.map((control) => control.height)).size, `heights: ${JSON.stringify(row)}`).toBe(1);
  expect(new Set(row.map((control) => control.top)).size, `tops: ${JSON.stringify(row)}`).toBe(1);
  // Exactly one filled control. "Filled" is an opaque plane, not merely a background: the outline
  // variant carries `--color-overlay-1`, which is a 2% white wash and would count as filled under a
  // transparency test.
  const filled = row.filter((control) => {
    const alpha = /rgba\([^)]*,\s*([\d.]+)\)$/.exec(control.background);
    return alpha === null || Number(alpha[1]) === 1;
  });
  expect(filled.length, `filled: ${JSON.stringify(row)}`).toBe(1);
  // And no control is boxless — a bare label beside two boxes is the third weight the owner saw.
  expect(row.every((control) => parseFloat(control.borderWidth) > 0), `borders: ${JSON.stringify(row)}`).toBe(true);

  await page.screenshot({ path: ".claude/shots-2026-09-19/81-hero-row-editable.png" });
});
