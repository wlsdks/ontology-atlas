import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **Does "expand all" actually reveal the count it claims** (promoted from the
 * 2026-08-13 walkthrough).
 *
 * `__atlasMap.chips()` is the observation window built after the precedent of
 * "claiming 24 chips while drawing 1", and until this spec it had **0 consumers** —
 * an instrument built for verification that nobody reads lets that precedent return
 * at any time.
 *
 * Three things measured: ① expanding increases the visible nodes by the claimed
 * child count and chips reports the same through expanded/shownChildren ② expanded
 * children do not overlap each other (0 pairs closer than the sum of their radii)
 * ③ the same bar reverses it as "collapse".
 *
 * The expand bar is drawn on the canvas rather than in the DOM, so it is clicked by
 * coordinate — and since the camera moves after selection, **the coordinates are
 * re-read after selecting** (clicking the original coordinates misses, measured).
 * The bar's y offset grows with zoom (measured -52 → -75 after a dive), so it is
 * computed as **screen radius + 32** rather than a fixed value. If the bar moves,
 * this spec dies loudly and the offset formula is fixed with it.
 */
/**
 * Waits for layout to settle — **until coordinates stop changing between frames.**
 *
 * ⚠️ Why it is needed (learned 2026-08-17 while fixing a regression introduced
 * here). Replacing a fixed 1.6s wait with polling "until the count matches" made
 * collapse fail in CI (expected 36, got 50). The count passes the instant it
 * matches, but **the camera and nodes are still moving**, so click coordinates
 * measured in that window were stale by the time the click arrived and landed on
 * empty space. That is the work the fixed wait had been doing by accident.
 *
 * So count and position are awaited separately — the count is what was revealed, the
 * position is where the next click will land.
 */
async function settleLayout(page: import("@playwright/test").Page) {
  const snapshot = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __atlasMap?: { nodes: () => Array<{ id: string; x: number; y: number }> } })
        .__atlasMap;
      return m ? m.nodes().map((n) => `${n.id}:${Math.round(n.x)},${Math.round(n.y)}`).join("|") : "";
    });
  await expect
    .poll(
      async () => {
        const before = await snapshot();
        await page.waitForTimeout(250);
        return before !== "" && before === (await snapshot());
      },
      { timeout: 30_000, message: "배치가 멈추지 않아 클릭 좌표를 믿을 수 없다" },
    )
    .toBe(true);
}

test("모두 펼치기는 주장한 수를 드러내고, 접기로 되돌린다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);

  const nodePos = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __atlasMap?: { nodes: () => Array<{ hidden: boolean; label: string; x: number; y: number; radius: number }> } }).__atlasMap;
      const box = document.querySelector('[data-testid="topology-map-v2-canvas"]')?.getBoundingClientRect();
      const n = m?.nodes().find((n) => !n.hidden && n.label === "주문");
      return n && box ? { px: box.left + n.x, py: box.top + n.y, r: n.radius } : null;
    });
  const visibleCount = () =>
    page.evaluate(
      () => (window as unknown as { __atlasMap: { nodes: () => Array<{ hidden: boolean }> } }).__atlasMap.nodes().filter((n) => !n.hidden).length,
    );
  const orderChip = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __atlasMap: { chips: () => Array<{ parentId: string; claimedCount: number; expanded: boolean; shownChildren: number }> } }).__atlasMap;
      return m.chips().find((c) => c.parentId === "domain:order") ?? null;
    });

  const first = await nodePos();
  expect(first, "주문 도메인을 지도에서 못 찾았다 — 이 스펙이 공회전한다").not.toBeNull();
  await page.mouse.click(first!.px, first!.py);
  await page.waitForTimeout(1200);

  const before = await visibleCount();
  const chipBefore = await orderChip();
  expect(chipBefore, "주문 칩이 없다 — chips() 창구가 죽었다").not.toBeNull();
  expect(chipBefore!.expanded).toBe(false);
  expect(chipBefore!.claimedCount).toBeGreaterThan(0);

  await settleLayout(page);
  const selected = await nodePos();
  await page.mouse.click(selected!.px, selected!.py - (selected!.r + 32));
  /*
   * ⚠️ This used to be a count comparison **with no retry** after a fixed 1.6s — on a
   * machine where the expansion had not finished, the count simply did not match and
   * it failed. It now waits for the value to arrive (full check audit, 2026-08-17).
   */
  await expect
    .poll(async () => (await visibleCount()) - before, {
      timeout: 20_000,
      message: "펼침이 주장한 수만큼 드러내지 않았다",
    })
    .toBe(chipBefore!.claimedCount);
  const chipAfter = await orderChip();
  expect(chipAfter!.expanded).toBe(true);
  expect(chipAfter!.shownChildren, "chips 가 화면과 다른 말을 한다").toBe(chipBefore!.claimedCount);

  // Zero overlap among expanded children — no pair is closer than the sum of their radii.
  const overlapPairs = await page.evaluate(() => {
    const m = (window as unknown as { __atlasMap: { nodes: () => Array<{ hidden: boolean; x: number; y: number; radius: number }> } }).__atlasMap;
    const nodes = m.nodes().filter((n) => !n.hidden && n.radius > 0);
    let pairs = 0;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius) pairs += 1;
      }
    }
    return pairs;
  });
  expect(overlapPairs, "펼쳐진 노드가 서로 겹쳤다").toBe(0);

  // The same bar is now "collapse" — press it and measure the return to the original
  // state. Layout must settle before coordinates are measured (see `settleLayout`
  // above).
  await settleLayout(page);
  const expanded = await nodePos();
  await page.mouse.click(expanded!.px, expanded!.py - (expanded!.r + 32));
  await expect
    .poll(visibleCount, { timeout: 20_000, message: "접기가 원상 복귀하지 않았다" })
    .toBe(before);
});

test("상단 전체 펼치기는 전 노드를 드러내고 자동으로 화면 안에 맞춘다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("demo:sample-source:v1", "dogfood");
  });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => window.__atlasMap?.nodes().length ?? 0), {
      timeout: 20_000,
      message: "전 노드 검사가 읽을 지도 계기가 없다",
    })
    .toBeGreaterThan(20);

  const action = page.getByTestId("topology-expand-all");
  await expect(action).toBeVisible();
  await action.click();
  await expect(page.getByTestId("topology-map-v2")).toHaveAttribute("data-map-lens", "all");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const nodes = window.__atlasMap?.nodes() ?? [];
          return nodes.length > 0 && nodes.every((node) => !node.hidden);
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  await settleLayout(page);

  const offscreen = await page.evaluate(() => {
    const map = document.querySelector<HTMLElement>('[data-testid="topology-map-v2"]');
    const nodes = window.__atlasMap?.nodes().filter((node) => !node.hidden) ?? [];
    if (!map || nodes.length === 0) return -1;
    const box = map.getBoundingClientRect();
    return nodes.filter(
      (node) =>
        node.x - node.radius < 0 ||
        node.y - node.radius < 0 ||
        node.x + node.radius > box.width ||
        node.y + node.radius > box.height,
    ).length;
  });
  expect(offscreen, "전체 펼치기 뒤 화면 밖에 남은 노드가 있다").toBe(0);

  await action.click();
  await expect(page.getByTestId("topology-map-v2")).not.toHaveAttribute("data-map-lens");
});
