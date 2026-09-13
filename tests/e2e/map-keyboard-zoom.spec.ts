import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapSettled, waitForMapStill } from "./settle";

/**
 * **Keyboard zoom and fit** (2026-09-02, `interaction/keyboard-zoom.ts`).
 *
 * The map answered only the wheel; every reference it is measured against
 * (Obsidian, Figma, tldraw) also zooms from the keyboard. This spec reads the
 * camera through `?e2e=1` rather than pixels: a zoom and a pan look alike on
 * screen, and only the scale says which one happened.
 *
 * Every wait here is the camera spring coming to rest, never a duration
 * (`.claude/rules/testing.md`, the timing rule): a zoom step is over when the
 * scale stops changing, which is the same event on any machine.
 */
async function readScale(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: { camera: () => { scale: number } | null } }).__atlasMap;
    return m?.camera()?.scale ?? Number.NaN;
  });
}

/**
 * Where the camera is **heading**. The keyboard handler sets this synchronously on
 * the key event, so it answers "did this keystroke command a zoom" with no wait at
 * all — which is the only honest way to assert that a keystroke did *nothing*.
 */
async function readTargetScale(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: { cameraTarget?: () => { scale: number } | null } }).__atlasMap;
    return m?.cameraTarget?.()?.scale ?? Number.NaN;
  });
}

test("+ zooms in a step, - zooms out, 0 returns to the fit, and a modifier leaves the browser alone", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
  const canvas = page.locator('[data-testid="ontology-map-canvas"]');
  const box = (await canvas.boundingBox())!;
  // Focus the canvas on empty space near the bottom-right, away from nodes.
  await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60);
  await waitForMapStill(page, { what: "camera" });
  const start = await readScale(page);
  expect(Number.isFinite(start)).toBe(true);

  await page.keyboard.press("=");
  await waitForMapStill(page, { what: "camera" });
  const zoomedIn = await readScale(page);
  expect(zoomedIn, "「+」 뒤 스케일이 커져야 한다").toBeGreaterThan(start * 1.1);

  await page.keyboard.press("-");
  await waitForMapStill(page, { what: "camera" });
  const backDown = await readScale(page);
  expect(Math.abs(backDown - start), "「-」 는 「+」 를 되돌린다").toBeLessThan(start * 0.05);

  await page.keyboard.press("=");
  await page.keyboard.press("=");
  await waitForMapStill(page, { what: "camera" });
  await page.keyboard.press("0");
  await waitForMapStill(page, { what: "camera" });
  const fitted = await readScale(page);
  expect(Math.abs(fitted - start), "「0」 은 처음의 맞춤으로 돌아온다").toBeLessThan(start * 0.05);

  /*
   * ⌘+ belongs to the browser. Sleeping and then finding the scale unchanged would
   * only prove the sleep was long enough for nothing to happen; the **target** is
   * set inside the key handler, so a commanded zoom is already visible here the
   * moment `press` resolves, and an unchanged target is the real absence.
   */
  const targetBefore = await readTargetScale(page);
  await page.keyboard.press("Meta+=");
  expect(
    await readTargetScale(page),
    "⌘+ 는 브라우저의 것이다 — 지도 카메라가 확대를 겨냥하면 안 된다",
  ).toBeCloseTo(targetBefore, 5);
  await waitForMapStill(page, { what: "camera" });
  expect(Math.abs((await readScale(page)) - start), "⌘+ 뒤에도 스케일은 그대로다").toBeLessThan(start * 0.05);
});
