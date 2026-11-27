import { expect, test, type Page } from "@playwright/test";

import { waitForAnimationsDone } from "./settle";
import { CLAUDE, CLAUDE_LATER, bridgeCalls, failOnConsoleNoise, main, openWorkStatus, room, row, setPulse, working, type Row } from "./work-status-bridge";

/**
 * The file-change pulse on Work status, with the bridge stubbed: a room's light flares and a spark
 * runs once round its frame for a newly counted change, at most once in `FLASH_MIN_GAP_MS`; the
 * words and the last-hour line say every change, and the switch stops it. Rust's own counting is
 * proven in `src-tauri/src/work_status/file_pulse/tests.rs`.
 */

const STEP_MS = 10_000;
const ROWS: Row[] = [main, working("feat/pulse-a", CLAUDE), working("feat/pulse-b", CLAUDE_LATER), row("feat/no-agent")];
const watched = (lastChangeAtMs: number | null, steps: { atMs: number; count: number }[] = []) => ({ watched: true, lastChangeAtMs, steps });
const quiet = { "feat-pulse-a": watched(null), "feat-pulse-b": watched(null), "feat-no-agent": watched(null) };

/** A change counted now in `key`: the step it falls in carries `count`. */
function changedNow(key: string, count: number, base: Record<string, unknown> = quiet) {
  const nowMs = Date.now();
  return { worktrees: { ...base, [key]: watched(nowMs, [{ atMs: Math.floor(nowMs / STEP_MS) * STEP_MS, count }]) } };
}

/** Waits until the page has asked for the pulse `more` times beyond what it had asked when called. */
async function answered(page: Page, more = 1) {
  const from = (await bridgeCalls(page)).pulseAsks;
  await expect.poll(async () => (await bridgeCalls(page)).pulseAsks).toBeGreaterThanOrEqual(from + more);
}

/** Animations running anywhere on the page: none while nothing happens. */
const runningAnimations = (page: Page) => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length);

interface PulseFrame { at: number; round: number; flare: number; elsewhere: number }

/**
 * Samples every frame from now on: how far round the frame the spark's head in `branch`'s room has
 * come (each edge's travel, held to its length), its flare's opacity, and how many animations run
 * in the other rooms.
 */
async function startPulseSampler(page: Page, branch: string) {
  await page.evaluate((name) => {
    const frames: PulseFrame[] = [];
    const target = window as unknown as { __pulseFrames: PulseFrame[]; __pulseStop: boolean };
    target.__pulseFrames = frames;
    target.__pulseStop = false;
    const rooms = () => [...document.querySelectorAll<HTMLElement>("[data-testid=work-room]")];
    // An edge whose run has ended goes back off its start, so each edge keeps the furthest it came.
    const furthest = new Map<string, number>();
    const tick = (at: number) => {
      if (target.__pulseStop) return;
      const mine = rooms().find((element) => element.textContent?.includes(name));
      const spark = mine?.querySelector<HTMLElement>("[data-testid=work-room-flash]");
      let round = 0;
      for (const edge of spark?.querySelectorAll<HTMLElement>("[data-edge]") ?? []) {
        const across = edge.dataset.edge === "top" || edge.dataset.edge === "bottom";
        const matrix = new DOMMatrix(getComputedStyle(edge).transform);
        const length = across ? spark!.offsetWidth : spark!.offsetHeight;
        const sparkPx = across ? edge.offsetWidth : edge.offsetHeight;
        const shift = across ? matrix.m41 : matrix.m42;
        const travelled = edge.dataset.edge === "top" || edge.dataset.edge === "right" ? shift + sparkPx : sparkPx - shift;
        furthest.set(edge.dataset.edge!, Math.max(furthest.get(edge.dataset.edge!) ?? 0, Math.min(length, travelled)));
        round += furthest.get(edge.dataset.edge!)!;
      }
      const flare = spark?.previousElementSibling;
      frames.push({
        at,
        round,
        flare: flare ? Number(getComputedStyle(flare).opacity) : 0,
        elsewhere: rooms().filter((element) => element !== mine).reduce((sum, element) => sum + element.getAnimations({ subtree: true }).length, 0),
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, branch);
}

const stopPulseSampler = (page: Page) => page.evaluate(() => {
  const target = window as unknown as { __pulseFrames: PulseFrame[]; __pulseStop: boolean };
  target.__pulseStop = true;
  return target.__pulseFrames;
});

/**
 * The spark's head goes round at one pace, in px per ms so a late frame is no jump: no step more
 * than twice the median, none backwards, and no still frame between its first and last move. The
 * flare's opacity never moves more than a quarter in one 60 Hz frame's time.
 */
function pulseJumps(frames: PulseFrame[]): string[] {
  const steps = frames.slice(1).map((frame, index) => ({
    at: Math.round(frame.at - frames[0].at),
    dt: Math.max(1, frame.at - frames[index].at),
    px: frame.round - frames[index].round,
    flare: Math.abs(frame.flare - frames[index].flare),
  }));
  const moving = steps.filter((step) => step.px > 0);
  const median = moving.map((step) => step.px / step.dt).sort((a, b) => a - b)[Math.floor(moving.length / 2)] ?? 0;
  const [first, last] = [steps.findIndex((step) => step.px > 0), steps.findLastIndex((step) => step.px > 0)];
  return steps.flatMap((step, index) => [
    ...(step.px / step.dt > 2 * median ? [`spark ${(step.px / step.dt).toFixed(2)}px/ms at ${step.at}ms, median ${median.toFixed(2)}`] : []),
    ...(index > first && index < last && step.px === 0 ? [`spark stood still at ${step.at}ms`] : []),
    ...(step.px < 0 ? [`spark went back at ${step.at}ms`] : []),
    ...(step.flare / step.dt > 0.25 / 16.7 ? [`flare moved ${step.flare.toFixed(2)} in ${step.dt.toFixed(0)}ms at ${step.at}ms`] : []),
  ]);
}

test.describe("work status file-change pulse", () => {
  failOnConsoleNoise();

  test("flashes a room's light for a new change, at most once in its quiet window, and says each in words", async ({ page }) => {
    await openWorkStatus(page, ROWS, {}, { pulse: { worktrees: quiet } });
    const a = room(page, "feat/pulse-a");
    const b = room(page, "feat/pulse-b");
    await answered(page);
    await expect(a).toHaveAttribute("data-room-flashes", "0");

    await setPulse(page, changedNow("feat-pulse-a", 3));
    await expect(a).toHaveAttribute("data-room-flashes", "1");
    await expect(a.getByTestId("work-room-flash")).toHaveCount(1);
    await expect(b).toHaveAttribute("data-room-flashes", "0");
    await expect(b.getByTestId("work-room-flash")).toHaveCount(0);
    await expect(a.getByTestId("work-room-facts")).toContainText("changed just now");
    await expect(a.getByTestId("work-room-last-minute")).toHaveText("3 file changes in the last minute");
    await expect(a.locator("[data-tick]")).toHaveCount(1);
    await expect(a.locator("[data-tick]")).toHaveAttribute("data-height", "2");

    // Answers that carry nothing new flash nothing.
    await answered(page, 2);
    await expect(a).toHaveAttribute("data-room-flashes", "1");

    // A change inside the flash's quiet window says itself in words and ticks, and does not flash.
    await setPulse(page, changedNow("feat-pulse-a", 7));
    await expect(a.locator("[data-tick]").last()).toHaveAttribute("data-height", "3");
    await expect(a).toHaveAttribute("data-room-flashes", "1");

    // The panel counts the minute and the hour, and says it counts only while the screen is open.
    await a.locator("[data-room-press]").click();
    const panel = page.getByTestId("work-room-panel-pulse");
    await expect(panel).toContainText("7 file changes in the last minute");
    await expect(panel).toContainText("in the last hour");
    await expect(panel).toContainText("Atlas counts only while Workshop is open.");
  });

  test("pulses only the room whose files changed, round its frame at one pace, then runs nothing", async ({ page }) => {
    await openWorkStatus(page, ROWS, {}, { pulse: { worktrees: quiet } });
    const a = room(page, "feat/pulse-a");
    await answered(page);
    await waitForAnimationsDone(page.getByTestId("work-building"));
    expect(await runningAnimations(page), "animations running before any change").toBe(0);

    await startPulseSampler(page, "feat/pulse-a");
    await setPulse(page, changedNow("feat-pulse-a", 3));
    await expect(a).toHaveAttribute("data-room-flashes", "1");
    await expect(a.locator("[data-scene]")).toHaveAttribute("data-fresh", "true");
    await waitForAnimationsDone(page.getByTestId("work-building"));
    const frames = await stopPulseSampler(page);

    const roundPx = await a.getByTestId("work-room-flash").evaluate((spark) => 2 * ((spark as HTMLElement).offsetWidth + (spark as HTMLElement).offsetHeight));
    expect(Math.max(...frames.map((frame) => frame.round)), "how far round the frame the spark came").toBeCloseTo(roundPx, 0);
    expect(Math.max(...frames.map((frame) => frame.flare)), "the flare's brightest frame").toBeGreaterThan(0.9);
    expect(Math.max(...frames.map((frame) => frame.elsewhere)), "animations in the rooms whose files did not change").toBe(0);
    expect(pulseJumps(frames).slice(0, 6), "frames where the pulse jumped or stood still").toEqual([]);
    expect(await runningAnimations(page), "animations running once the pulse has played").toBe(0);
  });

  test("plays one spark for a burst of five changes, keeps the room fresh, then runs nothing", async ({ page }) => {
    await openWorkStatus(page, ROWS, {}, { pulse: { worktrees: quiet } });
    const a = room(page, "feat/pulse-a");
    await answered(page);
    await waitForAnimationsDone(page.getByTestId("work-building"));
    await a.evaluate((element) => {
      const target = window as unknown as { __sparksMounted: number };
      target.__sparksMounted = 0;
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof HTMLElement && node.matches("[data-testid=work-room-flash]")) target.__sparksMounted += 1;
          }
        }
      }).observe(element, { childList: true, subtree: true });
    });

    for (let change = 1; change <= 5; change += 1) {
      await setPulse(page, changedNow("feat-pulse-a", change));
      await answered(page);
    }
    await expect(a.getByTestId("work-room-last-minute")).toHaveText("5 file changes in the last minute");
    await expect(a.locator("[data-scene]")).toHaveAttribute("data-fresh", "true");
    await expect(a).toHaveAttribute("data-room-flashes", "1");
    expect(await page.evaluate(() => (window as unknown as { __sparksMounted: number }).__sparksMounted), "sparks the burst played").toBe(1);
    await waitForAnimationsDone(page.getByTestId("work-building"));
    expect(await runningAnimations(page), "animations running once the burst has been said").toBe(0);
  });

  test("raises the light without motion under reduced motion while the words say the change", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWorkStatus(page, ROWS, {}, { pulse: { worktrees: quiet } });
    const a = room(page, "feat/pulse-a");
    await answered(page);
    await setPulse(page, changedNow("feat-pulse-a", 1));
    await expect(a).toHaveAttribute("data-room-flashes", "1");
    await expect(a.getByTestId("work-room-last-minute")).toHaveText("1 file change in the last minute");
    // The pulse becomes a still, brighter light for the minute the change is new.
    const scene = a.locator("[data-scene]");
    await expect(scene).toHaveAttribute("data-fresh", "true");
    expect(await a.getByTestId("work-room-flash").evaluate((element) => getComputedStyle(element).display), "the reduced spark").toBe("none");
    expect(await scene.evaluate((element) => getComputedStyle(element.querySelector(":scope > [data-room-light]")!, "::after").opacity), "the raised light").toBe("1");
    expect(await runningAnimations(page), "animations running under reduced motion").toBe(0);
  });

  test("says when files change where no agent works, and when macOS cannot watch a folder", async ({ page }) => {
    const nowMs = Date.now();
    await openWorkStatus(page, ROWS, {}, {
      pulse: { worktrees: { ...quiet, "feat-no-agent": watched(nowMs, [{ atMs: Math.floor(nowMs / STEP_MS) * STEP_MS, count: 1 }]), "feat-pulse-b": { watched: false, lastChangeAtMs: null, steps: [] } } },
    });
    const unheld = room(page, "feat/no-agent");
    await expect(unheld.getByTestId("work-room-status")).toContainText("Files are changing here, and Atlas sees no agent in this folder.");
    await expect(unheld.getByTestId("work-room-light")).toHaveCount(1);

    await room(page, "feat/pulse-b").locator("[data-room-press]").click();
    await expect(page.getByTestId("work-room-panel-pulse")).toHaveText("macOS could not watch this folder, so this room shows a change only when Atlas reads Git.");
    await room(page, "feat/pulse-a").locator("[data-room-press]").click();
    await expect(page.getByTestId("work-room-panel-pulse")).toContainText("No file change was counted here in the last hour.");
  });

  test("stops the pulse at its switch and starts it again", async ({ page }) => {
    await openWorkStatus(page, ROWS, {}, { pulse: changedNow("feat-pulse-a", 2) });
    const a = room(page, "feat/pulse-a");
    await expect(a.locator("[data-tick]")).toHaveCount(1);

    await page.getByTestId("work-status-reads-open").click();
    const reads = page.getByTestId("work-status-read-pulse");
    await expect(page.getByTestId("work-status-pulse-now")).toHaveText("Lights the room and counts changes as files change.");
    await reads.getByRole("radio", { name: "Off" }).click();
    await expect(page.getByTestId("work-status-pulse-now")).toContainText("Atlas does not watch for file changes.");
    await expect(a.locator("[data-tick]")).toHaveCount(0);
    await expect.poll(async () => (await bridgeCalls(page)).pulseOn).toBe(false);
    const asked = (await bridgeCalls(page)).pulseAsks;

    await reads.getByRole("radio", { name: "On" }).click();
    await expect.poll(async () => (await bridgeCalls(page)).pulseAsks).toBeGreaterThan(asked);
    await expect(a.locator("[data-tick]")).toHaveCount(1);
    // The changes Rust kept are not new to the screen, so turning it on flashes nothing.
    await expect(a).toHaveAttribute("data-room-flashes", "0");
  });
});
