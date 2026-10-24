import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";

/** A dimmed domain keeps a faint name (`--map-ego-rest-alpha`); children stay unnamed. */
test("selecting a domain keeps every other domain's name on the map", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 806 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await waitForMapStill(page);
  const target = await page.evaluate(() => {
    const dial = window.__atlasMap!.dial!();
    if (!("texts" in dial)) throw new Error("the branch frame is not drawn");
    const title = dial.texts.find((text) => text.id === "domain:order" && text.role === "domain")!;
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    return { x: canvas.x + (title.box.minX + title.box.maxX) / 2, y: canvas.y + (title.box.minY + title.box.maxY) / 2 };
  });
  await page.mouse.click(target.x, target.y);
  await expect
    .poll(() => page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null), { timeout: 20_000 })
    .toBe("domain:order");
  await waitForMapStill(page);

  const named = await page.evaluate(() => {
    const probe = window.__atlasMap!;
    const dial = probe.dial!()!;
    if (!("texts" in dial)) throw new Error("the selected branch frame is not drawn");
    const labels = new Set(dial.texts.filter((text) => text.role === "domain").map((text) => text.id));
    return probe
      .nodes()
      .filter((node) => node.kind === "domain" && !node.hidden && node.x >= dial.freeRect.minX && node.x <= dial.freeRect.maxX && node.y >= dial.freeRect.minY && node.y <= dial.freeRect.maxY)
      .map((node) => ({ id: node.id, named: labels.has(node.id) }));
  });
  expect(named.length, "the selected overview must retain multiple visible domains").toBeGreaterThan(3);
  expect(named.filter((node) => !node.named).map((node) => node.id), "visible domains that lost their names after selection").toEqual([]);
});
