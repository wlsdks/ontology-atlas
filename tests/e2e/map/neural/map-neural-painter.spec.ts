import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { liveInstances } from "../../heap-census";
import { openMapOnApp } from "../open-map-on-app";
import { waitForDomeEntered, waitForMapStill, waitFrames } from "../../settle";
import { dogfoodVault, probe } from "./neural-dogfood";

/**
 * Which painter draws Neural, pinned by URL: three.js under `?neuralgl=force`, canvas 2D under
 * `?neuralgl=off`, and canvas 2D after every fallback, with the same concepts and selection.
 */

type ProbeNode = { id: string; kind: string; x: number; y: number; radius: number; hidden: boolean };
type MapWindow = Window & {
  __atlasMap: {
    nodes(): ProbeNode[];
    selection(): { nodeId: string | null };
    dome(): { neural: { painter: string } } | null;
    labels(): { minX: number; minY: number; maxX: number; maxY: number }[];
  };
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
  await page.addInitScript(() => {
    localStorage.setItem("atlas.appearance.view3d", "on");
    localStorage.setItem("atlas.appearance.map-arrangement", "coupling");
  });
  await installDesktopRailRuntime(page);
  await openMapOnApp(page, `/en/topology/?synth=31&synthDeps=1&e2e=1&guides=off${query}`);
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

/**
 * Resolves once the painter's frame count has held for 30 page frames in a row: Neural's arrival keeps
 * drawing for about a second after the map's layout is still. A painter that never stops times out.
 */
async function waitForPainterIdle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const host = window as unknown as MapWindow & { __painterIdle?: { frames: number; held: number } };
      const seen = (host.__painterIdle ??= { frames: -1, held: 0 });
      const frames = host.__atlasMapNeuralGl.frames();
      if (frames !== seen.frames) {
        seen.frames = frames;
        seen.held = 0;
        return false;
      }
      seen.held += 1;
      return seen.held >= 30;
    },
    undefined,
    { polling: "raf" },
  );
}

test("the WebGL painter draws no frame while Neural rests", async ({ page }) => {
  await openNeural(page, "&neuralgl=force");
  await expect.poll(() => painter(page)).toBe("webgl");
  await waitForMapStill(page);
  await waitForPainterIdle(page);
  const frames = () => page.evaluate(() => (window as unknown as MapWindow).__atlasMapNeuralGl.frames());
  const before = await frames();
  expect(before).toBeGreaterThan(0);
  // measurement window: a map at rest draws no frame, so the painter's count must hold across one second.
  await page.waitForTimeout(1_000);
  expect(await frames()).toBe(before);
});

type Point = { x: number; y: number };

/** RGBA (0..255) the WebGL painter drew at each point, read inside its next frame. */
const glPixels = (page: Page, points: Point[]) =>
  page.evaluate((at) => (window as unknown as MapWindow).__atlasMapNeuralGl.sample(at), points).then((rgba) => rgba ?? []);

/** RGBA (0..255) of the map canvas at each point, which the canvas-2D painter draws on. */
const canvasPixels = (page: Page, points: Point[]) =>
  page.evaluate((at) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="ontology-map-canvas"]')!;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    const ctx = canvas.getContext("2d")!;
    return at.map((p) => Array.from(ctx.getImageData(Math.round(p.x * scale), Math.round(p.y * scale), 1, 1).data));
  }, points);

/** The stale warning ink after shading: its hue and saturation, at any brightness above the ground. */
function isAmber([r, g, b]: number[]): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 40 || max === min) return false;
  const hue = (max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4) * 60;
  const h = hue < 0 ? hue + 360 : hue;
  return h >= 32 && h <= 55 && (max - min) / max >= 0.5;
}

const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Waits for Neural's crossfade to finish, so neither painter draws over Flat's last frame. */
async function waitForNeuralAlone(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="map-neural-gl"]')?.style.opacity)).toBe("1");
  await waitForMapStill(page);
}

/** Drops the WebGL context, so the canvas-2D painter draws the same frame on the map canvas. */
async function fallBackToCanvas(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as MapWindow).__atlasMapNeuralGl.lose());
  await expect.poll(() => painter(page)).toBe("canvas");
  await waitForMapStill(page);
}

/** This repository's vault in the desktop runtime, where the Git walk calls some concepts stale. */
async function openDogfoodNeural(page: Page): Promise<ReturnType<typeof dogfoodVault>> {
  const vault = dogfoodVault();
  await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges: vault.changes });
  await page.goto("/ko/?guides=off&e2e=1&neuralgl=force", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId("topology-view-3d-choice-neural").click();
  await expect.poll(() => probe(page, (p) => p.nodes().some((n) => n.id === "capability:mcp-tool-server")), { timeout: 60_000 }).toBe(true);
  await waitForDomeEntered(page, 60_000);
  await expect(page.getByTestId("topology-neural-legend")).toHaveAttribute("data-evidence-availability", "measured", { timeout: 30_000 });
  await expect.poll(() => painter(page)).toBe("webgl");
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
  await waitForNeuralAlone(page);
  return vault;
}

/** How many fixed turns the overlap search may take before the pose counts as missing. */
const TURN_STEPS = 12;
const TURN_MOVES = 8;
const TURN_MOVE_PX = 12;

/** Turns the dome by one fixed drag across the middle of the canvas and waits for it to rest. */
async function turnDome(page: Page): Promise<void> {
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let move = 1; move <= TURN_MOVES; move += 1) {
    await page.mouse.move(x + move * TURN_MOVE_PX, y);
    await waitFrames(page, 1);
  }
  await page.mouse.up();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
  await waitForMapStill(page, { what: "dome" });
}

/**
 * Whether a point lies outside every drawn name. The canvas painter draws names on the map canvas
 * and the WebGL painter on a canvas of their own, so a point under a name compares a letter or its
 * backing with a cell.
 */
async function nameFree(page: Page): Promise<(p: Point) => boolean> {
  const names = await page.evaluate(() => (window as unknown as MapWindow).__atlasMap.labels());
  return (p) => names.every((n) => p.x < n.minX || p.x > n.maxX || p.y < n.minY || p.y > n.maxY);
}

/** The middle of each lens where a stale and a current cell overlap, unless a third cell or a name also covers it. */
async function staleOverlaps(page: Page, stale: ReadonlySet<string>): Promise<Point[]> {
  const cells = (await cellsOnScreen(page)).filter((c) => c.kind !== "project");
  const unnamed = await nameFree(page);
  const clear = (p: Point, a: ProbeNode, b: ProbeNode) =>
    unnamed(p) && cells.every((c) => c === a || c === b || Math.hypot(c.x - p.x, c.y - p.y) > c.radius + 1);
  const overlaps: Point[] = [];
  for (const a of cells) {
    for (const b of cells) {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (a.id >= b.id || stale.has(a.id) === stale.has(b.id) || d >= a.radius + b.radius - 2 || d <= Math.abs(a.radius - b.radius)) continue;
      const along = (d - b.radius + a.radius) / 2;
      const lens = { x: a.x + ((b.x - a.x) / d) * along, y: a.y + ((b.y - a.y) / d) * along };
      if (clear(lens, a, b)) overlaps.push(lens);
    }
  }
  return overlaps;
}

/** Cells on screen, clear of the canvas edges. */
async function cellsOnScreen(page: Page): Promise<ProbeNode[]> {
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  return (await page.evaluate(() => (window as unknown as MapWindow).__atlasMap.nodes())).filter(
    (n) => !n.hidden && n.radius >= 2 && n.x > 40 && n.x < box.width - 40 && n.y > 40 && n.y < box.height - 40,
  );
}

/** The cells whose disc no other cell's disc reaches. */
const apart = (cells: ProbeNode[]) =>
  cells.filter((c) => cells.every((o) => o === c || Math.hypot(o.x - c.x, o.y - c.y) > o.radius + c.radius + 1));

/** Left of a cell's centre: clear of a capability's nucleus and of the name, which sits to the right. */
const bodyPoint = (c: ProbeNode): Point => ({ x: c.x - c.radius * 0.6, y: c.y });

test.describe("the WebGL painter against the canvas painter on the same frame", () => {
  test.setTimeout(180_000);

  test("as many cells read amber under the sphere's shading as on the canvas painter", async ({ page }) => {
    await openDogfoodNeural(page);
    const points = apart((await cellsOnScreen(page)).filter((c) => c.kind !== "project")).map(bodyPoint);
    const glAmber = (await glPixels(page, points)).filter(isAmber).length;
    await fallBackToCanvas(page);
    const canvasAmber = (await canvasPixels(page, points)).filter(isAmber).length;
    expect(canvasAmber, "the dogfood vault draws stale cells").toBeGreaterThan(0);
    expect(glAmber).toBe(canvasAmber);
  });

  test("where a nearer cell covers a farther one, the overlap shows the nearer cell's ink", async ({ page }) => {
    const { stale } = await openDogfoodNeural(page);
    let overlaps = await staleOverlaps(page, stale);
    for (let step = 0; overlaps.length === 0 && step < TURN_STEPS; step += 1) {
      await turnDome(page);
      overlaps = await staleOverlaps(page, stale);    }
    expect(overlaps.length, "some pose of the dogfood vault draws a stale and a current cell overlapping").toBeGreaterThan(0);
    const gl = (await glPixels(page, overlaps)).map(isAmber);
    await fallBackToCanvas(page);
    // The canvas painter strokes cells far to near, so its overlap shows the nearer cell.
    const canvas = (await canvasPixels(page, overlaps)).map(isAmber);
    expect(gl).toEqual(canvas);
  });

  test("with a concept selected, a near rest cell draws brighter than a far one, as depth orders them on canvas", async ({ page }) => {
    await openNeural(page, "&neuralgl=force");
    await expect.poll(() => painter(page)).toBe("webgl");
    const focus = await largestCell(page);
    const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
    await page.mouse.click(box.x + focus.x, box.y + focus.y);
    await expect.poll(() => page.evaluate(() => (window as unknown as MapWindow).__atlasMap.selection().nodeId)).toBe(focus.id);
    await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
    await waitForNeuralAlone(page);
    const lit = await probe(page, (p) => {
      const n = p.dome()!.neural;
      return [n.focusId, ...n.needs, ...n.usedBy, ...Object.keys(n.impact ?? {})];
    });
    const unnamed = await nameFree(page);
    const rest = apart(await cellsOnScreen(page)).filter((c) => c.kind === "element" && !lit.includes(c.id) && unnamed(c));
    expect(rest.length, "rest elements stand clear on screen").toBeGreaterThan(3);
    const glLight = (await glPixels(page, rest)).map(luminance);
    await fallBackToCanvas(page);
    const canvasLight = (await canvasPixels(page, rest)).map(luminance);
    const near = canvasLight.indexOf(Math.max(...canvasLight));
    const far = canvasLight.indexOf(Math.min(...canvasLight));
    expect(canvasLight[near] / canvasLight[far], "the frame spreads the rest cells in depth").toBeGreaterThan(1.05);
    expect(glLight[near]).toBeGreaterThan(glLight[far]);
  });
});
