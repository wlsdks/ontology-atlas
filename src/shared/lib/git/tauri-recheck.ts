import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/** The desktop commands of a scheduled recheck (`src-tauri/src/git/recheck.rs`); each is `null` without the bridge. */

function invoke<T>(command: string, args: Record<string, unknown>): Promise<T> | null {
  if (typeof window === 'undefined' || !isTauri()) return null;
  return tauriInvoke<T>(command, args);
}

export interface RecheckGitState {
  repository: boolean;
  /** The repository's top folder. */
  repoRoot: string | null;
  head: string | null;
  branch: string | null;
  remoteDefault: string | null;
  hold: { reason: 'git' | 'branch'; detail: string } | null;
}

export interface RecheckDiff {
  commit: string;
  path: string;
  refused: boolean;
  diff: string | null;
  lines: number;
  cut: boolean;
}

export interface RecheckDocumentWrite {
  path: string;
  before: string;
  after: string;
}

export interface RecheckCommitResult {
  outcome: 'committed' | 'nothing' | 'held' | 'head-moved' | 'refused';
  commit: string | null;
  written: string[];
  changedMeanwhile: string[];
  detail: string | null;
  /** When `held`: why Git could not commit when the run finished. */
  hold: { reason: 'git' | 'branch'; detail: string } | null;
  restored: string[];
  left: string[];
  copy: string | null;
  /** After a commit: documents whose committed text is not what Atlas wrote. */
  rewritten: string[];
}

export interface RecheckUndoResult {
  outcome: 'undone' | 'nothing' | 'gone' | 'refused';
  commit: string | null;
  undone: string[];
  skipped: string[];
  detail: string | null;
}

export async function gitRecheckState(vaultPath: string): Promise<RecheckGitState | null> {
  return (await invoke<RecheckGitState>('git_recheck_state', { vaultPath })) ?? null;
}

export async function gitRecheckDiffs(
  vaultPath: string,
  requests: readonly { commit: string; path: string }[],
  maxLines: number,
): Promise<RecheckDiff[] | null> {
  return (await invoke<RecheckDiff[]>('git_recheck_diffs', { vaultPath, requests: [...requests], maxLines })) ?? null;
}

/** `unchecked`: paths past Git's request cap, which were not asked about. */
export async function gitUncommittedPaths(
  vaultPath: string,
  vaultPaths: readonly string[],
  repoPaths: readonly string[],
): Promise<{ changed: string[]; unchecked: string[] } | null> {
  return (await invoke<{ changed: string[]; unchecked: string[] }>('git_uncommitted_paths', { vaultPath, vaultPaths: [...vaultPaths], repoPaths: [...repoPaths] })) ?? null;
}

/** The documents whose `evidence_checked` mark still stands; see `git_recheck_marks_hold`. */
export async function gitRecheckMarksHold(vaultPath: string, marks: readonly { path: string; mark: string }[]): Promise<string[] | null> {
  return (await invoke<string[]>('git_recheck_marks_hold', { vaultPath, marks: [...marks] })) ?? null;
}

export async function gitRecheckCommit(input: {
  vaultPath: string;
  roundId: string;
  passId: string;
  expectedHead: string;
  message: string;
  documents: readonly RecheckDocumentWrite[];
}): Promise<RecheckCommitResult | null> {
  return (await invoke<RecheckCommitResult>('git_recheck_commit', { ...input, documents: [...input.documents] })) ?? null;
}

export interface RecheckRecovered {
  roundId: string;
  passId: string;
  restored: string[];
}

export async function gitRecheckRecover(vaultPath: string): Promise<RecheckRecovered | null> {
  return (await invoke<RecheckRecovered | null>('git_recheck_recover', { vaultPath })) ?? null;
}

export async function gitRecheckUndo(input: {
  vaultPath: string;
  runCommit: string;
  paths: readonly string[];
  message: string;
}): Promise<RecheckUndoResult | null> {
  return (await invoke<RecheckUndoResult>('git_recheck_undo', { ...input, paths: [...input.paths] })) ?? null;
}
