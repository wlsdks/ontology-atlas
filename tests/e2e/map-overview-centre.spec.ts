import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { seedFirstRunSeen } from "./first-run-seed";
import { dogfoodVaultFiles } from "./dogfood-vault-files";
import { waitForBoxStill, waitForDomeEntered, waitForMapSettled, waitForMapStill } from "./settle";

/**
 * **The overview stands in the middle of the free map, and the map's chrome stands on
 * one line** (owner report, 2026-09-25, the installed app at 1512×949: "isn't the ratio
 * off? INDEX on the left too, and the nodes seem pushed right").
 *
 * Measured before the fix on screen, the drawing's centre minus the centre of the free
 * map (INDEX's right edge to the utility rail's left edge):
 *
 * - the dogfood ontology, +82 px at 1512 (+38 to +113 across sizes and INDEX states):
 *   its hub is folded behind a crowded domain's chip, but the fit framed it anyway;
 * - the bundled sample, -52 to -89 px: its hub folds on the other side;
 * - any vault, -13 px with INDEX open and -10 px beside the agent dock: the side lanes
 *   reserved 26 px past INDEX against 52 past the rail, and the dock pulled the rail
 *   12 px closer without the lane following;
 * - and the tool row stood 8 px below INDEX's top edge from 1280 up, the rail 8 px
 *   further in than INDEX's inset.
 *
 * The drawn positions are converted to the screen through the canvas's own box, so a
 * viewport measured through the entry fade's scale (the bitmap stretched 0.5% across
 * the canvas) shows up here rather than being trusted.
 */

const SIZES = [
  { width: 1040, height: 720 },
  { width: 1280, height: 800 },
  { width: 1512, height: 949 },
  { width: 1920, height: 1080 },
] as const;
/** Half a node's rim: past it a person sees the drawing sit to one side. */
const TOLERANCE = 4;
const RAIL = ["topology-fit-control", "topology-tour-button", "topology-shortcuts-help-button", "topology-replay-growth"];

interface Frame {
  freeLeft: number;
  freeRight: number;
  drawnLeft: number;
  drawnRight: number;
  drawn: number;
  backing: { width: number; height: number; cssWidth: number; cssHeight: number; dpr: number };
  indexTop: number | null;
  indexLeftInset: number | null;
  toolbarTop: number;
  toolbarRightInset: number;
  railRightInset: number | null;
}

async function measure(page: Page): Promise<Frame> {
  return page.evaluate((railIds) => {
    const shown = (element: Element | null) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return null;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < 0.05) return null;
      return box;
    };
    const canvasElement = document.querySelector<HTMLCanvasElement>('[data-testid="ontology-map-canvas"]')!;
    const canvas = canvasElement.getBoundingClientRect();
    const index = shown(document.querySelector('[data-testid="topology-index-panel"]'));
    const tab = shown(document.querySelector('[data-testid="topology-index-tab"]'));
    const rail = railIds
      .map((id) => shown(document.querySelector(`[data-testid="${id}"]`)))
      .filter((box): box is DOMRect => box !== null);
    const probe = window.__atlasMap!;
    const camera = probe.camera()!;
    // The probe speaks in the camera's viewport px; the screen spreads them across the canvas box.
    const stretch = canvas.width / camera.width;
    const drawn = probe.nodes().filter((node) => !node.hidden && (node.alpha ?? 1) > 0.05);
    // The frame's own bounds: each drawn node's centre plus its kind's radius, the geometry
    // the fit centres. Bare centres read 3-5 px off a centred frame whenever the two ends are
    // different kinds (a drawn hub capability against a domain, in the fixture vault).
    const root = getComputedStyle(document.documentElement);
    const radius = (kind: string) => Number(root.getPropertyValue(`--map-radius-${kind}`)) * camera.scale;
    const lefts = drawn.map((node) => canvas.left + (node.x - radius(node.kind)) * stretch);
    const rights = drawn.map((node) => canvas.left + (node.x + radius(node.kind)) * stretch);
    const toolbar = document.querySelector('[data-testid="topology-top-toolbar"]')!;
    const toolbarTiles = [...toolbar.querySelectorAll("button")]
      .map(shown)
      .filter((box): box is DOMRect => box !== null);
    return {
      freeLeft: (index ?? tab)?.right ?? canvas.left,
      freeRight: rail.length > 0 ? Math.min(...rail.map((box) => box.left)) : canvas.right,
      drawnLeft: Math.min(...lefts),
      drawnRight: Math.max(...rights),
      // Unreadable radius tokens would turn every offset into NaN, which no bound rejects.
      drawn: drawn.every((node) => radius(node.kind) > 0) ? drawn.length : 0,
      backing: {
        width: canvasElement.width,
        height: canvasElement.height,
        cssWidth: canvasElement.clientWidth,
        cssHeight: canvasElement.clientHeight,
        dpr: window.devicePixelRatio,
      },
      indexTop: index ? index.top : null,
      indexLeftInset: index ? index.left - canvas.left : null,
      toolbarTop: Math.min(...toolbarTiles.map((box) => box.top)),
      toolbarRightInset: canvas.right - toolbar.getBoundingClientRect().right,
      railRightInset: rail.length > 0 ? canvas.right - Math.max(...rail.map((box) => box.right)) : null,
    };
  }, RAIL);
}

/** Every departure from the claim, named with where it happened. */
function check(frame: Frame, where: string, { chromeLine }: { chromeLine: boolean }): string[] {
  const failures: string[] = [];
  const offset = (frame.drawnLeft + frame.drawnRight) / 2 - (frame.freeLeft + frame.freeRight) / 2;
  console.log(
    `[centre] ${where} free=[${Math.round(frame.freeLeft)}, ${Math.round(frame.freeRight)}] ` +
      `drawn=[${Math.round(frame.drawnLeft)}, ${Math.round(frame.drawnRight)}] offset=${offset.toFixed(1)} ` +
      `backing=${frame.backing.width}x${frame.backing.height} css=${frame.backing.cssWidth}x${frame.backing.cssHeight} ` +
      `indexTop=${frame.indexTop} toolbarTop=${frame.toolbarTop} insets=${frame.indexLeftInset}/${frame.toolbarRightInset}/${frame.railRightInset}`,
  );
  if (frame.drawn < 3) {
    // An overview draws the project and its domains; fewer means nothing was measured.
    failures.push(`${where}: ${frame.drawn} drawn nodes with readable radii, nothing to centre`);
    return failures;
  }
  if (Math.abs(offset) > TOLERANCE) {
    failures.push(`${where}: the drawing's centre is ${offset.toFixed(1)}px from the free map's centre`);
  }
  const { width, height, cssWidth, cssHeight, dpr } = frame.backing;
  if (Math.abs(width - Math.round(cssWidth * dpr)) > 1 || Math.abs(height - Math.round(cssHeight * dpr)) > 1) {
    failures.push(`${where}: the bitmap is ${width}x${height} for a ${cssWidth}x${cssHeight} canvas at ${dpr}x`);
  }
  if (chromeLine) {
    if (frame.indexTop === null || Math.abs(frame.indexTop - frame.toolbarTop) > 0.5) {
      failures.push(`${where}: INDEX's top (${frame.indexTop}) and the tool row's (${frame.toolbarTop}) are not one line`);
    }
    const insets = [frame.indexLeftInset, frame.toolbarRightInset, frame.railRightInset];
    if (insets.some((inset) => inset === null || Math.abs(inset - insets[0]!) > 0.5)) {
      failures.push(`${where}: INDEX, the tool row and the rail stand ${insets.join(" / ")}px in, not one inset`);
    }
  }
  return failures;
}

async function pressFit(page: Page) {
  await page.getByTestId("topology-fit-control").getByRole("button").click();
  await waitForMapStill(page, { what: "camera" });
}

test("the overview stands in the middle of the free map, on one chrome line, with INDEX open or folded", async ({ page }) => {
  test.setTimeout(300_000);
  await seedFirstRunSeen(page);
  const failures: string[] = [];
  for (const index of ["expanded", "collapsed"] as const) {
    for (const size of SIZES) {
      await page.setViewportSize(size);
      await page.goto(`/ko/topology/?e2e=1&guides=off${index === "collapsed" ? "&index=collapsed" : ""}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByTestId(index === "expanded" ? "topology-index-panel" : "topology-index-tab")).toBeVisible({
        timeout: 30_000,
      });
      await page.evaluate(() => document.fonts.ready);
      await waitForMapSettled(page);
      const where = `${size.width}x${size.height} index=${index}`;
      failures.push(...check(await measure(page), `${where} entry`, { chromeLine: index === "expanded" }));
      // The fit tile frames the same drawing, not a second frame.
      await pressFit(page);
      failures.push(...check(await measure(page), `${where} fit`, { chromeLine: false }));
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("beside the open agent dock the overview still stands in the middle of the free map", async ({ page }) => {
  test.setTimeout(300_000);
  await installDesktopRailRuntime(page);
  await page.setViewportSize(SIZES[2]);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapSettled(page);
  const failures: string[] = [];
  for (const size of SIZES) {
    await page.setViewportSize(size);
    await page.goto("/ko/topology/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
    const chip = page.getByTestId("topology-vault-agent-toggle");
    await expect(chip).toBeVisible({ timeout: 30_000 });
    await waitForMapSettled(page);
    if ((await chip.getAttribute("aria-expanded")) !== "true") await chip.click();
    await expect(page.locator("main")).toHaveAttribute("data-agent-panel-open", "true");
    // The dock narrows the canvas over its reflow; the camera follows it to the end.
    await waitForBoxStill(page.getByTestId("ontology-map-canvas"));
    await waitForMapStill(page, { what: "camera" });
    const where = `${size.width}x${size.height} dock`;
    failures.push(...check(await measure(page), `${where} entry`, { chromeLine: false }));
    await pressFit(page);
    failures.push(...check(await measure(page), `${where} fit`, { chromeLine: false }));
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

/**
 * **At tablet widths the half-canvas cap keeps the centre** (2026-09-26). Between 768 and
 * 1023 the side lanes ask for more than half the canvas and the fit caps them. The cap cut
 * each lane in proportion to its give above what it measurably covers, and the rail's
 * lane had no measured floor, so it gave twice INDEX's air and the overview slid toward
 * the rail: +6.6 px at 900 and +15.4 px at 800 wide, and at 768 +18.2 px with the drawing
 * 9 px into the tiles' column. The lanes now give way by equal pixels, which keeps the
 * drawing between INDEX and the rail.
 */
test("at tablet widths, with INDEX open, the overview still stands in the middle of the free map", async ({ page }) => {
  test.setTimeout(240_000);
  await seedFirstRunSeen(page);
  const failures: string[] = [];
  for (const size of [
    { width: 768, height: 1024 },
    { width: 800, height: 1000 },
    { width: 900, height: 1000 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/ko/topology/?e2e=1&guides=off&index=expanded", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("topology-index-panel")).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await waitForMapSettled(page);
    failures.push(...check(await measure(page), `${size.width}x${size.height} tablet entry`, { chromeLine: false }));
    await pressFit(page);
    failures.push(...check(await measure(page), `${size.width}x${size.height} tablet fit`, { chromeLine: false }));
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

/** The free map (INDEX's right edge to the rail's left edge) against a drawn extent, page px. */
async function freeMap(page: Page) {
  return page.evaluate((railIds) => {
    const shown = (element: Element | null) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return null;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < 0.05) return null;
      return box;
    };
    const index = shown(document.querySelector('[data-testid="topology-index-panel"]'));
    const tab = shown(document.querySelector('[data-testid="topology-index-tab"]'));
    const rail = railIds
      .map((id) => shown(document.querySelector(`[data-testid="${id}"]`)))
      .filter((box): box is DOMRect => box !== null);
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"], [data-testid="territories-map"]')!.getBoundingClientRect();
    return {
      left: (index ?? tab)?.right ?? canvas.left,
      right: rail.length > 0 ? Math.min(...rail.map((box) => box.left)) : canvas.right,
    };
  }, RAIL);
}

async function chooseView(page: Page, view: string) {
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId(`topology-view-3d-choice-${view}`).click();
  await expect(page.getByTestId(`topology-view-3d-choice-${view}`)).toHaveCount(0);
}

/**
 * **Territories and Neural rest in the middle of the free map too** (2026-09-26), measured on
 * the product's own ontology at 1512×949 with INDEX open, as the owner saw them.
 *
 * - Territories rested with its project where the room's centre put it, 10 px left of that
 *   centre, and its names hang unevenly around the project: the drawing stood 12.5 px right.
 * - Neural was fitted between INDEX and the canvas's edge, as if the rail's column were free
 *   map: 30 px right at its fitted pose, one node under the tiles.
 *
 * Reduced motion, so the 3D view rests at the pose it was fitted for rather than turning.
 */
test("Territories and Neural rest in the middle of the free map", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, dogfoodVaultFiles(), undefined, { replaceFixture: true });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapSettled(page);
  const failures: string[] = [];

  await chooseView(page, "territories");
  await expect(page.getByTestId("territories-map")).toHaveAttribute("data-territories-ready", "true", { timeout: 60_000 });
  await waitForBoxStill(page.getByTestId("territories-map"));
  const territories = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="territories-map"] canvas')!.getBoundingClientRect();
    const xs: number[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-territory-id]")) {
      const mark = el.dataset.mark?.split(",").map(Number);
      if (mark && mark.length === 3) xs.push(canvas.left + mark[0]! - mark[2]!, canvas.left + mark[0]! + mark[2]!);
      // Names drawn at rest belong to the drawing; a folded name waits for hover.
      const box = el.dataset.labelBox?.split(",").map(Number);
      if (box && box.length === 4 && el.dataset.labelShown !== "on-focus") xs.push(canvas.left + box[0]!, canvas.left + box[0]! + box[2]!);
    }
    return { left: Math.min(...xs), right: Math.max(...xs), count: xs.length };
  });
  const free = await freeMap(page);
  const territoriesOffset = (territories.left + territories.right) / 2 - (free.left + free.right) / 2;
  console.log(`[centre] territories drawn=[${Math.round(territories.left)}, ${Math.round(territories.right)}] free=[${Math.round(free.left)}, ${Math.round(free.right)}] offset=${territoriesOffset.toFixed(1)}`);
  if (territories.count < 10) failures.push(`territories: ${territories.count / 2} marks measured, nothing to centre`);
  else if (Math.abs(territoriesOffset) > TOLERANCE) failures.push(`territories: the drawing's centre is ${territoriesOffset.toFixed(1)}px from the free map's centre`);

  // Straight from the flat map, so Neural is framed on entry rather than handed another view's camera.
  await chooseView(page, "flat");
  await waitForMapSettled(page);
  await chooseView(page, "coupling");
  await waitForDomeEntered(page, 60_000);
  await waitForMapStill(page);
  // 3D discs carry their depth's perspective, which the probe's radius already holds.
  const neural = await page.evaluate(() => {
    const probe = window.__atlasMap!;
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const stretch = canvas.width / probe.camera()!.width;
    const drawn = probe.nodes().filter((node) => !node.hidden && (node.alpha ?? 1) > 0.05 && node.radius > 0);
    return {
      left: Math.min(...drawn.map((node) => canvas.left + (node.x - node.radius) * stretch)),
      right: Math.max(...drawn.map((node) => canvas.left + (node.x + node.radius) * stretch)),
      count: drawn.length,
    };
  });
  const neuralFree = await freeMap(page);
  const neuralOffset = (neural.left + neural.right) / 2 - (neuralFree.left + neuralFree.right) / 2;
  console.log(`[centre] neural drawn=[${Math.round(neural.left)}, ${Math.round(neural.right)}] free=[${Math.round(neuralFree.left)}, ${Math.round(neuralFree.right)}] offset=${neuralOffset.toFixed(1)}`);
  if (neural.count < 10) failures.push(`neural: ${neural.count} drawn nodes, nothing to centre`);
  else if (Math.abs(neuralOffset) > TOLERANCE) failures.push(`neural: the drawing's centre is ${neuralOffset.toFixed(1)}px from the free map's centre`);
  if (neural.right > neuralFree.right) failures.push(`neural: the drawing runs ${(neural.right - neuralFree.right).toFixed(1)}px into the rail's column`);
  expect(failures, failures.join("\n")).toEqual([]);
});
