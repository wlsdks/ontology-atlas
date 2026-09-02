import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **Growth replay** (2026-09-02, `model/growth-replay.ts`).
 *
 * Pixels cannot tell "appearing in order" from "already there", so this spec
 * reads the idle gate's own activity names through `?e2e=1`: while the replay
 * runs, `growthReplaying` is what keeps the frame awake, and once it ends the
 * name is gone. The first input ends it early, which is the safety catch that
 * keeps a twelve-second event from ever holding the map hostage.
 */
async function lastActiveCauses(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: { idleDebug: () => { lastActive: { causes: string[] } | null } } }).__atlasMap;
    return m?.idleDebug().lastActive?.causes ?? [];
  });
}

test("the play tile replays the ontology, the idle gate names it, and a click ends it early", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const tile = page.locator('[data-testid="topology-replay-growth"]');
  await expect(tile).toBeVisible();
  await tile.click();
  await page.waitForTimeout(1500);
  expect(await lastActiveCauses(page), "재생 중에는 유휴 게이트가 재생을 이름으로 부른다").toContain("growthReplaying");

  // The first input after the starting click ends the replay.
  const canvas = page.locator('[data-testid="topology-map-v2-canvas"]');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60);
  await page.waitForTimeout(600);
  expect(await lastActiveCauses(page), "입력 하나로 재생이 끝난다").not.toContain("growthReplaying");
});
