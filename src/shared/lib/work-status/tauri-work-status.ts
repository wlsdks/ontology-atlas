import { invoke, isTauri } from '@tauri-apps/api/core';

/** Mirrors `src-tauri/src/work_status/`, which owns the contract. */
export type WorktreeStanding = 'base' | 'merged' | 'noCommits' | 'ahead' | 'unknown';
export type LockState = 'live' | 'stale' | 'unparsed';
export type LockTool = 'claudeCode' | 'unknown';
export type AgentTool = 'claudeCode' | 'codex';

/** An agent program whose own working folder, or a command's it runs, lies in the worktree. */
export interface WorktreeProcess {
  pid: number;
  tool: AgentTool;
  /** Seconds since the epoch. */
  startedAt: number | null;
}

export interface WorktreeLock {
  state: LockState;
  tool: LockTool;
  agentId: string | null;
  pid: number | null;
  /** Seconds since the epoch, from the lock reason. */
  sessionStartedAt: number | null;
  /** Milliseconds since the epoch: when the worktree was locked. */
  lockedAt: number | null;
}

export interface WorktreeRow {
  id: string;
  path: string;
  branch: string | null;
  head: string | null;
  mainCheckout: boolean;
  missing: boolean;
  standing: WorktreeStanding;
  ahead: number | null;
  /** Seconds since the epoch. */
  lastCommitAt: number | null;
  lastCommitAuthor: string | null;
  lock: WorktreeLock | null;
  acpPid: number | null;
  agentProcesses: WorktreeProcess[];
}

/** A commit beyond the base branch. The subject is untrusted text: render it as plain text only. */
export interface CommitLine {
  hash: string;
  /** Control and direction-override characters removed, at most 200 characters. */
  subject: string;
  /** Seconds since the epoch. */
  at: number | null;
}

/** An uncommitted file: its path relative to the worktree, in Git's `/` spelling, and when it was last written, in seconds. */
export interface ChangedFile {
  path: string;
  changedAt: number | null;
}

/** What one worktree is doing, read by `work_status_activity`. */
export interface WorktreeActivity {
  stamp: string;
  /** Newest first, at most twenty; `null` when the base branch is unknown or the log was unreadable. */
  commits: CommitLine[] | null;
  /** The worktree stands on the base branch: `commits` are that branch's own newest, not commits beyond it. */
  onBase: boolean;
  /** Changed tracked files and untracked entries; `null` when `git status` failed. */
  uncommitted: number | null;
  /** The uncommitted path that changed last, relative to the worktree, in Git's `/` spelling. */
  latestFile: string | null;
  /** The uncommitted files, last changed first, at most sixty. */
  files: ChangedFile[];
}

/** What a Claude Code session says of itself in its own session list. */
export type AgentSessionState = 'waitingApproval' | 'waitingAnswer' | 'working' | 'replied' | 'failed';

/** One Claude Code session standing in a worktree; never its name, id or folder. */
export interface AgentSessionRow {
  worktreeId: string;
  pid: number;
  state: AgentSessionState;
}

/**
 * How the last read of the session list went. `pending`: sessions run and the first read has not
 * come due. `noSession`: no Claude Code runs, so nothing is read. `unsupported`: this system cannot run the program with no network, so it never runs.
 */
export type AgentSessionsReadStatus = 'pending' | 'read' | 'noSession' | 'notFound' | 'timedOut' | 'failed' | 'unknownForm' | 'unsupported';

export interface AgentSessionsRead {
  status: AgentSessionsReadStatus;
  rows: AgentSessionRow[];
}

export interface WorkStatusSnapshot {
  status: 'ready' | 'ungranted' | 'unreadable' | 'no-history' | 'git-missing';
  root: string;
  repository: string;
  host: string | null;
  baseBranch: string | null;
  worktrees: WorktreeRow[];
}

export function isWorkStatusAvailable(): boolean {
  return typeof window !== 'undefined' && isTauri();
}

export async function readWorkStatus(repositoryPath: string): Promise<WorkStatusSnapshot | null> {
  return isWorkStatusAvailable() ? invoke<WorkStatusSnapshot>('work_status_read', { repositoryPath }) : null;
}

/** Changes when a worktree is added, removed, locked, unlocked or committed to; costs no process. */
export async function readWorkStatusFingerprint(repositoryPath: string): Promise<string | null> {
  return isWorkStatusAvailable() ? invoke<string | null>('work_status_fingerprint', { repositoryPath }) : null;
}

/** One stamp per worktree id from stats of its `HEAD`, `index` and reflog; costs no process. */
export async function readActivityStamps(repositoryPath: string): Promise<Record<string, string> | null> {
  return isWorkStatusAvailable() ? invoke<Record<string, string> | null>('work_status_activity_stamps', { repositoryPath }) : null;
}

/** One worktree's newest commit subjects and uncommitted files: two `git` processes, one read at a time. */
export async function readWorktreeActivity(repositoryPath: string, worktreeId: string, baseBranch: string | null): Promise<WorktreeActivity | null> {
  return isWorkStatusAvailable() ? invoke<WorktreeActivity | null>('work_status_activity', { repositoryPath, worktreeId, baseBranch }) : null;
}

/**
 * What each Claude Code session in the repository's worktrees says of itself, and how the last read
 * went. Rust paces the read (one `claude agents --json` in ten seconds, with no network) and
 * answers from its last list in between; `null` while a read runs, so the caller keeps what it had.
 */
export async function readAgentSessions(repositoryPath: string): Promise<AgentSessionsRead | null> {
  return isWorkStatusAvailable() ? invoke<AgentSessionsRead | null>('work_status_agent_sessions', { repositoryPath }) : null;
}

/**
 * Tells Rust whether the person leaves the read on. Off holds there too, so an ask already on its
 * way starts no program, and Rust drops the last list it held.
 */
export async function setAgentSessionsRead(on: boolean): Promise<void> {
  if (isWorkStatusAvailable()) await invoke('work_status_set_agent_sessions_read', { on });
}
