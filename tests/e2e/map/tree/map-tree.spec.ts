import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { judgeEvidence } from "../../../../src/shared/lib/git/evidence-verdict.mjs";
import { parseFrontmatter } from "../../../../src/shared/lib/vault-document/parse-frontmatter";
import type { TreePose } from "../../../../src/widgets/ontology-map/model/tree-view/tree-shapes";
import mapTree from "../../../../messages/ko/mapTree.json";
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { dogfoodEvidenceVault } from "../../hex-board-vaults";
import { waitForTreeStill } from "../../settle";
import { seedFirstRunSeen } from "../../first-run-seed";
import { stubDirectoryPicker } from "../../vault-picker-stub";

/**
 * The 3D tree on the product's own vault (`docs/ontology`). Evidence claims open it through the
 * installed-app runtime with the Git walk answered from this repository's history; the web claims
 * open the same files through the browser's folder picker. Captures go to `TREE_CAPTURE_DIR`.
 */

const CAPTURE_DIR = process.env.TREE_CAPTURE_DIR ?? null;
const REPO = path.resolve(__dirname, "../../../..");
const VIEWPORT = { width: 1512, height: 982 };
const DRAG_STEPS = 40;
const DRAG_STEP_PX = 6;

test.use({ viewport: VIEWPORT });

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Listed {
  id: string;
  kind: string;
  name: string;
  evidence: string;
  /** Canvas CSS px; null when the tree drew no mark for it. */
  mark: { x: number; y: number; r: number } | null;
  nameBox: Box | null;
}

/** The concept list's mirror of the drawn tree, written at rest. */
async function readList(page: Page): Promise<Listed[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="tree-map-list"] [data-tree-id]')].map((el) => {
      const nums = (value: string | undefined) => (value ? value.split(",").map(Number) : null);
      const m = nums(el.dataset.mark);
      const b = nums(el.dataset.nameBox);
      return {
        id: el.dataset.treeId!,
        kind: el.dataset.treeKind!,
        name: (el.textContent ?? "").trim(),
        evidence: el.dataset.evidence ?? "",
        mark: m ? { x: m[0]!, y: m[1]!, r: m[2]! } : null,
        nameBox: b ? { x: b[0]!, y: b[1]!, w: b[2]!, h: b[3]! } : null,
      };
    }),
  );
}

const rectsOverlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The mirror rounds to whole pixels, so a disc counts as over a box only when it reaches a pixel past the rounding. */
function discOverBox(c: { x: number; y: number; r: number }, b: Box): boolean {
  const nx = Math.max(b.x, Math.min(c.x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(c.y, b.y + b.h));
  return Math.hypot(c.x - nx, c.y - ny) < c.r - 1;
}

/** Concept id as the map names it: `<kind>:<last slug segment>`. */
const idOf = (kind: string, slug: string) => `${kind}:${slug.split("/").pop()}`;

interface VaultFacts {
  files: Record<string, string>;
  changes: ReturnType<typeof dogfoodEvidenceVault>["changes"];
  /** Every concept the evidence rule calls stale (or missing), by map id. */
  stale: Set<string>;
  domains: number;
}

function gitTime(repoRelative: string): string | null {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cI", "--", repoRelative], { cwd: REPO }).toString().trim() || null;
  } catch {
    return null;
  }
}

/** The dogfood vault's files, the Git walk's answers, and what the evidence rule makes of them per concept. */
function dogfoodTreeVault(): VaultFacts {
  const { files, changes, domains } = dogfoodEvidenceVault();
  const docs = Object.entries(files).flatMap(([rel, text]) => {
    const data = parseFrontmatter(text).frontmatter;
    if (typeof data.kind !== "string" || typeof data.slug !== "string") return [];
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
    return [{ rel, kind: data.kind, slug: data.slug, path: typeof data.path === "string" ? data.path : null, elements: list(data.elements) }];
  });
  const idBySlug = new Map(docs.map((d) => [d.slug, idOf(d.kind, d.slug)]));
  const pathBySlug = new Map(docs.filter((d) => d.path).map((d) => [d.slug, d.path!]));
  const change = (p: string) => {
    if (!changes[p]) {
      const exists = existsSync(path.join(REPO, p));
      changes[p] = { exists, isDir: exists && statSync(path.join(REPO, p)).isDirectory(), lastChangedAt: exists ? gitTime(p) : null };
    }
    return changes[p]!;
  };
  const stale = new Set<string>();
  for (const doc of docs) {
    const id = idBySlug.get(doc.slug)!;
    const paths = new Set([doc.path, ...doc.elements.map((e) => pathBySlug.get(e))].filter((p): p is string => !!p));
    const verdict = judgeEvidence({
      docChangedAt: changes[`${doc.slug}.md`]?.lastChangedAt ?? null,
      entries: [...paths].map((p) => ({ path: p, change: change(p) })),
    }).verdict;
    if (["project", "domain", "capability", "element"].includes(doc.kind) && (verdict === "stale" || verdict === "missing")) stale.add(id);
  }
  return { files, changes, stale, domains };
}

async function openTree(page: Page, vault: VaultFacts, how: { runtime: "desktop" | "desktop-without-git" | "web"; view?: string; reduced?: boolean }) {
  if (how.reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  if (how.runtime === "web") {
    await seedFirstRunSeen(page);
    await stubDirectoryPicker(page, vault.files);
    await page.goto(`/ko/topology/?guides=off&e2e=1&view=${how.view ?? "3d"}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("first-run-starter-open").click();
    await page.getByTestId("vault-guide-pick-existing").click();
  } else {
    const gitPathChanges = how.runtime === "desktop" ? vault.changes : undefined;
    await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges });
    await page.goto(`/ko/?guides=off&e2e=1&view=${how.view ?? "3d"}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("first-run-open").click();
  }
  const tree = page.getByTestId("tree-map");
  await expect(tree).toHaveAttribute("data-tree-ready", "true", { timeout: 60_000 });
  if (how.runtime === "desktop") await expect(tree).toHaveAttribute("data-tree-evidence", "measured", { timeout: 30_000 });
  await waitForTreeStill(page);
  return tree;
}

async function canvasBox(page: Page) {
  const box = (await page.locator('[data-testid="tree-map"] canvas').boundingBox())!;
  return { x: box.x, y: box.y, w: box.width, h: box.height };
}

/** Moves the pointer off the canvas so no hover holds a focus. */
async function leaveCanvas(page: Page) {
  await page.mouse.move(2, VIEWPORT.height - 2);
}

async function shot(page: Page, name: string) {
  if (!CAPTURE_DIR) return;
  mkdirSync(CAPTURE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURE_DIR, `tree-${name}-${VIEWPORT.width}.png`) });
}

/**
 * Pixels of the tree canvas in the stale warning ink at any depth tone, counted in the page.
 * `region` limits the count to a disc in canvas CSS px.
 */
async function countAmber(page: Page, region?: { x: number; y: number; r: number }): Promise<number> {
  return page.evaluate(
    (disc) => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="tree-map"] canvas')!;
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
        const s = max === 0 ? 0 : (max - min) / max;
        if (max === min) continue;
        const h = (max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4) * 60;
        const hue = h < 0 ? h + 360 : h;
        if (hue >= 32 && hue <= 55 && s >= 0.55 && max >= 0.3) count += 1;
      }
      return count;
    },
    region ?? null,
  );
}

test.describe("the 3D tree on the dogfood vault", () => {
  test.setTimeout(180_000);

  test("?view=strata opens the tree with the 3D row checked in the view picker", async ({ page }) => {
    await openTree(page, dogfoodTreeVault(), { runtime: "desktop", view: "strata" });
    await expect(page.getByTestId("topology-map-view")).toHaveAttribute("data-map-view", "tree");
    await page.getByTestId("topology-view-3d").click();
    await expect(page.getByTestId("topology-view-3d-choice-3d")).toHaveAttribute("aria-checked", "true");
  });

  test("every domain name is drawn and no name box covers a mark or another name", async ({ page }) => {
    const vault = dogfoodTreeVault();
    await openTree(page, vault, { runtime: "desktop" });
    await leaveCanvas(page);
    await waitForTreeStill(page);
    const listed = await readList(page);
    const domains = listed.filter((c) => c.kind === "domain");
    expect(domains).toHaveLength(vault.domains);
    expect(domains.filter((d) => !d.nameBox).map((d) => d.id), "domains drawn without a name").toEqual([]);
    const named = listed.filter((c) => c.nameBox);
    const marked = listed.filter((c) => c.mark);
    const hits: string[] = [];
    for (const a of named) {
      for (const m of marked) if (discOverBox(m.mark!, a.nameBox!)) hits.push(`${a.id} name × ${m.id} mark`);
      for (const b of named) if (a.id < b.id && rectsOverlap(a.nameBox!, b.nameBox!)) hits.push(`${a.id} name × ${b.id} name`);
    }
    expect(hits).toEqual([]);
    await shot(page, "a-rest");
  });

  test("the amber marks are exactly the concepts the Git walk calls stale", async ({ page }) => {
    const vault = dogfoodTreeVault();
    await openTree(page, vault, { runtime: "desktop" });
    await leaveCanvas(page);
    await waitForTreeStill(page);
    await expect(page.getByTestId("tree-map-legend-stale")).toHaveText(new RegExp(`\\b${vault.stale.size}\\b`));
    const listed = await readList(page);
    expect(listed.filter((c) => c.evidence === "stale").map((c) => c.id).sort()).toEqual(listed.map((c) => c.id).filter((id) => vault.stale.has(id)).sort());

    // A stale concept carries amber at its upper-right rim, where the dot sits; a current one does not,
    // unless a stale neighbour's own amber reaches into that rim.
    const misdrawn: string[] = [];
    for (const c of listed) {
      if (!c.mark || c.kind === "project") continue;
      const rim = { x: c.mark.x + c.mark.r * Math.SQRT1_2, y: c.mark.y - c.mark.r * Math.SQRT1_2, r: Math.max(2.2, c.mark.r / 2) };
      const staleNeighbourInRim = listed.some(
        (o) => o !== c && o.mark && vault.stale.has(o.id) && Math.hypot(o.mark.x - rim.x, o.mark.y - rim.y) <= rim.r + o.mark.r * 2,
      );
      if (!vault.stale.has(c.id) && staleNeighbourInRim) continue;
      const amber = await countAmber(page, rim);
      if ((amber > 0) !== vault.stale.has(c.id)) misdrawn.push(`${c.id}: ${amber} amber px, ${vault.stale.has(c.id) ? "stale" : "current"}`);
    }
    expect(misdrawn).toEqual([]);
    await shot(page, "b-evidence");
  });

  test("on the web nothing is amber and the quiet evidence line says why", async ({ page }) => {
    const vault = dogfoodTreeVault();
    const tree = await openTree(page, vault, { runtime: "web" });
    await expect(tree).toHaveAttribute("data-tree-evidence", "unknown");
    await expect(page.getByTestId("tree-map-evidence-note")).toHaveText(mapTree.evidenceAppOnly);
    await expect(page.getByTestId("tree-map-legend-stale")).toHaveCount(0);
    await leaveCanvas(page);
    await waitForTreeStill(page);
    expect(await countAmber(page), "amber pixels on the web").toBe(0);
    await shot(page, "c-web");
  });

  test("a click opens the compact panel and leaves the rail tiles in place", async ({ page }) => {
    const vault = dogfoodTreeVault();
    await openTree(page, vault, { runtime: "desktop" });
    await leaveCanvas(page);
    await waitForTreeStill(page);
    const tiles = ["topology-fit-control", "topology-shortcuts-help-button", "topology-replay-growth"];
    const before = await Promise.all(tiles.map((id) => page.getByTestId(id).boundingBox()));
    const box = await canvasBox(page);
    const target = (await readList(page)).find((c) => c.kind === "capability" && c.mark && c.mark.x > 120 && c.mark.x < box.w - 420)!;
    await page.mouse.click(box.x + target.mark!.x, box.y + target.mark!.y);
    const panel = page.getByTestId("map-detail-panel");
    await expect(panel).toHaveAttribute("data-selected-node-id", target.id);
    await expect(page.locator(`[data-tree-id="${target.id}"]`)).toHaveAttribute("aria-pressed", "true");
    await waitForTreeStill(page);
    for (const [i, id] of tiles.entries()) {
      await expect(page.getByTestId(id), `${id} after the click`).toBeVisible();
      expect(await page.getByTestId(id).boundingBox(), `${id} moved`).toEqual(before[i]);
    }
    await shot(page, "e-selected");
  });

  test("a 40-step drag turns the tree and moves no concept in the model", async ({ page }) => {
    const vault = dogfoodTreeVault();
    await openTree(page, vault, { runtime: "desktop" });
    await leaveCanvas(page);
    await waitForTreeStill(page);
    const start = (await page.evaluate(() => window.__atlasTree!.pose())) as TreePose;
    const marks = (list: Listed[]) => Object.fromEntries(list.map((c) => [c.id, c.mark]));
    const atRest = marks(await readList(page));
    const box = await canvasBox(page);
    // Bare canvas below the crowns, beside the trunk.
    const from = { x: box.x + box.w * 0.3, y: box.y + box.h * 0.7 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= DRAG_STEPS; i += 1) await page.mouse.move(from.x + i * DRAG_STEP_PX, from.y);
    await page.mouse.up();
    await leaveCanvas(page);
    await waitForTreeStill(page);
    const turned = (await page.evaluate(() => window.__atlasTree!.pose())) as TreePose;
    expect(Math.abs(turned.yaw - start.yaw), "the drag did not turn the tree").toBeGreaterThan(0.05);
    expect(await page.getByTestId("map-detail-panel").count(), "the drag selected a concept").toBe(0);
    await shot(page, "f-turned");

    await page.evaluate((pose) => window.__atlasTree!.setPose(pose), start);
    await waitForTreeStill(page);
    expect(marks(await readList(page)), "the same pose draws every concept where it was").toEqual(atRest);
  });

  test("under reduced motion the tree is fully grown on its first frame", async ({ page }) => {
    // Counts the arcs each tree frame paints; a frame begins with its full-canvas fills. Without Git
    // answers no stale dot can arrive later and change what a grown frame paints.
    await page.addInitScript(() => {
      const w = window as unknown as { __treeDiscs: number[] };
      w.__treeDiscs = [];
      const proto = CanvasRenderingContext2D.prototype;
      const fillRect = proto.fillRect;
      const arc = proto.arc;
      const isTree = (ctx: CanvasRenderingContext2D) => ctx.canvas.parentElement?.dataset.testid === "tree-map";
      proto.fillRect = function (this: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
        const frameStart = isTree(this) && x === 0 && y === 0 && width > 100 && height > 100;
        if (frameStart && (w.__treeDiscs.length === 0 || w.__treeDiscs.at(-1)! > 0)) w.__treeDiscs.push(0);
        fillRect.call(this, x, y, width, height);
      };
      proto.arc = function (this: CanvasRenderingContext2D, ...args: Parameters<CanvasRenderingContext2D["arc"]>) {
        if (isTree(this) && w.__treeDiscs.length > 0) w.__treeDiscs[w.__treeDiscs.length - 1]! += 1;
        arc.apply(this, args);
      };
    });
    await openTree(page, dogfoodTreeVault(), { runtime: "desktop-without-git", reduced: true });
    const discs = await page.evaluate(() => (window as unknown as { __treeDiscs: number[] }).__treeDiscs);
    console.log(`[tree reduced] discs per frame ${JSON.stringify(discs)}`);
    expect(discs.length, "the tree painted no frame").toBeGreaterThan(0);
    expect(discs[0], "the first frame against the last").toBe(discs.at(-1));
  });
});
