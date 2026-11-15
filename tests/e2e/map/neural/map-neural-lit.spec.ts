import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { parseFrontmatter } from "../../../../src/shared/lib/vault-document/parse-frontmatter";
import { judgeEvidence } from "../../../../src/shared/lib/git/evidence-verdict.mjs";
import { installDesktopRailRuntime, type StubPathChange } from "../../desktop-rail-arrival-harness";
import { waitForDomeEntered, waitForMapStill } from "../../settle";

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

/** The vault's files, the Git walk's answers, and the stale count the rule gives. */
function dogfoodVault(): { files: Record<string, string>; changes: Record<string, StubPathChange>; expectedStale: number } {
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
  let expectedStale = 0;
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
      expectedStale += 1;
    }
  }
  return { files, changes, expectedStale };
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

async function openNeural(page: Page) {
  const vault = dogfoodVault();
  await page.setViewportSize({ width: 1512, height: 982 });
  await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges: vault.changes });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId("topology-view-3d-choice-neural").click();
  await waitForDomeEntered(page, 60_000);
  const legend = page.getByTestId("topology-light-legend");
  await expect(legend).toHaveAttribute("data-evidence-availability", "measured", { timeout: 30_000 });
  return { vault, legend };
}

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
