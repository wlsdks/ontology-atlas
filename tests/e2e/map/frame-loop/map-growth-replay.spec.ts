import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill, waitFrames } from "../../settle";

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

async function expectReplayOver(page: import("@playwright/test").Page, message: string): Promise<void> {
  await expect
    .poll(async () => causesSince(page, await page.evaluate(() => performance.now())), { message })
    .not.toContain("growthReplaying");
}

type FlatNames = { owns: boolean; texts: { id: string; role: string }[]; clusters: { domainId: string; capabilityIds: string[] }[] };
type ReplayFrame = { pressed: boolean; named: string[] };
type ReplayWindow = { __atlasMap: { dial: () => FlatNames }; __replayFrames: ReplayFrame[]; __replayRecording: boolean };

async function openFlat(page: import("@playwright/test").Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  await page.goto("/en/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as unknown as Partial<ReplayWindow>).__atlasMap?.dial?.()?.owns === true, undefined, { timeout: 90_000 });
  await waitForMapStill(page);
}

/** Records, every painted frame, which concepts the Flat map names and whether the tile is pressed. */
async function recordNamedConcepts(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as ReplayWindow;
    const tile = document.querySelector('[data-testid="topology-replay-growth"]');
    w.__replayFrames = [];
    w.__replayRecording = true;
    const frame = () => {
      const named = w.__atlasMap.dial().texts.filter((t) => t.role === "domain" || t.role === "capability").map((t) => t.id);
      w.__replayFrames.push({ pressed: tile?.getAttribute("aria-pressed") === "true", named });
      if (w.__replayRecording) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

async function namedDomains(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as ReplayWindow).__atlasMap.dial().texts.filter((t) => t.role === "domain").map((t) => t.id).sort());
}

test("on the Flat map the replay clears every name and brings each domain back before its capabilities", async ({ page }) => {
  test.setTimeout(120_000);
  await openFlat(page);
  const clusters = await page.evaluate(() => (window as unknown as ReplayWindow).__atlasMap.dial().clusters);
  const domains = clusters.map((c) => c.domainId).sort();
  expect(domains.length, "the sample has more than one domain to order").toBeGreaterThan(1);
  expect(await namedDomains(page), "every domain is named at rest").toEqual(domains);

  const tile = page.locator('[data-testid="topology-replay-growth"]');
  await recordNamedConcepts(page);
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await page.waitForFunction(
    () => document.querySelector('[data-testid="topology-replay-growth"]')?.getAttribute("aria-pressed") === "false",
    undefined,
    { polling: "raf", timeout: 60_000 },
  );
  const frames = await page.evaluate(() => {
    const w = window as unknown as ReplayWindow;
    w.__replayRecording = false;
    return w.__replayFrames;
  });

  const cleared = frames.findIndex((f) => f.pressed && f.named.length === 0);
  expect(cleared, "a frame of the replay names no domain and no capability").toBeGreaterThanOrEqual(0);
  const firstNamed = (id: string): number => frames.findIndex((f, i) => i > cleared && f.named.includes(id));
  const domainFrames = domains.map(firstNamed);
  expect(domainFrames.every((i) => i > cleared), "every domain is named again").toBe(true);
  expect(new Set(domainFrames).size, "the domains come back one after another, not in one frame").toBe(domains.length);
  for (const cluster of clusters) {
    const born = firstNamed(cluster.domainId);
    for (const capability of cluster.capabilityIds) {
      const at = firstNamed(capability);
      if (at >= 0) expect(at, `${capability} is named after its domain ${cluster.domainId}`).toBeGreaterThanOrEqual(born);
    }
  }
  expect(await namedDomains(page), "every domain is named once the replay is over").toEqual(domains);
});

test("stopping the Flat replay midway brings every domain's name back", async ({ page }) => {
  test.setTimeout(120_000);
  await openFlat(page);
  const domains = await namedDomains(page);
  const tile = page.locator('[data-testid="topology-replay-growth"]');
  await tile.click();
  await expect.poll(() => namedDomains(page), { message: "the replay clears the domains' names" }).toEqual([]);
  await tile.click();
  await expect(tile, "the tile rests at once").toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => namedDomains(page), { message: "every domain is named again after the stop" }).toEqual(domains);
  await expectReplayOver(page, "the loop rests once the map has risen back");
});

test("the replay tile is offered only on the views that replay", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  const tile = page.locator('[data-testid="topology-replay-growth"]');
  for (const view of ["hex", "neural"]) {
    await page.goto(`/en/topology/?e2e=1&guides=off&view=${view}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid="topology-fit-control"]'), `${view} shows the map utilities`).toBeVisible();
    await expect(tile, `${view} draws no appear ramp, so it offers no replay`).toHaveCount(0);
  }
  await page.goto("/en/topology/?e2e=1&guides=off&view=3d", { waitUntil: "domcontentloaded" });
  await expect(tile, "the 3D tree replays its growth").toBeVisible();
});

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
  await expectReplayOver(page, "the second press ends the replay once the map has risen back");
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
  await expectReplayOver(page, "Escape ends the replay once the map has risen back");

  await tile.click();
  await expect.poll(() => lastActiveCauses(page)).toContain("growthReplaying");
  const canvas = page.locator('[data-testid="ontology-map-canvas"]');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60);
  await expect(tile).toHaveAttribute("aria-pressed", "false");
  await expectReplayOver(page, "a press on the canvas ends the replay once the map has risen back");
});
