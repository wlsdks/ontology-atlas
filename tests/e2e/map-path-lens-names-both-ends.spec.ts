import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **A path names both of its ends** (map round, 2026-09-20).
 *
 * Asking how one concept reaches another opens the path lens: the two ends and
 * the line between them keep full ink and everything else sinks. Measured
 * before the fix on `mode=path` from the exchange-request capability to the
 * stock-reservation one: both ends were drawn at full alpha, the origin was
 * named, and **the destination was not** — it sits inside the inventory
 * domain's expanded disc, where the greedy placer hands the space to the
 * domain (priority 3) and the project (2) before a capability (4). The path's
 * nodes are the subject of the question, so they now take the top band, the
 * same one the constellation lens already had.
 */
type Probe = {
  nodes: () => Array<{ id: string; hidden: boolean; alpha: number }>;
  labels: () => Array<{ nodeId: string }>;
};
const FROM = "capability:exchange-request";
const TO = "capability:stock-reservation";

test("경로는 두 끝의 이름을 모두 보여준다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 806 });
  await seedFirstRunSeen(page);
  await page.goto(
    `/ko/topology/?e2e=1&guides=off&mode=path&pathFrom=${encodeURIComponent(FROM)}&pathTo=${encodeURIComponent(TO)}`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForFunction(() => Boolean((window as unknown as { __atlasMap?: unknown }).__atlasMap), null, { timeout: 30_000 });
  await waitForMapStill(page, { what: "camera" });

  const read = () =>
    page.evaluate(
      ([from, to]) => {
        const m = (window as unknown as { __atlasMap: Probe }).__atlasMap;
        const named = new Set(m.labels().map((l) => l.nodeId));
        const node = (id: string) => m.nodes().find((n) => n.id === id) ?? null;
        return {
          from: node(from) && { drawn: !node(from)!.hidden, alpha: node(from)!.alpha, named: named.has(from) },
          to: node(to) && { drawn: !node(to)!.hidden, alpha: node(to)!.alpha, named: named.has(to) },
        };
      },
      [FROM, TO],
    );

  // The lens found the path: both ends are on the map at full ink.
  await expect.poll(async () => (await read()).to?.drawn, { timeout: 15_000, message: "경로의 끝이 지도에 없다" }).toBe(true);
  const state = (await read())!;
  expect(state.from!.alpha).toBeGreaterThan(0.8);
  expect(state.to!.alpha).toBeGreaterThan(0.8);

  await expect
    .poll(async () => [(await read()).from?.named, (await read()).to?.named], {
      timeout: 15_000,
      message: "경로의 양 끝 중 이름이 없는 쪽이 있다",
    })
    .toEqual([true, true]);
});
