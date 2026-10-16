import { expect, test, type Page } from "@playwright/test";

import { canvasOrigin, openDial, ORDERS, readDial, report, WIDTHS } from "./map-flat-dial-harness";
import { waitForMapSettled, waitForMapStill } from "../../settle";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

test("storefront: hovering Orders keeps every name and count; selecting it counts at each named far domain", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  const rest = await readDial(page);
  const chip = rest.clusters.find((c) => c.domainId === ORDERS)!.chip;
  const origin = await canvasOrigin(page);
  await page.mouse.move(origin.x + chip.x - 40, origin.y + chip.y - 40);
  await page.mouse.move(origin.x + chip.x, origin.y + chip.y, { steps: 6 });
  await page.waitForFunction((id) => window.__atlasMap!.hover() === id, ORDERS, { polling: "raf" });
  await page.waitForFunction(() => (window.__atlasMap!.dial!() as DialProbe).inkMix >= 1, undefined, { polling: "raf" });
  const hovered = await readDial(page);
  const names = (d: DialProbe) => d.texts.filter((t) => t.id !== ORDERS).map((t) => `${t.role}|${t.text}`).sort();
  const counts = (d: DialProbe) => d.numerals.map((n) => `${n.flowKey}|${n.text}`).sort();
  expect.soft(names(hovered), "hover keeps the resting names").toEqual(names(rest));
  expect.soft(counts(hovered), "hover keeps the resting counts").toEqual(counts(rest));

  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction((id) => window.__atlasMap!.selection().nodeId === id, ORDERS, { polling: "raf" });
  await page.waitForFunction(() => (window.__atlasMap!.dial!() as DialProbe).inkMix >= 1, undefined, { polling: "raf" });
  await waitForMapStill(page);
  const dial = await readDial(page);
  const capOf = new Map(dial.clusters.flatMap((c) => c.capabilityIds.map((id) => [id, c.domainId] as const)));
  const domains = new Set(dial.clusters.map((c) => c.domainId));
  const mine = (id: string) => id === ORDERS || capOf.get(id) === ORDERS;
  const stubbed = new Set(dial.stubs.map((s) => s.flowKey));
  const want = new Map<string, { needs: number; used: number }>();
  for (const f of dial.flows) {
    if (!f.drawn || f.relatesOnly || stubbed.has(f.key) || mine(f.a) === mine(f.b)) continue;
    const far = mine(f.a) ? f.b : f.a;
    if (!domains.has(far)) continue;
    const c = want.get(far) ?? { needs: 0, used: 0 };
    c.needs += mine(f.a) ? f.ab : f.ba;
    c.used += mine(f.a) ? f.ba : f.ab;
    want.set(far, c);
  }
  const grammar = ({ needs, used }: { needs: number; used: number }) => [needs > 0 ? `→${needs}` : null, used > 0 ? `←${used}` : null].filter((p) => p !== null).join(" ");
  const labelOf = new Map((await page.evaluate(() => window.__atlasMap!.nodes().map((n) => [n.id, n.label] as const))));
  const shown = [...want].map(([far, c]) => ({
    far,
    want: grammar(c),
    count: dial.numerals.find((n) => n.flowKey === `far\u0000${far}`)?.text ?? null,
    named: dial.texts.some((t) => t.role === "domain" && t.id === far),
    label: dial.texts.find((t) => t.role === "stub" && t.id === far)?.text ?? null,
  }));
  report("select Orders", shown);
  expect.soft(want.size, "Orders has drawn far domains").toBeGreaterThan(0);
  expect.soft(dial.numerals.filter((n) => !n.flowKey.startsWith("far\u0000")).map((n) => n.flowKey), "no count on a strand").toEqual([]);
  for (const s of shown) {
    if (s.named) expect.soft(s.count, `${s.far}: the count beside its name`).toBe(s.want);
    else expect.soft(s.label, `${s.far}: its name and count beside its chip`).toBe(`${labelOf.get(s.far)} ${s.want}`);
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

test("a selected element hands Flat back and returning restores the map scope", async ({ page }) => {
  await openDial(page, "storefront", WIDTHS[0]);
  await expect(page.getByTestId("topology-scope-readout")).toBeVisible();
  await page.goto(`/en/topology/?p=${encodeURIComponent("element:cart-session")}&guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
  const owns = () => page.evaluate(() => window.__atlasMap?.dial?.().owns ?? null);
  await expect.poll(owns, { message: "a selected element hands the paint back" }).toBe(false);
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
  const units = dial.texts.filter((t) => t.role === "units" && t.id !== null);
  const compared = units.map((t) => ({ id: t.id!, dial: numbers(t.text).slice(0, 2), index: index[t.id!] ? numbers(index[t.id!]!) : null }));
  report("units vs INDEX", compared);
  expect(compared.length, "units lines drawn").toBeGreaterThan(0);
  for (const row of compared) expect.soft(row.dial, `${row.id} units line against its INDEX row`).toEqual(row.index);
});
