import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { waitForDomeEntered, waitForMapStill, waitFrames } from "../../settle";
import { openMapOnApp } from "../open-map-on-app";
import { storefrontSampleFiles } from "../storefront-sample-files";
import { probe } from "./neural-dogfood";

/**
 * Turning Neural after a selection keeps the whole map in the area the panels leave free, as it does
 * with nothing selected: the turn's zoom follows the selection's fit, and the camera comes to rest.
 */

const SUBJECT = "capability:order-placement";

/** Drags the empty canvas sideways until the cloud has turned by `radians`, then lets it settle. */
async function turnBy(page: Page, radians: number) {
  const start = (await probe(page, (p) => p.dome()!.yaw));
  const grip = await page.evaluate(() => {
    const map = (window as unknown as { __atlasMap: { nodes: () => Array<{ x: number; y: number; radius: number; hidden: boolean }> } }).__atlasMap;
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const nodes = map.nodes().filter((n) => !n.hidden);
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (let ring = 0; ring < 60; ring += 1) {
      for (let k = 0; k < 12; k += 1) {
        const x = cx + Math.cos((k / 12) * Math.PI * 2) * ring * 6;
        const y = cy + Math.sin((k / 12) * Math.PI * 2) * ring * 6;
        const hit = document.elementFromPoint(canvas.left + x, canvas.top + y);
        if (hit?.getAttribute("data-testid") === "ontology-map-canvas" && nodes.every((n) => Math.hypot(n.x - x, n.y - y) > n.radius + 10)) {
          return { x: canvas.left + x, y: canvas.top + y };
        }
      }
    }
    return null;
  });
  expect(grip, "no empty canvas inside the cloud to turn it by").not.toBeNull();
  await page.mouse.move(grip!.x, grip!.y);
  await page.mouse.down();
  let x = grip!.x;
  for (let step = 0; step < 300; step += 1) {
    x += 2;
    await page.mouse.move(x, grip!.y);
    if (Math.abs((await probe(page, (p) => p.dome()!.yaw)) - start) >= radians) break;
  }
  // Hold still for a few frames so the release carries no fling.
  for (let k = 0; k < 6; k += 1) {
    await page.mouse.move(x, grip!.y);
    await waitFrames(page, 1);
  }
  await page.mouse.up();
  await page.mouse.move(2, 2);
  await waitForMapStill(page, { what: "dome" });
}

/** The cells whose centres lie outside the canvas area the toolbar and the detail panel leave free. */
async function cellsOutsideFreeArea(page: Page) {
  const canvas = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const toolbar = await page.getByTestId("topology-top-toolbar").boundingBox();
  const panel = await page.getByTestId("map-detail-panel").boundingBox();
  const free = {
    left: canvas.x,
    right: panel ? panel.x : canvas.x + canvas.width,
    top: toolbar ? toolbar.y + toolbar.height : canvas.y,
    bottom: canvas.y + canvas.height,
  };
  const cells = (await probe(page, (p) => p.nodes())).filter((n) => !n.hidden);
  return cells
    .map((n) => ({ id: n.id, x: canvas.x + n.x, y: canvas.y + n.y }))
    .filter((c) => c.x < free.left || c.x > free.right || c.y < free.top || c.y > free.bottom);
}

test("turning Neural after a selection keeps every cell in the free area, and the map comes to rest", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
    window.localStorage.setItem("atlas.appearance.map-arrangement", "coupling");
  });
  await installDesktopRailRuntime(page, storefrontSampleFiles(), undefined, { replaceFixture: true });
  await openMapOnApp(page, "/ko/topology/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await waitForDomeEntered(page, 120_000);
  await expect.poll(() => probe(page, (p) => p.nodes().some((n) => n.id === "capability:order-placement")), { timeout: 60_000 }).toBe(true);

  await turnBy(page, Math.PI / 4);
  const canvas = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const cell = (await probe(page, (p) => p.nodes())).find((n) => n.id === SUBJECT)!;
  await page.mouse.click(canvas.x + cell.x, canvas.y + cell.y);
  await expect(page.getByTestId("map-detail-panel")).toHaveAttribute("data-selected-node-id", SUBJECT);
  await page.mouse.move(2, 2);
  await waitForMapStill(page, { what: "camera" });

  await turnBy(page, Math.PI / 4);
  await waitForMapStill(page, { what: "camera" });
  expect(await cellsOutsideFreeArea(page)).toEqual([]);
});
