import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * Work status in the app, with the two native reads stubbed: the rooms a person sees for a
 * repository's worktrees, the shelf's list, a merge reaching the shelf, and the empty building.
 */

const NOW_S = Math.floor(Date.now() / 1000);
const CLAUDE = { pid: 101, start: NOW_S - 3 * 3600 };
const CLAUDE_LATER = { pid: 102, start: NOW_S - 2 * 3600 };

type Row = Record<string, unknown>;

function row(branch: string, patch: Row = {}): Row {
  const id = branch.replace(/[^a-z0-9]+/gi, "-");
  return {
    id, path: `/Users/probe/repo/.claude/worktrees/${id}`, branch, head: "abc1234", mainCheckout: false, missing: false,
    standing: "ahead", ahead: 2, lastCommitAt: NOW_S - 600, lastCommitAuthor: "stark", lock: null, acpPid: null, agentProcesses: [],
    ...patch,
  };
}

const main = row("main", { id: "main", path: "/Users/probe/repo", mainCheckout: true, standing: "base", ahead: 0 });
const lock = (session: typeof CLAUDE) => ({
  state: "live", tool: "claudeCode", agentId: `a${session.pid}`, pid: session.pid, sessionStartedAt: session.start, lockedAt: (NOW_S - 1800) * 1000,
});
const working = (branch: string, session: typeof CLAUDE) =>
  row(branch, { lock: lock(session), agentProcesses: [{ pid: session.pid, tool: "claudeCode", startedAt: session.start }] });

const SIX = [
  main,
  working("feat/library-stage", CLAUDE),
  working("feat/work-status-rooms", CLAUDE_LATER),
  row("feat/map-light", { agentProcesses: [{ pid: 301, tool: "codex", startedAt: NOW_S - 3600 }] }),
  row("feat/harness-tab", { lock: { ...lock(CLAUDE), state: "stale", pid: 999 } }),
  row("fix/old-topic", { lastCommitAt: NOW_S - 9 * 86400 }),
  row("fix/rail-tooltip", { standing: "merged", ahead: 0 }),
];

async function openWorkStatus(page: Page, rows: Row[]) {
  await seedFirstRunSeen(page);
  await page.addInitScript((initial: Row[]) => {
    const state = { rows: initial, version: 1 };
    const target = window as unknown as Record<string, unknown>;
    target.__workStatusRows = (next: Row[]) => { state.rows = next; state.version += 1; };
    target.isTauri = true;
    target.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    target.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke(command: string) {
        const answer = (value: unknown) => new Promise(resolve => setTimeout(() => resolve(value), 60));
        if (command === "pick_source_directory") return answer("/Users/probe/repo");
        if (command === "work_status_fingerprint") return answer(`v${state.version}`);
        if (command === "work_status_read") {
          return answer({ status: "ready", root: "/Users/probe/repo", repository: "repo", host: "github.com", baseBranch: "main", worktrees: structuredClone(state.rows) });
        }
        return Promise.reject(new Error(`unstubbed native command: ${command}`));
      },
    };
  }, rows);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/en/work-status/");
  await page.getByTestId("work-status-choose").click();
}

const room = (page: Page, branch: string) => page.getByTestId("work-room").filter({ hasText: branch });

test.describe("work status rooms", () => {
  test("puts attention and work on the stage and counts the rest on the shelf", async ({ page }) => {
    await openWorkStatus(page, SIX);

    await expect(page.getByTestId("work-room")).toHaveCount(4);
    for (const branch of ["feat/harness-tab", "feat/library-stage", "feat/work-status-rooms", "feat/map-light"]) {
      await expect(room(page, branch)).toHaveAttribute("data-room-size", "large");
    }
    await expect(room(page, "feat/harness-tab")).toHaveAttribute("data-room-state", "lockLeft");
    await expect(room(page, "feat/library-stage")).toContainText("Claude Code 1");
    await expect(room(page, "feat/work-status-rooms")).toContainText("Claude Code 2");
    await expect(page.getByTestId("work-building").locator("details, summary")).toHaveCount(0);

    await page.getByTestId("work-shelf-untouched").click();
    const list = page.getByTestId("work-shelf-list");
    await expect(list).toContainText("fix/old-topic");
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
  });

  test("moves a merged worktree to the shelf and keeps the other session's name", async ({ page }) => {
    await openWorkStatus(page, SIX);
    await expect(page.getByTestId("work-shelf-merged")).toContainText("1");

    await page.evaluate((next) => (window as unknown as { __workStatusRows: (rows: unknown[]) => void }).__workStatusRows(next), [
      ...SIX.filter((entry) => entry.branch !== "feat/library-stage"),
      row("feat/library-stage", { standing: "merged", ahead: 0 }),
    ]);

    await expect(room(page, "feat/library-stage")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId("work-shelf-merged")).toContainText("2");
    await expect(room(page, "feat/work-status-rooms")).toContainText("Claude Code 2");
  });

  test("shows one room for the base branch when no worktree exists", async ({ page }) => {
    await openWorkStatus(page, [main]);
    await expect(page.getByTestId("work-empty-room")).toContainText("Only main for now");
    await expect(page.getByTestId("work-room")).toHaveCount(0);
  });
});
