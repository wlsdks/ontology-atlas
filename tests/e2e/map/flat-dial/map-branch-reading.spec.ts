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
  const siblings = selected.clusters.find((c) => c.capabilityIds.includes(id))!.capabilityIds;
  for (const label of selected.texts.filter((t) => t.id && siblings.includes(t.id) && t.role === "capability")) {
    expect(label.box.maxX).toBeLessThanOrEqual(selected.freeRect.maxX);
  }
  expect(await page.evaluate(() => window.__atlasMap!.camera()!.scale)).toBeCloseTo(zoom, 3);
});

test("branch map: meaning review and a selected relation keep the same node forms", async ({ page }) => {
  await openDial(page, "dogfood", { width: 1920, height: 1080 }, "light=force&");
  const origin = await canvasOrigin(page);
  const project = await page.evaluate(() => window.__atlasMap!.nodes().find((n) => n.kind === "project")!);
  await page.mouse.click(origin.x + project.x, origin.y + project.y);
  await page.getByTestId("map-detail-panel-action-meaning").click();
  await expect(page.getByTestId("analysis-workbench")).toBeVisible();
  await waitForMapStill(page);
  const reviewed = await readDial(page);
  expect(reviewed.owns).toBe(true);
  expect(reviewed.texts.filter((t) => t.role === "domain")).toHaveLength(4);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.relationCaptions!().length)).toBeGreaterThan(0);
  await page.getByTestId("meaning-relation").first().getByRole("button", { name: /^Show this connection/ }).click();
  await waitForMapStill(page);
  expect(await page.evaluate(() => window.__atlasMap!.selection().edge)).toBeTruthy();
  expect((await readDial(page)).owns).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.relationCaptions!().length)).toBeGreaterThan(0);
  await expect(page.getByTestId("topology-edge-popover-positioner")).toBeHidden();
  expect((await readDial(page)).texts.filter((t) => t.role === "more")).toHaveLength(0);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await expect.poll(async () => {
    const status = await page.getByTestId("map-analysis-status-entry").boundingBox();
    const fit = await page.getByTestId("topology-fit-control").boundingBox();
    return status && fit ? fit.y - status.y - status.height : -1;
  }).toBeGreaterThanOrEqual(8);

});


test("branch map: travelling relation light leaves card text clear", async ({ page }) => {
  await openDial(page, "dogfood", { width: 1920, height: 1080 }, "light=force&");
  await page.waitForFunction(() => (window as unknown as { __atlasMapLight?: { state: () => string } }).__atlasMapLight?.state() === "ready");
  await page.evaluate(() => {
    const w = window as unknown as { __cardLight: { frames: number; peak: number }; __atlasMapLight: {
      active: () => boolean; sample: (points: [number, number][]) => Promise<number[][]>;
    } };
    w.__cardLight = { frames: 0, peak: 0 };
    let started = false;
    const tick = async () => {
      if (w.__atlasMapLight.active()) {
        started = true;
        const centers = window.__atlasMap!.nodes().filter((n) => n.kind === "domain");
        const pixels = await w.__atlasMapLight.sample(centers.flatMap((n) => [-20, 0, 20].map((dx): [number, number] => [n.x + dx, n.y])));
        w.__cardLight.frames++;
        w.__cardLight.peak = Math.max(w.__cardLight.peak, ...pixels.map((p) => p[3]!));
      } else if (started) return;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const origin = await canvasOrigin(page);
  const domain = await page.evaluate(() => window.__atlasMap!.nodes().find((n) => n.id === "domain:agent-access")!);
  await page.mouse.click(origin.x + domain.x, origin.y + domain.y);
  await page.mouse.move(5, 5);
  await page.waitForFunction(() => (window as unknown as { __cardLight: { frames: number } }).__cardLight.frames > 0);
  await page.waitForFunction(() => !(window as unknown as { __atlasMapLight: { active: () => boolean } }).__atlasMapLight.active());
  await waitForMapStill(page);
  const light = await page.evaluate(() => (window as unknown as { __cardLight: { frames: number; peak: number } }).__cardLight);
  expect(light.frames, "sample the actual relation light while it travels").toBeGreaterThan(0);
  expect(light.peak, "relation light never bleeds across card text").toBe(0);
});
