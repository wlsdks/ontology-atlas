import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { useDogfoodSample } from "../../sample-source";
import { waitForMapSettled, waitForMapStill } from "../../settle";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

const VIEWPORT = { width: 1920, height: 1080 };
/** Frames stop one idle grace (1,200 ms, `IDLE_GRACE_MS`) after the last motion; the budget allows 300 ms past it. */
const REST_BUDGET_MS = 1_500;
const QUIET_MS = 3_000;

test.use({ viewport: VIEWPORT });

interface MotionSample { t: number; settled: boolean; hover: string | null; selected: string | null }
type MotionWindow = Window & { __frames: number[]; __motion: MotionSample[] };

async function open(page: Page): Promise<DialProbe> {
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    const w = window as unknown as MotionWindow;
    w.__frames = [];
    w.__motion = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => raf((t) => {
      w.__frames.push(performance.now());
      callback(t);
      const probe = window.__atlasMap;
      if (probe?.dialMotionSettled) w.__motion.push({ t: performance.now(), settled: probe.dialMotionSettled(), hover: probe.hover(), selected: probe.selection().nodeId });
    });
  });
  await page.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page, { timeout: 90_000 });
  await page.waitForFunction(() => window.__atlasMap?.dial?.()?.owns === true, undefined, { timeout: 90_000 });
  await waitForMapStill(page);
  return page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);
}

async function canvasPoint(page: Page, at: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("ontology-map-canvas").boundingBox();
  if (box === null) throw new Error("the map canvas has no box");
  return { x: box.x + at.x, y: box.y + at.y };
}

const resetSamples = (page: Page) => page.evaluate(() => {
  const w = window as unknown as MotionWindow;
  w.__motion = [];
  return performance.now();
});

test("after a selection the attention motion lands and the map stops drawing", async ({ page }) => {
  test.setTimeout(120_000);
  await useDogfoodSample(page);
  const dial = await open(page);
  const disc = dial.discs.find((d) => dial.clusters.some((c) => c.capabilityIds.includes(d.id)))!;
  const at = await canvasPoint(page, disc);
  await page.mouse.move(at.x, at.y);
  await waitForMapStill(page);
  const since = await resetSamples(page);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction((id) => window.__atlasMap!.selection().nodeId === id, disc.id);
  await waitForMapStill(page);
  const landedAt = await page.evaluate((from) => {
    const samples = (window as unknown as MotionWindow).__motion.filter((s) => s.t > from);
    const moving = samples.findLastIndex((s) => !s.settled);
    return { moved: moving >= 0, at: samples[moving + 1]?.t ?? Number.NaN };
  }, since);
  expect(landedAt.moved, "the selection animated").toBe(true);
  await page.waitForFunction(
    (quietMs) => performance.now() - ((window as unknown as MotionWindow).__frames.at(-1) ?? 0) > quietMs,
    QUIET_MS,
    { polling: 250, timeout: 60_000 },
  );
  const lastFrame = await page.evaluate(() => (window as unknown as MotionWindow).__frames.at(-1)!);
  console.log(`[flat-motion] last frame ${Math.round(lastFrame - landedAt.at)} ms after the selection landed`);
  expect(lastFrame - landedAt.at).toBeLessThan(REST_BUDGET_MS);
});

test("under reduced motion every lit state is complete on its first frame", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await useDogfoodSample(page);
  const dial = await open(page);
  const domain = dial.clusters[0]!;
  const capability = dial.discs.find((d) => domain.capabilityIds.includes(d.id))!;
  const since = await resetSamples(page);
  const chip = await canvasPoint(page, domain.chip);
  await page.mouse.move(chip.x, chip.y);
  await page.waitForFunction((id) => window.__atlasMap!.hover() === id, domain.domainId);
  await waitForMapStill(page);
  const at = await canvasPoint(page, capability);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction((id) => window.__atlasMap!.selection().nodeId === id, capability.id);
  await waitForMapStill(page);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__atlasMap!.selection().nodeId === null);
  await waitForMapStill(page);
  const samples = await page.evaluate((from) => (window as unknown as MotionWindow).__motion.filter((s) => s.t > from), since);
  expect(samples.some((s) => s.hover === domain.domainId), "the hover was drawn").toBe(true);
  expect(samples.some((s) => s.selected === capability.id), "the selection was drawn").toBe(true);
  expect(samples.filter((s) => !s.settled).length, "no frame showed a state in motion").toBe(0);
});
