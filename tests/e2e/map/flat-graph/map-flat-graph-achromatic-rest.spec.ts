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
 * How coloured a square of the canvas is: how many pixels it drew, and the chroma of their mean
 * colour, summed in the page so no pixel array crosses the bridge. The mean is judged, not each
 * pixel, because subpixel text antialiasing fringes single pixels red and blue where the ink is
 * grey; the fringes cancel in the mean, and an ink with a hue of its own does not.
 */
const meanChroma = (page: Page, at: { x: number; y: number }, halfPx: number) =>
  page.evaluate(({ x, y, halfPx: half, drawn }) => {
    const element = document.querySelector<HTMLCanvasElement>('[data-testid="ontology-map-canvas"]')!;
    const box = element.getBoundingClientRect();
    const dpr = element.width / box.width;
    const side = Math.round(half * 2 * dpr);
    const { data } = element.getContext("2d")!.getImageData(Math.round((x - box.x - half) * dpr), Math.round((y - box.y - half) * dpr), side, side);
    const sum = [0, 0, 0];
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.max(data[i]!, data[i + 1]!, data[i + 2]!) < drawn) continue;
      lit += 1;
      for (let c = 0; c < 3; c += 1) sum[c]! += data[i + c]!;
    }
    const high = Math.max(...sum);
    return { drawn: lit, chroma: high === 0 ? 0 : (high - Math.min(...sum)) / high };
  }, { x: at.x, y: at.y, halfPx, drawn: DRAWN_PIXEL });

/** A pixel the map drew rather than left to the ground. */
const DRAWN_PIXEL = 56;
/** Mean chroma under which a square reads grey; the neutral ink's own cool cast measures 0.06. */
const GREY = 0.1;
/** Mean chroma over which a square reads as the project's ink; a pointed domain measures 0.30. */
const TINTED = 0.2;

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
    const rest = await meanChroma(page, where, 48);
    expect(rest.drawn, `${name} draws marks to judge`).toBeGreaterThan(200);
    console.log(`[achromatic-rest] ${name} at rest ${rest.chroma.toFixed(3)}`);
    expect(rest.chroma, `${name} rests with no hue of its own`).toBeLessThan(GREY);
  }

  await page.mouse.move(pointed.x, pointed.y);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.hover())).not.toBeNull();
  await waitForMapStill(page);
  const focused = await meanChroma(page, pointed, 48);
  expect(focused.chroma, "the pointed domain takes the project's ink").toBeGreaterThan(TINTED);
  const lit = await meanChroma(page, partner, 48);
  expect(lit.drawn, "the domain it reaches is lit, not sunk out of the measurement").toBeGreaterThan(200);
  expect(lit.chroma, "a lit domain outside the focus's own keeps the neutral ink").toBeLessThan(GREY);
  console.log(`[achromatic-rest] pointed ${focused.chroma.toFixed(3)}, lit partner ${lit.chroma.toFixed(3)}`);
});
