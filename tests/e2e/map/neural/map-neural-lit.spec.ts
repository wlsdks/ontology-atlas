import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { parseFrontmatter } from "../../../../src/shared/lib/vault-document/parse-frontmatter";
import { judgeEvidence } from "../../../../src/shared/lib/git/evidence-verdict.mjs";
import { installDesktopRailRuntime, type StubPathChange } from "../../desktop-rail-arrival-harness";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForDomeEntered, waitForMapStill } from "../../settle";
import { stubDirectoryPicker } from "../../vault-picker-stub";

/**
 * Neural, lit, on the dogfood vault, opened through the installed-app runtime with the Git walk
 * answered from this repository's real history; each claim is measured on the drawn result.
 */

const REPO = path.resolve(__dirname, "../../../..");
const VAULT = path.join(REPO, "docs/ontology");
/** Captures for a person to compare with the approved look, written only when asked for. */
const CAPTURE_DIR = process.env.MAP_3D_CAPTURE_DIR ?? null;

interface VaultDocFacts {
  rel: string;
  kind: string;
  slug: string;
  path: string | null;
  elements: string[];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (name.endsWith(".md")) out.push(abs);
  }
  return out;
}

function gitTime(repoRelative: string): string | null {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", repoRelative], { cwd: REPO }).toString().trim();
    return out || null;
  } catch {
    return null;
  }
}

const idOf = (kind: string, slug: string) => `${kind}:${slug.split("/").pop()}`;

/** The vault's files, the Git walk's answers, and the concepts the rule calls stale. */
function dogfoodVault(): { files: Record<string, string>; changes: Record<string, StubPathChange>; stale: Set<string> } {
  const files: Record<string, string> = {};
  const docs: VaultDocFacts[] = [];
  for (const abs of walk(VAULT)) {
    const rel = path.relative(VAULT, abs);
    const text = readFileSync(abs, "utf8");
    files[rel] = text;
    const data = parseFrontmatter(text).frontmatter;
    if (typeof data.kind !== "string" || typeof data.slug !== "string") continue;
    docs.push({
      rel,
      kind: data.kind,
      slug: data.slug,
      path: typeof data.path === "string" ? data.path : null,
      elements: Array.isArray(data.elements) ? data.elements.filter((e): e is string => typeof e === "string") : [],
    });
  }
  const pathBySlug = new Map(docs.filter((d) => d.path).map((d) => [d.slug, d.path!]));
  const changes: Record<string, StubPathChange> = {};
  const repoChange = (p: string): StubPathChange => {
    if (changes[p]) return changes[p]!;
    const abs = path.join(REPO, p);
    const exists = existsSync(abs);
    const change = { exists, isDir: exists && statSync(abs).isDirectory(), lastChangedAt: exists ? gitTime(p) : null };
    changes[p] = change;
    return change;
  };
  const stale = new Set<string>();
  for (const doc of docs) {
    const docKey = `${doc.slug}.md`;
    changes[docKey] = { exists: true, isDir: false, lastChangedAt: gitTime(path.join("docs/ontology", doc.rel)) };
    const paths = new Set<string>();
    if (doc.path) paths.add(doc.path);
    for (const e of doc.elements) {
      const p = pathBySlug.get(e);
      if (p) paths.add(p);
    }
    const verdict = judgeEvidence({
      docChangedAt: changes[docKey]!.lastChangedAt,
      entries: [...paths].map((p) => ({ path: p, change: repoChange(p) })),
    }).verdict;
    if (["project", "domain", "capability", "element"].includes(doc.kind) && (verdict === "stale" || verdict === "missing")) {
      stale.add(idOf(doc.kind, doc.slug));
    }
  }
  return { files, changes, stale };
}

type Probe = {
  nodes: () => Array<{ id: string; kind: string; x: number; y: number; radius: number; hidden: boolean }>;
  camera: () => { x: number; y: number; scale: number } | null;
  selection: () => { nodeId: string | null };
  dome: () => {
    yaw: number;
    pitch: number;
    poseTween: boolean;
    flight: string | null;
    flyPending: boolean;
    light: { current: number; stale: number; unknown: number };
  } | null;
};

/** Reads the page's map probe. `read` must be self-contained: it is sent as source. */
const probe = <T>(page: Page, read: (p: Probe) => T) =>
  page.evaluate(`(${read.toString()})(window.__atlasMap)`) as Promise<T>;

async function openNeural(page: Page, runtime: "desktop" | "web" = "desktop") {
  const vault = dogfoodVault();
  await page.setViewportSize({ width: 1512, height: 982 });
  if (runtime === "web") {
    await seedFirstRunSeen(page);
    await stubDirectoryPicker(page, vault.files);
    await page.goto("/ko/topology/?guides=off&e2e=1&view=neural", { waitUntil: "domcontentloaded" });
    await page.getByTestId("first-run-starter-open").click();
    await page.getByTestId("vault-guide-pick-existing").click();
  } else {
    await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges: vault.changes });
    await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
    await page.getByTestId("first-run-open").click();
    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-neural").click();
  }
  await waitForDomeEntered(page, 60_000);
  const legend = page.getByTestId("topology-neural-legend");
  if (runtime === "desktop") await expect(legend).toHaveAttribute("data-evidence-availability", "measured", { timeout: 30_000 });
  return { vault, legend };
}

/**
 * Pixels of the map canvas in the stale warning ink, counted in the page; `region` limits the
 * count to a disc in canvas CSS px.
 */
async function countAmber(page: Page, region?: { x: number; y: number; r: number }): Promise<number> {
  return page.evaluate((disc) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="ontology-map-canvas"]')!;
    const ctx = canvas.getContext("2d")!;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    const x0 = disc ? Math.max(0, Math.floor((disc.x - disc.r) * scale)) : 0;
    const y0 = disc ? Math.max(0, Math.floor((disc.y - disc.r) * scale)) : 0;
    const x1 = disc ? Math.min(canvas.width, Math.ceil((disc.x + disc.r) * scale)) : canvas.width;
    const y1 = disc ? Math.min(canvas.height, Math.ceil((disc.y + disc.r) * scale)) : canvas.height;
    if (x1 <= x0 || y1 <= y0) return 0;
    const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const w = x1 - x0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (disc) {
        const px = (x0 + ((i / 4) % w) + 0.5) / scale;
        const py = (y0 + Math.floor(i / 4 / w) + 0.5) / scale;
        if (Math.hypot(px - disc.x, py - disc.y) > disc.r) continue;
      }
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) continue;
      const s = (max - min) / max;
      const h = (max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4) * 60;
      const hue = h < 0 ? h + 360 : h;
      if (hue >= 32 && hue <= 55 && s >= 0.55 && max >= 0.3) count += 1;
    }
    return count;
  }, region ?? null);
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
    // A pointer resting on empty canvas stops the idle spin, so the probe and the pixels agree.
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
