import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapSettled, waitForMapStill } from "../../settle";
import type { Box, DialProbe } from "../../../../src/widgets/ontology-map/dial/types";
import { synthesizeVaultGraph } from "../../../../src/views/home/lib/synth-vault/synth-vault";

const SYNTH_SIZE = 400;
const CURVE_STEPS = 48;
/** Rounding of a box edge to canvas pixels. */
const EDGE_PX = 0.5;

/** The capability with the most dependency neighbours inside its own domain in the generated folder. */
function busiestCapability(): { id: string; domainId: string; neighbours: number } {
  const graph = synthesizeVaultGraph(SYNTH_SIZE, { dependencies: true });
  const domainOf = new Map(graph.edges.filter((e) => e.type === "contains" && e.from.startsWith("synth-domain-") && e.to.startsWith("synth-cap-")).map((e) => [e.to, e.from]));
  const near = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (e.type !== "depends_on" || !domainOf.has(e.from) || domainOf.get(e.from) !== domainOf.get(e.to)) continue;
    for (const [a, b] of [[e.from, e.to], [e.to, e.from]] as const) near.set(a, (near.get(a) ?? new Set()).add(b));
  }
  const [id, set] = [...near].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0]!;
  return { id, domainId: domainOf.get(id)!, neighbours: set.size };
}

async function selectOnCanvas(page: Page, id: string): Promise<DialProbe> {
  await seedFirstRunSeen(page);
  await page.goto(`/en/topology/?synth=${SYNTH_SIZE}&synthDeps=1&guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page, { timeout: 120_000 });
  await page.waitForFunction(() => window.__atlasMap?.dial?.()?.owns === true, undefined, { timeout: 120_000 });
  await waitForMapStill(page);
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const at = await page.evaluate((target) => window.__atlasMap!.nodes().find((n) => n.id === target)!, id);
  await page.mouse.click(box.x + at.x, box.y + at.y);
  await page.waitForFunction((target) => window.__atlasMap!.selection().nodeId === target, id);
  await page.mouse.move(box.x + 2, box.y + box.height - 2);
  await waitForMapStill(page, { what: "camera" });
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.dialMotionSettled?.() === true)).toBe(true);
  return page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);
}

const overlaps = (a: Box, b: Box) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

function crossesBox(s: DialProbe["strips"][number], b: Box): boolean {
  const point = (t: number) => ({ x: (1 - t) ** 2 * s.ax + 2 * (1 - t) * t * s.cx + t * t * s.bx, y: (1 - t) ** 2 * s.ay + 2 * (1 - t) * t * s.cy + t * t * s.by });
  for (let k = 0; k < CURVE_STEPS; k += 1) {
    const p = point(k / CURVE_STEPS);
    const q = point((k + 1) / CURVE_STEPS);
    let enter = 0;
    let leave = 1;
    let missed = false;
    for (const [d, q0] of [[p.x - q.x, p.x - b.minX], [q.x - p.x, b.maxX - p.x], [p.y - q.y, p.y - b.minY], [q.y - p.y, b.maxY - p.y]] as const) {
      if (d === 0) {
        if (q0 < 0) missed = true;
        continue;
      }
      const r = q0 / d;
      if (d < 0) enter = Math.max(enter, r);
      else leave = Math.min(leave, r);
    }
    if (!missed && enter <= leave) return true;
  }
  return false;
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1512, height: 982 }]) {
  test(`at ${viewport.width} wide a selected capability's domain and lit neighbours are named inside the free map, clear of the panel and of its lines`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    const pick = busiestCapability();
    expect(pick.neighbours, "the generated folder has a capability with several in-domain neighbours").toBeGreaterThanOrEqual(3);
    const dial = await selectOnCanvas(page, pick.id);
    const margin = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--map-graph-frame-margin-px")));
    expect(margin).toBeGreaterThan(0);

    const lines = dial.strips.filter((s) => /^(needs|neededBy|relates|broader):/.test(s.flowKey));
    const farEnds = new Set(lines.flatMap((s) => s.flowKey.split(":")[1]!.split(">")));
    const members = new Set(dial.clusters.find((c) => c.domainId === pick.domainId)!.capabilityIds);
    const inDomain = new Set([pick.id, pick.domainId, ...[...farEnds].filter((id) => members.has(id))]);
    const lit = new Set([pick.domainId, ...farEnds]);
    expect(inDomain.size, "lit neighbours inside the domain").toBeGreaterThanOrEqual(4);

    const r = dial.freeRect;
    const outside = dial.texts
      .filter((t) => t.id !== null && inDomain.has(t.id))
      .filter((t) => t.box.minX < r.minX + margin - EDGE_PX || t.box.maxX > r.maxX - margin + EDGE_PX || t.box.minY < r.minY + margin - EDGE_PX || t.box.maxY > r.maxY - margin + EDGE_PX)
      .map((t) => `${t.role}:${t.id} ${Math.round(t.box.minX)}..${Math.round(t.box.maxX)} x ${Math.round(t.box.minY)}..${Math.round(t.box.maxY)} in ${Math.round(r.minX)}..${Math.round(r.maxX)} x ${Math.round(r.minY)}..${Math.round(r.maxY)}`);
    expect(outside, "in-domain lit names inside the free map by the margin").toEqual([]);
    const named = dial.texts.filter((t) => t.id !== null && inDomain.has(t.id)).map((t) => t.id);
    expect(new Set(named), "the selection, its domain and its in-domain neighbours are named").toEqual(inDomain);

    const crossed = dial.texts
      .filter((t) => t.id !== null && lit.has(t.id) && !t.backed)
      .flatMap((t) => lines.filter((s) => crossesBox(s, t.box)).map((s) => `${t.role}:${t.id} x ${s.flowKey}`));
    expect(crossed, "unbacked lit names a lit line runs through").toEqual([]);

    const title = dial.texts.find((t) => t.role === "domain" && t.id === pick.domainId)!;
    const selected = dial.texts.filter((t) => t.id === pick.id);
    expect(selected.length).toBeGreaterThan(0);
    for (const t of selected) expect(overlaps(t.box, title.box), `${t.role} of the selection on its domain name`).toBe(false);
  });
}
