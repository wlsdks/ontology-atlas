import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { useDogfoodSample } from "../../sample-source";
import { waitForMapSettled, waitForMapStill } from "../../settle";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

const VIEWPORT = { width: 1920, height: 1080 };
const IDLE_WINDOW_MS = 3_000;

test.use({ viewport: VIEWPORT });

test.beforeEach(async ({ page }) => {
  await seedFirstRunSeen(page);
  await useDogfoodSample(page);
});

type FrameWindow = Window & { __graphFrameAt?: number };

const readDial = (page: Page) => page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);

async function openGraph(page: Page): Promise<DialProbe> {
  await page.addInitScript(() => {
    const w = window as FrameWindow;
    w.__graphFrameAt = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => raf((t) => {
      w.__graphFrameAt = performance.now();
      callback(t);
    });
  });
  await page.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page, { timeout: 90_000 });
  await page.waitForFunction(() => window.__atlasMap?.dial?.()?.owns === true, undefined, { timeout: 90_000 });
  await waitForMapStill(page);
  return readDial(page);
}

async function canvasPoint(page: Page, at: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("ontology-map-canvas").boundingBox();
  if (box === null) throw new Error("the map canvas has no box");
  return { x: box.x + at.x, y: box.y + at.y };
}

const hovered = (page: Page) =>
  page.evaluate(() => new Promise<string | null>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.__atlasMap!.hover())))));

test("Flat draws the domain graph: every capability is pointable, names never overlap, idle draws nothing", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const dial = await openGraph(page);
  const capabilityIds = await page.evaluate(() => window.__atlasMap!.nodes().filter((n) => n.kind === "capability" && !n.hidden).map((n) => n.id));

  expect(dial.clusters.length, "every domain is a cluster").toBeGreaterThan(1);
  expect(dial.textOverlaps, "no admitted name crosses another").toBe(0);
  for (const cluster of dial.clusters) expect(dial.texts.some((t) => t.id === cluster.domainId && t.role === "domain"), `${cluster.domainId} is named`).toBe(true);

  const discs = new Map(dial.discs.map((d) => [d.id, d]));
  expect(capabilityIds.filter((id) => !discs.has(id)), "every capability has a disc on screen").toEqual([]);
  for (const id of capabilityIds) {
    const at = await canvasPoint(page, discs.get(id)!);
    await page.mouse.move(at.x, at.y);
    expect(await hovered(page), `${id} answers the pointer`).toBe(id);
  }

  await page.mouse.move(5, VIEWPORT.height / 2);
  await page.waitForFunction(
    (quietMs) => performance.now() - ((window as FrameWindow).__graphFrameAt ?? 0) > quietMs,
    IDLE_WINDOW_MS,
    { polling: 250, timeout: 60_000 },
  );
  expect(errors).toEqual([]);
});

test("pointing at a domain sinks every other domain; selecting a capability names it and keeps its reach lit", async ({ page }) => {
  test.setTimeout(180_000);
  const rest = await openGraph(page);
  const restInk = new Map(rest.discs.map((d) => [d.id, d.ink]));
  const target = [...rest.clusters].sort((a, b) => b.capabilityIds.length - a.capabilityIds.length)[0]!;
  const own = new Set(target.capabilityIds);
  const foreign = rest.clusters.filter((c) => c !== target).flatMap((c) => c.capabilityIds).filter((id) => restInk.has(id));
  expect(foreign.length, "the sample has capabilities outside the target domain").toBeGreaterThan(0);

  const chip = await canvasPoint(page, target.chip);
  await page.mouse.move(chip.x, chip.y);
  expect(await hovered(page)).toBe(target.domainId);
  await waitForMapStill(page);
  const lit = await readDial(page);
  const litInk = new Map(lit.discs.map((d) => [d.id, d.ink]));
  for (const id of own) if (restInk.has(id)) expect(litInk.get(id), `${id} stays lit`).toBe(restInk.get(id));
  const sunkCount = foreign.filter((id) => litInk.get(id) !== restInk.get(id)).length;
  expect(sunkCount, "every foreign capability sinks").toBe(foreign.length);

  const capability = [...own].find((id) => restInk.has(id))!;
  const disc = lit.discs.find((d) => d.id === capability)!;
  const at = await canvasPoint(page, disc);
  await page.mouse.click(at.x, at.y);
  await page.mouse.move(5, VIEWPORT.height / 2);
  await waitForMapStill(page);
  expect(await page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(capability);
  const selected = await readDial(page);
  expect(selected.texts.some((t) => t.id === capability && t.role === "capability"), "the selected capability is named").toBe(true);
  expect(selected.textOverlaps, "no admitted name crosses another under a selection").toBe(0);
  const selectedInk = new Map(selected.discs.map((d) => [d.id, d.ink]));
  expect(selectedInk.get(target.domainId), "the selected capability's domain stays lit").toBe(restInk.get(target.domainId));
});
