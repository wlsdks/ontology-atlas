import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";

/** Disclosed context sinks by the rest alpha; folded branch members stay absent. */
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

test("concepts outside the selection recede while neighbors stay as they are", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off&p=capability%3Aexchange-request&open=domain%3Asupport", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await alphas(page))?.selection, { timeout: 15_000 }).toBe("capability:exchange-request");
  await waitForMapStill(page, { what: "camera" });
  const restAlpha = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--map-ego-rest-alpha")));
  expect(restAlpha, "the --map-ego-rest-alpha token is missing").toBeGreaterThan(0);
  expect(restAlpha).toBeLessThan(1);

  await expect
    .poll(async () => {
      const siblings = (await alphas(page))?.siblings;
      return !!siblings && siblings.every((value) => value !== null && value >= 0 && value <= restAlpha + 1e-6) && siblings.some((value) => value !== null && value > 0);
    }, {
      timeout: 15_000,
      message: "a disclosed sibling outside the selection did not recede",
    })
    .toBe(true);
  // Ego members keep their tier alpha (a capability's can sit below 1 at some
  // zooms) and never sink: each stays well above the rest alpha.
  const after = (await alphas(page))!;
  for (const [name, value] of [["focus", after.focus], ["neighbour", after.neighbour], ["parent", after.parent]] as const) {
    expect(value, `${name} receded`).toBeGreaterThan(restAlpha + 0.3);
  }
  await expect
    .poll(async () => Math.round(((await alphas(page))?.otherDomain ?? 1) * 100) / 100, { timeout: 15_000, message: "the other domain did not recede" })
    .toBe(restAlpha);
});
