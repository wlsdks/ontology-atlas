import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **Work status's desktop bridge, stubbed** — shared by every Work status spec.
 *
 * The installed app runs this same static export, so answering the commands the screen calls
 * exercises the real page model and rooms. It lives beside the specs because three specs need it,
 * and a second copy is a second fixture that drifts. Each `window.__workStatus*` hook changes what
 * the next answer holds; `__workStatusCalls` counts what the page asked and keeps every argument it
 * sent, so a spec can prove what never left the screen.
 */

export const NOW_S = Math.floor(Date.now() / 1000);
export const CLAUDE = { pid: 101, start: NOW_S - 3 * 3600 };
export const CLAUDE_LATER = { pid: 102, start: NOW_S - 2 * 3600 };

export type Row = Record<string, unknown>;

export function row(branch: string, patch: Row = {}): Row {
  const id = branch.replace(/[^a-z0-9]+/gi, "-");
  return {
    id, path: `/Users/probe/repo/.claude/worktrees/${id}`, branch, head: "abc1234", mainCheckout: false, missing: false,
    standing: "ahead", ahead: 2, lastCommitAt: NOW_S - 600, lastCommitAuthor: "stark", lock: null, acpPid: null, agentProcesses: [],
    ...patch,
  };
}

export const main = row("main", { id: "main", path: "/Users/probe/repo", mainCheckout: true, standing: "base", ahead: 0 });
export const lock = (session: typeof CLAUDE) => ({
  state: "live", tool: "claudeCode", agentId: `a${session.pid}`, pid: session.pid, sessionStartedAt: session.start, lockedAt: (NOW_S - 1800) * 1000,
});
export const working = (branch: string, session: typeof CLAUDE) =>
  row(branch, { lock: lock(session), agentProcesses: [{ pid: session.pid, tool: "claudeCode", startedAt: session.start }] });

export type Activity = Record<string, { commits: { hash: string; subject: string; at: number }[] | null; uncommitted: number; latestFile: string | null; onBase: boolean; files: { path: string; changedAt: number | null }[] }>;

/** What the page asked of the bridge since it opened. */
export interface BridgeCalls {
  asks: number;
  forgets: number;
  pulseAsks: number;
  pulsePauses: number;
  loadSamples: number;
  /** The last `on` the page told Rust for names, the pulse and load; `null` before any. */
  namesOn: boolean | null;
  pulseOn: boolean | null;
  loadOn: boolean | null;
  /** Every argument object the page sent, as JSON. */
  sent: string[];
}

export interface OpenOptions {
  /** The first answer of the file-change pulse; `null` answers as a system without one. */
  pulse?: unknown;
  /** The first load sample; `null` answers as a system without load. */
  load?: unknown;
  /** How many changes the base branch took in, one an hour back from now; two of two days by default. */
  landedCount?: number;
  width?: number;
  height?: number;
  /** The page's locale; English by default. */
  locale?: "en" | "ko";
}

export async function openWorkStatus(page: Page, rows: Row[], activity: Activity = {}, options: OpenOptions = {}) {
  await seedFirstRunSeen(page);
  await page.addInitScript(({ initial, reads, pulse, load, landedCount }: { initial: Row[]; reads: Activity; pulse: unknown; load: unknown; landedCount: number | null }) => {
    const state = { rows: initial, version: 1, activity: reads, activityVersion: 1, sessionStatus: "read", pulse, load };
    const calls = { asks: 0, forgets: 0, pulseAsks: 0, pulsePauses: 0, loadSamples: 0, namesOn: null as boolean | null, pulseOn: null as boolean | null, loadOn: null as boolean | null, sent: [] as string[] };
    const nowS = Math.floor(Date.now() / 1000);
    const LANDED_STUB = [
      { hash: "a".repeat(40), subject: "fix(map): keep a selected element's ring off its capability's disc (#12)", at: nowS - 3600, merge: true, files: 1, insertions: 30, deletions: 4 },
      { hash: "b".repeat(40), subject: "docs: say what landed", at: nowS - 2 * 86400, merge: false, files: 2, insertions: 5, deletions: 1 },
    ];
    if (landedCount !== null) {
      LANDED_STUB.splice(0, LANDED_STUB.length, ...Array.from({ length: landedCount }, (_, index) => (
        { hash: index.toString(16).padStart(40, "c"), subject: `fix: landed change ${index + 1} (#${100 + index})`, at: nowS - (index + 1) * 3600, merge: true, files: 1, insertions: 10, deletions: 2 }
      )));
    }
    const target = window as unknown as Record<string, unknown>;
    // How the session-list read went, and what the page asked of the bridge.
    target.__workStatusSessionRead = (status: string) => { state.sessionStatus = status; };
    target.__workStatusSessionCalls = () => ({ asks: calls.asks, forgets: calls.forgets });
    target.__workStatusCalls = () => structuredClone(calls);
    target.__workStatusRows = (next: Row[]) => { state.rows = next; state.version += 1; };
    // Rows held back until `when` says so. While they wait every tick reads anew, so the page keeps its one-second watch.
    let held: { rows: Row[]; when: () => boolean } | null = null;
    let waits = 0;
    target.__workStatusRowsWhen = (rows: Row[], when: () => boolean) => { held = { rows, when }; };
    target.__workStatusActivity = (next: Activity) => { state.activity = next; state.activityVersion += 1; };
    target.__workStatusPulse = (next: unknown) => { state.pulse = next; };
    target.__workStatusLoad = (next: unknown) => { state.load = next; };
    // What each Claude Code session says of itself, as the session-list read returns it.
    let sessions: unknown[] = [];
    target.__workStatusSessions = (next: unknown[]) => { sessions = next; };
    target.isTauri = true;
    target.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    target.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke(command: string, args: { worktreeId?: string; on?: boolean; sessionPids?: number[] } = {}) {
        calls.sent.push(JSON.stringify(args ?? {}));
        const answer = (value: unknown) => new Promise(resolve => setTimeout(() => resolve(value), 60));
        if (command === "pick_source_directory") return answer("/Users/probe/repo");
        if (command === "work_status_fingerprint") {
          if (held?.when()) {
            state.rows = held.rows;
            state.version += 1;
            held = null;
          } else if (held) waits += 1;
          return answer(`v${state.version}.${waits}`);
        }
        if (command === "work_status_agent_sessions") {
          calls.asks += 1;
          // Names off: Rust keeps none, so no answer carries one.
          const listed = structuredClone(sessions).map((each) => (calls.namesOn === false ? { ...(each as Row), name: undefined } : each));
          return answer({ status: state.sessionStatus, rows: listed });
        }
        if (command === "work_status_set_agent_sessions_read") {
          if (!args.on) calls.forgets += 1;
          return answer(null);
        }
        if (command === "work_status_set_session_names") {
          calls.namesOn = Boolean(args.on);
          return answer(null);
        }
        if (command === "work_status_file_pulse") {
          calls.pulseAsks += 1;
          return answer(structuredClone(state.pulse));
        }
        if (command === "work_status_pause_file_pulse") {
          calls.pulsePauses += 1;
          return answer(null);
        }
        if (command === "work_status_set_file_pulse") {
          calls.pulseOn = Boolean(args.on);
          return answer(null);
        }
        if (command === "work_status_load") {
          calls.loadSamples += 1;
          // As Rust does: a session's figures come back only for a pid the page sent.
          const read = structuredClone(state.load) as { sessions?: Record<string, unknown> } | null;
          const sent = new Set((args.sessionPids ?? []).map(String));
          if (read?.sessions) read.sessions = Object.fromEntries(Object.entries(read.sessions).filter(([pid]) => sent.has(pid)));
          return answer(read);
        }
        if (command === "work_status_set_load") {
          calls.loadOn = Boolean(args.on);
          return answer(null);
        }
        if (command === "work_status_activity_stamps") {
          return answer(Object.fromEntries(Object.keys(state.activity).map((id) => [id, `s${state.activityVersion}`])));
        }
        if (command === "work_status_activity") {
          const read = state.activity[args.worktreeId ?? ""];
          return answer(read ? { stamp: `s${state.activityVersion}`, ...structuredClone(read) } : null);
        }
        if (command === "work_status_landed") return answer({ changes: structuredClone(LANDED_STUB), weekCount: 2 });
        if (command === "work_status_landed_detail") {
          return answer({ hash: (args as { hash?: string }).hash, commits: [{ hash: "e1e1e1e", subject: "fix(map): keep the ring off the disc", at: Math.floor(Date.now() / 1000) - 7200 }], commitCount: 1, files: [{ path: "src/map/plan.ts", insertions: 30, deletions: 4 }], fileCount: 1 });
        }
        if (command === "work_status_read") {
          return answer({ status: "ready", root: "/Users/probe/repo", repository: "repo", host: "github.com", baseBranch: "main", worktrees: structuredClone(state.rows) });
        }
        return Promise.reject(new Error(`unstubbed native command: ${command}`));
      },
    };
  }, { initial: rows, reads: activity, pulse: "pulse" in options ? options.pulse : { worktrees: {} }, load: "load" in options ? options.load : { status: "read", worktrees: {}, outside: [], sessions: {}, mac: null }, landedCount: options.landedCount ?? null });
  await page.setViewportSize({ width: options.width ?? 1920, height: options.height ?? 1080 });
  await page.goto(`/${options.locale ?? "en"}/work-status/`);
  await page.getByTestId("work-status-choose").click();
}

export const room = (page: Page, branch: string) => page.getByTestId("work-room").filter({ hasText: branch });

export const setRows = (page: Page, next: Row[]) =>
  page.evaluate((rows) => (window as unknown as { __workStatusRows: (rows: unknown[]) => void }).__workStatusRows(rows), next);

export const setSessions = (page: Page, next: unknown[]) =>
  page.evaluate((rows) => (window as unknown as { __workStatusSessions: (rows: unknown[]) => void }).__workStatusSessions(rows), next);

export const setPulse = (page: Page, next: unknown) =>
  page.evaluate((pulse) => (window as unknown as { __workStatusPulse: (pulse: unknown) => void }).__workStatusPulse(pulse), next);

export const setLoad = (page: Page, next: unknown) =>
  page.evaluate((load) => (window as unknown as { __workStatusLoad: (load: unknown) => void }).__workStatusLoad(load), next);

/** Fails each test of the calling `describe` that logs a console error or warning the page did not expect. */
export function failOnConsoleNoise() {
  const noise: string[] = [];
  test.beforeEach(({ page }) => {
    noise.length = 0;
    page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") noise.push(`${message.type()}: ${message.text()}`); });
    page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));
  });
  test.afterEach(() => {
    const expected = /was preloaded using link preload but not used|You have Reduced Motion enabled/;
    expect(noise.filter((text) => !expected.test(text)), "console errors and warnings").toEqual([]);
  });
}

export const bridgeCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __workStatusCalls: () => BridgeCalls }).__workStatusCalls());
