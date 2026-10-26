import { invokeCancellable } from '../desktop-shell/cancellable-request';
import { invoke, isTauri } from '@tauri-apps/api/core';

export interface BriefingCommit {
  hash: string;
  subject: string;
  message?: string;
  messageComplete?: boolean;
  committedAt: string;
  paths: string[];
}

export interface ChangeBriefing {
  status: 'measured' | 'partial' | 'stale' | 'ungranted' | 'no-source' | 'no-history' | 'unreadable';
  sourceRoot: string;
  snapshot: string;
  head: string;
  base: string | null;
  tip: string | null;
  commits: BriefingCommit[];
  netPaths: string[] | null;
  limit: number;
  partialReasons: string[];
}

export interface ChangeBriefingPatch {
  status: 'measured' | 'binary' | 'unavailable' | 'stale';
  patch: string;
  truncated: boolean;
}

export async function gitChangeBriefing(
  vaultPath: string, projectSlug: string, startEpoch: number, endEpoch: number,
): Promise<ChangeBriefing | null> {
  return typeof window !== 'undefined' && isTauri()
    ? invoke<ChangeBriefing>('git_change_briefing', { vaultPath, projectSlug, startEpoch, endEpoch })
    : null;
}

export async function gitChangeBriefingPatch(
  vaultPath: string, projectSlug: string, head: string, base: string | null, tip: string, path: string,
): Promise<ChangeBriefingPatch | null> {
  return typeof window !== 'undefined' && isTauri()
    ? invoke<ChangeBriefingPatch>('git_change_briefing_patch', { vaultPath, projectSlug, head, base, tip, path })
    : null;
}

export async function gitSourceBriefing(sourcePath: string, startEpoch: number, endEpoch: number): Promise<ChangeBriefing | null> {
  return typeof window !== 'undefined' && isTauri()
    ? invoke<ChangeBriefing>('git_source_briefing', { sourcePath, startEpoch, endEpoch })
    : null;
}

export async function gitSourceBriefingPatch(sourcePath: string, head: string, base: string | null, tip: string, path: string): Promise<ChangeBriefingPatch | null> {
  return typeof window !== 'undefined' && isTauri()
    ? invoke<ChangeBriefingPatch>('git_source_briefing_patch', { sourcePath, head, base, tip, path })
    : null;
}

export interface PullDescription {
  number: number; title: string; body: string; url: string;
  updatedAt: string; fetchedAt: string; digest: string; integration: string; copyKind?: 'fresh' | 'saved' | 'session';
}
export interface PullLookupFailure { kind: 'rate-limited' | 'unavailable'; retryAt: string | null }
export interface PullDescriptions {
  status: 'measured' | 'partial' | 'unavailable'; repository: string;
  descriptions: PullDescription[]; unchecked: number; uncheckedCommits: string[]; unlinked: number; failure?: PullLookupFailure; saved?: SavedPullReport;
}
export async function gitBriefingRepositories(data: ChangeBriefing): Promise<string[]> {
  return typeof window !== 'undefined' && isTauri() && data.tip
    ? invoke('git_briefing_repositories', { sourcePath: data.sourceRoot, head: data.head, tip: data.tip, base: data.base, snapshot: data.snapshot }) : [];
}
export async function gitBriefingPullDescriptions(data: ChangeBriefing, repository: string, signal: AbortSignal, preservePrevious = false): Promise<PullDescriptions | null> {
  return typeof window !== 'undefined' && isTauri() && data.tip
    ? invokeCancellable('git_briefing_pull_descriptions', { sourcePath: data.sourceRoot, head: data.head, tip: data.tip, base: data.base, snapshot: data.snapshot, repository, preservePrevious }, signal) : null;
}

export interface SavedPullReport { status: 'saved' | 'unavailable' | 'unsupported' | 'unchanged' | 'superseded'; saved: number; unsaved: number; evicted: number }
export interface SavedPulls { status: 'ready' | 'unavailable' | 'unsupported'; pulls: PullDescriptions | null; omitted: number; ignored: number }
export async function gitBriefingSavedPullDescriptions(data: ChangeBriefing, repository: string): Promise<SavedPulls | null> {
  return typeof window !== 'undefined' && isTauri() && data.tip
    ? invoke('git_briefing_saved_pull_descriptions', { sourcePath: data.sourceRoot, head: data.head, tip: data.tip, base: data.base, snapshot: data.snapshot, repository }) : null;
}
export async function gitBriefingClearSavedPulls(): Promise<void> {
  if (typeof window === 'undefined' || !isTauri()) throw new Error('unavailable');
  await invoke('git_briefing_clear_saved_pulls');
}
