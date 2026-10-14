import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";

/**
 * Both path ends take the top label band, since a greedy placer would otherwise hand the
 * space to the domain and project before the capability.
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
  // The lens ramps its ends up on its own clock; poll until both have arrived at full ink.
  await expect
    .poll(async () => {
      const state = await read();
      return Math.min(state.from?.alpha ?? 0, state.to?.alpha ?? 0);
    }, { timeout: 15_000, message: "경로의 끝이 온전한 잉크로 그려지지 않았다" })
    .toBeGreaterThan(0.8);

  await expect
    .poll(async () => [(await read()).from?.named, (await read()).to?.named], {
      timeout: 15_000,
      message: "경로의 양 끝 중 이름이 없는 쪽이 있다",
    })
    .toEqual([true, true]);
});
