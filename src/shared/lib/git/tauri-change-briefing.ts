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
  /** The branch the history was read on; null when the repository has no integration branch. */
  line: string | null;
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

/** One release per tagged commit; `committedAt` is the tagged commit's epoch seconds. */
export interface TaggedCommit { commit: string; committedAt: number; names: string[] }

export interface ReleaseList {
  status: ChangeBriefing['status'];
  sourceRoot: string;
  snapshot: string;
  head: string;
  line: string | null;
  tags: TaggedCommit[];
  unreadableNames: number;
  /** `shallow`, `names` or `tag-limit`. */
  partialReasons: string[];
  walkStep: number;
  walkLimit: number;
}

/** One step of the first-parent walk from a tip, newest first. */
export interface ReleaseWalk {
  status: ChangeBriefing['status'];
  skip: number;
  /** Each walked commit's type as an index into `types`; -1 when its title carries none. */
  kinds: number[];
  types: string[];
  /** Tagged commits met, at their distance from the walk's tip. */
  marks: { position: number; commit: string }[];
  ended: boolean;
}

const nativeGit = () => typeof window !== 'undefined' && isTauri();

/** A project-bound read when `project` is set, else a read of the picked repository at `root`. */
export async function gitReleases(root: string, project: string): Promise<ReleaseList | null> {
  if (!nativeGit()) return null;
  return project ? invoke<ReleaseList>('git_change_releases', { vaultPath: root, projectSlug: project }) : invoke<ReleaseList>('git_source_releases', { sourcePath: root });
}

export async function gitReleaseWalk(root: string, project: string, snapshot: string, tip: string, skip: number): Promise<ReleaseWalk | null> {
  if (!nativeGit()) return null;
  return project
    ? invoke<ReleaseWalk>('git_change_release_walk', { vaultPath: root, projectSlug: project, snapshot, tip, skip })
    : invoke<ReleaseWalk>('git_source_release_walk', { sourcePath: root, snapshot, tip, skip });
}

/** The changes after `base` (null: from the first commit) up to `tip`, both issued by the list `snapshot` names. */
export async function gitReleaseSpan(root: string, project: string, snapshot: string, base: string | null, tip: string): Promise<ChangeBriefing | null> {
  if (!nativeGit()) return null;
  return project
    ? invoke<ChangeBriefing>('git_change_release_span', { vaultPath: root, projectSlug: project, snapshot, base, tip })
    : invoke<ChangeBriefing>('git_source_release_span', { sourcePath: root, snapshot, base, tip });
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
