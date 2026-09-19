import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForDomeAssembled, waitForFlatMap, waitForMapStill } from "./settle";

type Camera = { x: number; y: number; scale: number };

const camera = (page: Page) =>
  page.evaluate(() => window.__atlasMap?.camera() ?? null) as Promise<Camera | null>;

async function choose(page: Page, choice: "flat" | "galaxy" | "ownership") {
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

/**
 * **Galaxy → Cone keeps the cone's own fit.** Leaving Galaxy queues the Flat
 * camera saved on the way in and restores it once the stars have flown home —
 * and when the view chosen on the same switch is 3D, that restore landed on top
 * of the cone's fit. Measured 2026-09-19 at 1512×806, Flat → Galaxy → Cone: the
 * cone stood 286 px down with five nodes under the viewport, at the Flat scale
 * 0.477 instead of its fit 0.68. Flat → Cone, the same cone without the Galaxy
 * detour, is the reference frame.
 */
test("Galaxy → Cone frames the cone, not the Flat camera saved before Galaxy", async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.galaxy", "off");
    window.localStorage.setItem("atlas.appearance.view3d", "off");
  });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page);

  // The cone keeps its attention spin, so "dome" and "layout" stillness never
  // arrive on their own; the camera spring is the motion that ends.
  const coneFrame = async () => {
    await waitForDomeAssembled(page);
    // The stars flying home from Galaxy are the motion the stale restore waits
    // for, so measuring before it ends would pass on the frame the defect has
    // not reached yet. The idle gate names that motion ("homing").
    await page.waitForFunction(
      () => {
        const probe = window as unknown as { __atlasMap?: { idleDebug: () => { lastActive: { causes: string[] } | null } } };
        const causes = probe.__atlasMap?.idleDebug().lastActive?.causes ?? [];
        return !causes.includes("homing");
      },
      undefined,
      { polling: "raf", timeout: 30_000 },
    );
    await waitForMapStill(page, { what: "camera" });
    return page.evaluate(() => {
      const probe = window.__atlasMap!;
      const camera = probe.camera()!;
      const nodes = probe.nodes().filter((node) => !node.hidden);
      return {
        scale: probe.cameraTarget?.()?.scale ?? camera.scale,
        below: nodes.filter((node) => node.y > camera.height).length,
        top: Math.min(...nodes.map((node) => node.y)),
      };
    });
  };

  await choose(page, "ownership");
  const direct = await coneFrame();
  expect(direct.below, "곧장 들어간 원뿔부터 화면 밖이면 기준이 없다").toBe(0);

  await choose(page, "flat");
  await waitForFlatMap(page);
  await choose(page, "galaxy");
  await waitForMapStill(page);
  await choose(page, "ownership");
  const detour = await coneFrame();

  expect(detour.below, "갤럭시를 거쳐 온 원뿔이 화면 아래로 잘렸다").toBe(0);
  expect(
    Math.abs(detour.scale - direct.scale),
    `갤럭시를 거친 원뿔 배율 ${detour.scale.toFixed(3)} 이 곧장 들어간 ${direct.scale.toFixed(3)} 과 다르다`,
  ).toBeLessThan(0.05);
  expect(Math.abs(detour.top - direct.top), "원뿔 꼭대기가 다른 높이에 섰다").toBeLessThan(40);
});
