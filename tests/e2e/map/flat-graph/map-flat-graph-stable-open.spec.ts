import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { holdDesktopReads, installDesktopRailRuntime, releaseDesktopReads } from "../../desktop-rail-arrival-harness";
import { waitForMapStill } from "../../settle";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/dial-shapes";

const DOMAINS = ["orders", "catalog", "payments", "shipping", "returns", "inventory", "merchants", "platform"];
const CAPABILITIES_PER_DOMAIN = 6;
const ELEMENTS_PER_CAPABILITY = 9;
/** A shape tolerance relative to the graph's spread: the same layout agrees to 1e-12, a reshuffle to ~1. */
const SHAPE_EPSILON = 0.01;

/** Past the 400 documents at which a folder streams in partial reads, with domain- and capability-level dependencies. */
function generatedVault(): Record<string, string> {
  const files: Record<string, string> = {};
  const body = (title: string) => `\n# ${title}\n\n${title} keeps one boundary of the product honest.\n`;
  const domain = (d: number) => `domains/${DOMAINS[d % DOMAINS.length]}`;
  const capability = (d: number, c: number) => `capabilities/${DOMAINS[d % DOMAINS.length]}-${c}`;
  files["atlas.md"] = `---\nkind: project\ntitle: Atlas\nslug: atlas\ndomains: [${DOMAINS.map((_, d) => domain(d)).join(", ")}]\n---\n${body("Atlas")}`;
  DOMAINS.forEach((name, d) => {
    const capabilities = Array.from({ length: CAPABILITIES_PER_DOMAIN }, (_, c) => capability(d, c));
    files[`${domain(d)}.md`] = `---\nkind: domain\ntitle: ${name}\ndepends_on: [${domain(d + 1)}, ${domain(d + 3)}]\ncapabilities: [${capabilities.join(", ")}]\n---\n${body(name)}`;
    for (let c = 0; c < CAPABILITIES_PER_DOMAIN; c += 1) {
      const elements = Array.from({ length: ELEMENTS_PER_CAPABILITY }, (_, e) => `elements/${name}-${c}-${e}`);
      const dependsOn = c < 3 ? `depends_on: [${capability(d * 5 + 2 + c, c)}]\n` : "";
      files[`${capability(d, c)}.md`] = `---\nkind: capability\ntitle: ${name} ${c}\ndomain: ${domain(d)}\n${dependsOn}elements: [${elements.join(", ")}]\n---\n${body(`${name} ${c}`)}`;
      for (const element of elements) files[`${element}.md`] = `---\nkind: element\ntitle: ${element.slice("elements/".length)}\n---\n${body(element)}`;
    }
  });
  return files;
}

/** The capability files, whose reads a streamed folder answers after the map has drawn its first world. */
const streamedPaths = (vault: Record<string, string>) => Object.keys(vault).filter((path) => path.startsWith("capabilities/"));

/** Lets the held reads answer once the map has drawn a first world, as any folder past 400 documents does. */
async function releaseReadsAfterFirstDraw(page: Page): Promise<void> {
  await page.waitForFunction(() => (window.__atlasMap?.nodes().length ?? 0) > 0, undefined, { timeout: 60_000 });
  await releaseDesktopReads(page);
}

interface Picture {
  at: Map<string, { x: number; y: number }>;
  rim: Map<string, string>;
}

const MARKS = DOMAINS.length * (1 + CAPABILITIES_PER_DOMAIN);

async function settledPicture(page: Page): Promise<Picture> {
  await page.waitForFunction((marks) => {
    const dial = window.__atlasMap?.dial?.();
    const drawn = window.__atlasMap?.nodes().filter((n) => n.kind === "domain" || n.kind === "capability").length;
    return dial?.owns === true && (dial as DialProbe).placement.state === "settled" && drawn === marks && document.querySelector("[data-vault-load-progress]") === null;
  }, MARKS, { timeout: 120_000 });
  await page.evaluate(async () => {
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
    await Promise.allSettled([400, 510, 560, 650].map((weight) => document.fonts.load(`${weight} 12px ${family}`)));
    await document.fonts.ready;
  });
  await waitForMapStill(page);
  const rims = () => page.evaluate(() => (window.__atlasMap!.dial!() as DialProbe).discs.map((d) => [d.id, d.ink] as [string, string]));
  let rim = await rims();
  await expect.poll(async () => {
    const before = rim;
    await waitForMapStill(page);
    rim = await rims();
    return JSON.stringify(rim) === JSON.stringify(before);
  }, "rim inks stop changing").toBe(true);
  const at = await page.evaluate(() => {
    const nodes = window.__atlasMap!.nodes();
    const project = nodes.find((n) => n.kind === "project")!;
    return nodes.filter((n) => n.kind === "domain" || n.kind === "capability").map((n) => [n.id, { x: n.x - project.x, y: n.y - project.y }] as const);
  });
  const domains = new Set(at.map(([id]) => id));
  return { at: new Map(at), rim: new Map(rim.filter(([id]) => domains.has(id))) };
}

async function pickFolder(page: Page, streamed = false): Promise<void> {
  await page.goto("/en/?guides=off&e2e=1", { waitUntil: "networkidle" });
  await page.getByTestId("first-run-open").click();
  if (streamed) await releaseReadsAfterFirstDraw(page);
}

/** The largest distance between matching marks once the camera's zoom is divided out, relative to the graph's spread. */
function shapeDrift(a: Picture, b: Picture): number {
  const ids = [...a.at.keys()];
  const dot = ids.reduce((s, id) => s + a.at.get(id)!.x * b.at.get(id)!.x + a.at.get(id)!.y * b.at.get(id)!.y, 0);
  const norm = ids.reduce((s, id) => s + a.at.get(id)!.x ** 2 + a.at.get(id)!.y ** 2, 0);
  const zoom = dot / norm;
  const spread = Math.sqrt(norm / ids.length);
  return Math.max(...ids.map((id) => Math.hypot(b.at.get(id)!.x - zoom * a.at.get(id)!.x, b.at.get(id)!.y - zoom * a.at.get(id)!.y))) / spread;
}

const VIEWPORT = { width: 1920, height: 1080 };
test.use({ viewport: VIEWPORT });

test("one folder draws one Flat picture however its reads were batched, and after a reload", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  const vault = generatedVault();
  const pictures = new Map<string, Picture>();

  await installDesktopRailRuntime(page, vault, undefined, { replaceFixture: true });
  await pickFolder(page);
  pictures.set("one read", await settledPicture(page));

  const session = await browser.newContext({ baseURL, viewport: VIEWPORT });
  const streamed = await session.newPage();
  await installDesktopRailRuntime(streamed, vault, undefined, { replaceFixture: true, holdReadsUntilReleased: streamedPaths(vault) });
  await pickFolder(streamed, true);
  pictures.set("streamed reads", await settledPicture(streamed));
  await holdDesktopReads(streamed, streamedPaths(vault));
  await streamed.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await releaseReadsAfterFirstDraw(streamed);
  pictures.set("streamed restore after a reload", await settledPicture(streamed));
  await session.close();

  const [reference, ...others] = [...pictures];
  expect(reference![1].rim.size, "every drawn mark has a rim to compare").toBe(MARKS);
  expect(new Set(reference![1].rim.values()).size, "the resting map gives every mark the same ink").toBe(1);
  for (const [how, picture] of others) {
    expect.soft(shapeDrift(reference![1], picture), `${how}: positions against ${reference![0]}`).toBeLessThan(SHAPE_EPSILON);
    expect.soft(picture.rim, `${how}: rim ink per domain`).toEqual(reference![1].rim);
  }
});
