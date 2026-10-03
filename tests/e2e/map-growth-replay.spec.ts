import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill, waitFrames } from "./settle";

type LastActive = { t: number; causes: string[] } | null;

async function lastActiveCauses(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: { idleDebug: () => { lastActive: { causes: string[] } | null } } }).__atlasMap;
    return m?.idleDebug().lastActive?.causes ?? [];
  });
}

async function lastActiveStamp(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: { idleDebug: () => { lastActive: LastActive } } }).__atlasMap;
    return m?.idleDebug().lastActive?.t ?? 0;
  });
}

async function causesAfter(page: import("@playwright/test").Page, since: number): Promise<string[]> {
  await page.waitForFunction(
    (stamp) => {
      const m = (window as unknown as { __atlasMap?: { idleDebug: () => { lastActive: LastActive } } }).__atlasMap;
      const recorded = m?.idleDebug().lastActive;
      return recorded !== null && recorded !== undefined && recorded.t > stamp;
    },
    since,
    { polling: "raf", timeout: 15_000 },
  );
  return lastActiveCauses(page);
}

async function causesSince(page: import("@playwright/test").Page, since: number): Promise<string[]> {
  await waitFrames(page, 2);
  return page.evaluate((stamp) => {
    const recorded = (window as unknown as { __atlasMap?: { idleDebug: () => { lastActive: LastActive } } }).__atlasMap?.idleDebug().lastActive;
    return recorded && recorded.t > stamp ? recorded.causes : [];
  }, since);
}

test("the play tile toggles the replay, survives pointer input, and stops on a second press", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page);

  const tile = page.locator('[data-testid="topology-replay-growth"]');
  await expect(tile).toBeVisible();
  await expect(tile, "쉬는 동안에는 눌린 상태가 아니다").toHaveAttribute("aria-pressed", "false");

  await tile.click();
  await expect
    .poll(() => lastActiveCauses(page), { message: "재생 중에는 유휴 게이트가 재생을 이름으로 부른다" })
    .toContain("growthReplaying");
  await expect(tile, "재생 중에는 컨트롤이 눌린 상태다").toHaveAttribute("aria-pressed", "true");

  const canvas = page.locator('[data-testid="ontology-map-canvas"]');
  const box = (await canvas.boundingBox())!;
  const beforeInput = await lastActiveStamp(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30);
  await page.mouse.wheel(0, -120);
  expect(await causesAfter(page, beforeInput), "마우스를 움직이고 휠을 굴려도 재생은 계속된다").toContain(
    "growthReplaying",
  );
  await expect(tile, "움직였다고 눌린 상태가 풀리지 않는다").toHaveAttribute("aria-pressed", "true");

  await tile.click();
  await expect(tile, "멈추면 컨트롤도 쉰다").toHaveAttribute("aria-pressed", "false");
  const stopped = await page.evaluate(() => performance.now());
  expect(await causesSince(page, stopped), "두 번째 누름으로 재생이 끝난다").not.toContain("growthReplaying");
});

test("Escape and a press on the canvas each end a running replay", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page);

  const tile = page.locator('[data-testid="topology-replay-growth"]');
  await tile.click();
  await expect.poll(() => lastActiveCauses(page)).toContain("growthReplaying");
  await page.keyboard.press("Escape");
  await expect(tile).toHaveAttribute("aria-pressed", "false");
  const escaped = await page.evaluate(() => performance.now());
  expect(await causesSince(page, escaped), "Esc 로 재생이 끝난다").not.toContain("growthReplaying");

  await tile.click();
  await expect.poll(() => lastActiveCauses(page)).toContain("growthReplaying");
  const canvas = page.locator('[data-testid="ontology-map-canvas"]');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60);
  await expect(tile).toHaveAttribute("aria-pressed", "false");
  const pressed = await page.evaluate(() => performance.now());
  expect(await causesSince(page, pressed), "캔버스를 누르면 재생이 끝난다").not.toContain("growthReplaying");
});
