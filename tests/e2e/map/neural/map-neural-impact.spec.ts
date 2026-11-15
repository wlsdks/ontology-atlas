import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { parseFrontmatter } from "../../../../src/shared/lib/vault-document/parse-frontmatter";
import { waitForMapStill } from "../../settle";
import { idOf, openNeural, probe } from "./neural-dogfood";

/**
 * A selection in Neural lights what a change to it reaches, read on the dogfood vault: the spec
 * computes the impact from the vault files and compares it with what the painter lit.
 */

/** A concept whose dependents reach at least three distances on the dogfood vault. */
const SUBJECT = "elements/meaning-gap-findings";
/** Captures for a person to judge, written only when asked for. */
const CAPTURE_DIR = process.env.MAP_NEURAL_IMPACT_CAPTURE_DIR ?? null;

/** The subject's own dependencies, and every concept that depends on it with its fewest hops. */
function impactFromFiles(files: Record<string, string>, slug: string) {
  const kindOf = new Map<string, string>();
  const dependsOn = new Map<string, string[]>();
  for (const text of Object.values(files)) {
    const data = parseFrontmatter(text).frontmatter;
    if (typeof data.slug !== "string" || typeof data.kind !== "string") continue;
    kindOf.set(data.slug, data.kind);
    const refs = [data.dependencies, data.depends_on].flatMap((list) => (Array.isArray(list) ? list : []));
    dependsOn.set(data.slug, refs.filter((ref): ref is string => typeof ref === "string"));
  }
  const dependents = new Map<string, string[]>();
  for (const [from, refs] of dependsOn) {
    for (const ref of refs) if (kindOf.has(ref) && ref !== from) dependents.set(ref, [...(dependents.get(ref) ?? []), from]);
  }
  const distance = new Map<string, number>([[slug, 0]]);
  const queue = [slug];
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of dependents.get(queue[head]!) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, distance.get(queue[head]!)! + 1);
      queue.push(next);
    }
  }
  distance.delete(slug);
  const id = (s: string) => idOf(kindOf.get(s)!, s);
  return {
    needs: (dependsOn.get(slug) ?? []).filter((ref) => kindOf.has(ref)).map(id).sort(),
    impact: Object.fromEntries([...distance].map(([s, d]) => [id(s), d])),
  };
}

async function subjectOnCanvas(page: Page, id: string) {
  const canvas = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const cell = (await probe(page, (p) => p.nodes())).find((n) => n.id === id);
  expect(cell && !cell.hidden, `${id} is not drawn`).toBe(true);
  return { x: canvas.x + cell!.x, y: canvas.y + cell!.y };
}

/** The idle gate's last awake frame, in the page's clock. */
const lastAwake = (page: Page) => probe(page, (p) => p.idleDebug().lastActive?.t ?? 0);

/** Selects the subject with the pointer, takes the pointer off the canvas, and waits for its spread to end. */
async function selectAndSpread(page: Page, id: string) {
  await page.mouse.move(2, 2);
  await waitForMapStill(page, { what: "camera" });
  const at = await subjectOnCanvas(page, id);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId("map-detail-panel")).toHaveAttribute("data-selected-node-id", id);
  // The rail takes the pointer off the canvas without a hover of its own.
  await page.getByTestId("app-nav-rail-item-agents").hover();
  await expect
    .poll(() => probe(page, (p) => { const lit = p.dome()!.neural; return lit.selected && lit.spread >= lit.hops; }), { timeout: 15_000 })
    .toBe(true);
}

async function expectMapRests(page: Page, what: string) {
  let previous = -1;
  await expect
    .poll(async () => {
      const now = await lastAwake(page);
      const still = now === previous;
      previous = now;
      return still;
    }, { message: `the map kept drawing after ${what}`, timeout: 15_000 })
    .toBe(true);
  const quietFrom = await lastAwake(page);
  // measurement window: 1 s in which a resting map must record no awake frame.
  await page.waitForTimeout(1_000);
  expect(await lastAwake(page), `the map woke again after ${what}`).toBe(quietFrom);
}

/** A point on a drawn axon the pointer would pick, clear of cells and chrome, and the axon's normal there. */
function axonCrossing(page: Page) {
  return probe(page, (p) => {
    const map = p as unknown as {
      edges(): { sourceId: string; targetId: string; visible: boolean; ax: number; ay: number; bx: number; by: number; controlX: number; controlY: number }[];
      edgeAt(x: number, y: number): { sourceId: string; targetId: string } | null;
      nodeAt(x: number, y: number): unknown;
    };
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    for (const edge of map.edges().filter((e) => e.visible)) {
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const x = (1 - t) ** 2 * edge.ax + 2 * (1 - t) * t * edge.controlX + t * t * edge.bx;
        const y = (1 - t) ** 2 * edge.ay + 2 * (1 - t) * t * edge.controlY + t * t * edge.by;
        const tx = 2 * (1 - t) * (edge.controlX - edge.ax) + 2 * t * (edge.bx - edge.controlX);
        const ty = 2 * (1 - t) * (edge.controlY - edge.ay) + 2 * t * (edge.by - edge.controlY);
        const len = Math.hypot(tx, ty) || 1;
        const hit = map.edgeAt(x, y);
        const clear = [-16, 0, 16, 32].every((d) => {
          const px = x - (ty / len) * d;
          const py = y + (tx / len) * d;
          return map.nodeAt(px, py) === null &&
            document.elementFromPoint(canvas.x + px, canvas.y + py)?.getAttribute("data-testid") === "ontology-map-canvas";
        });
        if (hit?.sourceId === edge.sourceId && hit.targetId === edge.targetId && clear) {
          return { x: canvas.x + x, y: canvas.y + y, nx: -ty / len, ny: tx / len };
        }
      }
    }
    return null;
  });
}

test.describe("Neural's impact on the dogfood vault", () => {
  test.setTimeout(180_000);

  test("selecting a concept lights everything that depends on it, by distance, then rests", async ({ page }) => {
    const { vault, legend } = await openNeural(page);
    const id = idOf("element", SUBJECT);
    const expected = impactFromFiles(vault.files, SUBJECT);
    const size = Object.keys(expected.impact).length;
    expect(Math.max(...Object.values(expected.impact)), "the subject no longer reaches three distances").toBeGreaterThanOrEqual(3);

    await selectAndSpread(page, id);
    const lit = (await probe(page, (p) => p.dome()!.neural));
    expect(lit.focusId).toBe(id);
    expect(lit.impact).toEqual(expected.impact);
    expect(lit.needs).toEqual(expected.needs);
    expect(lit.liftedCells, "an impact cell was still under the veil after the spread").toBe(size);
    expect(lit.plateFacts).toContain(`영향 범위 ${size}`);
    await expect(legend.getByTestId("topology-neural-legend-indirect")).toBeVisible();

    await expectMapRests(page, "the spread arrived");
    if (CAPTURE_DIR) {
      mkdirSync(CAPTURE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(CAPTURE_DIR, "impact-e2e.png") });
    }
  });

  test("pointing across an axon and off it does not replay a selection's spread", async ({ page }) => {
    await openNeural(page);
    await selectAndSpread(page, idOf("element", SUBJECT));
    const crossing = await axonCrossing(page);
    expect(crossing, "no axon on screen is clear enough to point at").not.toBeNull();
    const { x, y, nx, ny } = crossing!;

    // Every frame from here on: the selection's lowest share of its spread, and whether a relation lit.
    await page.evaluate(() => {
      const host = window as unknown as { __spreadLow: number; __relationLit: boolean; __sampling: boolean;
        __atlasMap: { dome(): { neural: { focusId: string | null; selected: boolean; needs: string[]; spread: number; hops: number } } | null } };
      host.__spreadLow = Infinity;
      host.__relationLit = false;
      host.__sampling = true;
      const sample = () => {
        const lit = host.__atlasMap.dome()?.neural;
        if (lit?.selected) host.__spreadLow = Math.min(host.__spreadLow, lit.spread / lit.hops);
        if (lit && lit.focusId === null && lit.needs.length > 0) host.__relationLit = true;
        if (host.__sampling) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    for (const d of [-14, -7, -3, 0, 3, 7, 14, 32]) {
      await page.mouse.move(x + nx * d, y + ny * d);
      // A step a few frames long, so each pointer position is drawn.
      await page.waitForTimeout(80);
    }
    await page.getByTestId("app-nav-rail-item-agents").hover();
    // measurement window: longer than a whole spread, so a replay would be sampled while it runs.
    await page.waitForTimeout(1_500);
    const sampled = await page.evaluate(() => {
      const host = window as unknown as { __spreadLow: number; __relationLit: boolean; __sampling: boolean };
      host.__sampling = false;
      return { low: host.__spreadLow, relationLit: host.__relationLit };
    });
    expect(sampled.relationLit, "the pointer never lit the axon it crossed").toBe(true);
    expect(sampled.low, "the selection's spread fell below its whole after the pointer left an axon").toBeGreaterThanOrEqual(1);
    await expectMapRests(page, "the pointer left the axon");
  });

  test("pointing at the same concept without selecting it lights only its direct ends", async ({ page }) => {
    const { vault, legend } = await openNeural(page);
    const id = idOf("element", SUBJECT);
    const expected = impactFromFiles(vault.files, SUBJECT);
    const direct = Object.entries(expected.impact).filter(([, d]) => d === 1).map(([end]) => end).sort();

    await page.mouse.move(2, 2);
    await waitForMapStill(page, { what: "camera" });
    const at = await subjectOnCanvas(page, id);
    await page.mouse.move(at.x, at.y);
    await expect.poll(() => probe(page, (p) => p.dome()!.neural.focusId), { timeout: 15_000 }).toBe(id);
    const lit = await probe(page, (p) => p.dome()!.neural);
    expect(lit.selected).toBe(false);
    expect(lit.impact).toBeNull();
    expect(lit.usedBy).toEqual(direct);
    expect(lit.needs).toEqual(expected.needs);
    expect(lit.plateFacts).not.toContain("영향 범위");
    await expect(legend.getByTestId("topology-neural-legend-indirect")).toHaveCount(0);
  });
});
