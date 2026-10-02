import { expect, test, type Page } from "@playwright/test";
import type {} from "./atlas-map-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapSettled, waitForMapStill } from "./settle";

const DRAG_PX = 200;
const CANVAS = '[data-testid="ontology-map-canvas"]';

async function seedSpeeds(page: Page, speeds: { drag?: string; zoom?: string }) {
  await page.addInitScript((stored: { drag?: string; zoom?: string }) => {
    if (stored.drag) window.localStorage.setItem("atlas.appearance.map-drag-speed", stored.drag);
    if (stored.zoom) window.localStorage.setItem("atlas.appearance.map-zoom-speed", stored.zoom);
  }, speeds);
}

async function emptyCanvasPoint(page: Page, span: number): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ({ selector, span }) => {
      const canvas = document.querySelector(selector)!;
      const box = canvas.getBoundingClientRect();
      const probe = window.__atlasMap!;
      const marks = probe
        .nodes()
        .filter((node) => !node.hidden && (node.alpha ?? 1) > 0.05)
        .map((node) => ({ x: box.x + node.x, y: box.y + node.y, r: Math.max(node.radius, 8) }));
      const names = probe.labels().map((label) => ({
        x: box.x + (label.minX + label.maxX) / 2,
        y: box.y + (label.minY + label.maxY) / 2,
        r: Math.hypot(label.maxX - label.minX, label.maxY - label.minY) / 2,
      }));
      for (let fy = 0.3; fy <= 0.75; fy += 0.025) {
        for (let fx = 0.15; fx <= 0.6; fx += 0.02) {
          const x = box.x + box.width * fx;
          const y = box.y + box.height * fy;
          if (document.elementFromPoint(x, y) !== canvas || document.elementFromPoint(x + span, y) !== canvas) continue;
          const clear = [...marks, ...names].every((mark) => Math.hypot(mark.x - x, mark.y - y) - mark.r > 40);
          if (clear) return { x, y };
        }
      }
      return null;
    },
    { selector: CANVAS, span },
  );
  expect(point, "no empty stretch of map to start a pan on").not.toBeNull();
  return point!;
}

async function readCamera(page: Page) {
  return page.evaluate(() => window.__atlasMap!.camera()!);
}

async function dragMap(page: Page, from: { x: number; y: number }, dx: number) {
  const before = await readCamera(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 20 });
  const held = await readCamera(page);
  const interaction = await page.evaluate(() => window.__atlasMap!.interaction?.() ?? { kind: "idle" as const, nodeId: null });
  await page.mouse.up();
  return { movedPx: (before.x - held.x) * before.scale, interaction: interaction.kind };
}

async function openFlatMap(page: Page) {
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
}

test("at 2x drag speed a 200 px background drag moves the flat map 400 px", async ({ page }) => {
  await seedSpeeds(page, { drag: "2" });
  await openFlatMap(page);
  const from = await emptyCanvasPoint(page, DRAG_PX);
  const { movedPx, interaction } = await dragMap(page, from, DRAG_PX);
  expect(interaction, "the press landed on a node, so this moved a node, not the map").toBe("pan");
  expect(movedPx).toBeCloseTo(DRAG_PX * 2, 0);
});

test("at 0.5x drag speed a 200 px drag moves the hex board 100 px", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  await seedSpeeds(page, { drag: "0.5" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ko/topology/?view=hex&e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  const board = page.getByTestId("hex-board-map");
  await expect(board).toHaveAttribute("data-hex-ready", "true");
  const readTile = () =>
    page.evaluate(() => {
      const tile = document.querySelector<HTMLElement>('[data-testid="hex-board-map"] [data-hex-kind="project"][data-mark]')!;
      const [x, y] = tile.dataset.mark!.split(",").map(Number);
      return { x, y };
    });
  const start = await readTile();
  const from = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas')!;
    const box = canvas.getBoundingClientRect();
    const marks = [...document.querySelectorAll<HTMLElement>("[data-hex-id][data-mark]")].map((el) =>
      el.dataset.mark!.split(",").map(Number),
    );
    for (let fy = 0.3; fy <= 0.75; fy += 0.025) {
      for (let fx = 0.15; fx <= 0.6; fx += 0.02) {
        const x = box.x + box.width * fx;
        const y = box.y + box.height * fy;
        if (document.elementFromPoint(x, y) !== canvas || document.elementFromPoint(x + 200, y) !== canvas) continue;
        if (marks.every(([mx, my, r]) => Math.hypot(box.x + mx - x, box.y + my - y) > r * 1.2)) return { x, y };
      }
    }
    return null;
  });
  expect(from, "no empty stretch of board to start a pan on").not.toBeNull();
  await page.mouse.move(from!.x, from!.y);
  await page.mouse.down();
  await page.mouse.move(from!.x + DRAG_PX, from!.y, { steps: 20 });
  await page.waitForFunction(
    (before) => {
      const board = document.querySelector<HTMLElement>('[data-testid="hex-board-map"]');
      const tile = board?.querySelector<HTMLElement>('[data-hex-kind="project"][data-mark]');
      return board?.dataset.hexReady === "true" && Number(tile?.dataset.mark?.split(",")[0]) !== before.x;
    },
    start,
    { polling: "raf" },
  );
  const moved = await readTile();
  await page.mouse.up();
  expect(moved.x - start.x).toBeCloseTo(DRAG_PX * 0.5, 0);
  expect(moved.y).toBe(start.y);
});

test("choosing speeds in Settings changes how far a drag and a zoom key move the map", async ({ page }) => {
  await openFlatMap(page);
  await page.locator('[data-testid="app-settings-trigger"]:visible').click();
  await page.getByTestId("app-settings-nav-background").click();
  await page.getByTestId("app-settings-map-drag-speed-0.5").click();
  await page.getByTestId("app-settings-map-zoom-speed-2").click();
  await expect(page.getByTestId("app-settings-map-drag-speed-0.5")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("app-settings-map-zoom-speed-2")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app-settings-popover")).toHaveCount(0);
  expect(
    await page.evaluate(() => [
      window.localStorage.getItem("atlas.appearance.map-drag-speed"),
      window.localStorage.getItem("atlas.appearance.map-zoom-speed"),
    ]),
  ).toEqual(["0.5", "2"]);

  await page.locator(CANVAS).focus();
  await waitForMapStill(page, { what: "camera" });
  const before = await readCamera(page);
  await page.keyboard.press("=");
  await waitForMapStill(page, { what: "camera" });
  const zoomed = await readCamera(page);
  expect(zoomed.scale / before.scale).toBeCloseTo(1.25 ** 2, 3);

  const from = await emptyCanvasPoint(page, DRAG_PX);
  const { movedPx, interaction } = await dragMap(page, from, DRAG_PX);
  expect(interaction).toBe("pan");
  expect(movedPx).toBeCloseTo(DRAG_PX * 0.5, 0);
});
