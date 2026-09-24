import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { parseFrontmatter } from "../../src/shared/lib/parse-frontmatter";
import { judgeEvidence } from "../../src/shared/lib/evidence-verdict.mjs";
import { installDesktopRailRuntime, type StubPathChange } from "./desktop-rail-arrival-harness";

/**
 * **Territories names every capability, keeps every name clear, and counts stale honestly.**
 *
 * The view's whole claim is that at this scale nothing has to be folded: a reader sees each
 * capability's name in its own domain's territory and can tell from the ring which ones stand
 * on moved code. This opens the product's own dogfood vault (`docs/ontology`) through the
 * installed-app runtime, with the Git walk answered from this repository's real history, and
 * checks the claim on the drawn result:
 *
 * - every capability in the vault has a name on screen, and no two drawn names or marks overlap;
 * - the stale count the view shows equals the count this spec computes itself, from the same
 *   rule (`shared/lib/evidence-verdict.mjs`) over the same Git times;
 * - clicking a capability opens the same inspector the flat map opens.
 *
 * Captures land in the owner's scratch folder when it exists, for the design review.
 */

const REPO = path.resolve(__dirname, "../..");
const VAULT = path.join(REPO, "docs/ontology");
const CAPTURE_DIR = "/Users/jinan/scratch/map-concepts/app-territories";

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

/** The vault's files, and the Git walk's answers for every path the app will ask about. */
function dogfoodVault(): { files: Record<string, string>; changes: Record<string, StubPathChange>; expectedStale: number; capabilities: number } {
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
  let capabilities = 0;
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
    if (doc.kind === "capability") {
      capabilities += 1;
      if (verdict === "stale" || verdict === "missing") expectedStale += 1;
    }
  }
  return { files, changes, expectedStale, capabilities };
}

async function readDrawn(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="territories-map"]');
    const nums = (value: string | undefined) => (value ?? "").split(",").map(Number);
    const caps = [...document.querySelectorAll<HTMLElement>('[data-territory-kind="capability"]')].map((el) => {
      const [x, y, w, h] = nums(el.dataset.labelBox);
      const [mx, my, r] = nums(el.dataset.mark);
      return { id: el.dataset.territoryId!, name: el.textContent ?? "", evidence: el.dataset.evidence ?? "", label: { x: x!, y: y!, w: w!, h: h! }, mark: { x: mx!, y: my!, r: r! } };
    });
    const domains = [...document.querySelectorAll<HTMLElement>('[data-territory-kind="domain"]')].map((el) => {
      const [x, y, w, h] = nums(el.dataset.labelBox);
      return { id: el.dataset.territoryId!, stats: el.dataset.stats ?? "", label: { x: x!, y: y!, w: w!, h: h! } };
    });
    const canvas = root?.querySelector("canvas")?.getBoundingClientRect();
    return {
      ready: root?.dataset.territoriesReady ?? null,
      stale: root?.dataset.territoriesStale ?? null,
      evidence: root?.dataset.territoriesEvidence ?? null,
      canvas: canvas ? { x: canvas.x, y: canvas.y, w: canvas.width, h: canvas.height } : null,
      caps,
      domains,
    };
  });
}

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const viewport of [
  { width: 1512, height: 982 },
  { width: 1280, height: 800 },
]) {
  test(`territories on the dogfood vault at ${viewport.width}: every capability named, nothing overlapping, stale counted honestly`, async ({ page }) => {
    test.setTimeout(180_000);
    const vault = dogfoodVault();
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges: vault.changes });
    await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
    await page.getByTestId("first-run-open").click();

    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-territories").click();
    const map = page.getByTestId("territories-map");
    await expect(map).toHaveAttribute("data-territories-ready", "true", { timeout: 60_000 });
    await expect(map).toHaveAttribute("data-territories-evidence", "measured", { timeout: 30_000 });
    // The address carries the view, so a link opens it too.
    await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("territories");

    // The canvas actually painted: a mirror list with no picture under it would pass every
    // check below. Counted inside the page (a pixel array across the bridge costs seconds).
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="territories-map"] canvas');
            const ctx = canvas?.getContext("2d");
            if (!canvas || !ctx || canvas.width === 0) return 0;
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const [r0, g0, b0] = [data[0]!, data[1]!, data[2]!];
            let inked = 0;
            for (let i = 0; i < data.length; i += 16) {
              if (Math.abs(data[i]! - r0) + Math.abs(data[i + 1]! - g0) + Math.abs(data[i + 2]! - b0) > 60) inked += 1;
            }
            return inked;
          }),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(2_000);

    const drawn = await readDrawn(page);
    // Every capability in the vault is drawn and named.
    expect(drawn.caps).toHaveLength(vault.capabilities);
    for (const c of drawn.caps) expect(c.name.trim().length, `${c.id} has no name`).toBeGreaterThan(0);

    // No name overlaps another name or any mark.
    const boxes = [
      ...drawn.caps.map((c) => ({ id: `${c.id}:label`, box: c.label })),
      ...drawn.caps.map((c) => ({ id: `${c.id}:mark`, box: { x: c.mark.x - c.mark.r, y: c.mark.y - c.mark.r, w: 2 * c.mark.r, h: 2 * c.mark.r } })),
      ...drawn.domains.map((d) => ({ id: `${d.id}:label`, box: d.label })),
    ];
    const hits: string[] = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i]!.box, boxes[j]!.box)) hits.push(`${boxes[i]!.id} × ${boxes[j]!.id}`);
    expect(hits).toEqual([]);

    // The stale count shown is the count the rule gives.
    expect(Number(drawn.stale)).toBe(vault.expectedStale);
    expect(drawn.caps.filter((c) => c.evidence === "stale")).toHaveLength(vault.expectedStale);
    await expect(page.getByTestId("territories-evidence-note")).toContainText(`낡음 ${vault.expectedStale}`);
    const domainStale = drawn.domains.reduce((sum, d) => sum + Number(/낡음 (\d+)/.exec(d.stats)?.[1] ?? 0), 0);
    expect(domainStale).toBe(vault.expectedStale);

    const canCapture = existsSync(path.dirname(CAPTURE_DIR));
    if (canCapture) {
      mkdirSync(CAPTURE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(CAPTURE_DIR, `overview-${viewport.width}.png`) });
    }

    // Clicking a capability opens the same inspector the flat map opens. The largest one on
    // screen is chosen, so the click lands on a mark inside the viewport.
    const target = [...drawn.caps]
      .filter((c) => c.mark.x > drawn.canvas!.x + 40 && c.mark.x < drawn.canvas!.x + drawn.canvas!.w - 40 && c.mark.y > 120 && c.mark.y < viewport.height - 120)
      .sort((a, b) => b.mark.r - a.mark.r)[0]!;
    expect(target, "no capability mark inside the viewport").toBeDefined();
    await page.mouse.click(drawn.canvas!.x + target.mark.x, drawn.canvas!.y + target.mark.y);
    await expect(page.getByTestId("topology-node-popover-positioner")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("topology-node-popover-positioner")).toContainText(target.name.trim());
    await expect.poll(() => page.locator(`[data-territory-id="${target.id}"]`).getAttribute("aria-pressed")).toBe("true");
    // The focus is drawn: its elements as satellites, its own dependency arrows, rollups put away.
    const frame = async () =>
      JSON.parse((await page.locator('[data-testid="territories-map"] canvas').getAttribute("data-frame")) ?? "{}") as {
        focus?: string;
        dimT?: number;
        arrows?: number;
        satellites?: number;
        rollups?: number;
      };
    await expect.poll(async () => (await frame()).focus).toBe(target.id);
    await expect.poll(async () => (await frame()).dimT).toBe(1);
    const focused = await frame();
    console.log(`[territories ${viewport.width}] focus`, JSON.stringify(focused));
    expect(focused.satellites).toBeGreaterThan(0);
    expect(focused.arrows).toBeGreaterThan(0);
    expect(focused.rollups).toBe(0);
    if (canCapture) {
      // The camera makes room beside the inspector; capture once it has stopped.
      let last = "";
      await expect
        .poll(
          async () => {
            const now = JSON.stringify(((await frame()) as { offset?: number[] }).offset);
            const still = now === last;
            last = now;
            return still;
          },
          { intervals: [300, 300, 300, 300, 300] },
        )
        .toBe(true);
      await page.screenshot({ path: path.join(CAPTURE_DIR, `capability-${viewport.width}.png`) });
    }
  });
}
