import { expect, test, type Page } from "@playwright/test";

import { CLAUDE, CLAUDE_LATER, NOW_S, bridgeCalls, failOnConsoleNoise, main, openWorkStatus, room, row, setSessions, working, type Activity, type Row } from "./work-status-bridge";

/**
 * The Workshop by session (`docs/specs/2026-11-25-workshop-sessions-view.md`), with the bridge
 * stubbed: one block per session from what the page already reads, a shared folder's changes never
 * shown as one session's, each session's own state, the switch remembered and the building one
 * press away. Which sessions a projection finds is proven in `signals/session-board.test.ts`.
 */

const PLANTED = "ATLAS_PLANTED_7f3c";
/** A session name, apart from the planted file name, so a check for one never meets the other. */
const PLANTED_NAME = "ATLAS_NAME_91ab";
const claude = (pid: number, agoS: number) => ({ pid, tool: "claudeCode", startedAt: NOW_S - agoS });
const locked = (session: typeof CLAUDE, minutesAgo: number) => ({
  state: "live", tool: "claudeCode", agentId: `a${session.pid}`, pid: session.pid, sessionStartedAt: session.start, lockedAt: (NOW_S - minutesAgo * 60) * 1000,
});
const HELD = ["feat/held-a", "feat/held-b", "feat/held-c", "feat/held-d", "feat/held-e"];

const ROWS: Row[] = [
  main,
  working("feat/solo", CLAUDE),
  row("feat/shared", { agentProcesses: [claude(201, 3600), claude(202, 1800)] }),
  ...HELD.map((branch, index) => row(branch, { lock: locked(CLAUDE_LATER, 30 - index), agentProcesses: index === 0 ? [claude(CLAUDE_LATER.pid, 7200)] : [] })),
  row("feat/nobody"),
];
const files = (names: string[]) => names.map((name, index) => ({ path: `src/a/${name}`, changedAt: NOW_S - 60 * (index + 1) }));
const ACTIVITY: Activity = {
  "feat-solo": { commits: [{ hash: "s1", subject: "feat: the solo session's newest commit", at: NOW_S - 300 }], uncommitted: 3, latestFile: "src/a/one.ts", onBase: false, files: files(["one.ts", "two.ts", "three.ts"]) },
  "feat-shared": { commits: null, uncommitted: 12, latestFile: `src/a/${PLANTED}.ts`, onBase: false, files: files([`${PLANTED}.ts`, ...Array.from({ length: 11 }, (_, index) => `f${index}.ts`)]) },
};
const LISTED = [
  { worktreeId: "feat-solo", pid: CLAUDE.pid, state: "working", name: "solo work" },
  { worktreeId: "feat-shared", pid: 201, state: "waitingApproval", name: "first in shared" },
  { worktreeId: "feat-shared", pid: 202, state: "working", name: "second in shared" },
  { worktreeId: "feat-held-a", pid: CLAUDE_LATER.pid, state: "replied", name: "holds five" },
];

const blocks = (page: Page) => page.getByTestId("work-session-block");
const block = (page: Page, name: string) => blocks(page).filter({ has: page.getByTestId("work-session-block-name").getByText(name, { exact: true }) });

async function openBySession(page: Page, listed: unknown[] = LISTED, rows: Row[] = ROWS) {
  await openWorkStatus(page, rows, ACTIVITY);
  await setSessions(page, listed);
  await page.getByTestId("work-status-arrange-session").click();
  await expect(page.getByTestId("work-session-board").or(page.getByTestId("work-session-none"))).toBeVisible();
}

test.describe("work status by session", () => {
  failOnConsoleNoise();

  test("draws each session once, shows a folder's changes only where one session has it, and opens a shared one's panel", async ({ page }) => {
    await openBySession(page);
    await expect(blocks(page)).toHaveCount(4);
    await expect(page.getByTestId("work-room").first()).toBeHidden();

    // A session alone in its folder shows that folder's own facts and newest commits.
    const solo = block(page, "solo work");
    await expect(solo.getByTestId("work-session-folder-facts")).toContainText("3 files changed, not committed");
    await expect(solo.getByTestId("work-session-folder-commits")).toContainText("the solo session's newest commit");

    // Two sessions in one folder: each says its own state, neither shows the folder's figures.
    const first = block(page, "first in shared");
    const second = block(page, "second in shared");
    await expect(first.getByTestId("work-session-block-state")).toContainText("Waiting for your approval");
    await expect(second.getByTestId("work-session-block-state")).toContainText("Working");
    await expect(first.getByTestId("work-session-folder-facts")).toHaveText("Shared with second in shared");
    await expect(second.getByTestId("work-session-folder-facts")).toHaveText("Shared with first in shared");
    await expect(page.getByTestId("work-session-board")).not.toContainText(PLANTED);
    await expect(page.getByTestId("work-session-board")).not.toContainText("12 files");

    // Its panel shows the folder's changes once, and both sessions; Escape returns to the row pressed.
    const shared = first.getByTestId("work-session-folder");
    await shared.click();
    const panel = page.getByTestId("work-room-panel");
    await expect(panel).toContainText(PLANTED);
    await expect(panel.getByTestId("work-session-line")).toHaveCount(2);
    await expect(shared).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(shared).toBeFocused();
    await expect(page.getByTestId("work-session-without")).toHaveText("1 folder without a session");
  });

  test("frames a waiting session, counts sessions in the header and keeps every block in place when the wait moves", async ({ page }) => {
    await openBySession(page);
    await expect(block(page, "first in shared")).toHaveAttribute("data-waiting", "true");
    const order = await page.getByTestId("work-session-block-name").allTextContents();
    const alert = page.getByTestId("work-status-alert-waiting");
    await expect(alert).toHaveText("1 waiting for you");
    await alert.click();
    await expect(block(page, "first in shared")).toHaveAttribute("data-flash", "true");
    await expect(page.getByTestId("work-room").first()).toBeHidden();

    await setSessions(page, LISTED.map(each => (each.pid === 201 ? { ...each, state: "working" } : each.pid === CLAUDE.pid ? { ...each, state: "waitingAnswer" } : each)));
    await expect(block(page, "solo work")).toHaveAttribute("data-waiting", "true");
    await expect(block(page, "first in shared")).toHaveAttribute("data-waiting", "false");
    expect(await page.getByTestId("work-session-block-name").allTextContents()).toEqual(order);
  });

  test("lists three of a session's folders and shows the rest by folder, outlined", async ({ page }) => {
    await openBySession(page);
    const holder = block(page, "holds five");
    await expect(holder.getByTestId("work-session-folder")).toHaveCount(3);
    await holder.getByTestId("work-session-more-folders").click();
    await expect(page.getByTestId("work-session-board")).toHaveCount(0);
    await expect(page.getByTestId("work-status-arrange-folder")).toHaveAttribute("aria-selected", "true");
    for (const branch of HELD) await expect(room(page, branch).first()).toHaveAttribute("data-flash", "true");
  });

  test("says less when the session list says nothing, and shows no name with names off", async ({ page }) => {
    await openBySession(page, []);
    await expect(blocks(page)).toHaveCount(4);
    await expect(page.getByTestId("work-session-block-name")).toHaveText(["Claude Code 1", "Claude Code 2", "Claude Code 3", "Claude Code 4"]);
    for (const state of await page.getByTestId("work-session-block-state").allTextContents()) expect(state).toMatch(/^(Working|Resting)/);

    await setSessions(page, LISTED.map(each => ({ ...each, name: PLANTED_NAME })));
    await expect(page.getByTestId("work-session-board")).toContainText(PLANTED_NAME);
    await page.getByTestId("work-status-reads-open").click();
    await page.getByTestId("work-status-read-names").getByRole("radio", { name: "Off" }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toContainText(PLANTED_NAME);
  });

  test("remembers the choice and nothing else, and keeps the building one press away", async ({ page }) => {
    await openBySession(page, LISTED.map(each => ({ ...each, name: PLANTED_NAME })));
    const before = (await bridgeCalls(page)).sent.length;
    await block(page, PLANTED_NAME).first().getByTestId("work-session-folder").first().click();
    await page.keyboard.press("Escape");

    const kept = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), location.pathname]));
    expect(kept.includes(PLANTED_NAME), "a session name in storage or the address").toBe(false);
    expect(kept.includes(String(CLAUDE.pid)), "a pid in storage or the address").toBe(false);
    expect(await page.evaluate(() => localStorage.getItem("atlas.workStatus.arrangeBy"))).toBe("session");
    expect(new URL(page.url()).pathname).toBe("/en/work-status/");
    // Arranging by session asks the bridge nothing By folder does not.
    const sent = (await bridgeCalls(page)).sent.slice(before);
    expect(sent.filter(each => each.includes(PLANTED_NAME))).toEqual([]);

    await page.reload();
    await page.getByTestId("work-status-choose").click();
    await expect(page.getByTestId("work-session-board").or(page.getByTestId("work-session-none"))).toBeVisible();
    await page.getByTestId("work-status-arrange-folder").click();
    await expect(room(page, "feat/solo")).toBeVisible();

    await page.evaluate(() => localStorage.setItem("atlas.workStatus.arrangeBy", "sideways"));
    await page.reload();
    await page.getByTestId("work-status-choose").click();
    await expect(room(page, "feat/solo")).toBeVisible();
    await expect(page.getByTestId("work-status-arrange-folder")).toHaveAttribute("aria-selected", "true");
  });

  test("shows each session's own memory and CPU, sends session pids only By session, and drops them with load off", async ({ page }) => {
    const MB = 1_000_000;
    const group = (tool: string, count: number, megabytes: number) => ({ tool, count, memoryBytes: megabytes * MB, cpuCores: 0.1 });
    const own = (megabytes: number, cpuCores: number, groups: unknown[]) => ({ memoryBytes: megabytes * MB, cpuCores, groups });
    const load = {
      status: "read", worktrees: {}, outside: [], mac: null,
      sessions: {
        [CLAUDE.pid]: own(1200, 0.4, [group("agent", 1, 600), group("node", 3, 500), group("rust", 1, 100)]),
        201: own(700, 0.2, [group("agent", 1, 700)]),
        202: own(300, 1.5, [group("agent", 1, 200), group("git", 2, 100)]),
      },
    };
    const loadAsks = async () => (await bridgeCalls(page)).sent.map(each => JSON.parse(each) as { sessionPids?: number[] }).filter(each => each.sessionPids !== undefined);
    await openWorkStatus(page, ROWS, ACTIVITY, { load });
    await setSessions(page, LISTED);
    await expect.poll(async () => (await loadAsks()).length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect((await loadAsks()).every(ask => ask.sessionPids?.length === 0), "By folder sends no session pid").toBe(true);

    await page.getByTestId("work-status-arrange-session").click();
    await expect.poll(async () => (await loadAsks()).at(-1)?.sessionPids ?? [], { timeout: 30_000 })
      .toEqual(expect.arrayContaining([CLAUDE.pid, 201, 202, CLAUDE_LATER.pid]));
    const solo = block(page, "solo work").getByTestId("work-session-block-load");
    await expect(solo.locator("span")).toHaveText(["Memory 1.2 GB", "CPU 0.4 cores", "Node.js ×3 · Rust build ×1"]);
    // Two sessions in one folder: each its own tree, neither a share of the folder.
    await expect(block(page, "first in shared").getByTestId("work-session-block-load")).toContainText("CPU 0.2 cores");
    await expect(block(page, "first in shared").getByTestId("work-session-block-load")).not.toContainText("×");
    await expect(block(page, "second in shared").getByTestId("work-session-block-load").locator("span")).toHaveText(["Memory 300 MB", "CPU 1.5 cores", "Git ×2"]);
    // A session Rust did not answer for shows no line rather than a zero.
    await expect(block(page, "holds five").getByTestId("work-session-block-load")).toHaveCount(0);

    await page.getByTestId("work-status-reads-open").click();
    await page.getByTestId("work-status-read-load").getByRole("radio", { name: "Off" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("work-session-block-load")).toHaveCount(0);
  });

  test("says no session works here when only worktrees nobody holds remain", async ({ page }) => {
    await openBySession(page, [], [main, row("feat/nobody"), row("feat/left", { lock: { ...locked(CLAUDE, 5), state: "stale" } })]);
    await expect(page.getByTestId("work-session-none")).toContainText("No agent session is working in repo");
    await expect(page.getByTestId("work-session-without")).toHaveText("2 folders without a session");
  });
});
