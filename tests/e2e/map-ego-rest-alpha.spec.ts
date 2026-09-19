import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **What the ego focus dims actually recedes** (map round, 2026-09-20).
 *
 * Selecting a capability keeps its neighbours opaque and "dims" everything
 * else, but the dim was a colour ramp only: the dimmed stroke differs from the
 * normal stroke by 1.37:1 and the dimmed fill is lighter than the normal fill,
 * so three sibling capabilities beside the selection drew as bright, nameless
 * circles a person could not tell from the ego members. Dimmed nodes now sink
 * to `--map-ego-rest-alpha` on the same ramp the colour uses; ego members stay
 * at 1.
 */
type Probe = {
  nodes: () => Array<{ id: string; hidden: boolean; alpha: number }>;
  selection: () => { nodeId: string | null };
};
const alphas = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: Probe }).__atlasMap;
    if (!m) return null;
    const a = (id: string) => m.nodes().find((n) => n.id === id)?.alpha ?? null;
    return {
      selection: m.selection().nodeId,
      focus: a("capability:exchange-request"),
      neighbour: a("capability:return-request"),
      parent: a("domain:support"),
      siblings: [a("capability:faq"), a("capability:inquiry"), a("capability:refund-review")],
      otherDomain: a("domain:payment"),
    };
  });

test("선택 밖의 개념은 가라앉고, 이웃은 그대로다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off&p=capability%3Aexchange-request&open=domain%3Asupport", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await alphas(page))?.selection, { timeout: 15_000 }).toBe("capability:exchange-request");
  await waitForMapStill(page, { what: "camera" });
  const restAlpha = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--map-ego-rest-alpha")));
  expect(restAlpha, "--map-ego-rest-alpha 토큰이 없다").toBeGreaterThan(0);
  expect(restAlpha).toBeLessThan(1);

  await expect
    .poll(async () => (await alphas(page))?.siblings.map((v) => (v === null ? null : Math.round(v * 100) / 100)), {
      timeout: 15_000,
      message: "선택 밖의 형제 개념이 가라앉지 않았다",
    })
    .toEqual([restAlpha, restAlpha, restAlpha]);
  // Ego members keep their tier alpha (a capability's can sit below 1 at some
  // zooms) and never sink: each stays well above the rest alpha.
  const after = (await alphas(page))!;
  for (const [name, value] of [["focus", after.focus], ["neighbour", after.neighbour], ["parent", after.parent]] as const) {
    expect(value, `${name} 가 가라앉았다`).toBeGreaterThan(restAlpha + 0.3);
  }
  await expect
    .poll(async () => Math.round(((await alphas(page))?.otherDomain ?? 1) * 100) / 100, { timeout: 15_000, message: "다른 도메인이 가라앉지 않았다" })
    .toBe(restAlpha);
});
