import { expect, test, type Page } from "@playwright/test";

import { CLAUDE, CLAUDE_LATER, bridgeCalls, failOnConsoleNoise, main, openWorkStatus, room, setLoad, working, type Row } from "./work-status-bridge";

/**
 * Load on Work status, with the bridge stubbed: a heavy room says its memory and CPU on its wall,
 * its panel lists the tools and one line for this Mac, a failed or first sample says so and shows
 * no number, the header warns only past its thresholds, and the switch removes it everywhere. Who
 * a process counts for is proven in `src-tauri/src/work_status/load/tests.rs`.
 */

const GB = 1_000_000_000;
const MB = 1_000_000;
const ROWS: Row[] = [main, working("feat/heavy", CLAUDE), working("feat/light", CLAUDE_LATER)];
const group = (tool: string, count: number, memoryBytes: number, cpuCores: number | null) => ({ tool, count, memoryBytes, cpuCores });

const MAC = { memoryUsedBytes: 41 * GB, memoryTotalBytes: 64 * GB, pressure: "normal", cpuCores: 4.2, coreCount: 18, gpuPercent: 31 };
const HEAVY = {
  memoryBytes: 2.4 * GB,
  cpuCores: 1.6,
  groups: [
    group("agent", 1, 600 * MB, 0.2), group("node", 4, 900 * MB, 0.9), group("rust", 2, 500 * MB, 0.4), group("java", 1, 200 * MB, 0.05),
    group("python", 1, 100 * MB, 0.02), group("git", 3, 60 * MB, 0.01), group("other", 2, 40 * MB, 0.02),
  ],
  agentsElsewhere: [],
};
const LIGHT = { memoryBytes: 300 * MB, cpuCores: 0.1, groups: [group("agent", 1, 300 * MB, 0.1)], agentsElsewhere: [{ pid: CLAUDE.pid, worktreeId: "feat-heavy" }] };

function sample(patch: Record<string, unknown> = {}, mac: Record<string, unknown> | null = MAC) {
  return { status: "read", worktrees: { "feat-heavy": HEAVY, "feat-light": LIGHT }, outside: [group("gradleDaemon", 1, 800 * MB, 0.3)], mac, ...patch };
}

/** Waits until the page has taken `more` samples beyond those it had taken when called. */
async function sampled(page: Page, more = 1) {
  const from = (await bridgeCalls(page)).loadSamples;
  await expect.poll(async () => (await bridgeCalls(page)).loadSamples, { timeout: 30_000 }).toBeGreaterThanOrEqual(from + more);
}

test.describe("work status load", () => {
  failOnConsoleNoise();

  test("says a heavy room's load on its wall, and its tools and this Mac in its panel", async ({ page }) => {
    await openWorkStatus(page, ROWS, {}, { load: sample() });
    const heavy = room(page, "feat/heavy");
    await expect(heavy.getByTestId("work-room-load-fact")).toHaveText("2.4 GB · CPU 1.6 cores");
    await expect(room(page, "feat/light").getByTestId("work-room-load-fact")).toHaveCount(0);

    await heavy.locator("[data-room-press]").click();
    const panel = page.getByTestId("work-room-panel-load");
    await expect(panel).toContainText("Memory 2.4 GB · CPU 1.6 of 18 cores");
    await expect(panel.getByTestId("work-room-panel-load-groups").locator("li")).toHaveCount(6);
    await expect(panel.getByTestId("work-room-panel-load-groups").locator("li").first()).toHaveText("Node.js ×4 · 900 MB · CPU 0.9");
    await expect(panel).toContainText("and 2 more kinds");
    await expect(panel.getByTestId("work-room-panel-mac")).toContainText("This Mac: memory 41.0 GB of 64.0 GB · CPU 4.2 of 18 cores · GPU 31%");
    await expect(panel.getByTestId("work-room-panel-mac")).toContainText("Running outside every room: Gradle daemon ×1");

    // A room whose agent counts in another folder says so, by the folder's branch.
    await room(page, "feat/light").locator("[data-room-press]").click();
    await expect(page.getByTestId("work-room-panel-load")).toContainText("itself is counted in feat/heavy, the folder it was started in.");
  });

  test("reads before the first CPU figure, says a failed sample failed, and says a missing GPU figure", async ({ page }) => {
    await openWorkStatus(page, ROWS, {}, { load: sample({ worktrees: { "feat-heavy": { ...HEAVY, cpuCores: null }, "feat-light": LIGHT } }, { ...MAC, gpuPercent: null }) });
    await room(page, "feat/heavy").locator("[data-room-press]").click();
    const panel = page.getByTestId("work-room-panel-load");
    await expect(panel).toContainText("Reading…");
    await expect(panel.getByTestId("work-room-panel-mac")).toContainText("This Mac did not report GPU use.");
    await expect(panel.getByTestId("work-room-panel-mac")).not.toContainText("GPU 0%");

    await setLoad(page, { status: "failed", worktrees: {}, outside: [], mac: null });
    await expect(panel.getByTestId("work-room-panel-load-failed")).toHaveText(
      "Atlas could not read load from macOS just now and tries again in 5 seconds. Everything else in this room is unaffected.",
    );
    await expect(room(page, "feat/heavy").getByTestId("work-room-load-fact")).toHaveCount(0);
    await expect(page.getByTestId("work-status-alert-memory")).toHaveCount(0);
  });

  test("warns in the header only past its thresholds, and points at the rooms using the most", async ({ page }) => {
    await openWorkStatus(page, ROWS, {}, { load: sample({}, { ...MAC, pressure: "warning", cpuCores: 18 }) });
    // Memory warns on macOS's own level after two samples; CPU only after six at full.
    await sampled(page, 2);
    const memory = page.getByTestId("work-status-alert-memory");
    await expect(memory).toHaveText("Memory is running low");
    await expect(page.getByTestId("work-status-alert-cpu")).toHaveCount(0);
    await memory.click();
    await expect(room(page, "feat/heavy")).toHaveAttribute("data-flash", "true");

    // A failed sample clears every warning: Atlas says less, never more.
    await setLoad(page, { status: "failed", worktrees: {}, outside: [], mac: null });
    await expect(memory).toHaveCount(0);
  });

  test("removes load from every room and the header at its switch, and brings it back", async ({ page }) => {
    await openWorkStatus(page, ROWS, {}, { load: sample() });
    const heavy = room(page, "feat/heavy");
    await expect(heavy.getByTestId("work-room-load-fact")).toBeVisible();

    await page.getByTestId("work-status-reads-open").click();
    const row = page.getByTestId("work-status-read-load");
    await row.getByRole("radio", { name: "Off" }).click();
    await expect(page.getByTestId("work-status-load-now")).toHaveText("Atlas does not read memory, CPU or GPU use, so no room or heading shows them.");
    await expect(heavy.getByTestId("work-room-load-fact")).toHaveCount(0);
    await expect.poll(async () => (await bridgeCalls(page)).loadOn).toBe(false);
    await page.keyboard.press("Escape");
    await heavy.locator("[data-room-press]").click();
    await expect(page.getByTestId("work-room-panel")).toBeVisible();
    await expect(page.getByTestId("work-room-panel-load")).toHaveCount(0);

    await page.getByTestId("work-status-reads-open").click();
    await row.getByRole("radio", { name: "On" }).click();
    await expect.poll(async () => (await bridgeCalls(page)).loadOn).toBe(true);
    await expect(heavy.getByTestId("work-room-load-fact")).toBeVisible();
  });
});
