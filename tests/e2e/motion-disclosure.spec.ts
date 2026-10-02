import { expect, test, type Locator, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { installHarnessRuntime, mountHarnessVault } from "./harness-tab-fixture";
import { installDesktopBridge, openRounds } from "./rounds-desktop-bridge";

type Track = { height: number[]; opacity: number[]; inertAtFirstFrame: boolean };

const WINDOW_MS = 500;
const MAX_HEIGHT_STEP = 0.35;
const MAX_CONTENT_FFS = 0.25;
const OPENING_PLAYBACK = 0.25;

async function sampleToggle(page: Page, trigger: Locator, box: Locator, windowMs = WINDOW_MS): Promise<Track> {
  const boxHandle = await box.elementHandle();
  return trigger.evaluate(
    (triggerElement, { boxElement, windowMs }) =>
      new Promise<Track>((resolve) => {
        const target = boxElement as HTMLElement;
        const track: Track = { height: [], opacity: [], inertAtFirstFrame: false };
        const read = () => {
          const body = target.querySelector<HTMLElement>(".ai-row-disclosure-body");
          track.height.push(target.getBoundingClientRect().height);
          track.opacity.push(body ? Number(getComputedStyle(body).opacity) : 0);
        };
        read();
        (triggerElement as HTMLElement).click();
        const start = performance.now();
        let first = true;
        const frame = () => {
          if (first) {
            track.inertAtFirstFrame = target.hasAttribute("inert");
            first = false;
          }
          read();
          if (performance.now() - start < windowMs) requestAnimationFrame(frame);
          else resolve(track);
        };
        requestAnimationFrame(frame);
      }),
    { boxElement: boxHandle, windowMs },
  );
}

function maxStepShare(values: number[]): number {
  const total = Math.abs(values[values.length - 1]! - values[0]!);
  if (total === 0) return 0;
  let max = 0;
  for (let i = 1; i < values.length; i += 1) max = Math.max(max, Math.abs(values[i]! - values[i - 1]!) / total);
  return max;
}

function firstStepShare(values: number[]): number {
  const total = Math.abs(values[values.length - 1]! - values[0]!);
  if (total === 0) return 0;
  const firstChange = values.findIndex((value, index) => index > 0 && value !== values[0]);
  return firstChange < 0 ? 0 : Math.abs(values[firstChange]! - values[0]!) / total;
}

async function openProvenance(page: Page) {
  await installHarnessRuntime(page);
  await mountHarnessVault(page);
  await page.goto("/en/architecture/?view=coverage");
  await expect(page.getByTestId("harness-coverage")).toBeVisible({ timeout: 30_000 });
  const trigger = page.getByTestId("harness-coverage-provenance");
  const box = page.locator(`#${(await trigger.getAttribute("aria-controls"))!.replace(/:/g, "\\:")}`);
  return { trigger, box };
}

test.describe("Disclosure motion", () => {
  test("provenance opens and closes on the row curve with no height jump", async ({ page }) => {
    const { trigger, box } = await openProvenance(page);

    const animation = await page.context().newCDPSession(page);
    await animation.send("Animation.enable");
    await animation.send("Animation.setPlaybackRate", { playbackRate: OPENING_PLAYBACK });
    const opening = await sampleToggle(page, trigger, box, WINDOW_MS / OPENING_PLAYBACK);
    await animation.send("Animation.setPlaybackRate", { playbackRate: 1 });
    expect(opening.height.at(-1)!).toBeGreaterThan(opening.height[0]!);
    expect(maxStepShare(opening.height)).toBeLessThanOrEqual(MAX_HEIGHT_STEP);
    expect(firstStepShare(opening.opacity)).toBeLessThanOrEqual(MAX_CONTENT_FFS);

    const closing = await sampleToggle(page, trigger, box);
    expect(closing.inertAtFirstFrame).toBe(true);
    expect(closing.height.at(-1)!).toBeLessThan(closing.height[0]!);
    expect(maxStepShare(closing.height)).toBeLessThanOrEqual(MAX_HEIGHT_STEP);
  });

  test("an immediate second key press reverses the disclosure", async ({ page }) => {
    const { trigger } = await openProvenance(page);
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Space");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  test("reduced motion sets the height at once and keeps the content fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { trigger, box } = await openProvenance(page);
    const opening = await sampleToggle(page, trigger, box);
    expect(maxStepShare(opening.height)).toBeGreaterThan(0.9);
    expect(opening.opacity.some((value) => value > 0 && value < 1)).toBe(true);
  });

  test("a field error opens below the field without a jump and is an alert", async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page, { seedRounds: false });
    await openRounds(page);
    await page.getByTestId("library-rounds-new").click();
    await page.getByTestId("automations-new").click();
    await page.getByTestId("library-rounds-cadence-unit").getByRole("radio", { name: "Day" }).click();
    const time = page.getByTestId("library-rounds-time");
    const box = page.locator(`[id="${await time.getAttribute("id")}-error-box"]`);
    await expect(box).toHaveAttribute("data-state", "closed");

    const track = await box.evaluate(
      (element, windowMs) =>
        new Promise<number[]>((resolve) => {
          const heights = [element.getBoundingClientRect().height];
          const start = performance.now();
          const frame = () => {
            heights.push(element.getBoundingClientRect().height);
            if (performance.now() - start < windowMs) requestAnimationFrame(frame);
            else resolve(heights);
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
    expect(track.at(-1)!).toBeGreaterThan(track[0]!);
    expect(maxStepShare(track)).toBeLessThanOrEqual(MAX_HEIGHT_STEP);
  });
});
