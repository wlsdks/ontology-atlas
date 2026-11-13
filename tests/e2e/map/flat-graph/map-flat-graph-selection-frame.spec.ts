import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";
import { stubDirectoryPicker } from "../../vault-picker-stub";
import type { Box, DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

const DOMAINS = ["orders", "catalog", "payments", "shipping", "returns", "inventory"];
const CAPABILITIES_PER_DOMAIN = 6;
const ELEMENTS_PER_CAPABILITY = 3;
/** Each domain's hub needs three of its siblings and is needed by two, so it lights five in its own domain. */
const HUB_NEEDS = [1, 2, 3];
const HUB_NEEDED_BY = [4, 5];
const CURVE_STEPS = 48;
/** Rounding of a box edge to canvas pixels. */
const EDGE_PX = 0.5;

/** Elements of the hub's first two needs that the hub also needs, so its lit picture names elements. */
const HUB_ELEMENT_NEEDS = [1, 2];

/**
 * Domains of busy hubs whose neighbours carry long names, short enough that a domain fits 1512 wide
 * at the zoom that reads it clear, and a dependency across each domain pair. With `elementNeeds` each
 * hub also needs its siblings' elements, whose names then compete with the hub's.
 */
function generatedVault(elementNeeds = false): Record<string, string> {
  const files: Record<string, string> = {};
  const body = (title: string) => `\n# ${title}\n\n${title} keeps one boundary of the product honest.\n`;
  const domain = (d: number) => `domains/${DOMAINS[d % DOMAINS.length]}`;
  const capability = (d: number, c: number) => `capabilities/${DOMAINS[d % DOMAINS.length]}-${c}`;
  const title = (d: number, c: number) => (c === 0 ? `${DOMAINS[d]} hub` : `${DOMAINS[d]} step ${c} named at length`);
  files["atlas.md"] = `---\nkind: project\ntitle: Atlas\nslug: atlas\ndomains: [${DOMAINS.map((_, d) => domain(d)).join(", ")}]\n---\n${body("Atlas")}`;
  DOMAINS.forEach((name, d) => {
    const capabilities = Array.from({ length: CAPABILITIES_PER_DOMAIN }, (_, c) => capability(d, c));
    files[`${domain(d)}.md`] = `---\nkind: domain\ntitle: ${name}\ncapabilities: [${capabilities.join(", ")}]\n---\n${body(name)}`;
    for (let c = 0; c < CAPABILITIES_PER_DOMAIN; c += 1) {
      const elementsOf = (n: number) => Array.from({ length: ELEMENTS_PER_CAPABILITY }, (_, e) => `elements/${name}-${n}-${e}`);
      const hubNeeds = [...HUB_NEEDS.map((n) => capability(d, n)), capability(d + 1, 1), ...(elementNeeds ? HUB_ELEMENT_NEEDS.flatMap(elementsOf) : [])];
      const needs = c === 0 ? hubNeeds : HUB_NEEDED_BY.includes(c) ? [capability(d, 0)] : [];
      const elements = elementsOf(c);
      files[`${capability(d, c)}.md`] = `---\nkind: capability\ntitle: ${title(d, c)}\ndomain: ${domain(d)}\n${needs.length ? `depends_on: [${needs.join(", ")}]\n` : ""}elements: [${elements.join(", ")}]\n---\n${body(title(d, c))}`;
      for (const element of elements) files[`${element}.md`] = `---\nkind: element\ntitle: ${element.slice("elements/".length)}\n---\n${body(element)}`;
    }
  });
  return files;
}

async function openVault(page: Page, elementNeeds = false): Promise<void> {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, generatedVault(elementNeeds));
  await page.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "networkidle" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await page.waitForFunction((marks) => {
    const dial = window.__atlasMap?.dial?.();
    const drawn = window.__atlasMap?.nodes().filter((n) => n.kind === "domain" || n.kind === "capability").length;
    return dial?.owns === true && (dial as DialProbe).placement.state === "settled" && drawn === marks && document.querySelector("[data-vault-load-progress]") === null;
  }, DOMAINS.length * (1 + CAPABILITIES_PER_DOMAIN), { timeout: 120_000 });
  await waitForMapStill(page);
}

/** The hub drawn furthest right in the free map, where the detail panel opening on the right covers its domain unless the camera frames it. */
const hubNearPanel = (page: Page) => page.evaluate(() => {
  const free = (window.__atlasMap!.dial!() as DialProbe).freeRect;
  return window.__atlasMap!.nodes()
    .filter((n) => n.kind === "capability" && n.id.endsWith("-0") && n.x > free.minX && n.x < free.maxX && n.y > free.minY && n.y < free.maxY)
    .sort((a, b) => b.x - a.x)[0]!.id;
});

/** Clicks a concept where the map draws it now and waits for the selection to frame and rest. */
async function selectOnMap(page: Page, id: string): Promise<{ dial: DialProbe; clickedZoom: number }> {
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const at = await page.evaluate((of) => window.__atlasMap!.nodes().find((n) => n.id === of)!, id);
  expect(at.x > 0 && at.x < box.width && at.y > 0 && at.y < box.height, `${id} is on the canvas to click`).toBe(true);
  const clickedZoom = await page.evaluate(() => (window.__atlasMap!.dial!() as DialProbe).zoomRatio);
  await page.mouse.click(box.x + at.x, box.y + at.y);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId), `clicked ${id} at ${Math.round(at.x)},${Math.round(at.y)}`).toBe(id);
  await page.mouse.move(box.x + 2, box.y + box.height - 2);
  await waitForMapStill(page, { what: "camera" });
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.dialMotionSettled?.() === true)).toBe(true);
  return { clickedZoom, dial: await page.evaluate(() => window.__atlasMap!.dial!() as DialProbe) };
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

async function expectFramed(page: Page, id: string, dial: DialProbe, clickedZoom: number): Promise<void> {
    const margin = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--map-graph-frame-margin-px")));
    expect(margin).toBeGreaterThan(0);
    const panel = await page.evaluate(() => window.__atlasMap!.obstacleInsets());
    expect(panel?.right ?? 0, "the detail panel is open on the right").toBeGreaterThan(0);

    const domainId = dial.clusters.find((c) => c.capabilityIds.includes(id))!.domainId;
    const members = new Set(dial.clusters.find((c) => c.domainId === domainId)!.capabilityIds);
    const lines = dial.strips.filter((s) => /^(needs|neededBy|relates|broader):/.test(s.flowKey));
    const farEnds = new Set(lines.flatMap((s) => s.flowKey.slice(s.flowKey.indexOf(":") + 1).split(">")));
    const inDomain = new Set([id, domainId, ...[...farEnds].filter((end) => members.has(end))]);
    const lit = new Set([domainId, ...farEnds]);
    expect(inDomain.size, "the hub, its domain and its five in-domain neighbours").toBe(2 + HUB_NEEDS.length + HUB_NEEDED_BY.length);

    const r = dial.freeRect;
    const named = dial.texts.filter((t) => t.id !== null && inDomain.has(t.id));
    expect(new Set(named.map((t) => t.id)), "the selection, its domain and its in-domain neighbours are named").toEqual(inDomain);
    const outside = named
      .filter((t) => t.box.minX < r.minX + margin - EDGE_PX || t.box.maxX > r.maxX - margin + EDGE_PX || t.box.minY < r.minY + margin - EDGE_PX || t.box.maxY > r.maxY - margin + EDGE_PX)
      .map((t) => `${t.role}:${t.id} ${Math.round(t.box.minX)}..${Math.round(t.box.maxX)} x ${Math.round(t.box.minY)}..${Math.round(t.box.maxY)} in ${Math.round(r.minX)}..${Math.round(r.maxX)} x ${Math.round(r.minY)}..${Math.round(r.maxY)}`);
    expect(outside, "in-domain lit names inside the free map by the margin").toEqual([]);

    const crossed = dial.texts
      .filter((t) => t.id !== null && lit.has(t.id) && !t.backed)
      .flatMap((t) => lines.filter((s) => crossesBox(s, t.box)).map((s) => `${t.role}:${t.id} x ${s.flowKey}`));
    expect(crossed, "unbacked lit names a lit line runs through").toEqual([]);

    const crowded = named.flatMap((t, i) => named.slice(i + 1).filter((u) => u.id !== t.id && overlaps(t.box, u.box)).map((u) => `${t.role}:${t.id} x ${u.role}:${u.id}`));
    expect(crowded, "lit in-domain names overlapping one another").toEqual([]);
    const [ringGap, discGap, maxRatio, selectZoom] = await page.evaluate(() =>
      ["--map-graph-selected-ring-gap-px", "--map-graph-selected-disc-gap-px", "--map-camera-max-zoom-ratio", "--map-graph-select-zoom-max-ratio"]
        .map((v) => Number(getComputedStyle(document.documentElement).getPropertyValue(v))));
    expect(discGap).toBeGreaterThan(0);
    expect(selectZoom).toBeGreaterThan(1);
    expect(dial.zoomRatio, "a selection zooms in no further than its ratio of the zoom it was made at").toBeLessThanOrEqual(clickedZoom * selectZoom! + 1e-6);
    expect(dial.zoomRatio, "this vault frames the hub below the zoom band's top").toBeLessThan(maxRatio!);
    const ring = dial.discs.find((d) => d.id === id)!;
    const home = dial.discs.find((d) => d.id === domainId)!;
    expect(Math.hypot(ring.x - home.x, ring.y - home.y) - ring.r - ringGap! - home.r, "selection ring to its domain disc").toBeGreaterThanOrEqual(discGap! - EDGE_PX);

    const title = dial.texts.find((t) => t.role === "domain" && t.id === domainId)!;
    const selected = dial.texts.filter((t) => t.id === id);
    expect(selected.length).toBeGreaterThan(0);
    for (const t of selected) expect(overlaps(t.box, title.box), `${t.role} of the selection on its domain name`).toBe(false);

    const marks = dial.texts.filter((t) => t.id !== null && (t.role === "capability" || t.role === "element" || t.role === "status"));
    const stacked = marks.flatMap((t, i) => marks.slice(i + 1).filter((u) => u.id !== t.id && overlaps(t.box, u.box)).map((u) => `${t.role}:${t.text} x ${u.role}:${u.text}`));
    expect(stacked, "capability, element and count names overlapping one another").toEqual([]);
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1512, height: 982 }]) {
  test(`at ${viewport.width} wide a selected capability's domain and lit neighbours are named inside the free map, clear of the panel and of its lines`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await openVault(page);
    const id = await hubNearPanel(page);
    const { dial, clickedZoom } = await selectOnMap(page, id);
    await expectFramed(page, id, dial, clickedZoom);
  });
}

test("a capability clicked on the map while another is selected frames and names as a fresh selection does, its element names yielding", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await openVault(page, true);
  const partnerOf = (hub: string) => hub.replace(/([^/:]+)-0$/, (_, name: string) => `${DOMAINS[(DOMAINS.indexOf(name) + 1) % DOMAINS.length]}-1`);
  const inFreeMap = (id: string) => page.evaluate((of) => {
    const free = (window.__atlasMap!.dial!() as DialProbe).freeRect;
    return window.__atlasMap!.nodes().some((n) => n.id === of && n.x > free.minX && n.x < free.maxX && n.y > free.minY && n.y < free.maxY);
  }, id);
  const hubs = await page.evaluate(() => window.__atlasMap!.nodes().filter((n) => n.kind === "capability" && n.id.endsWith("-0")).map((n) => n.id).sort());
  let hub: string | null = null;
  for (const candidate of hubs) {
    if (!(await inFreeMap(partnerOf(candidate)))) continue;
    await selectOnMap(page, partnerOf(candidate));
    if (await inFreeMap(candidate)) {
      hub = candidate;
      break;
    }
  }
  expect(hub, "a selected capability whose partner hub in the previous domain stays in the free map").not.toBeNull();
  expect(await page.evaluate(() => window.__atlasMap!.obstacleInsets()?.right ?? 0), "the detail panel is open before the retarget").toBeGreaterThan(0);
  const { dial, clickedZoom } = await selectOnMap(page, hub!);
  expect(dial.texts.some((t) => t.role === "element"), "the hub's lit picture names elements").toBe(true);
  await expectFramed(page, hub!, dial, clickedZoom);
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1512, height: 982 }]) {
  test(`at ${viewport.width} wide a domain the detail panel would cover pans its member star clear without zooming, its nearest partner in view and its names off its lines`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await openVault(page);
    const before = await page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);
    const domainIds = new Set(before.clusters.map((c) => c.domainId));
    const id = before.discs
      .filter((d) => domainIds.has(d.id) && d.x > before.freeRect.minX && d.x < before.freeRect.maxX && d.y > before.freeRect.minY && d.y < before.freeRect.maxY)
      .sort((a, b) => b.x - a.x)[0]!.id;
    const star = new Set([id, ...before.clusters.find((c) => c.domainId === id)!.capabilityIds]);
    const { dial, clickedZoom } = await selectOnMap(page, id);
    const margin = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--map-graph-frame-margin-px")));
    const r = dial.freeRect;
    expect(before.discs.some((d) => star.has(d.id) && d.x + d.r > r.maxX - margin), "unmoved, the detail panel would cover the member star").toBe(true);

    expect(dial.zoomRatio, "a domain selection never zooms").toBeCloseTo(clickedZoom, 6);
    const outOfFrame = [
      ...dial.discs.filter((d) => star.has(d.id)).map((d) => ({ what: `disc ${d.id}`, box: { minX: d.x - d.r, maxX: d.x + d.r, minY: d.y - d.r, maxY: d.y + d.r } })),
      ...dial.texts.filter((t) => t.id !== null && star.has(t.id)).map((t) => ({ what: `${t.role} ${t.id}`, box: t.box })),
    ].filter(({ box }) => box.minX < r.minX + margin - EDGE_PX || box.maxX > r.maxX - margin + EDGE_PX || box.minY < r.minY + margin - EDGE_PX || box.maxY > r.maxY - margin + EDGE_PX)
      .map(({ what }) => what);
    expect(outOfFrame, "the domain, its members and their names inside the free map by the margin").toEqual([]);

    const lines = dial.strips.filter((s) => /^(needs|neededBy):/.test(s.flowKey));
    const partners = [...new Set(lines.flatMap((s) => s.flowKey.slice(s.flowKey.indexOf(":") + 1).split(">")))].filter((end) => end !== id);
    expect(partners.length, "the domain has partner domains").toBeGreaterThan(0);
    const home = dial.discs.find((d) => d.id === id)!;
    const nearest = partners.map((p) => dial.discs.find((d) => d.id === p)!).sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y))[0]!;
    expect(nearest.x > r.minX && nearest.x < r.maxX && nearest.y > r.minY && nearest.y < r.maxY, `the nearest partner, ${nearest.id}, is in the free map`).toBe(true);

    const lit = new Set([...star, ...partners]);
    const crossed = dial.texts
      .filter((t) => t.id !== null && lit.has(t.id) && !t.backed)
      .flatMap((t) => lines.filter((s) => crossesBox(s, t.box)).map((s) => `${t.role}:${t.id} x ${s.flowKey}`));
    expect(crossed, "unbacked lit names a domain line runs through").toEqual([]);
  });
}
