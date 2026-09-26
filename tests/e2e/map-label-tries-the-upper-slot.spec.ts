import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

/**
 * **A name blocked below tries the slot above before it is dropped** (map
 * round, 2026-09-20).
 *
 * The greedy placer walks the candidates by priority and drops any whose box
 * overlaps one already placed — with no second attempt, however much room sits
 * beside it. Measured on a folder of 20 concepts at 1512x982 with every group
 * opened: the map used 49% of the canvas width and still drew one capability
 * without its name, beaten by a neighbour 49 px away while its own upper slot
 * was clear. The frame already computes that upper slot for every node (it is
 * what "blocked below, flip above" uses against reserved discs); the placer
 * now takes it as a fallback.
 */
test("펼친 지도에서 이름을 잃는 개념이 없다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click().catch(() => {});
  await waitForMapStill(page);
  await page.getByTestId("topology-expand-all").click();
  // The expansion is on; then the opened map and its camera come to rest.
  await expect(page.getByTestId("topology-expand-all")).toHaveAttribute("aria-pressed", "true");
  await waitForMapStill(page);
  await waitForMapStill(page, { what: "camera" });

  const read = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __atlasMap: { nodes: () => Array<{ id: string; label: string; hidden: boolean; alpha: number }>; labels: () => Array<{ nodeId: string }> } }).__atlasMap;
      const named = new Set(m.labels().map((l) => l.nodeId));
      const drawn = m.nodes().filter((n) => !n.hidden && n.alpha > 0.02);
      return { drawn: drawn.length, missing: drawn.filter((n) => !named.has(n.id)).map((n) => n.label) };
    });

  const state = await read();
  expect(state.drawn, "펼쳐도 노드가 몇 개 없다 — 스펙이 공회전한다").toBeGreaterThan(15);
  await expect
    .poll(async () => (await read()).missing, { timeout: 15_000, message: "이름을 잃은 개념" })
    .toEqual([]);
});
