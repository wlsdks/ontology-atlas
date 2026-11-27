import { expect, test, type Locator, type Page } from "@playwright/test";

import { installDesktopRailRuntime } from "../desktop-rail-arrival-harness";
import { seedFirstRunSeen } from "../first-run-seed";
import { expectSmoothMotion, startSmoothness, stopSmoothness } from "../motion-sampler";
import { waitForAnimationsDone, waitForMapSettled } from "../settle";
import { installDesktopBridge, openDocumentAutomations } from "../rounds-desktop-bridge";

type Track = { height: number[]; opacity: number[]; time: number[]; inertAtFirstFrame: boolean };

const WINDOW_MS = 500;
const MAX_HEIGHT_STEP = 0.35;
// A smooth fade on the 120 ms `--motion-fast` ease reads at most 0.24 as its first step per frame.
const MAX_CONTENT_FFS = 0.25;
const PLAYBACK = 0.25;
const FRAME_MS = 1000 / 60;

/** Samples `WINDOW_MS` of document-timeline time; `Animation.setPlaybackRate` slows that clock with the animations. */
async function sampleToggle(trigger: Locator, box: Locator): Promise<Track> {
  const boxHandle = await box.elementHandle();
  return trigger.evaluate(
    (triggerElement, { boxElement, windowMs }) =>
      new Promise<Track>((resolve) => {
        const target = boxElement as HTMLElement;
        const track: Track = { height: [], opacity: [], time: [], inertAtFirstFrame: false };
        const now = () => Number(document.timeline.currentTime);
        const read = () => {
          const body = target.querySelector<HTMLElement>(".ai-row-disclosure-body");
          track.time.push(now());
          track.height.push(target.getBoundingClientRect().height);
          track.opacity.push(body ? Number(getComputedStyle(body).opacity) : 0);
        };
        read();
        (triggerElement as HTMLElement).click();
        const start = now();
        let first = true;
        const frame = () => {
          if (first) {
            track.inertAtFirstFrame = target.hasAttribute("inert");
            first = false;
          }
          read();
          if (now() - start < windowMs) requestAnimationFrame(frame);
          else resolve(track);
        };
        requestAnimationFrame(frame);
      }),
    { boxElement: boxHandle, windowMs: WINDOW_MS },
  );
}

/**
 * Each moving step as the share of the whole travel it covers per 60 Hz frame of animation time.
 * Dividing by the time a step spans keeps a frame the runner drops from reading as a jump; a
 * change that takes no time at all is infinitely fast.
 */
function sharesPerFrame(values: number[], times: number[]): number[] {
  const total = Math.abs(values[values.length - 1]! - values[0]!);
  if (total === 0) return [];
  const shares: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const share = Math.abs(values[i]! - values[i - 1]!) / total;
    if (share === 0) continue;
    const elapsed = times[i]! - times[i - 1]!;
    shares.push(elapsed > 0 ? (share * FRAME_MS) / elapsed : Infinity);
  }
  return shares;
}

const peakSharePerFrame = (values: number[], times: number[]) => Math.max(0, ...sharesPerFrame(values, times));
const firstSharePerFrame = (values: number[], times: number[]) => sharesPerFrame(values, times)[0] ?? 0;

function maxStepShare(values: number[]): number {
  const total = Math.abs(values[values.length - 1]! - values[0]!);
  if (total === 0) return 0;
  let max = 0;
  for (let i = 1; i < values.length; i += 1) max = Math.max(max, Math.abs(values[i]! - values[i - 1]!) / total);
  return max;
}

/** The settings sheet's Expand detail is a live `RowDisclosure`, opened over a map that has drawn. */
async function openExpandDetail(page: Page) {
  await installDesktopRailRuntime(page);
  await page.goto("/en/?guides=off&e2e=1");
  await page.getByTestId("first-run-open").click();
  await waitForMapSettled(page);
  await page.locator('[data-testid="app-settings-trigger"]:visible').click();
  await page.getByTestId("app-settings-nav-expand").click();
  const trigger = page.getByTestId("app-settings-expand-detail-toggle");
  await expect(trigger).toHaveAttribute("aria-expanded", "false", { timeout: 30_000 });
  const box = page.locator(`[id="${await trigger.getAttribute("aria-controls")}"]`);
  return { trigger, box };
}

test.describe("Disclosure motion", () => {
  test("a settings detail opens and closes on the row curve with no height jump", async ({ page }) => {
    const { trigger, box } = await openExpandDetail(page);
    await waitForAnimationsDone(page.locator("html"));
    await startSmoothness(page);

    const animation = await page.context().newCDPSession(page);
    await animation.send("Animation.enable");
    await animation.send("Animation.setPlaybackRate", { playbackRate: PLAYBACK });
    const opening = await sampleToggle(trigger, box);
    expect(opening.height.at(-1)!).toBeGreaterThan(opening.height[0]!);
    expect(peakSharePerFrame(opening.height, opening.time)).toBeLessThanOrEqual(MAX_HEIGHT_STEP);
    expect(firstSharePerFrame(opening.opacity, opening.time)).toBeLessThanOrEqual(MAX_CONTENT_FFS);

    const closing = await sampleToggle(trigger, box);
    expect(closing.inertAtFirstFrame).toBe(true);
    expect(closing.height.at(-1)!).toBeLessThan(closing.height[0]!);
    expect(peakSharePerFrame(closing.height, closing.time)).toBeLessThanOrEqual(MAX_HEIGHT_STEP);
    expectSmoothMotion(await stopSmoothness(page, '[data-testid="app-settings-popover"]'), { reflow: ["height"] });
  });

  test("an immediate second key press reverses the disclosure", async ({ page }) => {
    const { trigger } = await openExpandDetail(page);
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Space");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  test("reduced motion sets the height at once and keeps the content fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { trigger, box } = await openExpandDetail(page);
    const opening = await sampleToggle(trigger, box);
    expect(maxStepShare(opening.height)).toBeGreaterThan(0.9);
    expect(opening.opacity.some((value) => value > 0 && value < 1)).toBe(true);
  });

  test("a field error opens below the field without a jump and is an alert", async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page, { seedRounds: false });
    await openDocumentAutomations(page);
    await page.getByTestId("automations-new").click();
    await page.getByTestId("library-rounds-cadence-unit").getByRole("radio", { name: "Day" }).click();
    const time = page.getByTestId("library-rounds-time");
    const box = page.locator(`[id="${await time.getAttribute("id")}-error-box"]`);
    await expect(box).toHaveAttribute("data-state", "closed");

    const animation = await page.context().newCDPSession(page);
    await animation.send("Animation.enable");
    await animation.send("Animation.setPlaybackRate", { playbackRate: PLAYBACK });
    const track = await box.evaluate(
      (element, windowMs) =>
        new Promise<{ height: number[]; time: number[] }>((resolve) => {
          const now = () => Number(document.timeline.currentTime);
          const track = { height: [] as number[], time: [] as number[] };
          const read = () => {
            track.time.push(now());
            track.height.push(element.getBoundingClientRect().height);
          };
          read();
          const start = now();
          const frame = () => {
            read();
            if (now() - start < windowMs) requestAnimationFrame(frame);
            else resolve(track);
          };
          const input = document.querySelector<HTMLInputElement>('[data-testid="library-rounds-time"]')!;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
          setter.call(input, "");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          requestAnimationFrame(frame);
        }),
      WINDOW_MS,
    );
    await expect(box).toHaveAttribute("data-state", "open");
    await expect(box.getByRole("alert")).toBeVisible();
    expect(track.height.at(-1)!).toBeGreaterThan(track.height[0]!);
    expect(peakSharePerFrame(track.height, track.time)).toBeLessThanOrEqual(MAX_HEIGHT_STEP);
  });
});
