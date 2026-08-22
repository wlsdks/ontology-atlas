import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * Does the first screen **show nearly all the nodes**?
 *
 * ## Why (2026-08-17)
 *
 * After building "hovering a node name in the chat highlights that node on the map",
 * this test came out of measuring the fact that **highlighting an off-screen node
 * shows nothing**. The count was 19 of 20 on screen — the first-screen fit
 * (`computeOverviewCameraTarget`) was doing its job.
 *
 * So this test stays as a **lock** on that property. If layout or the first-screen fit
 * drifts, the first screen goes empty, and being a canvas no check can see it while a
 * person reads it as "is it meant to look like this?".
 *
 * ⚠️ **Coordinate trap** — `__atlasMap.nodes()` already returns **screen
 * coordinates**. Applying the camera transform once more puts everything off screen,
 * and measuring that way really did produce a false "0 of 20" once.
 */

/** Minimum share that must be visible on the first screen. Measured 19/20 = 95%. */
const MIN_ON_SCREEN_RATIO = 0.8;

test("첫 화면이 노드를 거의 다 보여 준다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("topology-map-v2-canvas")).toBeVisible({ timeout: 30_000 });
  /*
   * Waits for layout to settle — counting while things move gives a different number
   * every run.
   *
   * ⚠️ This used to be `waitForTimeout(8_000)`. 8 seconds is **one machine's number**:
   * a slow machine counts while nodes are still moving and a fast one throws away 7
   * seconds. Settling is judged by **value**, not time — layout has settled when node
   * coordinates barely move between frames (full check audit, 2026-08-17).
   */
  await expect
    .poll(
      async () => {
        const sample = () =>
          page.evaluate(() => {
            const map = (
              window as unknown as { __atlasMap?: { nodes: () => Array<{ id: string; x: number; y: number }> } }
            ).__atlasMap;
            return map ? map.nodes().map((n) => `${n.id}:${Math.round(n.x)},${Math.round(n.y)}`).join("|") : "";
          });
        const before = await sample();
        await page.waitForTimeout(400);
        const after = await sample();
        return before !== "" && before === after;
      },
      { timeout: 60_000, message: "배치가 정착하지 않았다" },
    )
    .toBe(true);

  const census = await page.evaluate(() => {
    const map = (
      window as unknown as {
        __atlasMap?: {
          nodes: () => Array<{ id: string; x: number; y: number }>;
          camera: () => { x: number; y: number; scale: number; width: number; height: number } | null;
        };
      }
    ).__atlasMap;
    if (!map) return null;
    const cam = map.camera();
    if (!cam) return null;
    const nodes = map.nodes();
    // ⚠️ `nodes()` already returns **screen coordinates** (its implementation applies
    // the camera transform internally). Transforming again here puts everything off
    // screen — measuring that way really did produce a false "0 of 20 on screen".
    const inside = nodes.filter(
      (n) => n.x >= 0 && n.x <= cam.width && n.y >= 0 && n.y <= cam.height,
    );
    return { total: nodes.length, inside: inside.length, outside: nodes.length - inside.length, cam };
  });

  expect(census, "지도 창구가 안 열렸다 — 아무것도 못 쟀다").not.toBeNull();
  const { total, inside, outside } = census as { total: number; inside: number; outside: number };
  console.log(`[census] 노드 ${total} · 화면 안 ${inside} · 화면 밖 ${outside}`);
  expect(total, "노드를 하나도 못 읽었다 — 이 시험은 아무것도 못 잰다").toBeGreaterThan(3);
  expect(
    inside / total,
    `첫 화면이 노드의 ${Math.round((inside / total) * 100)}% 만 보여 준다 ` +
      `(화면 밖 ${outside}개). 첫 화면 맞춤이 어긋났거나 배치가 흩어졌다.`,
  ).toBeGreaterThanOrEqual(MIN_ON_SCREEN_RATIO);
});
