import { expect, test } from "@playwright/test";
import "./atlas-map-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapSettled, waitForMapStill } from "./settle";
import type { Box, DialProbe } from "../../src/widgets/ontology-map/dial/types";

/**
 * **A short window does not keep tall reservations** (2026-09-19).
 *
 * The overview fit reserves a tool lane on top (148) and a readout band on
 * the bottom (96 plus the label allowance), sized for a tall desktop window.
 * Below 880 px the bands shrink to the tool lane plus a chip and the readout
 * plus a name. The flat dial (2026-10-03) frames its clusters and their
 * outward names, so the bar is the drawn extent (chips, discs and domain
 * names) against the free map: on the binding axis it fills at least 85 %
 * at 1512×806, and no name leaves the free rect.
 */
async function drawnFill(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const probe = window.__atlasMap!;
    const dial = probe.dial!() as DialProbe;
    const free = dial.freeRect;
    const chips = probe.nodes().filter((n) => !n.hidden && n.kind === "domain");
    const boxes: Box[] = [
      ...chips.map((n) => ({ minX: n.x - n.radius, maxX: n.x + n.radius, minY: n.y - n.radius, maxY: n.y + n.radius })),
      ...dial.discs.map((d) => ({ minX: d.x - d.r, maxX: d.x + d.r, minY: d.y - d.r, maxY: d.y + d.r })),
      ...dial.texts.filter((t) => t.role === "domain").map((t) => t.box),
    ];
    const minX = Math.min(...boxes.map((b) => b.minX));
    const maxX = Math.max(...boxes.map((b) => b.maxX));
    const minY = Math.min(...boxes.map((b) => b.minY));
    const maxY = Math.max(...boxes.map((b) => b.maxY));
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const controls = [...document.querySelectorAll<HTMLElement>("main button")]
      .filter((el) => el.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.top < 120 && r.left > canvas.left);
    const toolbarBottom = Math.max(...controls.map((r) => r.bottom)) - canvas.top;
    const inside = (b: Box) => b.minX >= free.minX && b.maxX <= free.maxX && b.minY >= free.minY && b.maxY <= free.maxY;
    return {
      owns: dial.owns,
      fill: Math.max((maxX - minX) / (free.maxX - free.minX), (maxY - minY) / (free.maxY - free.minY)),
      chipTop: Math.min(...chips.map((n) => n.y - n.radius)),
      toolbarBottom,
      height: probe.camera()!.height,
      namesOutside: dial.texts.filter((t) => !inside(t.box)).map((t) => t.text),
      labelsUnderToolbar: probe.labels().filter((l) => l.minY < toolbarBottom).map((l) => l.text),
    };
  });
}

async function waitForDialSettled(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => {
      const dial = window.__atlasMap?.dial?.();
      return !!dial && dial.owns && (dial as DialProbe).placement.state === "settled";
    },
    undefined,
    { polling: "raf" },
  );
  await waitForMapStill(page);
}

async function open(page: import("@playwright/test").Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await waitForMapSettled(page);
  await waitForDialSettled(page);
  return drawnFill(page);
}

test("the dial fills a short window's free map instead of a tall reservation", async ({ page }) => {
  test.setTimeout(90_000);
  await seedFirstRunSeen(page);
  // At the app's 1040×720 floor the side lanes bind, so only the 14-inch
  // window carries a fill floor; both keep the clipping invariants.
  for (const [width, height, floor] of [
    [1512, 806, 0.85],
    [1040, 720, 0],
  ] as const) {
    const fill = await open(page, width, height);
    console.log(`[short-fit] ${width}×${height} ${JSON.stringify(fill)}`);
    expect(fill.owns, `${width}×${height}: the dial draws the overview`).toBe(true);
    if (floor > 0) expect(fill.fill, `${width}×${height}: the drawing fills ${Math.round(fill.fill * 100)} % of the free map`).toBeGreaterThanOrEqual(floor);
    expect(fill.chipTop, `${width}×${height}: a chip sits under the toolbar`).toBeGreaterThan(fill.toolbarBottom);
    expect(fill.namesOutside, `${width}×${height}: names outside the free map`).toEqual([]);
    expect(fill.labelsUnderToolbar, `${width}×${height}: names under the toolbar`).toEqual([]);
  }
});

/**
 * The lanes are read again on every viewport commit, so a window dragged
 * from tall to short refits with the short lanes without a reload — the
 * token cache used to hold the first read for the whole session.
 */
test("shrinking a tall window refits with the short lanes without a reload", async ({ page }) => {
  test.setTimeout(90_000);
  await seedFirstRunSeen(page);
  const tall = await open(page, 1512, 1000);
  expect(tall.chipTop, "a tall window keeps the tall reservation (148)").toBeGreaterThanOrEqual(148);
  await page.setViewportSize({ width: 1512, height: 806 });
  await waitForMapStill(page);
  const short = await drawnFill(page);
  console.log(`[short-fit] 1512×1000 → 1512×806 ${JSON.stringify(short)}`);
  expect(short.height).toBeLessThan(880);
  expect(short.fill, `after shrinking, the drawing fills ${Math.round(short.fill * 100)} % of the free map`).toBeGreaterThanOrEqual(0.85);
  expect(short.namesOutside, "after shrinking, names outside the free map").toEqual([]);
});
