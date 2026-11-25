import { expect, test, type Page } from "@playwright/test";

import { CLAUDE, CLAUDE_LATER, bridgeCalls, failOnConsoleNoise, main, openWorkStatus, room, row, setPulse, working, type Row } from "./work-status-bridge";

/**
 * The file-change pulse on Work status, with the bridge stubbed: a room's light flashes once per
 * answer that carries a newly counted change, the words and the last-hour line say the same, and
 * the switch stops it. Rust's own counting is proven in `src-tauri/src/work_status/file_pulse/tests.rs`.
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

test.describe("work status file-change pulse", () => {
  failOnConsoleNoise();

  test("flashes a room's light once per answer that carries a new change, and says it in words", async ({ page }) => {
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
    await expect(a.locator("[data-room-tag]")).toContainText("changed just now");
    await expect(a.getByTestId("work-room-last-minute")).toHaveText("3 file changes in the last minute");
    await expect(a.locator("[data-tick]")).toHaveCount(1);
    await expect(a.locator("[data-tick]")).toHaveAttribute("data-height", "2");

    // Answers that carry nothing new flash nothing.
    await answered(page, 2);
    await expect(a).toHaveAttribute("data-room-flashes", "1");

    // The next change flashes once more, in its own element, so the one-shot plays again.
    await setPulse(page, changedNow("feat-pulse-a", 7));
    await expect(a).toHaveAttribute("data-room-flashes", "2");
    await expect(a.getByTestId("work-room-flash")).toHaveCount(1);
    await expect(a.locator("[data-tick]").last()).toHaveAttribute("data-height", "3");

    // The panel counts the minute and the hour, and says it counts only while the screen is open.
    await a.locator("[data-room-press]").click();
    const panel = page.getByTestId("work-room-panel-pulse");
    await expect(panel).toContainText("7 file changes in the last minute");
    await expect(panel).toContainText("in the last hour");
    await expect(panel).toContainText("Atlas counts only while Work status is open.");
  });

  test("keeps the light still under reduced motion while the words say the change", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWorkStatus(page, ROWS, {}, { pulse: { worktrees: quiet } });
    const a = room(page, "feat/pulse-a");
    await answered(page);
    await setPulse(page, changedNow("feat-pulse-a", 1));
    await expect(a).toHaveAttribute("data-room-flashes", "1");
    await expect(a.getByTestId("work-room-last-minute")).toHaveText("1 file change in the last minute");
    const flash = a.getByTestId("work-room-flash");
    expect(await flash.evaluate((element) => ({ running: element.getAnimations().length, opacity: getComputedStyle(element).opacity })), "the reduced flash").toEqual({ running: 0, opacity: "0" });
    expect(await a.locator("[data-tick]").evaluate((element) => element.getAnimations().length), "a tick that rises").toBe(0);
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
