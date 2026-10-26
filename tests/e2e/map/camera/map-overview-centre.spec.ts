import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { seedFirstRunSeen } from "../../first-run-seed";
import { dogfoodVaultFiles } from "../dogfood-vault-files";
import { waitForBoxStill, waitForDomeEntered, waitForMapSettled, waitForMapStill } from "../../settle";

/**
 * The overview's centre must match the free map's centre (INDEX right edge to rail left edge)
 * and the chrome stands on one line; the Flat dial's drawing is its outer ring. Positions
 * convert through the canvas box.
 */

/** The app's window floor and its opening window: the two sizes the installed app is read at. */
const SIZES = [
  { width: 1040, height: 720 },
  { width: 1512, height: 949 },
  { width: 1920, height: 1080 },
] as const;
/** Half a node's rim: past it a person sees the drawing sit to one side. */
const TOLERANCE = 4;
const HUB_VERTICAL_TOLERANCE = 8;
const RING_CAPTION_INSIDE_FREE_MAP = 24;
const RAIL = ["topology-fit-control", "topology-shortcuts-help-button", "topology-replay-growth"];

interface Frame {
  branchLabelsOutside: string[] | null;
  freeLeft: number;
  freeRight: number;
  drawnLeft: number;
  drawnRight: number;
  drawn: number;
  hubY: number | null;
  ringTop: number | null;
  freeTop: number | null;
  freeBottom: number | null;
  toolbarBottom: number;
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
    const dial = probe.dial?.();
    const ring = dial?.owns ? Math.max(0, ...dial.rings.map((r) => r.radius)) * camera.scale : 0;
    const hub = ring > 0 ? drawn.find((node) => node.kind === "project") : undefined;
    const lefts = hub ? [canvas.left + (hub.x - ring) * stretch] : drawn.map((node) => canvas.left + (node.x - radius(node.kind)) * stretch);
    const rights = hub ? [canvas.left + (hub.x + ring) * stretch] : drawn.map((node) => canvas.left + (node.x + radius(node.kind)) * stretch);
    const toolbar = document.querySelector('[data-testid="topology-top-toolbar"]')!;
    const toolbarTiles = [...toolbar.querySelectorAll("button")]
      .map(shown)
      .filter((box): box is DOMRect => box !== null);
    return {
      branchLabelsOutside: dial?.owns && dial.rings.length === 0 && dial.clusters.length > 0
        ? dial.texts.filter((t) => t.box.minX < dial.freeRect.minX || t.box.maxX > dial.freeRect.maxX || t.box.minY < dial.freeRect.minY || t.box.maxY > dial.freeRect.maxY).map((t) => t.text)
        : null,
      freeLeft: (index ?? tab)?.right ?? canvas.left,
      freeRight: rail.length > 0 ? Math.min(...rail.map((box) => box.left)) : canvas.right,
      drawnLeft: Math.min(...lefts),
      drawnRight: Math.max(...rights),
      // Unreadable radius tokens would turn every offset into NaN, which no bound rejects.
      drawn: drawn.every((node) => radius(node.kind) > 0) ? drawn.length : 0,
      hubY: hub ? canvas.top + hub.y * stretch : null,
      ringTop: hub ? canvas.top + (hub.y - ring) * stretch : null,
      freeTop: hub && dial?.owns ? canvas.top + dial.freeRect.minY * stretch : null,
      freeBottom: hub && dial?.owns ? canvas.top + dial.freeRect.maxY * stretch : null,
      toolbarBottom: Math.max(...toolbarTiles.map((box) => box.bottom)),
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
  if (frame.branchLabelsOutside !== null) {
    if (frame.branchLabelsOutside.length) failures.push(`${where}: branch names outside the free map: ${frame.branchLabelsOutside.join(", ")}`);
  } else if (Math.abs(offset) > TOLERANCE) {
    failures.push(`${where}: the drawing's centre is ${offset.toFixed(1)}px from the free map's centre`);
  }
  if (frame.hubY !== null && frame.ringTop !== null && frame.freeTop !== null && frame.freeBottom !== null) {
    const vertical = frame.hubY - (frame.freeTop + frame.freeBottom) / 2;
    const air = frame.ringTop - frame.toolbarBottom;
    const inside = frame.ringTop - frame.freeTop;
    console.log(`[centre] ${where} hub=${frame.hubY.toFixed(1)} free=[${frame.freeTop.toFixed(1)}, ${frame.freeBottom.toFixed(1)}] vertical=${vertical.toFixed(1)} toolbarAir=${air.toFixed(1)} ringInside=${inside.toFixed(1)}`);
    if (Math.abs(vertical) > HUB_VERTICAL_TOLERANCE) failures.push(`${where}: the hub stands ${vertical.toFixed(1)}px from the free map's middle`);
    if (inside < RING_CAPTION_INSIDE_FREE_MAP) failures.push(`${where}: the outer ring's top stands ${inside.toFixed(1)}px inside the free map's top, under ${RING_CAPTION_INSIDE_FREE_MAP}px`);
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

async function waitForDialArrived(page: Page) {
  await page.waitForFunction(() => {
    const dial = window.__atlasMap?.dial?.();
    return !dial || (dial.owns && dial.domainAppear >= 1);
  }, undefined, { polling: "raf", timeout: 30_000 });
  await waitForMapStill(page);
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
      await waitForDialArrived(page);
      const where = `${size.width}x${size.height} index=${index}`;
      failures.push(...check(await measure(page), `${where} entry`, { chromeLine: index === "expanded" }));
      // The fit tile frames the same drawing, not a second frame.
      await pressFit(page);
      failures.push(...check(await measure(page), `${where} fit`, { chromeLine: false }));
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("Escape after a deep link lands on the same overview as the entry fit", async ({ page }) => {
  test.setTimeout(300_000);
  await seedFirstRunSeen(page);
  const failures: string[] = [];
  // The window floor (1040x720) is not claimed: its deselect fit still reads a larger scale than the entry fit.
  for (const size of SIZES.slice(1)) {
    await page.setViewportSize(size);
    await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("topology-index-panel")).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await waitForMapSettled(page);
    await waitForDialArrived(page);
    const entry = await measure(page);
    // A deep link's selection keeps no camera to return to, so Escape refits the overview.
    const slug = await page.evaluate(() => window.__atlasMap!.nodes().find((node) => node.kind === "capability")!.id);
    await page.goto(`/ko/topology/?e2e=1&guides=off&p=${encodeURIComponent(slug)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("map-detail-panel")).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await waitForMapSettled(page);
    await waitForDialArrived(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("map-detail-panel")).toBeHidden({ timeout: 15_000 });
    await waitForMapStill(page, { what: "camera" });
    const where = `${size.width}x${size.height} escape`;
    const back = await measure(page);
    failures.push(...check(back, where, { chromeLine: true }));
    const moved = Math.hypot(back.drawnLeft - entry.drawnLeft, (back.hubY ?? 0) - (entry.hubY ?? 0));
    if (moved > 1) failures.push(`${where}: the ring stands ${moved.toFixed(1)}px from where the entry fit put it`);
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("beside the open agent dock the overview still stands in the middle of the free map", async ({ page }) => {
  test.setTimeout(300_000);
  await installDesktopRailRuntime(page);
  await page.setViewportSize(SIZES[1]);
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
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
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
 * Neural rests in the middle of the free map, measured with INDEX open.
 * Reduced motion so the 3D view rests at its fitted pose.
 */
test("Neural rests in the middle of the free map", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, dogfoodVaultFiles(), undefined, { replaceFixture: true });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapSettled(page);
  const failures: string[] = [];

  // Straight from the flat map, so Neural is framed on entry rather than handed another view's camera.
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
