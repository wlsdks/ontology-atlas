import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

test("모두 펼치기는 주장한 수를 드러내고, 접기로 되돌린다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off&realm=project%3Astorefront", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId("topology-realm-chip")).toBeVisible();
  await waitForMapStill(page);

  const nodePos = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __atlasMap?: { nodes: () => Array<{ hidden: boolean; label: string; x: number; y: number; radius: number }> } }).__atlasMap;
      const box = document.querySelector('[data-testid="ontology-map-canvas"]')?.getBoundingClientRect();
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
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __atlasMap: { selection: () => { nodeId: string | null } } }).__atlasMap.selection().nodeId), {
      timeout: 15_000,
      message: "주문 도메인이 선택되지 않았다",
    })
    .toBe("domain:order");
  await waitForMapStill(page);

  const before = await visibleCount();
  const chipBefore = await orderChip();
  expect(chipBefore, "주문 칩이 없다 — chips() 창구가 죽었다").not.toBeNull();
  expect(chipBefore!.expanded).toBe(false);
  expect(chipBefore!.claimedCount).toBeGreaterThan(0);

  await waitForMapStill(page);
  const selected = await nodePos();
  await page.mouse.click(selected!.px, selected!.py - (selected!.r + 32));
  await expect
    .poll(async () => (await visibleCount()) - before, {
      timeout: 20_000,
      message: "펼침이 주장한 수만큼 드러내지 않았다",
    })
    .toBe(chipBefore!.claimedCount);
  const chipAfter = await orderChip();
  expect(chipAfter!.expanded).toBe(true);
  expect(chipAfter!.shownChildren, "chips 가 화면과 다른 말을 한다").toBe(chipBefore!.claimedCount);

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

  await waitForMapStill(page);
  const expanded = await nodePos();
  await page.mouse.click(expanded!.px, expanded!.py - (expanded!.r + 32));
  await expect
    .poll(visibleCount, { timeout: 20_000, message: "접기가 원상 복귀하지 않았다" })
    .toBe(before);
});
