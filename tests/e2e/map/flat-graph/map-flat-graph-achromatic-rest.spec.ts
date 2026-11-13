import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";
import { stubDirectoryPicker } from "../../vault-picker-stub";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

const DOMAINS = ["orders", "catalog", "payments", "inventory", "shipping", "returns"];
const CAPABILITIES_PER_DOMAIN = 3;
/** One cross-domain dependency, so pointing at `orders` lights `returns` and the gate reads a lit mark. */
const DEPENDS: readonly [string, string][] = [["orders-0", "returns-0"]];

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

/**
 * How coloured a square of the canvas is: how many pixels it drew, and the share of those whose
 * chroma passes `COLOURED`, counted in the page so no pixel array crosses the bridge. A neutral ink
 * leaves grey pixels, however bright, and only an ink with a hue of its own raises the share.
 */
const colouredShare = (page: Page, at: { x: number; y: number }, halfPx: number) =>
  page.evaluate(({ x, y, halfPx: half, drawn, coloured }) => {
    const element = document.querySelector<HTMLCanvasElement>('[data-testid="ontology-map-canvas"]')!;
    const dpr = element.width / element.getBoundingClientRect().width;
    const box = element.getBoundingClientRect();
    const side = Math.round(half * 2 * dpr);
    const { data } = element.getContext("2d")!.getImageData(Math.round((x - box.x - half) * dpr), Math.round((y - box.y - half) * dpr), side, side);
    let lit = 0;
    let hued = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const high = Math.max(r, g, b);
      if (high < drawn) continue;
      lit += 1;
      if ((high - Math.min(r, g, b)) / high >= coloured) hued += 1;
    }
    return { drawn: lit, share: lit === 0 ? 0 : hued / lit };
  }, { x: at.x, y: at.y, halfPx, drawn: DRAWN_PIXEL, coloured: COLOURED });

/** A pixel the map drew rather than left to the ground. */
const DRAWN_PIXEL = 56;
/** Chroma over the brightest channel at which an ink reads as a colour rather than a grey. */
const COLOURED = 0.2;

const domainNode = (page: Page, name: string) =>
  page.evaluate((title) => window.__atlasMap!.nodes().find((n) => n.kind === "domain" && /[^/:]+$/.exec(n.id)?.[0] === title)!, name);

test("the map rests achromatic and gives the project's ink to the domain the pointer is in", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await openVault(page);
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const at = async (name: string) => {
    const node = await domainNode(page, name);
    return { x: box.x + node.x, y: box.y + node.y };
  };
  const pointed = await at("orders");
  const partner = await at("returns");

  for (const [name, where] of [["orders", pointed], ["returns", partner]] as const) {
    const rest = await colouredShare(page, where, 48);
    expect(rest.drawn, `${name} draws marks to judge`).toBeGreaterThan(200);
    expect(rest.share, `${name} rests with no hue of its own`).toBeLessThan(0.05);
  }

  await page.mouse.move(pointed.x, pointed.y);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.hover())).not.toBeNull();
  await waitForMapStill(page);
  const focused = await colouredShare(page, pointed, 48);
  expect(focused.share, "the pointed domain takes the project's ink").toBeGreaterThan(0.4);
  const lit = await colouredShare(page, partner, 48);
  expect(lit.drawn, "the domain it reaches is lit, not sunk out of the measurement").toBeGreaterThan(200);
  expect(lit.share, "a lit domain outside the focus's own keeps the neutral ink").toBeLessThan(0.05);
});
