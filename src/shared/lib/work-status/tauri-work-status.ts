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

/** What one worktree is doing, read by `work_status_activity`. */
export interface WorktreeActivity {
  stamp: string;
  /** Newest first, at most three; `null` when the base branch is unknown or the log was unreadable. */
  commits: CommitLine[] | null;
  /** Changed tracked files and untracked entries; `null` when `git status` failed. */
  uncommitted: number | null;
  /** The uncommitted path that changed last, relative to the worktree, in Git's `/` spelling. */
  latestFile: string | null;
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
