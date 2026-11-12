import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { useDogfoodSample } from "../../sample-source";
import { waitForMapStill } from "../../settle";
import { stubDirectoryPicker } from "../../vault-picker-stub";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

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

/** Slows every file read by a varying few milliseconds, so the folder arrives in several partial reads. */
async function streamReads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const read = FileSystemFileHandle.prototype.getFile;
    let calls = 0;
    FileSystemFileHandle.prototype.getFile = async function (this: FileSystemFileHandle) {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20 + (calls * 37) % 60));
      return read.call(this);
    };
  });
}

interface Picture {
  at: Map<string, { x: number; y: number }>;
  hue: Map<string, number>;
}

const MARKS = DOMAINS.length * (1 + CAPABILITIES_PER_DOMAIN);

async function settledPicture(page: Page): Promise<Picture> {
  await page.waitForFunction((marks) => {
    const dial = window.__atlasMap?.dial?.();
    const drawn = window.__atlasMap?.nodes().filter((n) => n.kind === "domain" || n.kind === "capability").length;
    return dial?.owns === true && (dial as DialProbe).placement.state === "settled" && drawn === marks && document.querySelector("[data-vault-load-progress]") === null;
  }, MARKS, { timeout: 120_000 });
  await page.evaluate(async () => {
    const family = getComputedStyle(document.body).fontFamily;
    await Promise.all([400, 510, 560, 650].map((weight) => document.fonts.load(`${weight} 12px ${family}`)));
    await document.fonts.ready;
  });
  await waitForMapStill(page);
  const hue = await page.waitForFunction(() => {
    const style = getComputedStyle(document.documentElement);
    const hues = Array.from({ length: 8 }, (_, k) => style.getPropertyValue(`--color-domain-${k + 1}-rgb`).trim().split(/\s+/).map(Number));
    const rims = new Map((window.__atlasMap!.dial!() as DialProbe).discs.map((d) => [d.id, d.ink]));
    const hueOf = (ink: string | undefined) => hues.findIndex((rgb) => ink !== undefined && rgb.every((v, k) => v === parseInt(ink.slice(1 + 2 * k, 3 + 2 * k), 16)));
    const byDomain = window.__atlasMap!.nodes().filter((n) => n.kind === "domain").map((n) => [n.id, hueOf(rims.get(n.id))] as [string, number]);
    return byDomain.every(([, index]) => index >= 0) && byDomain;
  });
  const at = await page.evaluate(() => {
    const nodes = window.__atlasMap!.nodes();
    const project = nodes.find((n) => n.kind === "project")!;
    return nodes.filter((n) => n.kind === "domain" || n.kind === "capability").map((n) => [n.id, { x: n.x - project.x, y: n.y - project.y }] as const);
  });
  return { at: new Map(at), hue: new Map((await hue.jsonValue()) || []) };
}

async function pickFolder(page: Page): Promise<void> {
  await page.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "networkidle" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await page.getByTestId("first-run-starter").waitFor({ state: "detached", timeout: 60_000 });
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

test("one folder draws one Flat picture whichever sample showed first, however its reads were batched, and after a reload", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  const vault = generatedVault();
  const pictures = new Map<string, Picture>();

  await seedFirstRunSeen(page);
  await page.addInitScript(() => window.localStorage.setItem("demo:sample-source:v1", "storefront"));
  await stubDirectoryPicker(page, vault);
  await pickFolder(page);
  pictures.set("one read after the storefront sample", await settledPicture(page));

  const session = await browser.newContext({ baseURL, viewport: VIEWPORT });
  const streamed = await session.newPage();
  await seedFirstRunSeen(streamed);
  await useDogfoodSample(streamed);
  await stubDirectoryPicker(streamed, vault);
  await streamReads(streamed);
  await pickFolder(streamed);
  pictures.set("streamed reads after the dogfood sample", await settledPicture(streamed));
  await streamed.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  pictures.set("streamed restore after a reload", await settledPicture(streamed));
  await session.close();

  const [reference, ...others] = [...pictures];
  expect(new Set(reference![1].hue.values()).size, "eight domains, eight hues").toBe(DOMAINS.length);
  for (const [how, picture] of others) {
    expect.soft(shapeDrift(reference![1], picture), `${how}: positions against ${reference![0]}`).toBeLessThan(SHAPE_EPSILON);
    expect.soft(picture.hue, `${how}: hue per domain`).toEqual(reference![1].hue);
  }
});
