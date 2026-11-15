import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { parseFrontmatter } from "../../../../src/shared/lib/vault-document/parse-frontmatter";
import { waitForMapStill } from "../../settle";
import { idOf, openNeural, probe } from "./neural-dogfood";

/**
 * Neural, lit, on the dogfood vault, opened through the installed-app runtime with the Git walk
 * answered by a fixed clock; each claim is measured on the drawn result.
 */

/** Captures for a person to compare with the approved look, written only when asked for. */
const CAPTURE_DIR = process.env.MAP_3D_CAPTURE_DIR ?? null;

/**
 * Pixels of the map canvas in the stale warning ink, counted in the page; `region` limits the
 * count to a disc in canvas CSS px. A pixel counts only when its four neighbours carry the ink too:
 * the map canvas is opaque, so Linux antialiases its names per subpixel, and those one-pixel
 * fringes have the same hue as the ink.
 */
async function countAmber(page: Page, region?: { x: number; y: number; r: number }): Promise<number> {
  return page.evaluate((disc) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="ontology-map-canvas"]')!;
    const ctx = canvas.getContext("2d")!;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    const x0 = disc ? Math.max(0, Math.floor((disc.x - disc.r) * scale) - 1) : 0;
    const y0 = disc ? Math.max(0, Math.floor((disc.y - disc.r) * scale) - 1) : 0;
    const x1 = disc ? Math.min(canvas.width, Math.ceil((disc.x + disc.r) * scale) + 1) : canvas.width;
    const y1 = disc ? Math.min(canvas.height, Math.ceil((disc.y + disc.r) * scale) + 1) : canvas.height;
    if (x1 <= x0 || y1 <= y0) return 0;
    const w = x1 - x0;
    const h = y1 - y0;
    const data = ctx.getImageData(x0, y0, w, h).data;
    const inked = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p += 1) {
      const r = data[p * 4]! / 255;
      const g = data[p * 4 + 1]! / 255;
      const b = data[p * 4 + 2]! / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) continue;
      const s = (max - min) / max;
      const hh = (max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4) * 60;
      const hue = hh < 0 ? hh + 360 : hh;
      if (hue >= 32 && hue <= 55 && s >= 0.55 && max >= 0.3) inked[p] = 1;
    }
    let count = 0;
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const p = y * w + x;
        if (!inked[p] || !inked[p - 1] || !inked[p + 1] || !inked[p - w] || !inked[p + w]) continue;
        if (disc && Math.hypot((x0 + x + 0.5) / scale - disc.x, (y0 + y + 0.5) / scale - disc.y) > disc.r) continue;
        count += 1;
      }
    }
    return count;
  }, region ?? null);
}

/** The concepts `slug` depends on and the concepts that depend on it, as map ids. */
function dependencyEnds(files: Record<string, string>, slug: string): string[] {
  const docs = Object.values(files).map((text) => parseFrontmatter(text).frontmatter);
  const kindOf = new Map(docs.flatMap((d) => (typeof d.slug === "string" && typeof d.kind === "string" ? [[d.slug, d.kind] as const] : [])));
  const ends: string[] = [];
  for (const d of docs) {
    if (typeof d.slug !== "string" || typeof d.kind !== "string") continue;
    const deps = (Array.isArray(d.dependencies) ? d.dependencies : []).filter((dep): dep is string => typeof dep === "string");
    if (d.slug === slug) {
      for (const dep of deps) if (kindOf.has(dep)) ends.push(idOf(kindOf.get(dep)!, dep));
    } else if (deps.includes(slug)) {
      ends.push(idOf(d.kind, d.slug));
    }
  }
  return ends;
}

/** A disc inside every cell's filled body, clear of a capability's dark nucleus. */
const CELL_PROBE_PX = 4;
/** A cell this close to one of the other evidence state shares its pixels or glow. */
const CELL_NEIGHBOUR_PX = 24;

/** A drawn node near the middle of the canvas, of the given kind, in page coordinates. */
async function pickNode(page: Page, kind: string) {
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const nodes = await probe(page, (p) => p.nodes());
  const cx = box.width / 2;
  const cy = box.height / 2;
  const pick = nodes
    .filter((n) => !n.hidden && n.kind === kind && n.x > 200 && n.x < box.width - 200 && n.y > 160 && n.y < box.height - 160)
    .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
  expect(pick, `no ${kind} drawn in the middle of the canvas`).toBeDefined();
  return { id: pick!.id, x: box.x + pick!.x, y: box.y + pick!.y };
}

test.describe("Neural on the dogfood vault", () => {
  test.setTimeout(180_000);

  test("a stale concept's cell is amber in the desktop runtime and a current one is not", async ({ page }) => {
    const { vault } = await openNeural(page);
    const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
    // A pointer resting on empty canvas, so no hover lights a cell while the pixels are read.
    await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
    await waitForMapStill(page, { what: "camera" });
    await waitForMapStill(page, { what: "dome" });
    const cells = (await probe(page, (p) => p.nodes())).filter(
      (n) => !n.hidden && n.x > 20 && n.x < box.width - 20 && n.y > 20 && n.y < box.height - 20 && n.kind !== "project",
    );
    const misdrawn: string[] = [];
    let staleSeen = 0;
    for (const c of cells) {
      const stale = vault.stale.has(c.id);
      const mixed = cells.some((o) => o !== c && vault.stale.has(o.id) !== stale && Math.hypot(o.x - c.x, o.y - c.y) < CELL_NEIGHBOUR_PX);
      if (mixed) continue;
      const amber = await countAmber(page, { x: c.x, y: c.y, r: CELL_PROBE_PX });
      if (stale) staleSeen += 1;
      if ((amber > 0) !== stale) misdrawn.push(`${c.id}: ${amber} amber px, ${stale ? "stale" : "current"}`);
    }
    expect(staleSeen, "no stale cell stood clear of current ones").toBeGreaterThan(0);
    expect(misdrawn).toEqual([]);
  });

  for (const width of [1512, 1920]) {
    test(`at ${width} px a focus's lit far ends stay clear of the detail panel`, async ({ page }) => {
      const { vault } = await openNeural(page, "desktop", width);
      const focusId = idOf("capability", "capabilities/mcp-tool-server");
      const ends = dependencyEnds(vault.files, "capabilities/mcp-tool-server");
      expect(ends.length).toBeGreaterThan(2);
      await page.mouse.move(2, 2);
      await waitForMapStill(page, { what: "camera" });
      const canvas = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
      const focus = (await probe(page, (p) => p.nodes())).find((n) => n.id === focusId)!;
      await page.mouse.click(canvas.x + focus.x, canvas.y + focus.y);
      const panel = page.getByTestId("map-detail-panel");
      await expect(panel).toHaveAttribute("data-selected-node-id", focusId);
      await page.mouse.move(2, 2);
      await waitForMapStill(page, { what: "camera" });
      const rect = (await panel.boundingBox())!;
      const viewport = page.viewportSize()!;
      const drawn = await probe(page, (p) => p.nodes());
      const misplaced: string[] = [];
      for (const id of ends) {
        const n = drawn.find((d) => d.id === id);
        if (!n || n.hidden) {
          misplaced.push(`${id}: not drawn`);
          continue;
        }
        const x = canvas.x + n.x;
        const y = canvas.y + n.y;
        const underPanel = x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
        const offScreen = x < 0 || y < 0 || x > viewport.width || y > viewport.height;
        if (underPanel || offScreen) misplaced.push(`${id} at ${x.toFixed(0)},${y.toFixed(0)}`);
      }
      expect(misplaced).toEqual([]);
    });
  }

  test("on the web nothing is amber and the quiet evidence line says why", async ({ page }) => {
    const { legend } = await openNeural(page, "web");
    await expect(legend).not.toHaveAttribute("data-evidence-availability", "measured");
    await expect(page.getByTestId("topology-neural-legend-note")).toBeVisible();
    await expect(page.getByTestId("topology-neural-legend-stale")).toHaveCount(0);
    await page.mouse.move(2, 2);
    await waitForMapStill(page, { what: "camera" });
    expect(await countAmber(page), "amber pixels on the web").toBe(0);
  });

  test("Neural: lit by the same evidence, captured at rest and on a focus", async ({ page }) => {
    const { legend } = await openNeural(page);
    await page.mouse.move(2, 2);
    // At rest: the dome has lit its evidence and the camera has stopped.
    await expect
      .poll(() => probe(page, (p) => { const l = p.dome()!.light; return l.current + l.stale + l.unknown; }))
      .toBeGreaterThan(0);
    await waitForMapStill(page, { what: "camera" });
    const light = (await probe(page, (p) => p.dome()))!.light;
    expect(light.current + light.stale + light.unknown).toBeGreaterThan(0);
    expect(light.stale).toBeLessThanOrEqual(Number(await legend.getAttribute("data-evidence-stale")));
    if (CAPTURE_DIR) {
      mkdirSync(CAPTURE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(CAPTURE_DIR, "neuron-rest.png") });
    }
    const target = await pickNode(page, "domain");
    /*
     * Sample the camera on every frame through the flight: the fly-to is 800 ms and eases out. The dome
     * flies by turning (yaw, pitch) and panning as much as by zooming, and its zoom may dip and return, so
     * progress reads the axes that travel, each by its own distance.
     */
    await page.evaluate(() => {
      const host = window as unknown as {
        flySamples: { t: number; v: number[]; flight: string | null }[];
        flySamplesDone: boolean;
        __atlasMap: { camera(): { x: number; y: number; scale: number }; dome(): { yaw: number; pitch: number; flight: string | null } | null };
      };
      host.flySamples = [];
      host.flySamplesDone = false;
      const start = performance.now();
      const tick = () => {
        const cam = host.__atlasMap.camera();
        const dome = host.__atlasMap.dome();
        host.flySamples.push({ t: performance.now() - start, v: [cam.x, cam.y, cam.scale, dome?.yaw ?? 0, dome?.pitch ?? 0], flight: dome?.flight ?? null });
        // measurement window: the claim is the flight's shape, sampled on every frame for 4 s —
        // five times the 800 ms flight, so a loaded runner still records the landing.
        if (performance.now() - start < 4_000) requestAnimationFrame(tick);
        else host.flySamplesDone = true;
      };
      requestAnimationFrame(tick);
    });
    await page.mouse.dblclick(target.x, target.y);
    await expect.poll(() => probe(page, (p) => p.dome()!.flight)).toBe(target.id);
    await page.mouse.move(2, 2);
    await page.waitForFunction(() => (window as unknown as { flySamplesDone?: boolean }).flySamplesDone === true, undefined, {
      timeout: 30_000,
    });
    const samples = await page.evaluate(
      () => (window as unknown as { flySamples: { t: number; v: number[]; flight: string | null }[] }).flySamples,
    );
    const first = samples.findIndex((x) => x.flight === target.id);
    expect(first, "the flight never began inside the window").toBeGreaterThan(0);
    const from = samples[first - 1]!.v;
    const end = samples.at(-1)!.v;
    const flight = samples.slice(first);
    // An axis counts when the flight carries it somewhere; one that dips and returns (the zoom's lift) does not.
    const axes = from
      .map((_, i) => i)
      .filter((i) => {
        const values = flight.map((x) => x.v[i]!);
        const range = Math.max(...values) - Math.min(...values);
        return range > 1e-4 && Math.abs(end[i]! - from[i]!) >= range * 0.5;
      });
    expect(axes, "the camera never moved on the fly-to").not.toEqual([]);
    const remaining = (v: number[]) =>
      Math.sqrt(axes.reduce((sum, i) => sum + ((v[i]! - end[i]!) / (end[i]! - from[i]!)) ** 2, 0) / axes.length);
    const t0 = samples[first]!.t;
    // Arrived is within 1% of the travel, not at an absolute pose: the claim is the flight's duration and shape.
    const arrived = flight.find((x) => remaining(x.v) <= 0.01);
    expect(arrived, "the fly-to never came within 1% of its landing inside the window").toBeDefined();
    const duration = arrived!.t - t0;
    // Ease-out: most of the travel happens in the first half of the flight.
    const mid = flight.reduce((best, x) => (Math.abs(x.t - (t0 + duration / 2)) < Math.abs(best.t - (t0 + duration / 2)) ? x : best));
    const firstHalf = 1 - remaining(mid.v);
    console.log(
      `[fly-to] ${duration.toFixed(0)} ms to within 1% on ${axes.length} axis(es), ${(firstHalf * 100).toFixed(0)}% of the travel done at half time`,
    );
    /*
     * The claim is the flight's shape relative to its own duration: several frames, eased out.
     * Absolute duration bounds measure the runner's frame pacing.
     */
    expect(firstHalf).toBeGreaterThan(0.6);
    if (CAPTURE_DIR) await page.screenshot({ path: path.join(CAPTURE_DIR, "neuron-focus.png") });
  });
});
