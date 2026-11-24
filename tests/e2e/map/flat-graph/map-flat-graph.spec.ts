import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { useDogfoodSample } from "../../sample-source";
import { waitForMapSettled, waitForMapStill } from "../../settle";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/dial-shapes";

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

/** The project's ink, the one colour on this canvas: a mark drawn in it belongs to the lit domain. */
const projectInk = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--map-graph-project").trim());

/** What a lit mark paints: the project's ink inside the focus's own domain, the neutral name ink elsewhere. */
const litInks = (page: Page) => page.evaluate(() => {
  const style = getComputedStyle(document.documentElement);
  return ["--map-graph-project", "--map-graph-name"].map((name) => style.getPropertyValue(name).trim());
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
  const ink = await projectInk(page);
  for (const id of own) if (restInk.has(id)) expect(litInk.get(id), `${id} is lit in the project's ink`).toBe(ink);
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
  expect(selectedInk.get(target.domainId), "the selected capability's domain stays lit").toBe(ink);
});

/** The screen distance between a domain's two closest member capabilities. */
function membersApartPx(dial: DialProbe, domainId: string): number {
  const ids = new Set(dial.clusters.find((c) => c.domainId === domainId)!.capabilityIds);
  const members = dial.discs.filter((d) => ids.has(d.id));
  return Math.min(...members.flatMap((d, i) => members.slice(i + 1).map((e) => Math.hypot(d.x - e.x, d.y - e.y))));
}

const tokenPx = (page: Page, name: string) => page.evaluate((v) => Number(getComputedStyle(document.documentElement).getPropertyValue(v)), name);

test("a domain selected at the overview zooms in far enough that two opened capability discs fit between its closest members, and one deselect returns the view", async ({ page }) => {
  test.setTimeout(180_000);
  await useDogfoodSample(page);
  await openGraph(page);
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const apart = 2 * (await tokenPx(page, "--map-graph-cap-open-max-px"));
  const before = await readDial(page);
  const domainId = [...before.clusters].sort((a, b) => membersApartPx(before, a.domainId) - membersApartPx(before, b.domainId))[0]!.domainId;
  expect(membersApartPx(before, domainId), "at the overview a domain's members stand closer than two opened capability discs").toBeLessThan(apart);

  const home = before.discs.find((d) => d.id === domainId)!;
  await page.mouse.click(box.x + home.x, box.y + home.y);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(domainId);
  await page.mouse.move(box.x + 2, box.y + box.height - 2);
  await waitForMapStill(page, { what: "camera" });
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.dialMotionSettled?.() === true)).toBe(true);
  const selected = await readDial(page);
  expect(selected.zoomRatio, "the selection zoomed in").toBeGreaterThan(before.zoomRatio);
  expect(membersApartPx(selected, domainId), "the closest members once the selection lands").toBeGreaterThanOrEqual(apart - 0.5);

  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBeNull();
  await waitForMapStill(page, { what: "camera" });
  const back = await readDial(page);
  expect(back.zoomRatio, "the deselect returns the zoom the reader left").toBeCloseTo(before.zoomRatio, 4);
  const returned = back.discs.find((d) => d.id === domainId)!;
  expect(Math.hypot(returned.x - home.x, returned.y - home.y), "the deselect returns the domain to where it stood").toBeLessThan(1);
});

test("a capability drawn smaller than the least pick radius answers a pointer that far from its centre", async ({ page }) => {
  test.setTimeout(180_000);
  await useDogfoodSample(page);
  const dial = await openGraph(page);
  const pickMin = await tokenPx(page, "--map-graph-pick-min-px");
  const reach = pickMin - 0.5;
  const centres = await page.evaluate(() => window.__atlasMap!.nodes().filter((n) => !n.hidden).map((n) => ({ id: n.id, x: n.x, y: n.y })));
  const capabilities = new Set(dial.clusters.flatMap((c) => c.capabilityIds));
  const nearestId = (p: { x: number; y: number }) => centres.reduce((a, b) => (Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? b : a)).id;
  const onMark = (p: { x: number; y: number }) =>
    dial.discs.some((d) => Math.hypot(d.x - p.x, d.y - p.y) <= d.r) ||
    dial.texts.some((t) => p.x >= t.box.minX - 1 && p.x <= t.box.maxX + 1 && p.y >= t.box.minY - 1 && p.y <= t.box.maxY + 1);
  // Every disc drawn inside the reach: the press answers there whether the disc's slack or the least radius carries it.
  const points = dial.discs
    .filter((d) => capabilities.has(d.id) && d.r < reach)
    .flatMap((d) => Array.from({ length: 8 }, (_, k) => ({ id: d.id, x: d.x + reach * Math.cos((k * Math.PI) / 4), y: d.y + reach * Math.sin((k * Math.PI) / 4) })))
    .filter((p) => nearestId(p) === p.id && !onMark(p));
  expect(points.length, "small capabilities with a clear point at the edge of their reach").toBeGreaterThan(0);
  for (const p of points.slice(0, 6)) {
    const at = await canvasPoint(page, p);
    await page.mouse.move(at.x, at.y);
    expect(await hovered(page), `${p.id} at ${reach} px from its centre`).toBe(p.id);
    await expect(page.getByTestId("ontology-map-canvas"), "the cursor offers the press").toHaveCSS("cursor", "pointer");
  }
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
  const litRims = await litInks(page);
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
  // How far an unnamed far end's name would reach, from the names this frame drew: the widest
  // pixels per character (CI's Linux fonts run wider), and the tallest line.
  const drawnNames = selected.texts.filter((t) => t.role !== "domain" && t.text.length > 0);
  const pxPerChar = Math.max(...drawnNames.map((t) => (t.box.maxX - t.box.minX) / t.text.length));
  const lineHeight = Math.max(...drawnNames.map((t) => t.box.maxY - t.box.minY));
  const labels = new Map((await page.evaluate(() => window.__atlasMap!.nodes().map((n) => [n.id, n.label] as const))));
  const nameWouldReachChrome = (end: string, d: { x: number; y: number; r: number }) => {
    const reachX = d.r + (labels.get(end)?.length ?? 0) * pxPerChar * 1.1 + lineHeight;
    const reachY = d.r + lineHeight * 3;
    return Math.min(d.x - free.minX, free.maxX - d.x) < reachX || Math.min(d.y - free.minY, free.maxY - d.y) < reachY;
  };
  let named = 0;
  for (const end of [...needs, ...neededBy]) {
    const disc = selected.discs.find((d) => d.id === end);
    if (!disc) continue;
    expect(litRims, `${end} is lit at full strength`).toContain(ink.get(end));
    const names = selected.texts.filter((t) => t.id === end && t.role !== "domain");
    for (const t of names) expect(panels.some((p) => overlap(t.box, p)), `${end}'s name ${t.text} is drawn under a panel`).toBe(false);
    if (names.length > 0) named += 1;
    else expect(!inFree(disc) || nameWouldReachChrome(end, disc), `${end} at (${Math.round(disc.x)}, ${Math.round(disc.y)}) in ${JSON.stringify(free)} is unnamed only where its name would reach a panel`).toBe(true);
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
