import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

type Camera = { x: number; y: number; scale: number };

const camera = (page: Page) =>
  page.evaluate(() => window.__atlasMap?.camera() ?? null) as Promise<Camera | null>;

async function choose(page: Page, choice: "flat" | "galaxy") {
  await page.locator('[data-testid="topology-view-3d"]').click();
  await page.locator(`[data-testid="topology-view-3d-choice-${choice}"]`).click();
}

function expectSameCamera(actual: Camera | null, expected: Camera | null) {
  expect(actual).not.toBeNull();
  expect(expected).not.toBeNull();
  expect(Math.abs(actual!.x - expected!.x)).toBeLessThan(0.1);
  expect(Math.abs(actual!.y - expected!.y)).toBeLessThan(0.1);
  expect(Math.abs(actual!.scale - expected!.scale)).toBeLessThan(0.001);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
});

test("a cold Galaxy entry returns to a useful first Flat frame", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.galaxy", "on");
    window.localStorage.setItem("atlas.appearance.view3d", "off");
  });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="topology-view-3d"]')).toHaveText(/Galaxy|갤럭시/);
  await waitForMapStill(page);

  await choose(page, "flat");
  await waitForMapStill(page);
  const settled = await camera(page);
  expect(settled).not.toBeNull();
  // This sample's spine has a useful close overview. The old transition used
  // the whole 105-node count and briefly/finally reduced it to a speck.
  expect(settled!.scale).toBeGreaterThan(0.5);
  expect(await page.evaluate(() => window.__atlasMap?.nodes().filter((node) => !node.hidden).length ?? 0))
    .toBeGreaterThan(0);
});

test("Flat zoom survives a Galaxy round trip and a rapid reversal", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.galaxy", "off");
    window.localStorage.setItem("atlas.appearance.view3d", "off");
  });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page);
  const canvas = (await page.locator('[data-testid="ontology-map-canvas"]').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, -120);
  await waitForMapStill(page, { what: "camera" });
  const zoomedFlat = await camera(page);

  await choose(page, "galaxy");
  await waitForMapStill(page);
  await choose(page, "flat");
  await waitForMapStill(page);
  expectSameCamera(await camera(page), zoomedFlat);

  // Reverse before either layout or camera can settle. The in-flight Galaxy
  // frame must not replace the remembered Flat camera.
  await choose(page, "galaxy");
  await choose(page, "flat");
  await waitForMapStill(page);
  expectSameCamera(await camera(page), zoomedFlat);

  // Reduced motion resolves the same state immediately. A late viewport
  // measurement (the real app shell finishes a few pixels after cold boot)
  // must not reinterpret the restored wheel view as an overview fit.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await choose(page, "galaxy");
  await choose(page, "flat");
  await page.setViewportSize({ width: 1408, height: 865 });
  await waitForMapStill(page);
  expectSameCamera(await camera(page), zoomedFlat);
});
