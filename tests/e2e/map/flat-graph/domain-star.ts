import { expect, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { useDogfoodSample as serveDogfoodSample } from "../../sample-source";
import { waitForMapSettled, waitForMapStill } from "../../settle";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/dial-shapes";

export interface StarMark { id: string; kind: "domain" | "capability" | "element"; x: number; y: number; r: number }

/** A selected domain's star as the frame drew it: its disc, member capabilities and their elements. */
export interface StarReading {
  domainId: string;
  zoomRatio: number;
  marks: StarMark[];
  /** The star's span over the free map's span, on the side where that share is larger. */
  fillShare: number;
  spanPx: { x: number; y: number };
  freePx: { x: number; y: number };
  nearestMembersPx: number;
  minCapabilityPx: number;
  minElementPx: number;
}

export const readDial = (page: Page) => page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);

export const tokenOf = (page: Page, name: string) => page.evaluate((v) => Number(getComputedStyle(document.documentElement).getPropertyValue(v)), name);

/** Opens the dogfood map on Flat at `viewport`, with the agent dock open on the right when `dock`. */
export async function openDogfoodFlat(page: Page, viewport: { width: number; height: number }, dock: boolean): Promise<void> {
  await page.setViewportSize(viewport);
  await seedFirstRunSeen(page);
  await serveDogfoodSample(page);
  await page.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page, { timeout: 90_000 });
  await page.waitForFunction(() => window.__atlasMap?.dial?.()?.owns === true, undefined, { timeout: 90_000 });
  if (dock) {
    await page.getByTestId("topology-meaning-workbench-toggle").click();
    await expect(page.getByTestId("analysis-workbench")).toBeVisible();
    await page.waitForFunction(() => {
      const surface = document.querySelector("[data-agent-dock-surface=\"inset\"]");
      const frame = document.querySelector("[data-agent-dock-frame]");
      return surface && frame && Number(getComputedStyle(surface).opacity) > 0.99 && [...surface.getAnimations(), ...frame.getAnimations()].every((a) => a.playState !== "running");
    });
    const dockLeft = (await page.getByTestId("analysis-workbench").boundingBox())!.x;
    const canvas = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
    expect(canvas.x + canvas.width, "the dock takes the map's right side").toBeLessThanOrEqual(dockLeft + 1);
  }
  await waitForMapStill(page);
}

/** Each capability's or domain's own elements, from the map's containment edges. */
export async function elementsByContainer(page: Page): Promise<Map<string, string[]>> {
  const pairs = await page.evaluate(() => window.__atlasMap!.edges().filter((e) => e.kind === "contains" && /^(capability|domain):/.test(e.sourceId) && e.targetId.startsWith("element:")).map((e) => [e.sourceId, e.targetId] as const));
  const out = new Map<string, string[]>();
  for (const [of, el] of pairs) if (!out.get(of)?.includes(el)) out.set(of, [...(out.get(of) ?? []), el]);
  return out;
}

export async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.getByTestId("ontology-map-canvas").boundingBox();
  if (box === null) throw new Error("the map canvas has no box");
  return box;
}

/** Waits until the camera and the attention motion rest, the pointer parked off every mark. */
export async function settleSelection(page: Page): Promise<void> {
  const box = await canvasBox(page);
  await page.mouse.move(box.x + 2, box.y + box.height - 2);
  await waitForMapStill(page, { what: "camera" });
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.dialMotionSettled?.() === true)).toBe(true);
}

/** Presses a concept at its drawn centre and waits for the selection to land. */
export async function pressAt(page: Page, id: string, at: { x: number; y: number }): Promise<void> {
  const box = await canvasBox(page);
  await page.mouse.click(box.x + at.x, box.y + at.y);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId), `pressed ${id} at ${Math.round(at.x)},${Math.round(at.y)}`).toBe(id);
  await settleSelection(page);
}

/** Escape on the map, which clears the selection while no dock is open above it. */
export async function deselect(page: Page): Promise<void> {
  await page.getByTestId("ontology-map-canvas").focus();
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBeNull();
  await settleSelection(page);
}

export function readStar(dial: DialProbe, domainId: string, elementsOf: ReadonlyMap<string, readonly string[]>): StarReading {
  const capabilityIds = new Set(dial.clusters.find((c) => c.domainId === domainId)!.capabilityIds);
  const elementIds = new Set([domainId, ...capabilityIds].flatMap((id) => elementsOf.get(id) ?? []));
  const marks: StarMark[] = [
    ...dial.discs.filter((d) => d.id === domainId || capabilityIds.has(d.id)).map((d) => ({ id: d.id, kind: d.id === domainId ? "domain" as const : "capability" as const, x: d.x, y: d.y, r: d.r })),
    ...dial.glyphs.filter((g) => elementIds.has(g.id)).map((g) => ({ id: g.id, kind: "element" as const, x: g.x, y: g.y, r: g.r })),
  ];
  const minX = Math.min(...marks.map((m) => m.x - m.r));
  const maxX = Math.max(...marks.map((m) => m.x + m.r));
  const minY = Math.min(...marks.map((m) => m.y - m.r));
  const maxY = Math.max(...marks.map((m) => m.y + m.r));
  const free = dial.freeRect;
  const spanPx = { x: maxX - minX, y: maxY - minY };
  const freePx = { x: free.maxX - free.minX, y: free.maxY - free.minY };
  const members = marks.filter((m) => m.kind === "capability");
  const nearestMembersPx = Math.min(...members.flatMap((a, i) => members.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
  return {
    domainId, zoomRatio: dial.zoomRatio, marks, spanPx, freePx, nearestMembersPx,
    fillShare: Math.max(spanPx.x / freePx.x, spanPx.y / freePx.y),
    minCapabilityPx: Math.min(...members.map((m) => m.r)),
    minElementPx: Math.min(...marks.filter((m) => m.kind === "element").map((m) => m.r)),
  };
}

export interface OpenTokens { openFill: number; capOpenMaxPx: number; elementOpenMaxPx: number; capDiscMinPx: number; capDiscGainPx: number; capDiscMaxPx: number; elementDotPx: number; growthMax: number }

export async function readOpenTokens(page: Page): Promise<OpenTokens> {
  const read = (name: string) => tokenOf(page, `--map-graph-${name}`);
  return {
    openFill: await read("open-fill"), capOpenMaxPx: await read("cap-open-max-px"), elementOpenMaxPx: await read("element-open-max-px"),
    capDiscMinPx: await read("cap-disc-min-px"), capDiscGainPx: await read("cap-disc-gain-px"), capDiscMaxPx: await read("cap-disc-max-px"),
    elementDotPx: await read("element-dot-px"), growthMax: await read("growth-max"),
  };
}

/**
 * Each member's and element's least radius the opened star guarantees from where the marks are
 * drawn: `openFill` of its room, a pair split in proportion to the two open maxima, short of the
 * domain disc and of its nearest mark's largest own radius, and never past its open maximum.
 */
export function openRadiusFloors(star: StarReading, elementsOf: ReadonlyMap<string, readonly string[]>, t: OpenTokens): Map<string, number> {
  const domain = star.marks.find((m) => m.kind === "domain")!;
  const grown = star.marks.filter((m) => m.kind !== "domain");
  const openMax = (m: StarMark) => (m.kind === "capability" ? t.capOpenMaxPx : t.elementOpenMaxPx);
  const ownMax = (m: StarMark) => (m.kind === "capability"
    ? Math.min(t.capDiscMaxPx, t.capDiscMinPx + t.capDiscGainPx * Math.sqrt(elementsOf.get(m.id)?.length ?? 0)) * t.growthMax
    : t.elementDotPx * t.growthMax);
  return new Map(grown.map((a) => {
    let room = Math.hypot(a.x - domain.x, a.y - domain.y) - domain.r;
    for (const b of grown) {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (b === a || d === 0) continue;
      room = Math.min(room, (d * openMax(a)) / (openMax(a) + openMax(b)));
    }
    const nearest = grown.filter((b) => b !== a).sort((p, q) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(a.x - q.x, a.y - q.y))[0];
    if (nearest) room = Math.min(room, Math.hypot(a.x - nearest.x, a.y - nearest.y) - ownMax(nearest) / t.openFill);
    return [a.id, Math.min(openMax(a), t.openFill * Math.max(0, room)) - 0.5];
  }));
}

/** Pairs of the star's marks whose drawn discs overlap by more than a rounding half pixel. */
export function overlappingMarks(star: StarReading): string[] {
  const { marks } = star;
  return marks.flatMap((a, i) => marks.slice(i + 1).filter((b) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 0.5).map((b) => `${a.id} x ${b.id}`));
}

export function describeStar(s: StarReading): string {
  return `${s.domainId}: zoom ${s.zoomRatio.toFixed(3)}, star ${Math.round(s.spanPx.x)} x ${Math.round(s.spanPx.y)} in ${Math.round(s.freePx.x)} x ${Math.round(s.freePx.y)} (${Math.round(s.fillShare * 100)} %), nearest members ${s.nearestMembersPx.toFixed(1)} px, least capability r ${s.minCapabilityPx.toFixed(2)}, least element r ${s.minElementPx.toFixed(2)}`;
}
