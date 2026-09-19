import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **A double-click opens a node's children instead of undoing the click**
 * (map round, 2026-09-19).
 *
 * Measured before the fix on the order domain: two pointer taps within the
 * double-click window selected the node and then deselected it — the map ended
 * with nothing selected, the chip still folded, and the person's most natural
 * "open this" gesture had done nothing. Now the second tap of a double-click
 * keeps the selection and toggles the parent's cluster, the same act as pressing
 * its `+N` chip. A second quick tap on a node without children keeps the
 * selection too: a repeated click never becomes an undo.
 */
type Probe = {
  nodes: () => Array<{ hidden: boolean; label: string; x: number; y: number }>;
  chips: () => Array<{ parentId: string; claimedCount: number; expanded: boolean; shownChildren: number }>;
  selection: () => { nodeId: string | null };
};
const probe = (page: import("@playwright/test").Page) => ({
  nodePos: () =>
    page.evaluate(() => {
      const m = (window as unknown as { __atlasMap: Probe }).__atlasMap;
      const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
      const n = m.nodes().find((n) => !n.hidden && n.label === "주문");
      return n ? { px: box.left + n.x, py: box.top + n.y } : null;
    }),
  orderChip: () => page.evaluate(() => (window as unknown as { __atlasMap: Probe }).__atlasMap.chips().find((c) => c.parentId === "domain:order") ?? null),
  selected: () => page.evaluate(() => (window as unknown as { __atlasMap: Probe }).__atlasMap.selection().nodeId),
});

test("더블클릭은 자식을 펼치고 선택을 지키지, 선택을 되돌리지 않는다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await waitForMapStill(page);
  const { nodePos, orderChip, selected } = probe(page);

  const at = await nodePos();
  expect(at, "주문 도메인을 지도에서 못 찾았다").not.toBeNull();
  const before = await orderChip();
  expect(before, "주문 칩이 없다 — chips() 창구가 죽었다").not.toBeNull();
  expect(before!.expanded).toBe(false);

  await page.mouse.dblclick(at!.px, at!.py);

  await expect.poll(async () => (await orderChip())?.expanded, { timeout: 20_000, message: "더블클릭이 주문의 자식을 펼치지 않았다" }).toBe(true);
  await expect.poll(async () => (await orderChip())?.shownChildren, { timeout: 20_000 }).toBe(before!.claimedCount);
  expect(await selected(), "더블클릭의 두 번째 탭이 선택을 되돌렸다").toBe("domain:order");

  // Double-clicking the same node again folds it back — the chip's own act, mirrored.
  await waitForMapStill(page);
  const again = await nodePos();
  await page.mouse.dblclick(again!.px, again!.py);
  await expect.poll(async () => (await orderChip())?.expanded, { timeout: 20_000, message: "두 번째 더블클릭이 접지 않았다" }).toBe(false);
  expect(await selected()).toBe("domain:order");
});
