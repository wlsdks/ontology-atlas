import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **Keyboard zoom and fit** (2026-09-02, `interaction/keyboard-zoom.ts`).
 *
 * The map answered only the wheel; every reference it is measured against
 * (Obsidian, Figma, tldraw) also zooms from the keyboard. This spec reads the
 * camera through `?e2e=1` rather than pixels: a zoom and a pan look alike on
 * screen, and only the scale says which one happened.
 */
async function readScale(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: { camera: () => { scale: number } | null } }).__atlasMap;
    return m?.camera()?.scale ?? Number.NaN;
  });
}

test("+ zooms in a step, - zooms out, 0 returns to the fit, and a modifier leaves the browser alone", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const canvas = page.locator('[data-testid="topology-map-v2-canvas"]');
  const box = (await canvas.boundingBox())!;
  // Focus the canvas on empty space near the bottom-right, away from nodes.
  await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60);
  await page.waitForTimeout(400);
  const start = await readScale(page);
  expect(Number.isFinite(start)).toBe(true);

  await page.keyboard.press("=");
  await page.waitForTimeout(700);
  const zoomedIn = await readScale(page);
  expect(zoomedIn, "「+」 뒤 스케일이 커져야 한다").toBeGreaterThan(start * 1.1);

  await page.keyboard.press("-");
  await page.waitForTimeout(700);
  const backDown = await readScale(page);
  expect(Math.abs(backDown - start), "「-」 는 「+」 를 되돌린다").toBeLessThan(start * 0.05);

  await page.keyboard.press("=");
  await page.keyboard.press("=");
  await page.waitForTimeout(700);
  await page.keyboard.press("0");
  await page.waitForTimeout(1000);
  const fitted = await readScale(page);
  expect(Math.abs(fitted - start), "「0」 은 처음의 맞춤으로 돌아온다").toBeLessThan(start * 0.05);

  await page.keyboard.press("Meta+=");
  await page.waitForTimeout(400);
  expect(Math.abs((await readScale(page)) - start), "⌘+ 는 브라우저의 것이다 — 지도가 확대되면 안 된다").toBeLessThan(start * 0.05);
});
