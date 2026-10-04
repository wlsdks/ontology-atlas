import { expect, test, type Page } from "@playwright/test";
import "./atlas-cosmos-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForDomeAssembled, waitForFlatMap, waitForMapStill } from "./settle";

type Camera = { x: number; y: number; scale: number };

const camera = (page: Page) =>
  page.evaluate(() => window.__atlasMap?.camera() ?? null) as Promise<Camera | null>;

async function choose(page: Page, choice: "flat" | "galaxy" | "strata") {
  await page.locator('[data-testid="topology-view-3d"]').click();
  await page.locator(`[data-testid="topology-view-3d-choice-${choice}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
});

test("a cold Galaxy entry returns to a useful first Flat frame", async ({ page }) => {
  const flatPage = await page.context().newPage();
  await flatPage.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(flatPage);
  await flatPage.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.galaxy", "off");
    window.localStorage.setItem("atlas.appearance.view3d", "off");
  });
  await flatPage.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(flatPage);
  const coldFlat = await camera(flatPage);
  expect(coldFlat).not.toBeNull();
  await flatPage.close();

  await page.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.galaxy", "on");
    window.localStorage.setItem("atlas.appearance.view3d", "off");
  });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="topology-view-3d"]')).toHaveText(/Galaxy|갤럭시/);
  await waitForCosmosStill(page);

  await choose(page, "flat");
  await waitForMapStill(page);
  const settled = await camera(page);
  expect(settled).not.toBeNull();
  expect(Math.abs(settled!.scale - coldFlat!.scale), "the round trip lands on the cold Flat entry's scale").toBeLessThanOrEqual(0.01);
  expect(await page.evaluate(() => window.__atlasMap?.nodes().filter((node) => !node.hidden).length ?? 0))
    .toBeGreaterThan(0);
});

/**
 * **Galaxy → Strata keeps the 3D view's own fit** (the Cone this was measured on left on 2026-09-25; the fit path is shared). Leaving Galaxy queues the Flat
 * camera saved on the way in and restores it once the stars have flown home —
 * and when the view chosen on the same switch is 3D, that restore landed on top
 * of the cone's fit. Measured 2026-09-19 at 1512×806, Flat → Galaxy → Cone: the
 * cone stood 286 px down with five nodes under the viewport, at the Flat scale
 * 0.477 instead of its fit 0.68. Flat → Cone, the same cone without the Galaxy
 * detour, is the reference frame.
 */
test("Galaxy → Strata frames the 3D view, not the Flat camera saved before Galaxy", async ({ page }) => {
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

  await choose(page, "strata");
  const direct = await coneFrame();
  expect(direct.below, "곧장 들어간 원뿔부터 화면 밖이면 기준이 없다").toBe(0);

  await choose(page, "flat");
  await waitForFlatMap(page);
  await choose(page, "galaxy");
  await waitForCosmosStill(page);
  await choose(page, "strata");
  const detour = await coneFrame();

  expect(detour.below, "갤럭시를 거쳐 온 원뿔이 화면 아래로 잘렸다").toBe(0);
  expect(
    Math.abs(detour.scale - direct.scale),
    `갤럭시를 거친 원뿔 배율 ${detour.scale.toFixed(3)} 이 곧장 들어간 ${direct.scale.toFixed(3)} 과 다르다`,
  ).toBeLessThan(0.05);
  expect(Math.abs(detour.top - direct.top), "원뿔 꼭대기가 다른 높이에 섰다").toBeLessThan(40);
});

const COSMOS_PREFIX = "atlas.map.cosmos.v1:";
type CosmosRecord = { version: 1; centres: Record<string, [number, number]> };

async function openGalaxy(page: Page, query = "") {
  await page.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.galaxy", "on");
    window.localStorage.setItem("atlas.appearance.view3d", "off");
    window.localStorage.setItem("atlas.appearance.territories", "off");
    window.localStorage.setItem("atlas.appearance.hex-board", "off");
  });
  await page.goto(`/en/topology/?e2e=1&guides=off${query}`, { waitUntil: "domcontentloaded" });
  await waitForCosmosStill(page);
}

async function waitForCosmosStill(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __cosmosStill?: unknown }).__cosmosStill = { sig: "", count: 0 };
  });
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __cosmosStill: { sig: string; count: number } };
      const probe = window.__atlasCosmos;
      const layout = probe?.layout();
      if (!probe || !layout || layout.galaxies.length === 0) return false;
      if (probe.arrival().active || probe.interaction().kind !== "none") return false;
      const c = probe.camera();
      const sig = JSON.stringify([c.x, c.y, c.scale, c.width, probe.room(), layout.galaxies.map((g) => [g.id, g.sx, g.sy])]);
      if (w.__cosmosStill.sig === sig) w.__cosmosStill.count += 1;
      else w.__cosmosStill = { sig, count: 0 };
      return w.__cosmosStill.count >= 20;
    },
    undefined,
    { polling: "raf", timeout: 30_000 },
  );
}

const readRecord = (page: Page) =>
  page.evaluate((prefix) => {
    const key = Object.keys(window.localStorage).find((k) => k.startsWith(prefix));
    return key ? { key, record: JSON.parse(window.localStorage.getItem(key)!) as CosmosRecord } : null;
  }, COSMOS_PREFIX);

const galaxyWorld = (page: Page) =>
  page.evaluate(() => {
    const probe = window.__atlasCosmos!;
    const c = probe.camera();
    const room = probe.room();
    return probe.layout()!.galaxies.map((g) => ({
      id: g.id,
      sx: g.sx,
      sy: g.sy,
      wx: c.x + (g.sx - room.x - room.width / 2) / c.scale,
      wy: c.y + (g.sy - room.y - room.height / 2) / c.scale,
    }));
  });

async function shiftRecordedCentre(page: Page) {
  const stored = await readRecord(page);
  expect(stored).not.toBeNull();
  const [id, [x, y]] = Object.entries(stored!.record.centres).sort((a, b) => Math.hypot(...b[1]) - Math.hypot(...a[1]))[0]!;
  const length = Math.hypot(x, y) || 1;
  const moved: [number, number] = [x + (300 * x) / length, y + (300 * y) / length];
  const centres = { ...stored!.record.centres, [id]: moved };
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [stored!.key, JSON.stringify({ version: 1, centres })] as const);
  return { key: stored!.key, id, x: moved[0], y: moved[1] };
}

test("Galaxy records the settled centres per folder and draws them again after a reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGalaxy(page);
  await expect.poll(async () => Object.keys((await readRecord(page))?.record.centres ?? {}).length).toBe(9);
  const before = await galaxyWorld(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForCosmosStill(page);
  const after = await galaxyWorld(page);
  expect(after.map((g) => g.id).sort()).toEqual(before.map((g) => g.id).sort());
  for (const g of before) {
    const again = after.find((a) => a.id === g.id)!;
    expect(Math.abs(again.sx - g.sx), g.id).toBeLessThan(0.5);
    expect(Math.abs(again.sy - g.sy), g.id).toBeLessThan(0.5);
  }
});

test("a recorded centre is where Galaxy draws that galaxy", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGalaxy(page);
  await expect.poll(async () => (await readRecord(page)) !== null).toBe(true);
  const moved = await shiftRecordedCentre(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForCosmosStill(page);
  const drawn = (await galaxyWorld(page)).find((g) => g.id === moved.id)!;
  expect(Math.abs(drawn.wx - moved.x)).toBeLessThan(0.5);
  expect(Math.abs(drawn.wy - moved.y)).toBeLessThan(0.5);
});

test("Auto-arrange settles Galaxy afresh and records the fresh sky", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGalaxy(page);
  await expect.poll(async () => (await readRecord(page)) !== null).toBe(true);
  const moved = await shiftRecordedCentre(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForCosmosStill(page);

  await page.getByTestId("topology-auto-arrange").click();
  await expect.poll(async () => (await readRecord(page))?.record.centres[moved.id]?.[0]).not.toBe(moved.x);
  await waitForCosmosStill(page);
  const arranged = (await readRecord(page))!.record.centres;

  await page.evaluate((key) => window.localStorage.removeItem(key), moved.key);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForCosmosStill(page);
  await expect.poll(async () => (await readRecord(page)) !== null).toBe(true);
  const fresh = (await readRecord(page))!.record.centres;

  expect(Object.keys(arranged).sort()).toEqual(Object.keys(fresh).sort());
  for (const [id, [x, y]] of Object.entries(fresh)) {
    expect(Math.abs(arranged[id]![0] - x), id).toBeLessThanOrEqual(0.01);
    expect(Math.abs(arranged[id]![1] - y), id).toBeLessThanOrEqual(0.01);
  }
});

test("Flat returns to its overview after a Galaxy round trip", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.galaxy", "off");
    window.localStorage.setItem("atlas.appearance.view3d", "off");
  });
  await page.goto("/en/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page);
  const overview = await camera(page);

  await choose(page, "galaxy");
  await waitForCosmosStill(page);
  await choose(page, "flat");
  await waitForFlatMap(page);
  const back = await camera(page);
  expect(back).not.toBeNull();
  expect(Math.abs(back!.x - overview!.x)).toBeLessThan(0.1);
  expect(Math.abs(back!.y - overview!.y)).toBeLessThan(0.1);
  expect(Math.abs(back!.scale - overview!.scale)).toBeLessThan(0.1);
});

test("zooming into a galaxy moves the footer to the circuit tier", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGalaxy(page);
  const canvas = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const largest = await page.evaluate(() => {
    const galaxies = window.__atlasCosmos!.layout()!.galaxies;
    return [...galaxies].sort((a, b) => b.members - a.members)[0]!;
  });
  await page.mouse.move(canvas.x + largest.sx, canvas.y + largest.sy);
  for (let i = 0; i < 40; i += 1) {
    if ((await page.evaluate(() => window.__atlasCosmos!.stats()?.band)) === "circuit") break;
    await page.mouse.wheel(0, -240);
    await waitForCosmosStill(page);
  }
  expect(await page.evaluate(() => window.__atlasCosmos!.stats()?.band)).toBe("circuit");
  await expect(page.getByTestId("first-run-readout")).toHaveAttribute("data-zoom-tier", "circuit");
});

test("inside a live galaxy Galaxy strokes far fewer paths than it draws stars", async ({ page }) => {
  await page.addInitScript(() => {
    const counter = { strokes: 0 };
    (window as unknown as { __cosmosStrokes: typeof counter }).__cosmosStrokes = counter;
    const original = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (this: CanvasRenderingContext2D, ...args: [Path2D?]) {
      if ((this.canvas as HTMLCanvasElement).dataset?.testid === "ontology-map-canvas") counter.strokes += 1;
      return (original as (...a: unknown[]) => void).apply(this, args);
    };
  });
  await openGalaxy(page, "&synth=2000");
  const target = await page.evaluate(() => {
    const galaxies = window.__atlasCosmos!.layout()!.galaxies;
    return [...galaxies].sort((a, b) => b.members - a.members)[0]!.id;
  });
  await page.evaluate((id) => window.__atlasCosmos!.flyTo(id), target);
  await page.waitForFunction(() => (window.__atlasCosmos!.stats()?.liveGalaxies ?? 0) > 0, undefined, { polling: "raf", timeout: 30_000 });

  const perFrame = await page.evaluate(
    () =>
      new Promise<{ strokes: number; liveStars: number }>((resolve) => {
        const probe = window.__atlasCosmos!;
        const counter = (window as unknown as { __cosmosStrokes: { strokes: number } }).__cosmosStrokes;
        const strokes: number[] = [];
        const stars: number[] = [];
        let frames = probe.frames();
        let last = counter.strokes;
        const sample = () => {
          const now = probe.frames();
          if (now === frames + 1) {
            strokes.push(counter.strokes - last);
            stars.push(probe.stats()?.liveStars ?? 0);
          }
          frames = now;
          last = counter.strokes;
          if (strokes.length >= 12) {
            const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1]!;
            resolve({ strokes: median(strokes), liveStars: median(stars) });
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
  expect(perFrame.liveStars).toBeGreaterThan(0);
  expect(perFrame.strokes).toBeLessThan(perFrame.liveStars / 10);
});
