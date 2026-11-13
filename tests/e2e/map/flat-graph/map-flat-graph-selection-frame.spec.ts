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

/** The domain drawn furthest right in the free map, its member star, and the probe before it is selected. */
async function domainNearPanel(page: Page): Promise<{ id: string; star: Set<string>; before: DialProbe }> {
  const before = await page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);
  const domainIds = new Set(before.clusters.map((c) => c.domainId));
  const id = before.discs
    .filter((d) => domainIds.has(d.id) && d.x > before.freeRect.minX && d.x < before.freeRect.maxX && d.y > before.freeRect.minY && d.y < before.freeRect.maxY)
    .sort((a, b) => b.x - a.x)[0]!.id;
  return { id, before, star: new Set([id, ...before.clusters.find((c) => c.domainId === id)!.capabilityIds]) };
}

/** The selected domain's disc, its member star and every name they carry, its name and reach line included, inside the free map by the margin. */
async function expectDomainFramed(page: Page, id: string, star: ReadonlySet<string>, before: DialProbe, dial: DialProbe): Promise<number> {
  const margin = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--map-graph-frame-margin-px")));
  const r = dial.freeRect;
  expect(before.discs.some((d) => star.has(d.id) && d.x + d.r > r.maxX - margin), "unmoved, the detail panel would cover the member star").toBe(true);
  const own = dial.texts.filter((t) => t.id === id).map((t) => t.role);
  expect(own, "the selected domain is named with its reach line beneath").toEqual(expect.arrayContaining(["domain", "status"]));
  const outOfFrame = [
    ...dial.discs.filter((d) => star.has(d.id)).map((d) => ({ what: `disc ${d.id}`, box: { minX: d.x - d.r, maxX: d.x + d.r, minY: d.y - d.r, maxY: d.y + d.r } })),
    ...dial.texts.filter((t) => t.id !== null && star.has(t.id)).map((t) => ({ what: `${t.role} ${t.id}`, box: t.box })),
  ].filter(({ box }) => box.minX < r.minX + margin - EDGE_PX || box.maxX > r.maxX - margin + EDGE_PX || box.minY < r.minY + margin - EDGE_PX || box.maxY > r.maxY - margin + EDGE_PX)
    .map(({ what }) => `${what} ${Math.round(r.minX)}..${Math.round(r.maxX)}`);
  expect(outOfFrame, "the domain, its members and their names inside the free map by the margin").toEqual([]);
  return margin;
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1512, height: 949 }]) {
  test(`at ${viewport.width} wide a domain chosen in the explorer frames its star, name and reach line between the explorer and the detail panel without zooming in`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await openVault(page);
    const { id, star, before } = await domainNearPanel(page);
    const row = page.locator(`[data-testid="topology-index-panel"] [data-index-row="${id}"]`);
    await expect(row, "the explorer lists the domain at rest").toBeVisible();
    const clickedZoom = before.zoomRatio;
    await row.click();
    await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(id);
    await waitForMapStill(page, { what: "camera" });
    await expect.poll(() => page.evaluate(() => window.__atlasMap!.dialMotionSettled?.() === true)).toBe(true);
    const dial = await page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);
    const panels = await page.evaluate(() => window.__atlasMap!.obstacleInsets());
    expect(panels?.left ?? 0, "the explorer is open on the left").toBeGreaterThan(0);
    expect(panels?.right ?? 0, "the detail panel is open on the right").toBeGreaterThan(0);
    expect(dial.freeRect.minX, "the free map starts past the explorer").toBeGreaterThanOrEqual(panels!.left);
    expect(dial.zoomRatio, "a domain selection never zooms in").toBeLessThanOrEqual(clickedZoom + 1e-6);
    await expectDomainFramed(page, id, star, before, dial);
  });
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1512, height: 982 }]) {
  test(`at ${viewport.width} wide a domain the detail panel would cover pans its member star clear without zooming, its nearest partner in view and its names off its lines`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await openVault(page);
    const { id, star, before } = await domainNearPanel(page);
    const { dial, clickedZoom } = await selectOnMap(page, id);
    expect(dial.zoomRatio, "a domain selection never zooms").toBeCloseTo(clickedZoom, 6);
    await expectDomainFramed(page, id, star, before, dial);
    const r = dial.freeRect;

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

/** Canvas boxes of what covers the map: each side panel out to its canvas edge, the key's words and the tool row's controls. */
const chromeBoxes = (page: Page) => page.evaluate(() => {
  const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
  const local = (el: Element | null) => {
    const b = el?.getBoundingClientRect();
    return b && b.width > 0 ? { minX: b.left - canvas.left, maxX: b.right - canvas.left, minY: b.top - canvas.top, maxY: b.bottom - canvas.top } : null;
  };
  const explorer = local(document.querySelector('[data-testid="topology-index-panel"]'));
  const detail = local(document.querySelector('[data-testid="map-detail-panel"]'));
  return {
    explorer: explorer && { ...explorer, minX: 0 },
    detail: detail && { ...detail, maxX: canvas.width },
    key: local(document.querySelector('[data-testid="topology-flat-key"] > div')),
    tools: local(document.querySelector('[data-testid="topology-tool-tile-group"]')),
  };
});

async function drawnUnderChrome(page: Page): Promise<string[]> {
  const chrome = await chromeBoxes(page);
  const dial = await page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);
  return dial.texts.flatMap((t) => Object.entries(chrome).filter(([, b]) => b !== null && overlaps(t.box, b)).map(([what]) => `${t.role} "${t.text}" under ${what}`));
}

test("no map name is drawn under the key, the explorer, the detail panel, the gap beside the rail or the tool row", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1512, height: 949 });
  await openVault(page);
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const { key, explorer, tools } = await chromeBoxes(page);
  expect(key, "the key shows below the map").not.toBeNull();
  expect(explorer, "the explorer is open").not.toBeNull();
  expect(tools, "the tool row shows").not.toBeNull();
  const centre = (b: Box) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
  // Pans the domain name nearest `at` onto it by the shortest move, and checks it landed there.
  const panNameOnto = async (at: { x: number; y: number }, what: string, cover: Box) => {
    const rest = await page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);
    const name = rest.texts.filter((t) => t.role === "domain").map((t) => ({ t, dx: at.x - centre(t.box).x, dy: at.y - centre(t.box).y }))
      .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))[0]!;
    const disc = (probe: DialProbe) => probe.discs.find((d) => d.id === name.t.id)!;
    const offset = { x: name.t.box.minX - disc(rest).x, y: name.t.box.minY - disc(rest).y };
    // A press on empty map: no disc within reach and no name under it.
    const empty = (x: number, y: number) => rest.discs.every((d) => Math.hypot(d.x - x, d.y - y) > d.r + 24) && rest.texts.every((t) => !(x >= t.box.minX && x <= t.box.maxX && y >= t.box.minY && y <= t.box.maxY));
    const centred = { x: box.width / 2 - name.dx / 2, y: box.height / 2 - name.dy / 2 };
    const start = [0, 40, 80, 120, 160].flatMap((ring) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([i, j]) => ({ x: centred.x + i! * ring, y: centred.y + j! * ring })))
      .find((p) => empty(p.x, p.y))!;
    expect(start, "an empty point to press").toBeDefined();
    const from = { x: box.x + start.x, y: box.y + start.y };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + name.dx, from.y + name.dy, { steps: 20 });
    expect(await page.evaluate(() => window.__atlasMap!.interaction?.().kind), "the press pans the map").toBe("pan");
    await page.mouse.up();
    await waitForMapStill(page);
    const panned = disc(await page.evaluate(() => window.__atlasMap!.dial!() as DialProbe));
    const width = name.t.box.maxX - name.t.box.minX;
    const height = name.t.box.maxY - name.t.box.minY;
    const lands = { minX: panned.x + offset.x, maxX: panned.x + offset.x + width, minY: panned.y + offset.y, maxY: panned.y + offset.y + height };
    expect(overlaps(lands, cover), `${name.t.text}'s name lands on ${what}`).toBe(true);
    expect(await drawnUnderChrome(page), `names drawn under the chrome with a name on ${what}`).toEqual([]);
  };
  await panNameOnto(centre(key!), "the key's words", key!);
  await panNameOnto({ x: explorer!.maxX, y: box.height / 2 }, "the explorer's edge", explorer!);
  await panNameOnto(centre(tools!), "the tool row", tools!);

  await selectOnMap(page, await hubNearPanel(page));
  expect(await drawnUnderChrome(page), "names drawn under the chrome with a selection").toEqual([]);
});
