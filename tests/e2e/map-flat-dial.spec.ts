import { expect, test, type Page } from "@playwright/test";

import "./atlas-map-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapSettled, waitForMapStill } from "./settle";
import type { Box, DialProbe } from "../../src/widgets/ontology-map/dial/types";

type Vault = "storefront" | "dogfood" | "synth 2,000" | "synth 10,000" | "layered 10,000";

const QUERY: Record<Vault, string> = {
  storefront: "",
  dogfood: "",
  "synth 2,000": "synth=2000&synthDeps=1&",
  "synth 10,000": "synth=10000&synthDeps=1&",
  "layered 10,000": "synth=10000&synthDeps=1&synthShape=layered&",
};

const OVERVIEW: Record<Vault, { rings: number[]; marks: number; lines: number | "all"; perEnd?: number; crossings: number; namesCrossed: number; noDiscs?: boolean }> = {
  storefront: { rings: [2, 4, 3], marks: 100, lines: "all", crossings: 10, namesCrossed: 3 },
  dogfood: { rings: [2, 2], marks: 60, lines: "all", crossings: 2, namesCrossed: 3 },
  "synth 2,000": { rings: [15], marks: 400, lines: 24, crossings: 40, namesCrossed: 2 },
  "synth 10,000": { rings: [33], marks: 80, lines: 40, perEnd: 6, crossings: 15, namesCrossed: 3, noDiscs: true },
  "layered 10,000": { rings: [3, 12, 15, 3], marks: 80, lines: 40, perEnd: 6, crossings: 100, namesCrossed: 6, noDiscs: true },
};

const WIDTHS = [
  { width: 1512, height: 982 },
  { width: 1040, height: 720 },
] as const;

const ZOOM_CEILING = 3.2;
const ORDERS = "domain:order";

async function openDial(page: Page, vault: Vault, size: { width: number; height: number }, extra = "") {
  await page.setViewportSize(size);
  await seedFirstRunSeen(page);
  await page.addInitScript((dogfood) => {
    if (dogfood) window.localStorage.setItem("demo:sample-source:v1", "dogfood");
  }, vault === "dogfood");
  await page.goto(`/en/topology/?${QUERY[vault]}${extra}guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page, { timeout: 90_000 });
  await waitForDial(page);
}

async function waitForDial(page: Page) {
  await page.waitForFunction(
    () => {
      const dial = window.__atlasMap?.dial?.();
      return !!dial && dial.owns && (dial as DialProbe).placement.state === "settled";
    },
    undefined,
    { polling: "raf", timeout: 90_000 },
  );
  await waitForMapStill(page);
}

async function canvasOrigin(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("ontology-map-canvas").boundingBox();
  if (box === null) throw new Error("the map canvas has no box");
  return { x: box.x, y: box.y };
}

const readDial = (page: Page) => page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);

const overlaps = (a: Box, b: Box) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
const inside = (a: Box, r: Box) => a.minX >= r.minX && a.maxX <= r.maxX && a.minY >= r.minY && a.maxY <= r.maxY;

function cut(dial: DialProbe): string[] {
  return [...dial.texts.map((t) => t.text), ...dial.stubs.map((s) => s.text)].filter((t) => t.includes("…"));
}

function drawnPerEnd(dial: DialProbe): number {
  const count = new Map<string, number>();
  for (const f of dial.flows) if (f.drawn) for (const end of [f.a, f.b]) count.set(end, (count.get(end) ?? 0) + 1);
  return Math.max(0, ...count.values());
}

function ringSplit(dial: DialProbe): number[] {
  const steps = [...dial.rings].sort((a, b) => a.radius - b.radius).map((r) => r.step);
  return steps.map((step) => dial.clusters.filter((c) => c.step === step).length);
}

async function zoomAt(page: Page, at: { x: number; y: number }, done: (dial: DialProbe) => boolean, ceiling = ZOOM_CEILING + 0.5): Promise<DialProbe> {
  const origin = await canvasOrigin(page);
  await page.mouse.move(origin.x + at.x, origin.y + at.y);
  for (;;) {
    const dial = await readDial(page);
    if (done(dial) || dial.zoomRatio >= ceiling) return dial;
    const before = dial.zoomRatio;
    await page.mouse.wheel(0, -60);
    await waitForMapStill(page, { what: "camera" });
    if ((await readDial(page)).zoomRatio <= before + 1e-4) return readDial(page);
  }
}

async function atRest(page: Page): Promise<DialProbe> {
  const origin = await canvasOrigin(page);
  const spot = await page.evaluate(() => {
    const d = window.__atlasMap!.dial!() as DialProbe;
    const marks = [...d.discs.map((q) => ({ x: q.x, y: q.y })), ...d.clusters.map((c) => c.chip)];
    let best = { x: d.freeRect.minX, y: d.freeRect.minY, gap: -1 };
    for (let x = d.freeRect.minX + 12; x < d.freeRect.maxX; x += 12) {
      for (let y = d.freeRect.minY + 12; y < d.freeRect.maxY; y += 12) {
        if (d.texts.some((t) => x >= t.box.minX && x <= t.box.maxX && y >= t.box.minY && y <= t.box.maxY)) continue;
        const gap = Math.min(...marks.map((m) => Math.hypot(m.x - x, m.y - y)));
        if (gap > best.gap) best = { x, y, gap };
      }
    }
    return best;
  });
  await page.mouse.move(origin.x + spot.x, origin.y + spot.y);
  await page.waitForFunction(() => window.__atlasMap!.hover() === null, undefined, { polling: "raf" });
  await waitForMapStill(page);
  return readDial(page);
}

function namedCapabilities(dial: DialProbe, domainId: string): { named: number; total: number; missing: string[] } {
  const ids = dial.clusters.find((c) => c.domainId === domainId)?.capabilityIds ?? [];
  const shown = new Set(dial.texts.filter((t) => t.role === "capability" || t.role === "ledger").map((t) => t.id));
  const missing = ids.filter((id) => !shown.has(id));
  return { named: ids.length - missing.length, total: ids.length, missing };
}

function report(label: string, value: unknown) {
  console.log(`[flat-dial] ${label} ${JSON.stringify(value)}`);
}

for (const vault of Object.keys(OVERVIEW) as Vault[]) {
  for (const size of WIDTHS) {
    test(`${vault} at ${size.width}: the overview keeps its rings, marks, lines and names inside the bars`, async ({ page }) => {
      test.setTimeout(180_000);
      await openDial(page, vault, size);
      await expect(page.getByTestId("topology-index-panel")).toBeVisible();
      const dial = await readDial(page);
      const bar = OVERVIEW[vault];
      const drawn = dial.flows.filter((f) => f.drawn).length;
      const marks = dial.clusters.length + dial.discs.length + drawn;
      const measured = { rings: ringSplit(dial), marks, discs: dial.discs.length, drawn, flows: dial.flows.length, perEnd: drawnPerEnd(dial), crossings: dial.crossings, namesCrossed: dial.namesCrossed, textOverlaps: dial.textOverlaps, numerals: dial.numerals.length };
      report(`${vault} ${size.width} overview`, measured);

      expect.soft(dial.zoomRatio, "the overview").toBeCloseTo(1, 2);
      expect.soft(measured.rings, "domains per ring, innermost first").toEqual(bar.rings);
      expect.soft(marks, "chips + capability discs + lines").toBeLessThanOrEqual(bar.marks);
      if (bar.noDiscs) expect.soft(dial.discs.length, "capability discs at the overview").toBe(0);
      if (bar.lines === "all") expect.soft(dial.flows.filter((f) => !f.drawn).map((f) => f.key), "every flow drawn").toEqual([]);
      else expect.soft(drawn, "lines at rest").toBeLessThanOrEqual(bar.lines);
      if (bar.perEnd !== undefined) expect.soft(measured.perEnd, "lines per end").toBeLessThanOrEqual(bar.perEnd);
      expect.soft(dial.crossings, "line crossings").toBeLessThanOrEqual(bar.crossings);
      expect.soft(dial.namesCrossed, "names a line crosses").toBeLessThanOrEqual(bar.namesCrossed);
      expect.soft(cut(dial), "every name whole").toEqual([]);
      if (vault === "synth 2,000") expect.soft(dial.numerals.length, "rest numerals").toBeLessThanOrEqual(9);
      if (vault === "storefront") expect.soft(dial.ledger, "no ledger on the storefront overview: zooming names its capabilities in place").toBeNull();
    });
  }
}

for (const size of WIDTHS) {
  test(`storefront at ${size.width}: rest numerals rank inside their budget and touch no name`, async ({ page }) => {
    await openDial(page, "storefront", size);
    const dial = await readDial(page);
    const D = dial.clusters.length;
    const budget = Math.min(9, Math.max(4, Math.round(0.6 * D)));
    const rest = dial.flows.filter((f) => f.drawn && !f.relatesOnly).sort((a, b) => b.total - a.total);
    const floor = rest[Math.min(budget, rest.length) - 1]?.total ?? 0;
    report(`storefront ${size.width} numerals`, { budget, numerals: dial.numerals.map((n) => n.text), textOverlaps: dial.textOverlaps });

    expect.soft(dial.textOverlaps, "names overlapping names").toBe(0);
    expect.soft(dial.numerals.length, "rest numerals").toBeLessThanOrEqual(budget);
    for (const numeral of dial.numerals) {
      const flow = dial.flows.find((f) => f.key === numeral.flowKey)!;
      expect.soft(flow.total, `${numeral.flowKey} carries a numeral`).toBeGreaterThanOrEqual(2);
      expect.soft(flow.total, `${numeral.flowKey} ranks inside the budget`).toBeGreaterThanOrEqual(floor);
      const touched = dial.texts.filter((t) => overlaps(t.box, numeral.box)).map((t) => t.text);
      expect.soft(touched, `numeral ${numeral.text} on ${numeral.flowKey}`).toEqual([]);
    }
  });
}

for (const vault of ["storefront", "synth 2,000"] as const) {
  for (const size of WIDTHS) {
    for (const index of ["expanded", "collapsed"] as const) {
      test(`${vault} at ${size.width}, INDEX ${index}: no name under INDEX or the rail, and every domain keeps its name`, async ({ page }) => {
        await openDial(page, vault, size, `index=${index}&`);
        await expect(page.getByTestId("topology-index-panel")).toHaveCount(index === "expanded" ? 1 : 0);
        const dial = await readDial(page);
        const outside = dial.texts.filter((t) => !inside(t.box, dial.freeRect)).map((t) => t.text);
        const named = new Set(dial.texts.filter((t) => t.role === "domain").map((t) => t.id));
        report(`${vault} ${size.width} ${index} free rect`, { outside, named: named.size, D: dial.clusters.length });
        expect.soft(outside, "texts outside the free rect").toEqual([]);
        expect.soft(named.size, "distinct domain names").toBe(dial.clusters.length);
      });
    }
  }
}

test("storefront at 1512: each units line says what that domain's INDEX row says", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  await page.getByTestId("first-run-starter-dismiss").click();
  await expect(page.locator('[data-testid="topology-index-subcounts"]').first()).toBeVisible();
  await waitForMapStill(page);
  const dial = await readDial(page);
  const index = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-testid="topology-index-row"]')]
        .map((row) => [row.getAttribute("data-index-row"), row.querySelector('[data-testid="topology-index-subcounts"]')?.textContent ?? null] as const)
        .filter(([, text]) => text !== null),
    ),
  );
  const numbers = (text: string) => (text.match(/\d+/g) ?? []).map(Number);
  const units = dial.texts.filter((t) => t.role === "units" && t.id !== null);
  const compared = units.map((t) => ({ id: t.id!, dial: numbers(t.text).slice(0, 2), index: index[t.id!] ? numbers(index[t.id!]!) : null }));
  report("units vs INDEX", compared);
  expect(compared.length, "units lines drawn").toBeGreaterThan(0);
  for (const row of compared) expect.soft(row.dial, `${row.id} units line against its INDEX row`).toEqual(row.index);
});

test("storefront: hovering Orders draws each direction with its count", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  const before = await readDial(page);
  const chip = before.clusters.find((c) => c.domainId === ORDERS)!.chip;
  const origin = await canvasOrigin(page);
  await page.mouse.move(origin.x + chip.x - 40, origin.y + chip.y - 40);
  await page.mouse.move(origin.x + chip.x, origin.y + chip.y, { steps: 6 });
  await page.waitForFunction((id) => window.__atlasMap!.hover() === id, ORDERS, { polling: "raf" });
  await page.waitForFunction(() => (window.__atlasMap!.dial!() as DialProbe).inkMix >= 1, undefined, { polling: "raf" });
  const dial = await readDial(page);
  const attended = dial.flows.filter((f) => (f.a === ORDERS || f.b === ORDERS) && f.ab + f.ba > 0);
  report("hover Orders", attended.map((f) => ({ key: f.key, ab: f.ab, ba: f.ba, numerals: dial.numerals.filter((n) => n.flowKey === f.key).map((n) => n.text) })));
  expect.soft(attended.length, "Orders has flows").toBeGreaterThan(0);
  for (const flow of attended) {
    const strips = dial.strips.filter((s) => s.flowKey === flow.key);
    const numerals = dial.numerals.filter((n) => n.flowKey === flow.key).map((n) => n.text).sort();
    const want = [flow.ab, flow.ba].filter((n) => n > 0).map(String).sort();
    expect.soft(strips.length, `${flow.key}: one strip per direction`).toBe(want.length);
    expect.soft(numerals, `${flow.key}: numerals equal the counts`).toEqual(want);
  }
});

async function opaqueInk(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const style = getComputedStyle(document.documentElement);
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = style.getPropertyValue("--map-canvas-bg-near").trim();
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = style.getPropertyValue(name).trim();
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v!.toString(16).padStart(2, "0")).join("")}`;
  }, token);
}

const channelGap = (a: string, b: string) => Math.max(...[1, 3, 5].map((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16))));

test("storefront: hovering Orders gives partner capability discs the needs or used-by rim ink", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  const needsInk = await opaqueInk(page, "--map-indigo-bright");
  const usedByInk = await opaqueInk(page, "--map-edge-selected");
  const before = await readDial(page);
  const chip = before.clusters.find((c) => c.domainId === ORDERS)!.chip;
  const origin = await canvasOrigin(page);
  await page.mouse.move(origin.x + chip.x - 40, origin.y + chip.y - 40);
  await page.mouse.move(origin.x + chip.x, origin.y + chip.y, { steps: 6 });
  await page.waitForFunction((id) => window.__atlasMap!.hover() === id, ORDERS, { polling: "raf" });
  await page.waitForFunction(() => (window.__atlasMap!.dial!() as DialProbe).inkMix >= 1, undefined, { polling: "raf" });
  const dial = await readDial(page);
  const domainOf = new Map(dial.clusters.flatMap((c) => c.capabilityIds.map((id) => [id, c.domainId] as const)));
  const inked = (ink: string) => dial.discs.filter((d) => channelGap(d.ink, ink) <= 1).map((d) => domainOf.get(d.id));
  const needsDomains = new Set(inked(needsInk));
  const userDomains = new Set(inked(usedByInk));
  const needed = new Set<string>();
  const using = new Set<string>();
  for (const f of dial.flows) {
    if (f.relatesOnly || (f.a !== ORDERS && f.b !== ORDERS)) continue;
    const other = f.a === ORDERS ? f.b : f.a;
    if ((f.a === ORDERS ? f.ab : f.ba) > 0) needed.add(other);
    if ((f.a === ORDERS ? f.ba : f.ab) > 0) using.add(other);
  }
  report("hover Orders partner rims", { needed: [...needed], using: [...using], needsDomains: [...needsDomains], userDomains: [...userDomains] });
  expect(needed.size + using.size, "Orders has cross-domain partners").toBeGreaterThan(0);
  expect.soft([...needed].filter((d) => !needsDomains.has(d)), "every domain Orders needs shows a needs rim").toEqual([]);
  expect.soft([...using].filter((d) => !userDomains.has(d) && !needsDomains.has(d)), "every domain using Orders shows a used-by rim").toEqual([]);
  expect.soft([...needsDomains].filter((d) => d === undefined || !needed.has(d)), "needs rims only on domains Orders needs").toEqual([]);
  expect.soft([...userDomains].filter((d) => d === undefined || !using.has(d)), "used-by rims only on domains that use Orders").toEqual([]);
});

test("storefront Orders zoomed: every capability named, leaders and names clear, stubs say their counts", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  const chip = (await readDial(page)).clusters.find((c) => c.domainId === ORDERS)!.chip;
  const dial = await zoomAt(page, chip, (d) => d.zoomRatio >= 1.65 && namedCapabilities(d, ORDERS).missing.length === 0);
  const named = namedCapabilities(dial, ORDERS);
  const labels = await page.evaluate(() => Object.fromEntries(window.__atlasMap!.nodes().map((n) => [n.id, n.label])));
  report("Orders zoomed", { zoom: dial.zoomRatio, named, ledger: dial.ledger, namesCrossed: dial.namesCrossed, stubs: dial.stubs.map((s) => s.text) });

  expect.soft(named.missing, `Orders named at ${dial.zoomRatio.toFixed(2)}×`).toEqual([]);
  expect.soft(dial.zoomRatio, "zoom needed to name every capability").toBeLessThanOrEqual(ZOOM_CEILING);
  expect.soft(dial.ledger?.leaderCrossings ?? 0, "leader crossings").toBe(0);
  expect.soft(dial.namesCrossed, "zoomed names crossed").toBe(0);
  expect.soft(cut(dial), "every name whole").toEqual([]);
  for (const stub of dial.stubs) {
    const flow = dial.flows.find((f) => f.key === stub.flowKey)!;
    const farIsB = dial.texts.some((t) => t.role === "stub" && t.id === flow.b && t.text === stub.text);
    const far = farIsB ? flow.b : flow.a;
    const out = farIsB ? flow.ab : flow.ba;
    const back = farIsB ? flow.ba : flow.ab;
    const want = [labels[far], out > 0 ? `→${out}` : null, back > 0 ? `←${back}` : null].filter(Boolean).join(" ");
    expect.soft(stub.text, `stub ${stub.flowKey}`).toBe(want);
  }
});

for (const size of WIDTHS) {
  test(`synth 2,000 at ${size.width}: zooming the central domain names every capability, in place or in the ledger`, async ({ page }) => {
    test.setTimeout(180_000);
    await openDial(page, "synth 2,000", size);
    const start = await readDial(page);
    const cx = (start.freeRect.minX + start.freeRect.maxX) / 2;
    const cy = (start.freeRect.minY + start.freeRect.maxY) / 2;
    const target = [...start.clusters].sort((a, b) => Math.hypot(a.chip.x - cx, a.chip.y - cy) - Math.hypot(b.chip.x - cx, b.chip.y - cy))[0]!;
    const dial = await zoomAt(page, target.chip, (d) => d.disclosure.enteredDomain !== null && namedCapabilities(d, d.disclosure.enteredDomain).missing.length === 0);
    const entered = dial.disclosure.enteredDomain;
    const named = entered ? namedCapabilities(dial, entered) : null;
    report(`synth 2,000 ${size.width} zoomed`, { aimed: target.domainId, entered, zoom: dial.zoomRatio, named, ledger: dial.ledger, namesCrossed: dial.namesCrossed });
    expect(entered, "a domain is entered").not.toBeNull();
    expect.soft(named!.missing, `${entered} named`).toEqual([]);
    expect.soft(named!.total, "the entered domain has capabilities").toBeGreaterThan(0);
    expect.soft(dial.zoomRatio, "zoom needed").toBeLessThanOrEqual(ZOOM_CEILING);
    expect.soft(dial.ledger?.leaderCrossings ?? 0, "leader crossings").toBe(0);
    expect.soft(dial.namesCrossed, "zoomed names crossed").toBe(0);
    expect.soft(cut(dial), "every name whole").toEqual([]);
  });
}

test("layered 10,000: wheel zoom at the innermost domain keeps lines, crossings and names inside the zoom bars", async ({ page }) => {
  test.setTimeout(240_000);
  await openDial(page, "layered 10,000", WIDTHS[0]);
  const start = await readDial(page);
  const inner = [...start.rings].sort((a, b) => a.radius - b.radius)[0]!.step;
  const target = start.clusters.find((c) => c.step === inner)!;
  await zoomAt(page, target.chip, (d) => d.zoomRatio >= 5, 6);
  const at5 = await atRest(page);
  report("layered 10,000 at 5×", { zoom: at5.zoomRatio, entered: at5.disclosure.enteredDomain, discs: at5.discs.length, drawn: at5.flows.filter((f) => f.drawn).length, crossings: at5.crossings, stubs: at5.stubs.length, namesCrossed: at5.namesCrossed, textOverlaps: at5.textOverlaps });
  expect.soft(at5.zoomRatio, "reached 5×").toBeGreaterThanOrEqual(5);
  expect.soft(at5.discs.length, "capabilities drawn").toBeGreaterThan(0);
  expect.soft(at5.flows.filter((f) => f.drawn).length, "lines at rest").toBeLessThanOrEqual(20);
  expect.soft(at5.crossings, "crossings").toBe(0);
  expect.soft(cut(at5), "every stub label whole").toEqual([]);

  const deep = await zoomAt(page, target.chip, (d) => d.zoomRatio >= 13.8, 20);
  report("layered 10,000 deep", { zoom: deep.zoomRatio, discs: deep.discs.length, texts: deep.texts.length, textOverlaps: deep.textOverlaps });
  expect.soft(deep.zoomRatio, "reached 13.8×").toBeGreaterThanOrEqual(13.8);
  expect.soft(cut(deep), "every text whole").toEqual([]);
});

test("layered 10,000: element squares stay inside the orphan cluster at 5× and at most 1,000 at 13.8×", async ({ page }) => {
  test.setTimeout(240_000);
  await openDial(page, "layered 10,000", WIDTHS[0]);
  const start = await readDial(page);
  const inner = [...start.rings].sort((a, b) => a.radius - b.radius)[0]!.step;
  const target = start.clusters.find((c) => c.step === inner)!;
  await zoomAt(page, target.chip, (d) => d.zoomRatio >= 5, 6);
  const at5 = await atRest(page);
  await zoomAt(page, target.chip, (d) => d.zoomRatio >= 13.8, 20);
  const deep = await atRest(page);
  report("layered 10,000 squares", { at5: { zoom: at5.zoomRatio, squares: at5.squares }, deep: { zoom: deep.zoomRatio, squares: deep.squares } });
  expect.soft(at5.zoomRatio, "reached 5×").toBeGreaterThanOrEqual(5);
  expect.soft(at5.squares, "element squares outside the orphan cluster at 5×").toBe(0);
  expect.soft(deep.zoomRatio, "reached 13.8×").toBeGreaterThanOrEqual(13.8);
  expect.soft(deep.squares, "element squares at 13.8×").toBeGreaterThan(0);
  expect.soft(deep.squares, "element squares at 13.8×").toBeLessThanOrEqual(1000);
});

test("a lens hands Flat back to the classic paint, and clearing it returns the dial", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  await page.goto(`/en/topology/?p=${encodeURIComponent("capability:checkout")}&impact=downstream&guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
  const owns = () => page.evaluate(() => window.__atlasMap?.dial?.().owns ?? null);
  await expect.poll(owns, { message: "the impact lens hands the paint back" }).toBe(false);
  await expect.poll(async () => {
    await page.keyboard.press("Escape");
    return page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null);
  }, { message: "Escape walks the ladder down to no selection, which clears the lens" }).toBeNull();
  await expect.poll(owns, { message: "clearing the lens returns the dial" }).toBe(true);
});

test("a selected element hands Flat back without the legend, and the plain address shows the legend again", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  await expect(page.getByTestId("flat-dial-legend")).toBeVisible();
  await page.goto(`/en/topology/?p=${encodeURIComponent("element:cart-session")}&guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
  const owns = () => page.evaluate(() => window.__atlasMap?.dial?.().owns ?? null);
  await expect.poll(owns, { message: "a selected element hands the paint back" }).toBe(false);
  await expect(page.getByTestId("flat-dial-legend")).toHaveCount(0);
  await page.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
  await expect.poll(owns, { message: "clearing the selection returns the dial" }).toBe(true);
  await expect(page.getByTestId("flat-dial-legend")).toBeVisible();
});

test("the legend's stale entry shows only with synthesized evidence", async ({ page }) => {
  test.setTimeout(180_000);
  await openDial(page, "synth 2,000", WIDTHS[0]);
  const legend = page.getByTestId("flat-dial-legend");
  await expect(legend).toHaveAttribute("data-evidence-measured", "false");
  await expect(legend.getByText("stale", { exact: true })).toHaveCount(0);
  await openDial(page, "synth 2,000", WIDTHS[0], "synthEvidence=12&");
  await expect(legend).toHaveAttribute("data-evidence-measured", "true");
  await expect(legend.getByText("stale", { exact: true })).toBeVisible();
});

test("the Flat overview offers no Expand all", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  await expect(page.getByTestId("topology-expand-all")).toHaveCount(0);
});
