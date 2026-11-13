import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { useDogfoodSample } from "../../sample-source";
import { waitForMapSettled, waitForMapStill } from "../../settle";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

const VIEWPORT = { width: 1920, height: 1080 };
const IDLE_WINDOW_MS = 3_000;

test.use({ viewport: VIEWPORT });

test.beforeEach(async ({ page }) => {
  await seedFirstRunSeen(page);
});

type FrameWindow = Window & { __graphFrameAt?: number };

const readDial = (page: Page) => page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);

async function openGraph(page: Page, query = ""): Promise<DialProbe> {
  await page.addInitScript(() => {
    const w = window as FrameWindow;
    w.__graphFrameAt = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => raf((t) => {
      w.__graphFrameAt = performance.now();
      callback(t);
    });
  });
  await page.goto(`/en/topology/?${query}guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page, { timeout: 90_000 });
  await page.waitForFunction(() => window.__atlasMap?.dial?.()?.owns === true, undefined, { timeout: 90_000 });
  await waitForMapStill(page);
  return readDial(page);
}

async function canvasPoint(page: Page, at: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("ontology-map-canvas").boundingBox();
  if (box === null) throw new Error("the map canvas has no box");
  return { x: box.x + at.x, y: box.y + at.y };
}

/** The eight domain hues as the canvas writes them: a disc rim in one of these is lit at full hue. */
const domainHues = (page: Page) => page.evaluate(() => {
  const style = getComputedStyle(document.documentElement);
  return Array.from({ length: 8 }, (_, k) => {
    const [r, g, b] = style.getPropertyValue(`--color-domain-${k + 1}-rgb`).trim().split(/\s+/).map(Number);
    return `#${[r, g, b].map((n) => n!.toString(16).padStart(2, "0")).join("")}`;
  });
});

const hovered = (page: Page) =>
  page.evaluate(() => new Promise<string | null>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.__atlasMap!.hover())))));

test("Flat draws the domain graph: every capability is pointable, names never overlap, idle draws nothing", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await useDogfoodSample(page);
  const dial = await openGraph(page);
  const capabilityIds = await page.evaluate(() => window.__atlasMap!.nodes().filter((n) => n.kind === "capability" && !n.hidden).map((n) => n.id));

  expect(dial.clusters.length, "every domain is a cluster").toBeGreaterThan(1);
  expect(dial.textOverlaps, "no admitted name crosses another").toBe(0);
  for (const cluster of dial.clusters) expect(dial.texts.some((t) => t.id === cluster.domainId && t.role === "domain"), `${cluster.domainId} is named`).toBe(true);

  const discs = new Map(dial.discs.map((d) => [d.id, d]));
  expect(capabilityIds.filter((id) => !discs.has(id)), "every capability has a disc on screen").toEqual([]);
  for (const id of capabilityIds) {
    const at = await canvasPoint(page, discs.get(id)!);
    await page.mouse.move(at.x, at.y);
    expect(await hovered(page), `${id} answers the pointer`).toBe(id);
  }

  await page.mouse.move(5, VIEWPORT.height / 2);
  await page.waitForFunction(
    (quietMs) => performance.now() - ((window as FrameWindow).__graphFrameAt ?? 0) > quietMs,
    IDLE_WINDOW_MS,
    { polling: 250, timeout: 60_000 },
  );
  expect(errors).toEqual([]);
});

test("pointing at a domain sinks every other domain; selecting a capability names it and keeps its reach lit", async ({ page }) => {
  test.setTimeout(180_000);
  await useDogfoodSample(page);
  const rest = await openGraph(page);
  const restInk = new Map(rest.discs.map((d) => [d.id, d.ink]));
  const target = [...rest.clusters].sort((a, b) => b.capabilityIds.length - a.capabilityIds.length)[0]!;
  const own = new Set(target.capabilityIds);
  const foreign = rest.clusters.filter((c) => c !== target).flatMap((c) => c.capabilityIds).filter((id) => restInk.has(id));
  expect(foreign.length, "the sample has capabilities outside the target domain").toBeGreaterThan(0);

  const chip = await canvasPoint(page, target.chip);
  await page.mouse.move(chip.x, chip.y);
  expect(await hovered(page)).toBe(target.domainId);
  await waitForMapStill(page);
  const lit = await readDial(page);
  const litInk = new Map(lit.discs.map((d) => [d.id, d.ink]));
  const hues = await domainHues(page);
  for (const id of own) if (restInk.has(id)) expect(hues, `${id} is lit at its full hue`).toContain(litInk.get(id));
  const sunkCount = foreign.filter((id) => litInk.get(id) !== restInk.get(id)).length;
  expect(sunkCount, "every foreign capability sinks").toBe(foreign.length);

  const capability = [...own].find((id) => restInk.has(id))!;
  const disc = lit.discs.find((d) => d.id === capability)!;
  const at = await canvasPoint(page, disc);
  await page.mouse.click(at.x, at.y);
  await page.mouse.move(5, VIEWPORT.height / 2);
  await waitForMapStill(page);
  expect(await page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(capability);
  const selected = await readDial(page);
  expect(selected.texts.some((t) => t.id === capability && t.role === "capability"), "the selected capability is named").toBe(true);
  expect(selected.textOverlaps, "no admitted name crosses another under a selection").toBe(0);
  const selectedInk = new Map(selected.discs.map((d) => [d.id, d.ink]));
  expect(hues, "the selected capability's domain stays lit").toContain(selectedInk.get(target.domainId));
});

test("under a path lens a concept outside the lens draws no disc and answers no pointer", async ({ page }) => {
  test.setTimeout(180_000);
  const dial = await openGraph(page, "mode=path&pathFrom=domain%3Afulfillment&pathTo=capability%3Acarrier-integration&");
  await expect(page.getByTestId("ontology-map")).toHaveAttribute("data-map-lens", "path");
  await waitForMapStill(page);
  const nodes = await page.evaluate(() => window.__atlasMap!.nodes().filter((n) => n.kind === "capability"));
  const discs = new Set((await readDial(page)).discs.map((d) => d.id));
  const outside = nodes.filter((n) => n.alpha === 0);
  expect(dial.owns).toBe(true);
  expect(outside.length, "the lens leaves capabilities outside it").toBeGreaterThan(0);
  expect(outside.filter((n) => discs.has(n.id)).map((n) => n.id), "no disc outside the lens").toEqual([]);
  for (const n of outside.slice(0, 8)) {
    const at = await canvasPoint(page, n);
    await page.mouse.move(at.x, at.y);
    expect(await hovered(page), `${n.id} is outside the lens`).not.toBe(n.id);
  }
});

const linesOf = (dial: DialProbe, kind: "needs" | "neededBy") =>
  dial.strips.filter((s) => s.flowKey.startsWith(`${kind}:`)).map((s) => s.flowKey.slice(kind.length + 1).split(">") as [string, string]);
const overlap = (a: { minX: number; maxX: number; minY: number; maxY: number }, b: typeof a) =>
  a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

test("selecting a capability lights and names what it needs and what needs it, and keeps its name clear of the panel and the domain names", async ({ page }) => {
  test.setTimeout(180_000);
  await useDogfoodSample(page);
  const rest = await openGraph(page);
  const hues = await domainHues(page);
  let chosen: { id: string; needs: string[]; neededBy: string[] } | null = null;
  for (const disc of rest.discs) {
    if (!rest.clusters.some((c) => c.capabilityIds.includes(disc.id))) continue;
    const at = await canvasPoint(page, disc);
    await page.mouse.move(at.x, at.y);
    if ((await hovered(page)) !== disc.id) continue;
    await waitForMapStill(page);
    const dial = await readDial(page);
    const needs = linesOf(dial, "needs").map(([, to]) => to);
    const neededBy = linesOf(dial, "neededBy").map(([from]) => from);
    if (needs.length > 0 && neededBy.length > 0) {
      chosen = { id: disc.id, needs, neededBy };
      break;
    }
  }
  expect(chosen, "the sample has a capability that both needs and is needed").not.toBeNull();
  const { id, needs, neededBy } = chosen!;

  const centre = (await readDial(page)).discs.find((d) => d.id === id);
  expect(centre, `${id} reports a disc centre`).toBeDefined();
  const at = await canvasPoint(page, centre!);
  await page.mouse.click(at.x, at.y);
  await page.mouse.move(5, VIEWPORT.height / 2);
  await waitForMapStill(page);
  expect(await page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(id);
  const selected = await readDial(page);
  // A selection may zoom in until its domain reads clear: far ends in other domains may leave the
  // screen and far-end elements come onto it, so the lit picture is checked for what is drawn.
  const selectedNeeds = linesOf(selected, "needs");
  const selectedNeededBy = linesOf(selected, "neededBy");
  expect(selectedNeeds.map(([from, to]) => `${from}>${to}`)).toEqual(expect.arrayContaining(needs.map((to) => `${id}>${to}`)));
  expect(selectedNeededBy.map(([from, to]) => `${from}>${to}`)).toEqual(expect.arrayContaining(neededBy.map((from) => `${from}>${id}`)));
  expect(selectedNeeds.every(([from]) => from === id) && selectedNeededBy.every(([, to]) => to === id), "every lit line runs to or from the selection").toBe(true);

  const ink = new Map(selected.discs.map((d) => [d.id, d.ink]));
  const free = selected.freeRect;
  // A far end keeps its light anywhere; its name draws only where no panel covers it.
  const inFree = (d: { x: number; y: number }) => d.x > free.minX && d.x < free.maxX && d.y > free.minY && d.y < free.maxY;
  // Each side panel in canvas pixels, out to its canvas edge.
  const panels = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    return [["topology-index-panel", "left"], ["map-detail-panel", "right"]].flatMap(([testId, side]) => {
      const b = document.querySelector(`[data-testid="${testId}"]`)?.getBoundingClientRect();
      if (!b || b.width === 0) return [];
      return [{ minX: side === "left" ? 0 : b.left - canvas.left, maxX: side === "left" ? b.right - canvas.left : canvas.width, minY: b.top - canvas.top, maxY: b.bottom - canvas.top }];
    });
  });
  expect(panels.length, "the detail panel is open").toBeGreaterThan(0);
  let named = 0;
  for (const end of [...needs, ...neededBy]) {
    const disc = selected.discs.find((d) => d.id === end);
    if (!disc) continue;
    expect(hues, `${end} is lit at its full hue`).toContain(ink.get(end));
    const names = selected.texts.filter((t) => t.id === end && t.role !== "domain");
    for (const t of names) expect(panels.some((p) => overlap(t.box, p)), `${end}'s name ${t.text} is drawn under a panel`).toBe(false);
    if (names.length > 0) named += 1;
    else expect(inFree(disc), `${end} is unnamed only where its name would reach a panel`).toBe(false);
  }
  expect(named, "the selection names at least one far end").toBeGreaterThan(0);

  const own = selected.texts.filter((t) => t.id === id && t.role !== "domain");
  expect(own.length, "the selection is named").toBeGreaterThan(0);
  const domainNames = selected.texts.filter((t) => t.role === "domain");
  for (const t of own) {
    expect(t.box.minX >= free.minX && t.box.maxX <= free.maxX && t.box.minY >= free.minY && t.box.maxY <= free.maxY, `${t.text} sits inside the free map`).toBe(true);
    for (const d of domainNames) expect(overlap(t.box, d.box), `${t.text} touches ${d.text}`).toBe(false);
  }
});
