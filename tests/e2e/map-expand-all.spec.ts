import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **「모두 펼치기」가 주장한 수를 실제로 드러내는가** (2026-08-13 걷기에서 승격).
 *
 * `__atlasMap.chips()` 는 「칩이 24개 있다고 주장하는데 그리는 것은 1개였다」는
 * 전례 때문에 만든 관측 창구인데, 이 스펙 전까지 **소비자가 0** 이었다 — 검증
 * 하려고 만든 계기를 아무도 읽지 않으면 그 전례는 언제든 돌아온다.
 *
 * 재는 것 셋: ① 펼치면 보이는 노드가 주장한 자식 수만큼 늘고 chips 가
 * expanded/shownChildren 로 같은 말을 한다 ② 펼쳐진 자식들이 서로 겹치지
 * 않는다(반지름 합 기준 0쌍) ③ 같은 바가 「접기」로 되돌린다.
 *
 * 펼침 바는 DOM 이 아니라 캔버스에 그려지므로 좌표로 누른다 — 선택 후 카메라가
 * 움직이니 **선택 뒤에 좌표를 다시 받는다**(처음 좌표로 누르면 빗나간다, 실측).
 * 바의 y 오프셋은 줌을 따라 커지므로(다이브 후 -52→-75 실측) 고정값이
 * 아니라 **화면 반지름 + 32** 로 셈한다. 바가 이사가면 이 스펙이 큰 소리로
 * 죽고, 그때 오프셋 식을 함께 고친다.
 */
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

  const selected = await nodePos();
  await page.mouse.click(selected!.px, selected!.py - (selected!.r + 32));
  /*
   * ⚠️ 고정 1.6초 뒤 **재시도 없는** 수 비교였다 — 펼침이 아직 안 끝난
   * 기계에서는 수가 안 맞아 그냥 터진다. 값이 도달할 때까지 기다린다
   * (2026-08-17 검사 전수조사).
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

  // 펼쳐진 자식끼리 겹침 0 — 반지름 합보다 가까운 쌍이 없다.
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

  // 같은 바가 이제 「접기」다 — 눌러서 원상 복귀까지 잰다.
  const expanded = await nodePos();
  await page.mouse.click(expanded!.px, expanded!.py - (expanded!.r + 32));
  await expect
    .poll(visibleCount, { timeout: 20_000, message: "접기가 원상 복귀하지 않았다" })
    .toBe(before);
});
