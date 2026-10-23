import { expect, test } from "@playwright/test";
import { canvasOrigin, openDial, readDial } from "./map-flat-dial-harness";
import { waitForMapStill } from "../../settle";

for (const width of [1920, 2560]) {
  test(`branch map at ${width}: readable marks and inspector-safe domain selection`, async ({ page }) => {
    await openDial(page, "dogfood", { width, height: width === 1920 ? 1080 : 1410 });
    const before = await readDial(page);
    expect(before.discs.length).toBeGreaterThanOrEqual(24);
    const gaps = before.discs.flatMap((a, i) => before.discs.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(10);
    expect(before.textOverlaps).toBe(0);
    const card = before.texts.find((t) => t.id === "domain:agent-access" && t.role === "domain")!;
    const origin = await canvasOrigin(page);
    const zoom = await page.evaluate(() => window.__atlasMap!.camera()!.scale);
    await page.mouse.click(origin.x + (card.box.minX + card.box.maxX) / 2, origin.y + (card.box.minY + card.box.maxY) / 2);
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();
    await page.mouse.move(5, 5);
    await waitForMapStill(page);
    const selected = await readDial(page);
    const ids = new Set(selected.clusters.find((c) => c.domainId === "domain:agent-access")!.capabilityIds);
    const names = selected.texts.filter((t) => t.role === "capability" && t.id && ids.has(t.id));
    expect(names.length).toBeGreaterThanOrEqual(6);
    for (const name of names) {
      expect(name.box.minX).toBeGreaterThanOrEqual(selected.freeRect.minX);
      expect(name.box.maxX).toBeLessThanOrEqual(selected.freeRect.maxX);
    }
    expect(selected.flows.every((f) => f.a.startsWith("domain:") && f.b.startsWith("domain:"))).toBe(true);
    expect(selected.namesCrossed).toBe(0);
    expect(await page.evaluate(() => window.__atlasMap!.camera()!.scale)).toBeCloseTo(zoom, 3);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("map-detail-panel")).toBeHidden();
    await waitForMapStill(page);
    expect(await page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBeNull();
  });
}

test("branch map: implementation detail never stacks an element over its capability", async ({ page }) => {
  await openDial(page, "dogfood", { width: 1920, height: 1080 });
  await page.goto("/en/topology/?guides=off&e2e=1&p=element%3Apassage-ask-brief");
  await expect(page.getByTestId("map-detail-panel")).toBeVisible();
  await waitForMapStill(page);
  const pair = await page.evaluate(() => window.__atlasMap!.nodes().filter((n) => n.id === "element:passage-ask-brief" || n.id === "capability:library-workspace"));
  expect(pair).toHaveLength(2);
  expect(Math.hypot(pair[0]!.x - pair[1]!.x, pair[0]!.y - pair[1]!.y)).toBeGreaterThan(pair[0]!.radius + pair[1]!.radius + 8);
});

test("branch map: a clicked capability keeps its entire name outside the inspector", async ({ page }) => {
  await openDial(page, "dogfood", { width: 1920, height: 1080 });
  const id = "capability:agent-environment-doctor";
  const origin = await canvasOrigin(page);
  const node = await page.evaluate((id) => window.__atlasMap!.nodes().find((n) => n.id === id)!, id);
  const zoom = await page.evaluate(() => window.__atlasMap!.camera()!.scale);
  await page.mouse.click(origin.x + node.x, origin.y + node.y);
  await expect(page.getByTestId("map-detail-panel")).toBeVisible();
  await page.mouse.move(5, 5);
  await waitForMapStill(page);
  const selected = await readDial(page);
  const name = selected.texts.find((t) => t.id === id && t.role === "capability")!;
  expect(name).toBeDefined();
  expect(name.box.minX).toBeGreaterThanOrEqual(selected.freeRect.minX);
  expect(name.box.maxX).toBeLessThanOrEqual(selected.freeRect.maxX);
  expect(await page.evaluate(() => window.__atlasMap!.camera()!.scale)).toBeCloseTo(zoom, 3);
});
