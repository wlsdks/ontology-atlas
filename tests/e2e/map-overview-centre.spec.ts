import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForBoxStill, waitForMapSettled, waitForMapStill } from "./settle";

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
