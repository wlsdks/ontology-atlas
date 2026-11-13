import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";
import { stubDirectoryPicker } from "../../vault-picker-stub";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

const DOMAINS = ["orders", "catalog", "payments", "inventory", "shipping", "returns"];
const CAPABILITIES_PER_DOMAIN = 3;
/** Capability dependencies across domains: orders needs catalog (twice), payments and inventory; shipping and payments need orders; returns touches only shipping. */
const DEPENDS: readonly [string, string][] = [
  ["orders-0", "catalog-0"], ["orders-1", "catalog-1"], ["orders-0", "payments-0"], ["orders-2", "inventory-0"],
  ["shipping-0", "orders-0"], ["payments-1", "orders-1"], ["returns-0", "shipping-1"],
];
const IDLE_WINDOW_MS = 3_000;

type FrameWindow = Window & { __graphFrameAt?: number };

function generatedVault(): Record<string, string> {
  const files: Record<string, string> = {};
  const body = (title: string) => `\n# ${title}\n\n${title} keeps one boundary of the product honest.\n`;
  files["atlas.md"] = `---\nkind: project\ntitle: Atlas\nslug: atlas\ndomains: [${DOMAINS.map((d) => `domains/${d}`).join(", ")}]\n---\n${body("Atlas")}`;
  for (const name of DOMAINS) {
    const capabilities = Array.from({ length: CAPABILITIES_PER_DOMAIN }, (_, c) => `capabilities/${name}-${c}`);
    files[`domains/${name}.md`] = `---\nkind: domain\ntitle: ${name}\ncapabilities: [${capabilities.join(", ")}]\n---\n${body(name)}`;
    for (let c = 0; c < CAPABILITIES_PER_DOMAIN; c += 1) {
      const slug = `${name}-${c}`;
      const needs = DEPENDS.filter(([from]) => from === slug).map(([, to]) => `capabilities/${to}`);
      files[`capabilities/${slug}.md`] = `---\nkind: capability\ntitle: ${name} step ${c}\ndomain: domains/${name}\n${needs.length ? `depends_on: [${needs.join(", ")}]\n` : ""}---\n${body(`${name} step ${c}`)}`;
    }
  }
  return files;
}

async function openVault(page: Page): Promise<void> {
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    const w = window as FrameWindow;
    w.__graphFrameAt = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => raf((t) => {
      w.__graphFrameAt = performance.now();
      callback(t);
    });
  });
  await stubDirectoryPicker(page, generatedVault());
  await page.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "networkidle" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await page.waitForFunction((marks) => {
    const dial = window.__atlasMap?.dial?.() as DialProbe | undefined;
    const drawn = window.__atlasMap?.nodes().filter((n) => n.kind === "domain" || n.kind === "capability").length;
    return dial?.owns === true && dial.placement.state === "settled" && drawn === marks && document.querySelector("[data-vault-load-progress]") === null;
  }, DOMAINS.length * (1 + CAPABILITIES_PER_DOMAIN), { timeout: 120_000 });
  await waitForMapStill(page);
}

const readDial = (page: Page) => page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);
const domainNode = (page: Page, name: string) =>
  page.evaluate((title) => window.__atlasMap!.nodes().find((n) => n.kind === "domain" && /[^/:]+$/.exec(n.id)?.[0] === title)!, name);

/** The lit domain lines a frame drew, as `kind:fromName>toName`. */
async function domainLines(page: Page, dial: DialProbe): Promise<string[]> {
  const nameOf = await page.evaluate(() => Object.fromEntries(window.__atlasMap!.nodes().filter((n) => n.kind === "domain").map((n) => [n.id, /[^/:]+$/.exec(n.id)?.[0] ?? n.id])));
  return dial.strips
    .filter((s) => /^(needs|neededBy):/.test(s.flowKey))
    .map((s) => {
      const kind = s.flowKey.slice(0, s.flowKey.indexOf(":"));
      const [from, to] = s.flowKey.slice(kind.length + 1).split(">") as [string, string];
      return `${kind}:${nameOf[from] ?? from}>${nameOf[to] ?? to}`;
    })
    .sort();
}

const ORDERS_LINES = ["neededBy:payments>orders", "neededBy:shipping>orders", "needs:orders>catalog", "needs:orders>inventory", "needs:orders>payments"];

test("pointing at a domain draws one line per partner domain and direction, and lights those domains", async ({ page }) => {
  test.setTimeout(180_000);
  await openVault(page);
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const orders = await domainNode(page, "orders");
  await page.mouse.move(box.x + orders.x, box.y + orders.y);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.hover())).toBe(orders.id);
  await waitForMapStill(page);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.dialMotionSettled?.() === true)).toBe(true);
  const dial = await readDial(page);
  expect(await domainLines(page, dial)).toEqual(ORDERS_LINES);

  const hues = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Array.from({ length: 8 }, (_, k) => {
      const [r, g, b] = style.getPropertyValue(`--color-domain-${k + 1}-rgb`).trim().split(/\s+/).map(Number);
      return `#${[r, g, b].map((n) => n!.toString(16).padStart(2, "0")).join("")}`;
    });
  });
  const ink = new Map(dial.discs.map((d) => [d.id, d.ink]));
  for (const name of ["orders", "catalog", "payments", "inventory", "shipping"]) {
    expect(hues, `${name} is lit at its full hue`).toContain(ink.get((await domainNode(page, name)).id));
  }
  expect(hues, "an unconnected domain sinks").not.toContain(ink.get((await domainNode(page, "returns")).id));
  await expect(page.getByTestId("topology-flat-key").locator("[data-key-shape]")).toHaveCount(2);

  const widths = (d: DialProbe) => Object.fromEntries(d.strips.filter((s) => /^(needs|neededBy):/.test(s.flowKey)).map((s) => [s.flowKey, s.widthPx]));
  const atFit = widths(dial);
  expect(Math.max(...Object.values(atFit)), "a two-relation taper is wider than a one-relation one").toBeGreaterThan(Math.min(...Object.values(atFit)));
  for (let k = 0; k < 4; k += 1) await page.mouse.wheel(0, -120);
  await waitForMapStill(page, { what: "camera" });
  const zoomed = await domainNode(page, "orders");
  await page.mouse.move(box.x + zoomed.x, box.y + zoomed.y);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.hover())).toBe(orders.id);
  await waitForMapStill(page);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.dialMotionSettled?.() === true)).toBe(true);
  const closer = await readDial(page);
  expect(closer.zoomRatio, "the wheel zoomed in").toBeGreaterThan(dial.zoomRatio * 1.2);
  expect(widths(closer), "a line keeps its screen width at every zoom").toEqual(atFit);
});

test("selecting a domain counts its partner domains under its name as the panel does, names both line kinds, then rests", async ({ page }) => {
  test.setTimeout(180_000);
  await openVault(page);
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const orders = await domainNode(page, "orders");
  const clickedZoom = (await readDial(page)).zoomRatio;
  await page.mouse.click(box.x + orders.x, box.y + orders.y);
  await page.waitForFunction((id) => window.__atlasMap!.selection().nodeId === id, orders.id);
  await page.mouse.move(box.x + 2, box.y + box.height - 2);
  await waitForMapStill(page, { what: "camera" });
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.dialMotionSettled?.() === true)).toBe(true);

  const dial = await readDial(page);
  expect(await domainLines(page, dial), "every partner's line draws").toEqual(ORDERS_LINES);
  expect(dial.zoomRatio, "a domain selection never zooms").toBeCloseTo(clickedZoom, 6);

  const members = new Set(dial.clusters.find((c) => c.domainId === orders.id)!.capabilityIds);
  const under = dial.strips.filter((s) => /^(needs|neededBy):/.test(s.flowKey)).flatMap((s) => dial.discs
    .filter((d) => members.has(d.id))
    .filter((d) => Array.from({ length: 33 }, (_, k) => k / 32).some((t) => {
      const x = (1 - t) ** 2 * s.ax + 2 * (1 - t) * t * s.cx + t * t * s.bx;
      const y = (1 - t) ** 2 * s.ay + 2 * (1 - t) * t * s.cy + t * t * s.by;
      return Math.hypot(x - d.x, y - d.y) < d.r;
    }))
    .map((d) => `${s.flowKey} under ${d.id}`));
  expect(under, "a domain's lines leave outside its own member star").toEqual([]);

  const figures = (text: string) => (text.match(/\d+/g) ?? []).map(Number);
  const reach = dial.texts.filter((t) => t.id === orders.id && t.role === "status");
  expect(reach.length, "one count line under the selected domain").toBe(1);
  const panelCount = async (group: string) => figures((await page.locator(`[data-datasheet-group-total="${group}"]`).first().textContent()) ?? "")[0];
  const panel = [await panelCount("needs"), await panelCount("neededBy")];
  expect(panel).toEqual([3, 2]);
  expect(figures(reach[0]!.text), "the map's counts are the panel's").toEqual(panel);

  const key = page.getByTestId("topology-flat-key");
  await expect(key.locator('[data-key-shape="needs"]')).toHaveCount(1);
  await expect(key.locator('[data-key-shape="neededBy"]')).toHaveCount(1);

  await page.waitForFunction(
    (quietMs) => performance.now() - ((window as FrameWindow).__graphFrameAt ?? 0) > quietMs,
    IDLE_WINDOW_MS,
    { polling: 250, timeout: 60_000 },
  );
});
