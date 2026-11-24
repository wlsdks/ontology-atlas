import { expect, test, type Page } from "@playwright/test";

import { CODE_CONCEPTS, installCodeReaderRuntime, openConceptOnMap } from "./code-reader-fixture";
import { expectSmoothMotion, FRAME_INTERVAL_BUDGET_MS, PERF_BARS, startSmoothness, stopSmoothness } from "./motion-sampler";
import { waitForAnimationsDone, waitForBoxStill, waitForMapStill } from "./settle";

/*
 * The code reader's motion, measured per frame in full Chromium's headless mode, which composites
 * on the GPU as a window does without opening one: opening, moving to another cited range, moving
 * between its seat beside the panel and the panel's own place, closing, and rest.
 */
test.use({ channel: "chromium", headless: true });

const POSITIONER = '[data-testid="topology-node-popover-positioner"]';
/** No moving value covers more than half of its travel in one frame. */
const MAX_STEP_SHARE = 0.5;
/** The reader's room declares the one reflow it animates. */
const REFLOW = ["width"] as const;
/** criterion 4: a file that does not change for this long draws, reads and mutates nothing. */
const REST_WINDOW_MS = 60_000;

type Sample = { t: number; readerX: number; readerWidth: number; readerOpacity: number; seatWidth: number; panelOpacity: number; lineY: number };
type RecorderWindow = Window & { __readerFrames?: { samples: Sample[]; stop: boolean } };

async function startRecording(page: Page) {
  await page.evaluate(() => {
    const record = { samples: [] as Sample[], stop: false };
    (window as RecorderWindow).__readerFrames = record;
    const box = (selector: string) => document.querySelector<HTMLElement>(selector);
    const frame = (t: number) => {
      if (record.stop) return;
      const reader = box('[data-testid="code-reader"]');
      const readerBox = reader?.getBoundingClientRect();
      const panel = box('[data-testid="concept-panel-place"]');
      record.samples.push({
        t,
        readerX: readerBox?.left ?? Number.NaN,
        readerWidth: readerBox?.width ?? Number.NaN,
        readerOpacity: reader ? Number(getComputedStyle(reader).opacity) : 0,
        seatWidth: box('[data-testid="code-reader-slot"]')?.getBoundingClientRect().width ?? 0,
        panelOpacity: panel ? Number(getComputedStyle(panel).opacity) : 0,
        // Where line 40 stands on screen: lines read above it shift scrollTop, not what is seen.
        lineY: box('[data-line="40"]')?.getBoundingClientRect().top ?? Number.NaN,
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

async function stopRecording(page: Page): Promise<Sample[]> {
  return page.evaluate(() => {
    const record = (window as RecorderWindow).__readerFrames!;
    record.stop = true;
    return record.samples;
  });
}

/**
 * The largest share of a value's whole travel covered between two frames. Outside the perf lane a
 * step across a stalled frame is not judged: a timed motion covers that stall's time in one frame,
 * which a GPU-less runner produces without any jump in the page.
 */
function maxStepShare(samples: Sample[], key: keyof Omit<Sample, "t">): number {
  const moving = samples.filter((sample) => Number.isFinite(sample[key]));
  if (moving.length < 2) return 0;
  const values = moving.map((sample) => sample[key]);
  const total = Math.max(...values) - Math.min(...values);
  if (total === 0) return 0;
  let largest = 0;
  for (let i = 1; i < moving.length; i += 1) {
    if (!PERF_BARS && moving[i]!.t - moving[i - 1]!.t > FRAME_INTERVAL_BUDGET_MS) continue;
    largest = Math.max(largest, Math.abs(values[i]! - values[i - 1]!) / total);
  }
  return largest;
}

function expectNoJump(samples: Sample[], keys: readonly (keyof Omit<Sample, "t">)[]) {
  const intervals = samples.slice(1).map((sample, index) => sample.t - samples[index]!.t);
  console.log(`[code-reader-motion] ${JSON.stringify({ frames: samples.length, maxIntervalMs: Math.round(Math.max(...intervals)) })}`);
  if (PERF_BARS) expect(Math.max(...intervals), "a frame interval while the reader moved").toBeLessThanOrEqual(FRAME_INTERVAL_BUDGET_MS);
  for (const key of keys) expect(maxStepShare(samples, key), `${key} jumped in one frame`).toBeLessThanOrEqual(MAX_STEP_SHARE);
}

async function settled(page: Page) {
  const reader = page.getByTestId("code-reader");
  if ((await reader.count()) > 0) {
    await waitForAnimationsDone(reader);
    await waitForBoxStill(reader);
  }
  await waitForAnimationsDone(page.locator(POSITIONER));
  await waitForMapStill(page, { what: "camera" });
}

/** At 1512 with the concept list folded the reader stands beside the panel. */
async function openOnConcept(page: Page) {
  await page.setViewportSize({ width: 1512, height: 900 });
  await installCodeReaderRuntime(page);
  await openConceptOnMap(page, CODE_CONCEPTS.current, "en", { probe: true });
  await page.getByTestId("topology-index-fold").click();
  await expect(page.getByTestId("topology-index-panel")).toHaveCount(0);
  await waitForMapStill(page, { what: "camera" });
}

test.describe("Code reader motion", () => {
  test("opens, moves to another range, changes seat and closes with no frame over budget and no jump", async ({ page }) => {
    await openOnConcept(page);
    const row = page.getByTestId("map-detail-panel-code");

    await startSmoothness(page);
    await startRecording(page);
    await row.click();
    await expect(page.getByTestId("code-reader")).toHaveAttribute("data-code-reader-placement", "beside");
    await settled(page);
    expectNoJump(await stopRecording(page), ["readerX", "readerOpacity", "seatWidth"]);

    await startRecording(page);
    await page.getByTestId("code-reader-range").nth(1).click();
    await expect(page.locator('[data-line="7"]')).toBeInViewport();
    await settled(page);
    const glide = await stopRecording(page);
    expectNoJump(glide, ["lineY"]);
    expect(new Set(glide.map((sample) => sample.lineY)).size, "the range scroll glided over several frames").toBeGreaterThan(3);
    expectSmoothMotion(await stopSmoothness(page, POSITIONER), { reflow: REFLOW });

    // The concept list's own width and the toolbar beside it reflow here; the frames above judge the reader.
    await startRecording(page);
    await page.getByTestId("topology-index-tab").click();
    await expect(page.getByTestId("code-reader")).toHaveAttribute("data-code-reader-placement", "replace");
    await settled(page);
    expectNoJump(await stopRecording(page), ["readerX", "readerWidth", "seatWidth", "panelOpacity"]);

    await startRecording(page);
    await page.getByTestId("topology-index-fold").click();
    await expect(page.getByTestId("code-reader")).toHaveAttribute("data-code-reader-placement", "beside");
    await settled(page);
    expectNoJump(await stopRecording(page), ["readerX", "readerWidth", "seatWidth", "panelOpacity"]);

    await startSmoothness(page);
    await startRecording(page);
    await page.getByTestId("code-reader-close").click();
    await expect(page.getByTestId("code-reader")).toHaveCount(0);
    await settled(page);
    expectNoJump(await stopRecording(page), ["seatWidth"]);
    expectSmoothMotion(await stopSmoothness(page, POSITIONER), { reflow: REFLOW });
  });

  test("under reduced motion the range jumps and the seat takes its width at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openOnConcept(page);
    await page.getByTestId("map-detail-panel-code").click();
    await settled(page);
    await startRecording(page);
    await page.getByTestId("code-reader-range").nth(1).click();
    await expect(page.locator('[data-line="7"]')).toBeInViewport();
    await settled(page);
    const positions = (await stopRecording(page)).map((sample) => sample.lineY);
    expect(new Set(positions).size, "the scroll took one step").toBeLessThanOrEqual(2);
  });

  test("open on a file that does not change, it reads, changes and animates nothing for a minute", async ({ page }) => {
    test.setTimeout(REST_WINDOW_MS * 3);
    await openOnConcept(page);
    await page.getByTestId("map-detail-panel-code").click();
    await settled(page);
    const before = await page.evaluate(() => {
      const calls = (window as unknown as { __codeReaderCalls: { window: number; stamp: number } }).__codeReaderCalls;
      const counts = { mutations: 0 };
      new MutationObserver((records) => {
        counts.mutations += records.length;
      }).observe(document.querySelector('[data-testid="topology-node-popover-positioner"]')!, { subtree: true, childList: true, attributes: true, characterData: true });
      (window as unknown as { __restCounts: typeof counts }).__restCounts = counts;
      return { calls: { ...calls } };
    });
    // measurement window: criterion 4 asks what the reader does over a minute at rest.
    await page.waitForTimeout(REST_WINDOW_MS);
    const after = await page.evaluate(() => {
      const calls = (window as unknown as { __codeReaderCalls: { window: number; stamp: number } }).__codeReaderCalls;
      const reader = document.querySelector('[data-testid="code-reader"]')!;
      return {
        calls: { ...calls },
        mutations: (window as unknown as { __restCounts: { mutations: number } }).__restCounts.mutations,
        running: reader.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length,
      };
    });
    expect(after.calls).toEqual(before.calls);
    expect(after.mutations).toBe(0);
    expect(after.running).toBe(0);
  });
});
