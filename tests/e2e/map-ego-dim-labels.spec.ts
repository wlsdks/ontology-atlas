import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **A selected node does not make the other domains nameless** (2026-09-19).
 *
 * Selecting the order domain dimmed the domains it does not touch — and their
 * names went to alpha 0 with them, so three of the nine domains became
 * anonymous grey chips. A person deciding where to go next was left hovering
 * to find out which chip was which. The dimmed domain keeps a faint name now
 * (`--map-ego-dim-label-alpha`); children stay unnamed, as they were before
 * the selection.
 */
test("selecting a domain keeps every other domain's name on the map", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 806 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off&p=domain:order", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null), { timeout: 20_000 })
    .toBe("domain:order");
  await waitForMapStill(page);

  const named = await page.evaluate(() => {
    const probe = window.__atlasMap!;
    const labels = new Set(probe.labels().map((label) => label.nodeId));
    return probe
      .nodes()
      .filter((node) => node.kind === "domain" && !node.hidden)
      .map((node) => ({ id: node.id, named: labels.has(node.id) }));
  });
  expect(named.length, "도메인이 없으면 이 스펙은 공회전한다").toBeGreaterThan(3);
  expect(named.filter((node) => !node.named).map((node) => node.id), "선택 뒤 이름을 잃은 도메인").toEqual([]);
});
