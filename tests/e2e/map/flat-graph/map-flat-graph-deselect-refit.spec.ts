import { expect, test, type Page } from "@playwright/test";

import en from "../../../../messages/en.json";
import { waitForMapStill } from "../../settle";
import { canvasBox, openDogfoodFlat, pressAt, readDial, settleSelection } from "./domain-star";

const VIEWPORT = { width: 1410, height: 840 };
/** Canvas px the domains' span and centre may differ by from the fit they are compared with. */
const SAME_FIT_PX = 2;
/** The largest share of a return's whole zoom change (or pan, when it keeps its zoom) one painted frame may take at the run's frame pace. */
const FRAME_ZOOM_SHARE_MAX = 0.25;

interface Overview { spanX: number; spanY: number; centreX: number; centreY: number; zoom: number; canvasWidth: number }

/** The domains' discs as the last frame drew them, in canvas px. */
async function readOverview(page: Page): Promise<Overview> {
  const dial = await readDial(page);
  const ids = new Set(dial.clusters.map((c) => c.domainId));
  const discs = dial.discs.filter((d) => ids.has(d.id));
  const minX = Math.min(...discs.map((d) => d.x - d.r));
  const maxX = Math.max(...discs.map((d) => d.x + d.r));
  const minY = Math.min(...discs.map((d) => d.y - d.r));
  const maxY = Math.max(...discs.map((d) => d.y + d.r));
  return { spanX: maxX - minX, spanY: maxY - minY, centreX: (minX + maxX) / 2, centreY: (minY + maxY) / 2, zoom: dial.zoomRatio, canvasWidth: (await canvasBox(page)).width };
}

const describeOverview = (o: Overview) => `domains ${o.spanX.toFixed(1)} x ${o.spanY.toFixed(1)} px about ${o.centreX.toFixed(1)},${o.centreY.toFixed(1)} at zoom ${o.zoom.toFixed(3)} in a ${o.canvasWidth.toFixed(0)} px canvas`;

function expectSameFit(back: Overview, fit: Overview, what: string): void {
  const said = `${what}: ${describeOverview(back)}, the fit ${describeOverview(fit)}`;
  expect(back.canvasWidth, `${said}: the same free map`).toBe(fit.canvasWidth);
  expect(Math.abs(back.spanX - fit.spanX), `${said}: the same width`).toBeLessThanOrEqual(SAME_FIT_PX);
  expect(Math.abs(back.spanY - fit.spanY), `${said}: the same height`).toBeLessThanOrEqual(SAME_FIT_PX);
  expect(Math.hypot(back.centreX - fit.centreX, back.centreY - fit.centreY), `${said}: the same centre`).toBeLessThanOrEqual(SAME_FIT_PX);
}

async function dockAtRest(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const surface = document.querySelector("[data-agent-dock-surface=\"inset\"]");
    const frame = document.querySelector("[data-agent-dock-frame]");
    return surface && frame && Number(getComputedStyle(surface).opacity) > 0.99 && [...surface.getAnimations(), ...frame.getAnimations()].every((a) => a.playState !== "running");
  });
}

/** Opens the dock from the chrome's toggle, or, with a concept selected, from its panel, which covers the toggle. */
async function openDock(page: Page): Promise<void> {
  if (await page.evaluate(() => window.__atlasMap!.selection().nodeId) === null) await page.getByTestId("topology-meaning-workbench-toggle").click();
  else {
    await page.getByTestId("map-detail-panel-more-menu-trigger").click();
    await page.getByTestId("map-detail-panel-action-meaning").click();
  }
  await expect(page.getByTestId("analysis-workbench")).toBeVisible();
  await dockAtRest(page);
  await waitForMapStill(page, { what: "camera" });
}

/** Waits until the dock is gone, the canvas is `restWidth` wide again and the camera rests. */
async function dockClosed(page: Page, restWidth: number): Promise<void> {
  await expect(page.getByTestId("analysis-workbench")).toBeHidden();
  await expect.poll(async () => (await canvasBox(page)).width).toBe(restWidth);
  await waitForMapStill(page, { what: "camera" });
}

const pressDockClose = (page: Page) => page.getByTestId("analysis-workbench").getByRole("button", { name: en.analysisWorkbench.close }).click();

/**
 * How far the closing dock has handed its width back to the map when the Escape lands: late in the
 * close, so the resize ends under the deselect's glide. Measured: there the code before the
 * deselect refit fails 5 of 5, at the first widened frame 1 of 3.
 */
const NEARLY_CLOSED_SHARE = 0.85;

/**
 * Presses Escape on the map in the first painted frame that shows the map `NEARLY_CLOSED_SHARE` of the
 * way from `dockedWidth` to `freeWidth`: a key sent after the close press lands whenever a slow
 * machine gets to it, often after the dock has gone.
 */
const escapeAsTheDockCloses = (page: Page, dockedWidth: number, freeWidth: number) => page.evaluate(({ docked, free, share }) => {
  const canvas = document.querySelector<HTMLElement>("[data-testid=\"ontology-map-canvas\"]")!;
  const tick = () => {
    if (canvas.getBoundingClientRect().width < docked + (free - docked) * share) {
      requestAnimationFrame(tick);
      return;
    }
    canvas.focus();
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  };
  requestAnimationFrame(tick);
}, { docked: dockedWidth, free: freeWidth, share: NEARLY_CLOSED_SHARE });

interface FrameSample { t: number; zoom: number; x: number; y: number; canvasWidth: number; selected: string | null }

/** Records the drawn zoom and centre, the canvas width and the selection on every frame until `stopSamples`. */
const startSamples = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __frameSamples: FrameSample[]; __sampling: boolean };
  const canvas = document.querySelector("[data-testid=\"ontology-map-canvas\"]")!;
  w.__frameSamples = [];
  w.__sampling = true;
  const tick = (t: number) => {
    const camera = window.__atlasMap!.camera()!;
    w.__frameSamples.push({ t, zoom: camera.scale, x: camera.x, y: camera.y, canvasWidth: canvas.getBoundingClientRect().width, selected: window.__atlasMap!.selection().nodeId });
    if (w.__sampling) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const stopSamples = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __frameSamples: FrameSample[]; __sampling: boolean };
  w.__sampling = false;
  return w.__frameSamples;
});

/** A zoom change, in log units, below which a return is judged on its pan. */
const ZOOM_UNCHANGED_LOG = 1e-3;

/**
 * No painted frame takes more than its share of the whole zoom change: the return glides, never
 * jumps. A frame longer than the run's median counts at the median pace, so a stalled frame is not a jump.
 * The Flat camera floors at the overview's zoom, so a selection the dock's close lifted to that floor
 * returns at the zoom it holds; that return is judged the same way on its pan, in canvas px.
 */
function expectGlide(samples: FrameSample[], what: string): void {
  const intervals = samples.slice(1).map((s, i) => s.t - samples[i]!.t);
  const pace = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)]!;
  const atPace = (step: number, i: number) => step * Math.min(1, pace / intervals[i]!);
  const first = samples[0]!;
  const last = samples.at(-1)!;
  const zoomWhole = Math.abs(Math.log(last.zoom / first.zoom));
  const zoomed = zoomWhole > ZOOM_UNCHANGED_LOG;
  const steps = samples.slice(1).map((s, i) => atPace(zoomed ? Math.abs(Math.log(s.zoom / samples[i]!.zoom)) : Math.hypot(s.x - samples[i]!.x, s.y - samples[i]!.y) * s.zoom, i));
  const whole = zoomed ? zoomWhole : Math.hypot(last.x - first.x, last.y - first.y) * last.zoom;
  const moved = zoomed ? "zoom" : "pan";
  const largest = Math.max(0, ...steps);
  console.log(`[deselect-refit] ${what}: largest frame step ${(largest / whole).toFixed(3)} of the whole ${moved} change over ${samples.length} frames`);
  expect(whole, `${what}: the deselect moved the camera`).toBeGreaterThan(zoomed ? 0 : SAME_FIT_PX);
  expect(largest / whole, `${what}: the largest frame step ${largest.toFixed(4)} of a whole ${moved} ${whole.toFixed(4)} over ${samples.length} frames`).toBeLessThanOrEqual(FRAME_ZOOM_SHARE_MAX);
}

async function pressConcept(page: Page, id: string): Promise<void> {
  const disc = (await readDial(page)).discs.find((d) => d.id === id);
  expect(disc, `${id} is drawn to press`).toBeDefined();
  await pressAt(page, id, disc!);
}

/** Escape on the map: with no dock open above it, it clears the selection. */
async function deselectWithEscape(page: Page): Promise<void> {
  await page.getByTestId("ontology-map-canvas").focus();
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBeNull();
}

/** Canvas px a ground press keeps from every drawn line and mark, so it selects neither. */
const BARE_GROUND_PX = 32;

/** A press on the free map's barest uncovered ground, which clears the selection with the dock still open. */
async function deselectOnGround(page: Page): Promise<void> {
  const free = (await readDial(page)).freeRect;
  const box = await canvasBox(page);
  const at = await page.evaluate(({ f, box }) => {
    const map = window.__atlasMap!;
    const canvas = document.querySelector("[data-testid=\"ontology-map-canvas\"]");
    const curves = map.edges().flatMap((e) => Array.from({ length: 21 }, (_, i) => {
      const t = i / 20;
      return { x: (1 - t) ** 2 * e.ax + 2 * (1 - t) * t * e.controlX + t ** 2 * e.bx, y: (1 - t) ** 2 * e.ay + 2 * (1 - t) * t * e.controlY + t ** 2 * e.by, r: 0 };
    }));
    const marks = [...curves, ...map.nodes().filter((n) => !n.hidden).map((n) => ({ x: n.x, y: n.y, r: n.radius }))];
    let best = { x: 0, y: 0, clear: -Infinity };
    for (let x = f.minX + 12; x <= f.maxX - 12; x += 16) {
      for (let y = f.minY + 12; y <= f.maxY - 12; y += 16) {
        const clear = Math.min(...marks.map((m) => Math.hypot(m.x - x, m.y - y) - m.r));
        if (clear > best.clear && map.nodeAt!(x, y) === null && document.elementFromPoint(box.x + x, box.y + y) === canvas) best = { x, y, clear };
      }
    }
    return best;
  }, { f: free, box });
  expect(at.clear, "the free map has bare ground to press").toBeGreaterThanOrEqual(BARE_GROUND_PX);
  await page.mouse.click(box.x + at.x, box.y + at.y);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection())).toEqual({ nodeId: null, edge: null });
  await settleSelection(page);
}

const firstDomain = async (page: Page) => (await readDial(page)).clusters[0]!.domainId;
const firstCapability = async (page: Page) => (await readDial(page)).clusters[0]!.capabilityIds[0]!;

test.describe(`at ${VIEWPORT.width}x${VIEWPORT.height} on Flat, a deselect fits the free map as it is after the dock changed under a selection`, () => {
  for (const [what, pick] of [["domain", firstDomain], ["capability", firstCapability]] as const) {
    test(`a ${what} pressed with the dock open, then the dock closed: Escape glides back to the overview the map loaded with`, async ({ page }) => {
      test.setTimeout(180_000);
      await openDogfoodFlat(page, VIEWPORT, false);
      const loaded = await readOverview(page);
      await openDock(page);
      await pressConcept(page, await pick(page));
      await pressDockClose(page);
      await dockClosed(page, loaded.canvasWidth);
      await startSamples(page);
      await deselectWithEscape(page);
      await settleSelection(page);
      const samples = await stopSamples(page);
      expectSameFit(await readOverview(page), loaded, `the ${what}'s deselect with the dock closed`);
      expectGlide(samples, `the ${what}'s deselect`);
    });
  }

  test("under reduced motion, a domain pressed with the dock open, then the dock closed: Escape lands on the loaded overview in one step", async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDogfoodFlat(page, VIEWPORT, false);
    const loaded = await readOverview(page);
    await openDock(page);
    await pressConcept(page, await firstDomain(page));
    await pressDockClose(page);
    await dockClosed(page, loaded.canvasWidth);
    await startSamples(page);
    await deselectWithEscape(page);
    await settleSelection(page);
    const samples = await stopSamples(page);
    expectSameFit(await readOverview(page), loaded, "the deselect under reduced motion");
    const from = samples[0]!.zoom;
    const to = samples.at(-1)!.zoom;
    const between = samples.filter((s) => Math.abs(Math.log(s.zoom / from)) > 1e-6 && Math.abs(Math.log(s.zoom / to)) > 1e-6);
    expect(Math.abs(Math.log(to / from)), "the deselect changed the zoom").toBeGreaterThan(0);
    expect(between.map((s) => s.zoom.toFixed(4)), `frames between zoom ${from.toFixed(4)} and ${to.toFixed(4)}`).toEqual([]);
  });

  test("a domain pressed with the dock open: Escape while the dock is still closing glides to the overview the map loaded with", async ({ page }) => {
    test.setTimeout(180_000);
    await openDogfoodFlat(page, VIEWPORT, false);
    const loaded = await readOverview(page);
    await openDock(page);
    await pressConcept(page, await firstDomain(page));
    await escapeAsTheDockCloses(page, (await canvasBox(page)).width, loaded.canvasWidth);
    await startSamples(page);
    await pressDockClose(page);
    await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBeNull();
    await dockClosed(page, loaded.canvasWidth);
    await settleSelection(page);
    const samples = await stopSamples(page);
    const cleared = samples.find((s) => s.selected === null);
    expect(cleared?.canvasWidth, "the dock was still closing when the selection cleared").toBeLessThan(loaded.canvasWidth);
    expectSameFit(await readOverview(page), loaded, "the deselect while the dock closed");
    expectGlide(samples, "the deselect while the dock closed");
  });

  test("a domain pressed with the dock closed, then the dock opened: a press on bare ground glides to the overview of the narrower map", async ({ page }) => {
    test.setTimeout(180_000);
    await openDogfoodFlat(page, VIEWPORT, false);
    const loaded = await readOverview(page);
    await openDock(page);
    const docked = await readOverview(page);
    await pressDockClose(page);
    await dockClosed(page, loaded.canvasWidth);
    await pressConcept(page, await firstDomain(page));
    await openDock(page);
    await startSamples(page);
    await deselectOnGround(page);
    const samples = await stopSamples(page);
    expectSameFit(await readOverview(page), docked, "the deselect with the dock open");
    expectGlide(samples, "the deselect with the dock open");
  });
});
