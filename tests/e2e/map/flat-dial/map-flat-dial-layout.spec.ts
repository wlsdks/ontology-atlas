import { expect, test, type Page } from "@playwright/test";

import { canvasOrigin, openDial, ORDERS, readDial, report, WIDTHS, QUERY, type Vault } from "./map-flat-dial-harness";
import { waitForMapStill } from "../../settle";
import type { Box, DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

const OVERVIEW: Record<Vault, { domains: number; flows: number; marks: number; lines: number; perEnd?: number; crossings: number; namesCrossed: number; noDiscs?: boolean }> = {
  storefront: { domains: 9, flows: 21, marks: 100, lines: 21, crossings: 10, namesCrossed: 3 },
  dogfood: { domains: 4, flows: 5, marks: 60, lines: 5, crossings: 2, namesCrossed: 0 },
  "synth 2,000": { domains: 15, flows: 45, marks: 400, lines: 24, crossings: 40, namesCrossed: 2 },
  "synth 10,000": { domains: 33, flows: 99, marks: 80, lines: 40, perEnd: 6, crossings: 15, namesCrossed: 3, noDiscs: true },
  "layered 10,000": { domains: 33, flows: 403, marks: 80, lines: 40, perEnd: 6, crossings: 100, namesCrossed: 6, noDiscs: true },
};

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

async function selectFromSearch(page: Page, id: string) {
  const label = await page.evaluate(id => window.__atlasMap!.nodes().find(n => n.id === id)!.label, id);
  await page.keyboard.press("ControlOrMeta+k");
  const search = page.getByRole("dialog").filter({ has: page.getByRole("combobox") });
  await expect(search).toBeVisible();
  await search.getByRole("combobox").fill(label);
  await search.locator(`[role="option"][data-value="ontology:${id}"]`).click();
  await expect(search).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(id);
  await page.mouse.move(5, 5);
  await waitForMapStill(page);
}

async function checkDomainOrientation(page: Page, dial: DialProbe) {
  const nodes = await page.evaluate(() => window.__atlasMap!.nodes());
  const named = new Set(dial.texts.filter(t => t.role === "domain").map(t => t.id));
  const directions = dial.clusters.map(c => ({
    id: c.domainId,
    side: Math.sign(nodes.find(n => n.id === c.capabilityIds[0])!.x - c.chip.x),
  }));
  expect.soft([...new Set(directions.filter(c => named.has(c.id)).map(c => c.side))].sort(), "both facing branch directions keep a named reference").toEqual([...new Set(directions.map(c => c.side))].sort());
  return dial.clusters.filter(c => !named.has(c.domainId)).map(c => c.domainId);
}

async function recoverCulledNames(page: Page, vault: Vault, size: { width: number; height: number }, ids: readonly string[], extra = "") {
  for (const id of ids) {
    if (QUERY[vault]) await openDial(page, vault, size, `${extra}p=${encodeURIComponent(id)}&`);
    else await selectFromSearch(page, id);
    const selected = await readDial(page);
    const name = selected.texts.find(t => t.id === id && t.role === "domain");
    expect(name, `selecting the culled domain ${id} restores its name`).toBeDefined();
    expect(inside(name!.box, selected.freeRect), `the restored name ${id} clears the panels`).toBe(true);
    expect.soft(selected.textOverlaps, "restoring a selected name does not overlap another name").toBe(0);
  }
}

async function recoverOmittedPairs(page: Page, overview: DialProbe) {
  const domainOf = new Map(overview.clusters.flatMap(c => c.capabilityIds.map(id => [id, c.domainId] as const)));
  const omitted = overview.flows.filter(f => !f.drawn && !f.relatesOnly);
  for (const domain of new Set(omitted.map(f => f.a))) {
    await selectFromSearch(page, domain);
    const selected = await readDial(page);
    for (const missing of omitted.filter(f => f.a === domain)) {
      const recovered = selected.flows.filter(f => {
        const a = domainOf.get(f.a) ?? f.a;
        const b = domainOf.get(f.b) ?? f.b;
        return !f.relatesOnly && ((a === missing.a && b === missing.b) || (a === missing.b && b === missing.a));
      });
      const counts = recovered.reduce((sum, f) => {
        const forward = (domainOf.get(f.a) ?? f.a) === missing.a;
        return { ab: sum.ab + (forward ? f.ab : f.ba), ba: sum.ba + (forward ? f.ba : f.ab) };
      }, { ab: 0, ba: 0 });
      expect.soft(counts, `${missing.key} keeps both directional counts while selected`).toEqual({ ab: missing.ab, ba: missing.ba });
      expect.soft(recovered.some(f => f.drawn), `selecting an endpoint reveals the omitted pair ${missing.key}`).toBe(true);
    }
  }
}

async function selectCanvasDomain(page: Page, id: string) {
  const dial = await readDial(page);
  const name = dial.texts.find(t => t.id === id && t.role === "domain")!;
  expect(name, "the domain can be selected by its drawn name").toBeDefined();
  const origin = await canvasOrigin(page);
  await page.mouse.dblclick(origin.x + (name.box.minX + name.box.maxX) / 2, origin.y + (name.box.minY + name.box.maxY) / 2);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(id);
  await page.mouse.move(5, 5);
  await waitForMapStill(page);
}

async function correctStubCounts(page: Page, dial: DialProbe) {
  const labels = await page.evaluate(() => Object.fromEntries(window.__atlasMap!.nodes().map(n => [n.id, n.label])));
  for (const stub of dial.stubs) {
    const flow = dial.flows.find(f => f.key === stub.flowKey)!;
    const farIsB = dial.texts.some(t => t.role === "stub" && t.id === flow.b && t.text === stub.text);
    const far = farIsB ? flow.b : flow.a;
    const out = farIsB ? flow.ab : flow.ba;
    const back = farIsB ? flow.ba : flow.ab;
    const want = [labels[far], out > 0 ? `→${out}` : null, back > 0 ? `←${back}` : null].filter(Boolean).join(" ");
    expect.soft(stub.text, `stub ${stub.flowKey} keeps its direction and counts`).toBe(want);
  }
}

function selectedPairCounts(dial: DialProbe, domainId: string) {
  const domainOf = new Map(dial.clusters.flatMap(cluster => cluster.capabilityIds.map(id => [id, cluster.domainId] as const)));
  const counts = new Map<string, { needs: number; used: number }>();
  for (const flow of dial.flows) {
    if (flow.relatesOnly) continue;
    const a = domainOf.get(flow.a) ?? flow.a;
    const b = domainOf.get(flow.b) ?? flow.b;
    if ((a === domainId) === (b === domainId)) continue;
    const far = a === domainId ? b : a;
    const pair = counts.get(far) ?? { needs: 0, used: 0 };
    pair.needs += a === domainId ? flow.ab : flow.ba;
    pair.used += a === domainId ? flow.ba : flow.ab;
    counts.set(far, pair);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}

function namedSelectedStubs(dial: DialProbe, domainId: string) {
  const domainOf = new Map(dial.clusters.flatMap(cluster => cluster.capabilityIds.map(id => [id, cluster.domainId] as const)));
  const selected = (flow: DialProbe["flows"][number]) => ((domainOf.get(flow.a) ?? flow.a) === domainId) !== ((domainOf.get(flow.b) ?? flow.b) === domainId);
  const pairs = selectedPairCounts(dial, domainId);
  expect(pairs.length, "the fixture has selected directional connections").toBeGreaterThan(0);
  const drawn = dial.flows.filter(flow => flow.drawn && !flow.relatesOnly && selected(flow));
  expect(drawn.length, "selected connections are declared drawn").toBeGreaterThan(0);
  for (const flow of drawn) {
    expect(dial.strips.some(strip => strip.flowKey === flow.key && (strip.role === "chord" || strip.role === "stub")), `drawn selected pair ${flow.key} has a painted chord or recovery stub`).toBe(true);
  }
  expect(dial.stubs.length, "the selected offscreen connections have named recovery stubs").toBeGreaterThan(0);
  expect(new Set(dial.stubs.map(stub => stub.flowKey)).size, "each recovered pair has one named stub").toBe(dial.stubs.length);
  expect([...new Set(dial.strips.filter(strip => strip.role === "stub").map(strip => strip.flowKey))].sort(), "painted recovery keys equal the named stub plans").toEqual(dial.stubs.map(stub => stub.flowKey).sort());
  for (const stub of dial.stubs) {
    const flow = dial.flows.find(flow => flow.key === stub.flowKey);
    expect(flow, `stub ${stub.flowKey} refers to a semantic pair`).toBeDefined();
    expect(flow!.drawn, `stub ${stub.flowKey} is counted as drawn`).toBe(true);
    const far = (domainOf.get(flow!.a) ?? flow!.a) === domainId ? flow!.b : flow!.a;
    expect(selected(flow!), `stub ${stub.flowKey} has exactly one selected domain end`).toBe(true);
    expect(dial.texts.filter(text => text.role === "stub" && text.id === far && text.text === stub.text), `stub ${stub.flowKey} has one whole far-end name`).toHaveLength(1);
    expect(inside(stub.box, dial.freeRect), `stub ${stub.flowKey} clears the panels`).toBe(true);
    expect(dial.strips.filter(strip => strip.role === "stub" && strip.flowKey === stub.flowKey), `stub ${stub.flowKey} draws each nonzero direction`).toHaveLength(Number(flow!.ab > 0) + Number(flow!.ba > 0));
  }
}

async function clickMemberAction(page: Page, domainId: string, direction: "more" | "less") {
  const pattern = direction === "more" ? /more/i : /collapse/i;
  const dial = await readDial(page);
  const action = dial.texts.find(t => t.id === domainId && t.role === "more" && pattern.test(t.text));
  expect(action, `${direction} is available for ${domainId}`).toBeDefined();
  expect(inside(action!.box, dial.freeRect), "the disclosure control is clear of the panels").toBe(true);
  const origin = await canvasOrigin(page);
  await page.mouse.click(origin.x + (action!.box.minX + action!.box.maxX) / 2, origin.y + (action!.box.minY + action!.box.maxY) / 2);
  await page.mouse.move(5, 5);
  await waitForMapStill(page);
  expect(await page.evaluate(() => window.__atlasMap!.selection().nodeId), "disclosure keeps its domain selected").toBe(domainId);
}

function clearFocusedNames(dial: DialProbe) {
  expect.soft(dial.namesCrossed, "focused names crossed by lines").toBe(0);
  expect.soft(dial.textOverlaps, "focused names overlapping names").toBe(0);
  expect.soft(cut(dial), "focused names stay whole").toEqual([]);
  expect.soft(dial.texts.filter(t => !inside(t.box, dial.freeRect)).map(t => t.text), "focused texts stay outside the panels").toEqual([]);
}

function namedCapabilities(dial: DialProbe, domainId: string): { named: number; total: number; missing: string[] } {
  const ids = dial.clusters.find((c) => c.domainId === domainId)?.capabilityIds ?? [];
  const shown = new Set(dial.texts.filter((t) => t.role === "capability" || t.role === "ledger").map((t) => t.id));
  const missing = ids.filter((id) => !shown.has(id));
  return { named: ids.length - missing.length, total: ids.length, missing };
}

for (const vault of Object.keys(OVERVIEW) as Vault[]) {
  for (const size of WIDTHS) {
    test(`${vault} at ${size.width}: the branch overview keeps every domain, marks, lines and names inside the bars`, async ({ page }) => {
      test.setTimeout(180_000);
      await openDial(page, vault, size);
      if (QUERY[vault]) await expect(page.getByTestId("topology-scope-readout")).toHaveAttribute("data-synthetic", "true");
      else await expect(page.getByTestId("topology-index-panel")).toBeVisible();
      const dial = await readDial(page);
      const bar = OVERVIEW[vault];
      const drawn = dial.flows.filter((f) => f.drawn).length;
      const marks = dial.clusters.length + dial.discs.length + drawn;
      const measured = { domains: dial.clusters.length, rings: dial.rings.length, marks, discs: dial.discs.length, drawn, flows: dial.flows.length, perEnd: drawnPerEnd(dial), crossings: dial.crossings, namesCrossed: dial.namesCrossed, textOverlaps: dial.textOverlaps, numerals: dial.numerals.length };
      report(`${vault} ${size.width} overview`, measured);

      expect.soft(dial.zoomRatio, "the overview").toBeCloseTo(1, 2);
      expect.soft(dial.rings, "Flat maps keep the branch grammar at every graph size").toEqual([]);
      expect.soft(dial.clusters, "every domain belongs to the branch layout").toHaveLength(bar.domains);
      const culledNames = await checkDomainOrientation(page, dial);
      expect.soft(marks, "chips + capability discs + lines").toBeLessThanOrEqual(bar.marks);
      if (bar.noDiscs) expect.soft(dial.discs.length, "capability discs at the overview").toBe(0);
      expect.soft(dial.flows, "the flow inventory retains every pair, including omitted rest lines").toHaveLength(bar.flows);
      expect.soft(new Set(dial.flows.map(f => f.key)).size, "each flow pair occurs once").toBe(bar.flows);
      expect.soft(dial.budget.total, "the disclosure count includes every counted pair").toBe(dial.flows.filter(f => !f.relatesOnly).length);
      expect.soft(drawn, "some connections remain visible at rest").toBeGreaterThan(0);
      expect.soft(drawn, "lines at rest").toBeLessThanOrEqual(bar.lines);
      if (bar.perEnd !== undefined) expect.soft(measured.perEnd, "lines per end").toBeLessThanOrEqual(bar.perEnd);
      expect.soft(dial.crossings, "line crossings").toBeLessThanOrEqual(bar.crossings);
      expect.soft(dial.namesCrossed, "names a line crosses").toBeLessThanOrEqual(bar.namesCrossed);
      expect.soft(dial.textOverlaps, "names overlapping names").toBe(0);
      expect.soft(cut(dial), "every name whole").toEqual([]);
      if (vault === "synth 2,000") expect.soft(dial.numerals.length, "rest numerals").toBeLessThanOrEqual(9);
      expect.soft(dial.ledger, "branch maps do not switch to a detached ledger").toBeNull();
      if (vault === "storefront" || vault === "dogfood") await recoverOmittedPairs(page, dial);
      await recoverCulledNames(page, vault, size, culledNames);
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
      test(`${vault} at ${size.width}, INDEX ${index}: names clear the panels and culled domains remain accessible`, async ({ page }) => {
        await openDial(page, vault, size, `index=${index}&`);
        await expect(page.getByTestId("topology-index-panel")).toHaveCount(vault === "storefront" && index === "expanded" ? 1 : 0);
        const dial = await readDial(page);
        const outside = dial.texts.filter((t) => !inside(t.box, dial.freeRect)).map((t) => t.text);
        const named = new Set(dial.texts.filter((t) => t.role === "domain").map((t) => t.id));
        report(`${vault} ${size.width} ${index} free rect`, { outside, named: named.size, D: dial.clusters.length });
        expect.soft(outside, "texts outside the free rect").toEqual([]);
        expect.soft(dial.clusters, "every domain remains in the map").toHaveLength(OVERVIEW[vault].domains);
        const culled = await checkDomainOrientation(page, dial);
        await recoverCulledNames(page, vault, size, culled, `index=${index}&`);
      });
    }
  }
}

for (const vault of ["storefront", "synth 2,000", "layered 10,000"] as const) {
  for (const size of WIDTHS) {
    test(`${vault} at ${size.width}: More reveals members, Collapse reverses it, and scope viewing returns to the same domain`, async ({ page }) => {
      test.setTimeout(180_000);
      await openDial(page, vault, size);
      const overview = await readDial(page);
      const domainId = vault === "storefront" ? ORDERS : overview.clusters.find(c => c.capabilityIds.length > 12)!.domainId;
      if (vault === "storefront") await selectFromSearch(page, domainId);
      else await selectCanvasDomain(page, domainId);
      const before = namedCapabilities(await readDial(page), domainId);
      expect(before.named, "the selected branch shows its initial members").toBeGreaterThan(0);
      expect(before.missing.length, "the fixture exercises a real hidden member").toBeGreaterThan(0);
      await clickMemberAction(page, domainId, "more");
      await expect.poll(async () => namedCapabilities(await readDial(page), domainId).named).toBeGreaterThan(before.named);
      const expanded = await readDial(page);
      const newlyNamed = before.missing.filter(id => expanded.texts.some(t => t.id === id && t.role === "capability"));
      expect(newlyNamed.length, "More exposes previously hidden concepts").toBeGreaterThan(0);
      expect(namedCapabilities(expanded, domainId).named, "one action reveals a bounded batch").toBeLessThanOrEqual(before.named * 2);
      clearFocusedNames(expanded);
      await correctStubCounts(page, expanded);
      if (vault === "layered 10,000") {
        expect(selectedPairCounts(expanded, domainId), "disclosure preserves every selected pair and its directional counts").toEqual(selectedPairCounts(overview, domainId));
        namedSelectedStubs(expanded, domainId);
        expect.soft(expanded.crossings, "focused large-graph line crossings").toBe(0);
      }
      await clickMemberAction(page, domainId, "less");
      await expect.poll(async () => namedCapabilities(await readDial(page), domainId).missing).toEqual(before.missing);
      const collapsed = await readDial(page);
      clearFocusedNames(collapsed);
      if (vault === "storefront") await page.getByTestId("map-detail-panel-more-menu-trigger").click();
      const scopeEntry = page.getByTestId(vault === "storefront" ? "map-detail-panel-action-realm" : "topology-realm-enter-button");
      await expect(scopeEntry).toBeVisible();
      await scopeEntry.click();
      await expect(page.getByTestId("topology-realm-chip-clear")).toBeVisible();
      await page.waitForFunction(id => {
        const probe = window.__atlasMap;
        const dial = probe?.dial?.();
        return dial?.owns && (dial as DialProbe).domainAppear >= 0.999 && probe?.nodes().some(node => node.id === id && node.draggable);
      }, domainId);
      await waitForMapStill(page);
      const scoped = await readDial(page);
      expect(scoped.owns, "scope viewing keeps the same renderer").toBe(true);
      expect(scoped.clusters.map(c => c.domainId)).toEqual([domainId]);
      expect(scoped.rings, "scope viewing keeps the branch grammar").toEqual([]);
      const scopeBefore = namedCapabilities(scoped, domainId);
      expect(scopeBefore.named, "the scope exposes a readable initial subset").toBeGreaterThan(0);
      expect(scopeBefore.missing.length).toBeGreaterThan(0);
      await clickMemberAction(page, domainId, "more");
      await expect.poll(async () => namedCapabilities(await readDial(page), domainId).named).toBeGreaterThan(scopeBefore.named);
      const scopeAfter = await readDial(page);
      const count = namedCapabilities(scopeAfter, domainId).named;
      expect(count, "scope disclosure stays bounded").toBeLessThanOrEqual(scopeBefore.named * 2);
      if (vault === "storefront") expect(namedCapabilities(scopeAfter, domainId).missing, "all eight Orders capabilities are reachable").toEqual([]);
      expect.soft(scopeAfter.flows.filter(f => f.drawn).length, "focused lines at rest").toBeLessThanOrEqual(20);
      expect.soft(scopeAfter.crossings, "focused line crossings").toBe(0);
      clearFocusedNames(scopeAfter);
      report(`${vault} ${size.width} disclosure`, { domainId, before, newlyNamed, scopeBefore, scopeNamed: count, squares: scopeAfter.squares });
      await page.getByTestId("topology-realm-chip-clear").click();
      await expect(page.getByTestId("topology-realm-chip")).toBeHidden();
      await waitForMapStill(page);
      expect((await readDial(page)).clusters).toHaveLength(OVERVIEW[vault].domains);
      expect(await page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(domainId);
      if (vault === "storefront") await page.getByTestId("map-detail-panel-more-menu-trigger").click();
      await expect(scopeEntry).toBeVisible();
    });
  }
}

for (const vault of ["synth 10,000", "layered 10,000"] as const) {
  for (const size of WIDTHS) {
    test(`${vault} at ${size.width}: deep links reach hidden contained and unassigned elements without exposing the entire graph`, async ({ page }) => {
      test.setTimeout(180_000);
      await openDial(page, vault, size);
      const initial = await page.evaluate(() => window.__atlasMap!.nodes());
      for (const id of ["synth-el-1", "synth-el-0"]) {
        const hidden = initial.find(n => n.id === id)!;
        expect(hidden, "the synthetic fixture contains the requested element").toBeDefined();
        expect(hidden.hidden || (hidden.alpha ?? 0) <= 0.05, "the deep link starts from an undisclosed element").toBe(true);
        await openDial(page, vault, size, `p=${encodeURIComponent(id)}&`);
        await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(id);
        const selected = await page.evaluate(id => window.__atlasMap!.nodes().find(n => n.id === id)!, id);
        const dial = await readDial(page);
        const name = dial.texts.find(t => t.id === id && t.role === "element");
        expect(name, "the selected element is named in the map").toBeDefined();
        expect(selected.hidden, "the selected element is drawn").toBe(false);
        expect(selected.alpha ?? 0, "the selected element is visibly present").toBeGreaterThan(0.5);
        expect(inside({ minX: selected.x - selected.radius, maxX: selected.x + selected.radius, minY: selected.y - selected.radius, maxY: selected.y + selected.radius }, dial.freeRect), "the selected element clears the panels").toBe(true);
        expect(inside(name!.box, dial.freeRect), "the selected element name clears the panels").toBe(true);
        expect.soft(dial.squares, "rendered implementation elements remain bounded").toBeLessThanOrEqual(1000);
        clearFocusedNames(dial);
        report(`${vault} ${size.width} hidden element`, { id, squares: dial.squares, namesCrossed: dial.namesCrossed, textOverlaps: dial.textOverlaps });
        await page.keyboard.press("Escape");
        await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBeNull();
      }
    });
  }
}
