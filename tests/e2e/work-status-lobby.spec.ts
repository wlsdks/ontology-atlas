import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * The lobby on Work status's ground floor: a few of the crew at a time, far apart, stopped while nobody can
 * see it and still under reduced motion, and never over a room's Moru.
 */

const NOW_S = Math.floor(Date.now() / 1000);
const SESSION = { pid: 101, start: NOW_S - 3 * 3600 };

function row(branch: string, patch: Record<string, unknown> = {}) {
  const id = branch.replace(/[^a-z0-9]+/gi, "-");
  return {
    id, path: `/Users/probe/repo/.claude/worktrees/${id}`, branch, head: "abc1234", mainCheckout: false, missing: false,
    standing: "ahead", ahead: 2, lastCommitAt: NOW_S - 600, lastCommitAuthor: "stark", lock: null, acpPid: null, agentProcesses: [],
    ...patch,
  };
}
const ROWS = [
  row("main", { id: "main", path: "/Users/probe/repo", mainCheckout: true, standing: "base", ahead: 0 }),
  row("feat/library-stage", {
    lock: { state: "live", tool: "claudeCode", agentId: "a101", pid: SESSION.pid, sessionStartedAt: SESSION.start, lockedAt: (NOW_S - 1800) * 1000 },
    agentProcesses: [{ pid: SESSION.pid, tool: "claudeCode", startedAt: SESSION.start }],
  }),
  ...["fix/old-topic", "feat/map-light", "docs/lobby", "chore/tidy", "feat/rest-one", "feat/rest-two"].map(branch => row(branch, { lastCommitAt: NOW_S - 9 * 86400 })),
];

async function openWorkStatus(page: Page, width: number, height: number) {
  await seedFirstRunSeen(page);
  await page.addInitScript((rows) => {
    const target = window as unknown as Record<string, unknown>;
    target.isTauri = true;
    target.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    target.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke(command: string) {
        const answer = (value: unknown) => new Promise(resolve => setTimeout(() => resolve(value), 60));
        if (command === "pick_source_directory") return answer("/Users/probe/repo");
        if (command === "work_status_fingerprint") return answer("v1");
        if (command === "work_status_activity_stamps") return answer({});
        if (command === "work_status_activity") return answer(null);
        if (command === "work_status_read") return answer({ status: "ready", root: "/Users/probe/repo", repository: "repo", host: "github.com", baseBranch: "main", worktrees: rows });
        return Promise.reject(new Error(`unstubbed native command: ${command}`));
      },
    };
  }, ROWS);
  await page.setViewportSize({ width, height });
  await page.goto("/en/work-status/");
  await page.getByTestId("work-status-choose").click();
  const canvas = page.getByTestId("work-lobby-canvas");
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toHaveAttribute("data-lobby-ready", "true", { timeout: 20_000 });
  return canvas;
}

type Stats = { running: boolean; visible: number; gap: number; peakKeptBytes: number };
const stats = (page: Page) =>
  page.getByTestId("work-lobby-canvas").evaluate((el) => (el as HTMLCanvasElement & { lobby: { stats(): Stats } }).lobby.stats());

test.describe("work status lobby", () => {
  for (const [width, height] of [[1512, 901], [1440, 900], [1920, 1080]] as const) {
    test(`shows a few Moru at a time, far apart, at ${width}px`, async ({ page }) => {
      const canvas = await openWorkStatus(page, width, height);
      await expect(canvas).toHaveAttribute("data-lobby-running", "true");
      await expect(page.getByTestId("work-lobby-note")).toHaveText(/says nothing about any worktree/);
      let most = 0, nearest = Infinity;
      for (let i = 0; i < 20; i++) {
        const now = await stats(page);
        most = Math.max(most, now.visible);
        if (Number.isFinite(now.gap)) nearest = Math.min(nearest, now.gap);
        await page.waitForTimeout(500);
      }
      expect(most, "Moru visible at once").toBeGreaterThanOrEqual(1);
      expect(most, "Moru visible at once").toBeLessThanOrEqual(5);
      // Middles at least a body (97px) apart in any lane: two playing together stand flipper to flipper.
      expect(nearest, "nearest two Moru, px").toBeGreaterThanOrEqual(80);
      // The lobby lies under every room, so no lobby Moru is drawn over a room's Moru.
      const lobbyTop = await canvas.evaluate((el) => el.getBoundingClientRect().top);
      const roomBottoms = await page.locator("[data-room-moru]").evaluateAll((els) => els.map((el) => el.closest("[data-room-key]")!.getBoundingClientRect().bottom));
      for (const bottom of roomBottoms) expect(bottom).toBeLessThanOrEqual(lobbyTop);
    });
  }

  test("stops while the window is hidden", async ({ page }) => {
    const canvas = await openWorkStatus(page, 1512, 901);
    await expect(canvas).toHaveAttribute("data-lobby-running", "true");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(canvas).toHaveAttribute("data-lobby-running", "false");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(canvas).toHaveAttribute("data-lobby-running", "true");
  });

  test("holds a still lobby under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const canvas = await openWorkStatus(page, 1512, 901);
    await expect(canvas).toHaveAttribute("data-lobby-running", "false");
    const shot = () => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    const first = await shot();
    expect((await stats(page)).visible).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(1500);
    expect(await shot()).toBe(first);
  });
});
