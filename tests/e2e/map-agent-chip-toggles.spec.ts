import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

/**
 * **The agent chip closes what it opened** (map round, 2026-09-20).
 *
 * It wears the active tone, reports `aria-expanded`, and calls only
 * `openVaultAgent`. Measured with a folder open at 1512 wide: the first press
 * opened the dock and narrowed the map's canvas from 1448 to 1055, and every
 * press after that left `aria-expanded="true"` and the canvas at 1055. A
 * control that says "expanded" while ignoring the press is the same shape the
 * meaning-review chip had a few slots away.
 *
 * The dock keeps its own close button; this is the second way in, and the one
 * a person reaches for after pressing the chip to open it.
 */
test("에이전트 칩을 다시 누르면 닫히고, 지도가 폭을 되찾는다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click().catch(() => {});
  await waitForMapStill(page).catch(() => {});

  const chip = page.getByTestId("topology-vault-agent-toggle");
  const canvasWidth = () =>
    page.evaluate(() => Math.round(document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect().width));

  await expect(chip).toHaveAttribute("aria-expanded", "false");
  const wide = await canvasWidth();
  expect(wide, "지도가 이미 좁다 — 스펙이 공회전한다").toBeGreaterThan(1200);

  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await expect.poll(canvasWidth, { timeout: 10_000 }).toBeLessThan(wide - 100);

  await chip.click();
  await expect(chip, "다시 눌러도 열린 상태 그대로다").toHaveAttribute("aria-expanded", "false");
  await expect.poll(canvasWidth, { timeout: 10_000, message: "닫았는데 지도가 폭을 못 되찾았다" }).toBe(wide);
});
