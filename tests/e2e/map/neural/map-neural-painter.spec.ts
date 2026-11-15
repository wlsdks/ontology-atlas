import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { liveInstances } from "../../heap-census";
import { waitForDomeEntered, waitForMapStill } from "../../settle";

/**
 * Which painter draws Neural, pinned by URL: three.js under `?neuralgl=force`, canvas 2D under
 * `?neuralgl=off`, and canvas 2D after every fallback, with the same concepts and selection.
 */

type ProbeNode = { id: string; kind: string; x: number; y: number; radius: number; hidden: boolean };
type MapWindow = Window & {
  __atlasMap: { nodes(): ProbeNode[]; selection(): { nodeId: string | null }; dome(): { neural: { painter: string } } | null };
  __atlasMapNeuralGl: {
    state(): string;
    frames(): number;
    counts(): { cells: number; axons: number };
    sample(points: { x: number; y: number }[]): Promise<number[][] | null>;
    lose(): void;
  };
};

test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: "reduce" } });

async function openNeural(page: Page, query: string): Promise<void> {
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem("atlas.appearance.view3d", "on");
    localStorage.setItem("atlas.appearance.map-arrangement", "coupling");
  });
  await page.goto(`/en/topology/?synth=31&synthDeps=1&e2e=1&guides=off${query}`);
  await waitForDomeEntered(page);
  await waitForMapStill(page);
}

const painter = (page: Page) => page.evaluate(() => (window as unknown as MapWindow).__atlasMap.dome()?.neural.painter ?? null);
const glState = (page: Page) => page.evaluate(() => (window as unknown as MapWindow).__atlasMapNeuralGl.state());

/** The capability whose cell is largest on screen, away from the edges. */
async function largestCell(page: Page): Promise<ProbeNode> {
  const nodes = await page.evaluate(() => (window as unknown as MapWindow).__atlasMap.nodes());
  return nodes
    .filter((node) => !node.hidden && node.kind === "capability" && node.x > 360 && node.x < 1320 && node.y > 140 && node.y < 760)
    .sort((a, b) => b.radius - a.radius)[0];
}

test("Neural is drawn through WebGL under ?neuralgl=force, cells included", async ({ page }) => {
  await openNeural(page, "&neuralgl=force");
  await expect.poll(() => painter(page)).toBe("webgl");
  const counts = await page.evaluate(() => (window as unknown as MapWindow).__atlasMapNeuralGl.counts());
  expect(counts.cells).toBeGreaterThan(0);
  const cell = await largestCell(page);
  const rgba = await page.evaluate((at) => (window as unknown as MapWindow).__atlasMapNeuralGl.sample([at]), { x: cell.x, y: cell.y });
  expect(rgba?.[0][3], "the WebGL canvas holds the cell's body").toBeGreaterThan(128);
});

test("Neural is drawn on canvas 2D under ?neuralgl=off", async ({ page }) => {
  await openNeural(page, "&neuralgl=off");
  await expect.poll(() => painter(page)).toBe("canvas");
  expect(await glState(page)).toBe("off");
  await expect(page.getByTestId("map-neural-gl")).toHaveCount(0);
});

/** Stubs `getContext("webgl2")` to fail and returns the scripts that carried the WebGL painter. */
async function withoutWebgl2(page: Page): Promise<string[]> {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      return kind === "webgl2" ? null : getContext.call(this, kind as "2d", ...(rest as []));
    } as typeof getContext;
  });
  const painterScripts: string[] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() !== "script") return;
    const body = await response.text().catch(() => "");
    if (body.includes("WebGLRenderer")) painterScripts.push(response.url());
  });
  return painterScripts;
}

test("a browser that cannot open WebGL2 draws Neural on canvas 2D and never loads the painter", async ({ page }) => {
  const painterScripts = await withoutWebgl2(page);
  await openNeural(page, "");
  await expect.poll(() => painter(page)).toBe("canvas");
  expect(await glState(page)).not.toBe("webgl");
  expect(painterScripts).toEqual([]);
});

test("?neuralgl=force without a WebGL2 context asks for no three.js chunk", async ({ page }) => {
  const painterScripts = await withoutWebgl2(page);
  await openNeural(page, "&neuralgl=force");
  await expect.poll(() => painter(page)).toBe("canvas");
  expect(await glState(page)).toBe("unaccelerated");
  expect(painterScripts).toEqual([]);
});

test("after a lost context Neural falls back to canvas 2D with the same selection and concepts", async ({ page }) => {
  await openNeural(page, "&neuralgl=force");
  await expect.poll(() => painter(page)).toBe("webgl");
  const cell = await largestCell(page);
  const canvas = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  await page.mouse.click(canvas.x + cell.x, canvas.y + cell.y);
  const selection = () => page.evaluate(() => (window as unknown as MapWindow).__atlasMap.selection().nodeId);
  await expect.poll(selection).toBe(cell.id);
  const ids = () => page.evaluate(() => (window as unknown as MapWindow).__atlasMap.nodes().map((node) => node.id).sort());
  const before = await ids();
  await page.evaluate(() => (window as unknown as MapWindow).__atlasMapNeuralGl.lose());
  await expect.poll(() => painter(page)).toBe("canvas");
  expect(await glState(page)).toBe("lost");
  expect(await selection()).toBe(cell.id);
  expect(await ids()).toEqual(before);
});

test("five Flat-to-Neural round trips leave at most one live WebGL2 context", async ({ page }) => {
  await openNeural(page, "&neuralgl=force");
  await expect.poll(() => painter(page)).toBe("webgl");
  for (let trip = 0; trip < 5; trip += 1) {
    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-flat").click();
    await expect.poll(() => glState(page)).toBe("idle");
    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-neural").click();
    await expect.poll(() => painter(page)).toBe("webgl");
  }
  const cdp = await page.context().newCDPSession(page);
  expect(await liveInstances(cdp, "WebGL2RenderingContext", "!item.isContextLost()")).toBeLessThanOrEqual(1);
});

test("the WebGL painter draws no frame while Neural rests", async ({ page }) => {
  await openNeural(page, "&neuralgl=force");
  await expect.poll(() => painter(page)).toBe("webgl");
  await waitForMapStill(page);
  const frames = () => page.evaluate(() => (window as unknown as MapWindow).__atlasMapNeuralGl.frames());
  const before = await frames();
  expect(before).toBeGreaterThan(0);
  // measurement window: a map at rest draws no frame, so the painter's count must hold across one second.
  await page.waitForTimeout(1_000);
  expect(await frames()).toBe(before);
});
