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

test.describe("Neural's impact on the dogfood vault", () => {
  test.setTimeout(180_000);

  test("selecting a concept lights everything that depends on it, by distance, then rests", async ({ page }) => {
    const { vault, legend } = await openNeural(page);
    const id = idOf("element", SUBJECT);
    const expected = impactFromFiles(vault.files, SUBJECT);
    const size = Object.keys(expected.impact).length;
    expect(Math.max(...Object.values(expected.impact)), "the subject no longer reaches three distances").toBeGreaterThanOrEqual(3);

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
    const lit = (await probe(page, (p) => p.dome()!.neural));
    expect(lit.focusId).toBe(id);
    expect(lit.impact).toEqual(expected.impact);
    expect(lit.needs).toEqual(expected.needs);
    expect(lit.liftedCells, "an impact cell was still under the veil after the spread").toBe(size);
    expect(lit.plateFacts).toContain(`영향 범위 ${size}`);
    await expect(legend.getByTestId("topology-neural-legend-indirect")).toBeVisible();

    let previous = -1;
    await expect
      .poll(async () => {
        const now = await lastAwake(page);
        const still = now === previous;
        previous = now;
        return still;
      }, { message: "the map kept drawing after the spread arrived", timeout: 15_000 })
      .toBe(true);
    const quietFrom = await lastAwake(page);
    // measurement window: 1 s in which a resting map must record no awake frame.
    await page.waitForTimeout(1_000);
    expect(await lastAwake(page), "the map woke again after the spread").toBe(quietFrom);
    if (CAPTURE_DIR) {
      mkdirSync(CAPTURE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(CAPTURE_DIR, "impact-e2e.png") });
    }
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
