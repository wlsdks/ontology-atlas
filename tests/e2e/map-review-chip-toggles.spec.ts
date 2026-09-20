import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **The review chip wears an on-state, so it has to report one and mean it**
 * (map round, 2026-09-20).
 *
 * `HomePage` states the rule beside a neighbouring control: a control may wear
 * the active tone and `aria-pressed` for exactly as long as the thing it names
 * is on. The meaning-review chip wore the tone and reported nothing, and its
 * handler only ever opened. Measured on the live map with the panel open:
 * three presses in a row left the panel present, the canvas at 928px, and no
 * pressed state on the chip — a lit control that does nothing when pressed.
 */
test("의미 검토 칩은 자기 상태를 말하고, 다시 누르면 닫힌다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page, { what: "camera" });

  const chip = page.getByTestId("topology-meaning-workbench-toggle");
  const panel = page.getByTestId("analysis-workbench");
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(panel).toHaveCount(0);

  await chip.click();
  await expect(panel).toBeVisible();
  await expect(chip, "패널이 열렸는데 칩이 눌린 상태를 말하지 않는다").toHaveAttribute("aria-pressed", "true");

  // The same press closes it: a lit control that ignores a press is not a control.
  await chip.click();
  await expect(panel).toHaveCount(0);
  await expect(chip).toHaveAttribute("aria-pressed", "false");

  // The map gets its width back when the panel goes.
  const width = await page.evaluate(() => document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(1200);
});
