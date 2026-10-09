import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * A domain at the canvas floor keeps its name, and no name enters the floor
 * band reserved for the readout. On this route the Flat dial paints the
 * overview, and `dial/label-marks.ts#domainNames` accepts a slot only when the
 * whole box is inside `freeRect`, which ends where the band starts. So a name
 * whose slot below would cross the band moves beside or above its node; beside
 * is correct, and asserting "above the node top" failed CI on it.
 * `render/label-layout.ts#floorFlipBaseline` is the same rule for the non-dial
 * pass, which this route does not reach; its unit tests pin it.
 */
type Probe = {
  nodes: () => Array<{ id: string; hidden: boolean; x: number; y: number; radius: number }>;
  labels: () => Array<{ nodeId: string; minY: number; maxY: number }>;
  selection: () => { nodeId: string | null };
};
const read = (page: Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: Probe }).__atlasMap;
    if (!m) return null;
    const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const labels = new Map(m.labels().map((l) => [l.nodeId, l]));
    const domains = m.nodes().filter((n) => !n.hidden && n.id.startsWith("domain:")).map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      top: n.y - n.radius,
      label: labels.get(n.id) ? { minY: labels.get(n.id)!.minY, maxY: labels.get(n.id)!.maxY } : null,
    }));
    const panel = document.querySelector('[data-testid="map-detail-panel"]')?.getBoundingClientRect() ?? null;
    const panelLeft = panel ? panel.left - box.left : Number.POSITIVE_INFINITY;
    return { selection: m.selection().nodeId, canvasHeight: box.height, panelLeft, domains };
  });

/** A point on empty canvas from which a vertical drag of `dy` stays on the canvas. */
const emptyStart = (page: Page, dy: number) =>
  page.evaluate((dy) => {
    const m = (window as unknown as { __atlasMap?: Probe }).__atlasMap!;
    const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const drawn = m.nodes().filter((n) => !n.hidden);
    for (let x = box.left + 80; x < box.right - 80; x += 40) {
      for (let y = box.top + 120; y < box.bottom - 40; y += 40) {
        if (y + dy < box.top + 40 || y + dy > box.bottom - 40) continue;
        if (drawn.every((n) => Math.hypot(box.left + n.x - x, box.top + n.y - y) > n.radius + 40)) return { x, y };
      }
    }
    return null;
  }, dy);

/** The selected capability's domain; its preferred name slot is below its node. */
const SUBJECT = "domain:support";
const MAX_PULL_PX = 240;

test("a domain at the canvas floor keeps its name outside the floor band", async ({ page }) => {
  test.setTimeout(120_000);
  // The 14-inch app viewport: this is where the two lowest domains met the floor band.
  await page.setViewportSize({ width: 1512, height: 806 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off&p=capability%3Aexchange-request&open=domain%3Asupport", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await read(page))?.selection, { timeout: 15_000 }).toBe("capability:exchange-request");
  await waitForMapStill(page, { what: "camera" });

  const { canvasHeight, panelLeft } = (await read(page))!;
  const floorBand = canvasHeight - 72;
  // Any slot under a node this close to the band crosses it; slots beside or above do not.
  const target = floorBand - 20;
  for (let pull = 0; pull < 8; pull++) {
    const subject = (await read(page))!.domains.find((d) => d.id === SUBJECT)!;
    if (Math.abs(target - subject.y) < 4) break;
    const dy = Math.max(-MAX_PULL_PX, Math.min(MAX_PULL_PX, target - subject.y));
    const start = await emptyStart(page, dy);
    expect(start, "no empty canvas to drag from").not.toBeNull();
    await page.mouse.move(start!.x, start!.y);
    await page.mouse.down();
    await page.mouse.move(start!.x, start!.y + dy, { steps: Math.ceil(Math.abs(dy) / 16) });
    await page.mouse.up();
    await waitForMapStill(page, { what: "camera" });
  }

  const state = (await read(page))!;
  const subject = state.domains.find((d) => d.id === SUBJECT)!;
  expect(subject.y, `${SUBJECT} did not reach the floor`).toBeGreaterThan(floorBand - 40);
  expect(subject.y, `${SUBJECT} went under the floor band`).toBeLessThan(floorBand);
  expect(subject.x, `${SUBJECT} is behind the inspector`).toBeLessThan(panelLeft);
  expect(subject.label, `${SUBJECT} lost its name at the floor`).not.toBeNull();

  const atFloor = state.domains.filter((d) => d.y > floorBand - 40 && d.top > 0 && d.y < canvasHeight && d.x < panelLeft);
  for (const d of atFloor.filter((d) => d.label)) {
    expect(d.label!.maxY, `${d.id} has its name inside the floor band`).toBeLessThanOrEqual(floorBand);
    expect(d.label!.minY, `${d.id} has its name above the canvas`).toBeGreaterThan(0);
  }
});
