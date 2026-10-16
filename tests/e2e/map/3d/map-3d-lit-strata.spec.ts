import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { parseFrontmatter } from "../../../../src/shared/lib/vault-document/parse-frontmatter";
import { judgeEvidence } from "../../../../src/shared/lib/git/evidence-verdict.mjs";
import { installDesktopRailRuntime, type StubPathChange } from "../../desktop-rail-arrival-harness";
import { waitForDomeEntered, waitForMapStill } from "../../settle";

/**
 * The lit 3D map on the dogfood vault, opened through the installed-app runtime with the Git walk
 * answered from this repository's real history; each claim is measured on the drawn result.
 */

const REPO = path.resolve(__dirname, "../../../..");
const VAULT = path.join(REPO, "docs/ontology");
/** Captures for a person to compare with the approved look, written only when asked for. */
const CAPTURE_DIR = process.env.MAP_3D_CAPTURE_DIR ?? null;
const PITCH_MIN = 0.15;
const PITCH_MAX = 0.95;

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

async function openLit(page: Page, arrangement: "strata" | "coupling", reduced: boolean) {
  const vault = dogfoodVault();
  await page.setViewportSize({ width: 1512, height: 982 });
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges: vault.changes });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId(`topology-view-3d-choice-${arrangement}`).click();
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

test.describe("lit 3D map on the dogfood vault", () => {
  test.setTimeout(180_000);

  test("Strata: evidence is light, counted by the rule; a click selects, a double-click flies, Esc flies back", async ({ page }) => {
    const { vault, legend } = await openLit(page, "strata", true);
    await waitForMapStill(page, { what: "camera" });

    // The legend counts are the rule's, over the concepts on the map.
    const stale = Number(await legend.getAttribute("data-evidence-stale"));
    const current = Number(await legend.getAttribute("data-evidence-current"));
    const unknown = Number(await legend.getAttribute("data-evidence-unknown"));
    expect(stale).toBe(vault.expectedStale);
    expect(current).toBeGreaterThan(0);
    // The frame drew those lights: every drawn node wears one, no unmeasured node is lit as
    // current, and the drawn stale lights are the measured ones on screen.
    const light = (await probe(page, (p) => p.dome()))!.light;
    const drawnTotal = light.current + light.stale + light.unknown;
    expect(drawnTotal).toBeGreaterThan(0);
    expect(light.current).toBeLessThanOrEqual(current);
    expect(light.stale).toBeLessThanOrEqual(stale);
    expect(light.unknown).toBeLessThanOrEqual(unknown);
    expect(drawnTotal).toBe(current + stale + unknown);

    if (CAPTURE_DIR) {
      mkdirSync(CAPTURE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(CAPTURE_DIR, "strata-rest.png") });
    }

    // A single click selects and moves nothing.
    const before = await probe(page, (p) => ({ camera: p.camera(), dome: p.dome() }));
    const target = await pickNode(page, "capability");
    await page.mouse.click(target.x, target.y);
    await expect.poll(() => probe(page, (p) => p.selection().nodeId)).toBe(target.id);
    // Read once whatever the click set moving (the sideways nudge) has come to rest.
    await waitForMapStill(page, { what: "camera" });
    const afterClick = await probe(page, (p) => ({ camera: p.camera(), dome: p.dome() }));
    expect(afterClick.dome!.yaw).toBeCloseTo(before.dome!.yaw, 3);
    expect(afterClick.dome!.pitch).toBeCloseTo(before.dome!.pitch, 3);
    expect(afterClick.camera!.scale).toBeCloseTo(before.camera!.scale, 3);
    // The only move a click may cause is the sideways nudge that keeps the node clear of the
    // inspector it opened — never a vertical move, a zoom or a turn.
    expect(afterClick.camera!.y).toBeCloseTo(before.camera!.y, 1);
    expect(afterClick.dome!.flight).toBeNull();

    // A double-click flies to the node: the flight is recorded and the camera moved.
    const again = await pickNode(page, "capability");
    await page.mouse.dblclick(again.x, again.y);
    await expect.poll(() => probe(page, (p) => p.dome()!.flight)).toBe(again.id);
    await waitForMapStill(page, { what: "camera" });
    const flown = await probe(page, (p) => ({ camera: p.camera(), dome: p.dome() }));
    expect(flown.camera!.scale).toBeGreaterThan(afterClick.camera!.scale);
    if (CAPTURE_DIR) await page.screenshot({ path: path.join(CAPTURE_DIR, "strata-focus.png") });

    // Esc flies back to the view the fly-to left from.
    await page.getByTestId("ontology-map-canvas").focus();
    await page.keyboard.press("Escape");
    await expect.poll(() => probe(page, (p) => p.dome()!.flight)).toBeNull();
    await waitForMapStill(page, { what: "camera" });
    const back = await probe(page, (p) => ({ camera: p.camera(), dome: p.dome() }));
    expect(back.camera!.scale).toBeCloseTo(afterClick.camera!.scale, 2);
    expect(back.dome!.pitch).toBeCloseTo(afterClick.dome!.pitch, 2);
  });

  /*
   * The nudge that slides a node out from under the inspector must leave with the selection, or the
   * next concept sits under the INDEX panel and a click aimed at it presses the panel.
   */
  test("Strata: a click's nudge off the inspector is undone when the selection clears", async ({ page }) => {
    await openLit(page, "strata", true);
    await waitForMapStill(page, { what: "camera" });
    const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
    const start = (await probe(page, (p) => p.camera()))!;
    const nodes = await probe(page, (p) => p.nodes());
    const right = nodes
      .filter((n) => !n.hidden && n.kind === "capability" && n.y > 160 && n.y < box.height - 160)
      .sort((a, b) => b.x - a.x)[0]!;
    await page.mouse.click(box.x + right.x, box.y + right.y);
    await expect.poll(() => probe(page, (p) => p.selection().nodeId)).toBe(right.id);
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();
    await waitForMapStill(page, { what: "camera" });
    const nudged = (await probe(page, (p) => p.camera()))!;
    expect(Math.abs(nudged.x - start.x), "the right-most capability was not under the inspector — no nudge to undo").toBeGreaterThan(1);
    expect(nudged.y).toBeCloseTo(start.y, 1);
    expect(nudged.scale).toBeCloseTo(start.scale, 3);
    // Clear the selection with a press on bare canvas, far from any disc.
    const spare = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="ontology-map-canvas"]')!;
      const r = el.getBoundingClientRect();
      const drawn = (window as unknown as { __atlasMap: { nodes(): Array<{ x: number; y: number; radius: number; hidden: boolean }> } }).__atlasMap
        .nodes()
        .filter((n) => !n.hidden);
      for (let y = 40; y < r.height - 40; y += 20)
        for (let x = 360; x < r.width - 90; x += 20)
          if (drawn.every((n) => Math.hypot(n.x - x, n.y - y) > n.radius + 40) && document.elementFromPoint(r.x + x, r.y + y) === el)
            return { x: r.x + x, y: r.y + y };
      return null;
    });
    expect(spare, "no bare canvas to press").not.toBeNull();
    await page.mouse.click(spare!.x, spare!.y);
    await expect.poll(() => probe(page, (p) => p.selection().nodeId)).toBeNull();
    await waitForMapStill(page, { what: "camera" });
    const back = (await probe(page, (p) => p.camera()))!;
    expect(back.x).toBeCloseTo(start.x, 1);
    expect(back.scale).toBeCloseTo(start.scale, 3);
  });

  test("Strata: a hard vertical drag cannot tip the planes past 0.15–0.95 rad", async ({ page }) => {
    await openLit(page, "strata", true);
    await waitForMapStill(page, { what: "camera" });
    const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
    // Grab the structure between nodes (inside the dome's grip, so the drag orbits).
    const nodes = await probe(page, (p) => p.nodes());
    const empty = (() => {
      for (let dy = -60; dy <= 60; dy += 12) {
        const x = box.width / 2;
        const y = box.height / 2 + dy;
        if (nodes.every((n) => Math.hypot(n.x - x, n.y - y) > n.radius + 10)) return { x: box.x + x, y: box.y + y };
      }
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    })();
    for (const direction of [1, -1]) {
      await page.mouse.move(empty.x, empty.y);
      await page.mouse.down();
      for (let i = 1; i <= 20; i += 1) await page.mouse.move(empty.x, empty.y + direction * i * 40);
      const pressed = (await probe(page, (p) => p.dome()))!.pitch;
      // The rubber band may squash past a wall by its cap (0.09) while held, never more.
      expect(pressed).toBeGreaterThanOrEqual(PITCH_MIN - 0.09 - 1e-6);
      expect(pressed).toBeLessThanOrEqual(PITCH_MAX + 0.09 + 1e-6);
      await page.mouse.up();
      // Released, the band springs back onto the wall it was pressed past.
      const wall = direction > 0 ? PITCH_MAX : PITCH_MIN;
      await expect
        .poll(async () => Math.abs((await probe(page, (p) => p.dome()!.pitch)) - wall), { timeout: 10_000 })
        .toBeLessThan(1e-3);
    }
  });

  test("Neural: lit by the same evidence, captured at rest and on a focus", async ({ page }) => {
    const { legend } = await openLit(page, "coupling", false);
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
