import { expect, test, type Page } from "@playwright/test";

import { canvasOrigin, openDial, ORDERS, readDial, report, WIDTHS } from "./map-flat-dial-harness";
import { waitForMapSettled, waitForMapStill } from "../../settle";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

async function hoverOrders(page: Page) {
  const dial = await readDial(page);
  const name = dial.texts.find((text) => text.id === ORDERS && text.role === "domain");
  expect(name, "Orders has a drawn name to hover").toBeDefined();
  const origin = await canvasOrigin(page);
  await page.mouse.move(origin.x + (name!.box.minX + name!.box.maxX) / 2, origin.y + (name!.box.minY + name!.box.maxY) / 2);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.hover())).toBe(ORDERS);
  await page.waitForFunction(() => (window.__atlasMap!.dial!() as DialProbe).inkMix >= 1, undefined, { polling: "raf" });
}

test("storefront: hovering Orders keeps names stable and inspection preserves named directional bundles", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  const rest = await readDial(page);
  await hoverOrders(page);
  const hovered = await readDial(page);
  const names = (dial: DialProbe) => dial.texts.filter((text) => text.role === "domain").map((text) => [text.id, text.text, text.box]);
  expect(names(hovered), "hover preserves domain names and their positions").toEqual(names(rest));
  expect(rest.numerals, "the overview has no bare bundle numbers").toEqual([]);

  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(ORDERS);
  await page.mouse.move(5, 5);
  await waitForMapStill(page);
  const dial = await readDial(page);
  // Sample-vault directed connections, independent of the painted count strings.
  const expected = [
    ["domain:customer", 2, 2], ["domain:catalog", 2, 1], ["domain:inventory", 3, 0],
    ["domain:marketing", 2, 1], ["domain:payment", 3, 0], ["domain:fulfillment", 1, 0],
    ["domain:loyalty", 0, 1], ["domain:support", 0, 1],
  ] as const;
  const labels = new Map(await page.evaluate(() => window.__atlasMap!.nodes().map((node) => [node.id, node.label] as const)));
  expect(dial.texts.some((text) => text.id === ORDERS && text.role === "domain"), "the inspected endpoint is named").toBe(true);
  for (const [far, needs, used] of expected) {
    const flow = dial.flows.find((flow) => (flow.a === ORDERS && flow.b === far) || (flow.b === ORDERS && flow.a === far));
    expect(flow, `${far} keeps its recorded domain bundle`).toBeDefined();
    expect([flow!.a === ORDERS ? flow!.ab : flow!.ba, flow!.a === ORDERS ? flow!.ba : flow!.ab], `${far} keeps both directions`).toEqual([needs, used]);
    expect(flow!.drawn, `${far} is drawn or recovered on endpoint inspection`).toBe(true);
    const label = labels.get(far);
    expect(label, `${far} has a recorded endpoint name`).toBeTruthy();
    const namedDomain = dial.texts.some((text) => text.id === far && text.role === "domain" && text.text === label);
    const namedStub = dial.stubs.some((stub) => stub.flowKey === flow!.key && stub.text.startsWith(`${label} `));
    expect(namedDomain || namedStub, `${far} retains its name or a named stub for this bundle`).toBe(true);
  }
  expect(dial.numerals.length, "inspection draws localized connection counts").toBeGreaterThan(0);
  for (const numeral of dial.numerals) {
    const flow = dial.flows.find((flow) => flow.key === numeral.flowKey);
    expect(flow, "each count belongs to a recorded bundle").toBeDefined();
    expect([flow!.ab, flow!.ba].filter((count) => count > 1).map((count) => `${count} connections`), "the labelled count retains a recorded direction").toContain(numeral.text);
    expect(numeral.box.minX).toBeGreaterThanOrEqual(dial.freeRect.minX);
    expect(numeral.box.maxX).toBeLessThanOrEqual(dial.freeRect.maxX);
  }
  report("selected directional bundles", dial.flows.filter((flow) => flow.a === ORDERS || flow.b === ORDERS));
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

test("storefront: hovering Orders emphasizes its recorded bundles with neutral ink", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  const neutral = await opaqueInk(page, "--map-dial-stroke-domain");
  await hoverOrders(page);
  const dial = await readDial(page);
  const partners = dial.flows.filter((flow) => !flow.relatesOnly && (flow.a === ORDERS || flow.b === ORDERS));
  const attended = dial.strips.filter((strip) => partners.some((flow) => flow.key === strip.flowKey));
  expect(partners.length, "Orders has recorded cross-domain partners").toBeGreaterThan(0);
  expect(attended.length, "hover paints recorded partner bundles").toBeGreaterThan(0);
  for (const strip of attended) expect(channelGap(strip.ink, neutral), `${strip.flowKey} uses neutral emphasis`).toBeLessThanOrEqual(1);
});

test("an impact lens retains named branches and Escape clears its selection", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  await page.goto(`/en/topology/?p=${encodeURIComponent("capability:checkout")}&impact=downstream&guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
  await expect.poll(() => new URL(page.url()).searchParams.get("impact")).toBe("downstream");
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe("capability:checkout");
  await waitForMapStill(page);
  const named = await page.evaluate(() => window.__atlasMap!.labels());
  expect(named.some((label) => label.nodeId === "capability:checkout"), "the inspected capability keeps its branch name").toBe(true);
  expect(named.filter((label) => label.nodeId.startsWith("domain:")).length, "the lens preserves domain branch context").toBeGreaterThan(0);
  await expect.poll(async () => {
    await page.keyboard.press("Escape");
    return page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null);
  }, { message: "Escape walks the ladder down to no selection, which clears the lens" }).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get("impact")).toBeNull();
  await expect(page.getByTestId("topology-scope-readout")).toBeVisible();
});

test("a selected implementation keeps branch forms and returning restores the map scope", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  await expect(page.getByTestId("topology-scope-readout")).toBeVisible();
  await page.goto(`/en/topology/?p=${encodeURIComponent("element:cart-session")}&guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
  const owns = () => page.evaluate(() => window.__atlasMap?.dial?.().owns ?? null);
  await expect.poll(owns, { message: "implementation inspection retains branch forms" }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe("element:cart-session");
  const implementation = (await readDial(page)).texts.find((text) => text.id === "element:cart-session" && text.role === "element");
  expect(implementation, "the selected implementation keeps its drawn name").toBeDefined();
  await expect(page.getByTestId("flat-dial-legend")).toHaveCount(0);
  await page.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
  await expect.poll(owns, { message: "clearing the selection returns the dial" }).toBe(true);
  await expect(page.getByTestId("topology-scope-readout")).toBeVisible();
});

test("synthesized evidence keeps its test data identified without a generic legend", async ({ page }) => {
  test.setTimeout(180_000);
  await openDial(page, "synth 2,000", WIDTHS[0]);
  const scope = page.getByTestId("topology-scope-readout");
  await expect(scope).toHaveAttribute("data-synthetic", "true");
  await expect(page.getByTestId("flat-dial-legend")).toHaveCount(0);
  await openDial(page, "synth 2,000", WIDTHS[0], "synthEvidence=12&");
  await expect(scope).toHaveAttribute("data-synthetic", "true");
  await expect(page.getByTestId("flat-dial-legend")).toHaveCount(0);
});

test("the Flat overview offers no Expand all", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  await expect(page.getByTestId("topology-expand-all")).toHaveCount(0);
});

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
  const domainIds = new Set(dial.clusters.map((cluster) => cluster.domainId));
  const units = dial.texts.filter((t) => t.role === "units" && t.id !== null && domainIds.has(t.id));
  const compared = units.map((t) => ({ id: t.id!, dial: numbers(t.text).slice(0, 2), index: index[t.id!] ? numbers(index[t.id!]!) : null }));
  report("units vs INDEX", compared);
  expect(compared.length, "units lines drawn").toBeGreaterThan(0);
  for (const row of compared) {
    expect(row.dial, `${row.id} names both capability and element counts`).toHaveLength(2);
    expect.soft(row.dial, `${row.id} units line against its INDEX row`).toEqual(row.index);
  }
});
