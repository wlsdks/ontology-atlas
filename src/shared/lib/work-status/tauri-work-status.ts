import { invoke, isTauri } from '@tauri-apps/api/core';

/** Mirrors `src-tauri/src/work_status/`, which owns the contract. */
export type WorktreeStanding = 'base' | 'merged' | 'noCommits' | 'ahead' | 'unknown';
export type LockState = 'live' | 'stale' | 'unparsed';
export type LockTool = 'claudeCode' | 'unknown';

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
