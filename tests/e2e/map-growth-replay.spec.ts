import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **Growth replay** (2026-09-02, `model/growth-replay.ts`; toggle semantics 2026-09-07).
 *
 * Pixels cannot tell "appearing in order" from "already there", so this spec
 * reads the idle gate's own activity names through `?e2e=1`: while the replay
 * runs, `growthReplaying` is what keeps the frame awake, and once it ends the
 * name is gone.
 *
 * The rule it holds: **the control is a toggle, not a hold.** The owner's report
 * (2026-09-07) was that moving or scrolling the mouse killed a replay they had
 * just asked for — *"nobody keeps the mouse still after pressing a button"*. So
 * pointer movement and wheel-zoom must leave it running, the tile must wear the
 * active state (`aria-pressed`) while it does, and a second press must stop it.
 */
type LastActive = { t: number; causes: string[] } | null;

async function lastActiveCauses(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: { idleDebug: () => { lastActive: { causes: string[] } | null } } }).__atlasMap;
    return m?.idleDebug().lastActive?.causes ?? [];
  });
}

/** When the idle gate last recorded an awake frame, in the page's own clock. */
async function lastActiveStamp(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: { idleDebug: () => { lastActive: LastActive } } }).__atlasMap;
    return m?.idleDebug().lastActive?.t ?? 0;
  });
}

/**
 * The activity names from a frame the gate recorded **after** `since`.
 *
 * This is what "the replay survived that input" needs and a sleep cannot give:
 * polling for `growthReplaying` would pass on the value recorded *before* the
 * input, so it would stay green against exactly the regression this spec exists
 * for. Requiring a fresh stamp first means the answer comes from a frame that has
 * already seen the pointer move — and the kill, when there is one, happens in the
 * event handler, so one such frame is the whole condition.
 */
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

  // Moving and wheel-zooming must NOT end it — this is the whole point of the toggle.
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

  // A second press stops it, and the control returns to rest.
  await tile.click();
  await expect
    .poll(() => lastActiveCauses(page), { message: "두 번째 누름으로 재생이 끝난다" })
    .not.toContain("growthReplaying");
  await expect(tile, "멈추면 컨트롤도 쉰다").toHaveAttribute("aria-pressed", "false");
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
  await expect.poll(() => lastActiveCauses(page), { message: "Esc 로 재생이 끝난다" }).not.toContain("growthReplaying");
  await expect(tile).toHaveAttribute("aria-pressed", "false");

  // A press on the canvas is a deliberate "look at this instead" — including on
  // empty ground, which no selection callback would have reported.
  await tile.click();
  await expect.poll(() => lastActiveCauses(page)).toContain("growthReplaying");
  const canvas = page.locator('[data-testid="ontology-map-canvas"]');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60);
  await expect
    .poll(() => lastActiveCauses(page), { message: "캔버스를 누르면 재생이 끝난다" })
    .not.toContain("growthReplaying");
  await expect(tile).toHaveAttribute("aria-pressed", "false");
});
