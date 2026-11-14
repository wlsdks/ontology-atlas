import type { BriefingCommit } from '@/shared/lib/git/tauri-change-briefing';
import { localDate } from './briefing-model';

const MERGE_PREFIX = /^Merge #(\d+):\s*/i;
const TRAILING_PR = /\(#(\d+)\)\s*$/;
const CONVENTIONAL_HEAD = /^[\p{L}\p{N}_-]+(?:\(([^()]*)\))?(!)?:/u;
const NAMED_GROUP_LIMIT = 7;
const NOTABLE_LIMIT = 3;
const SIZE_FLOOR_FILES = 30;
const SIZE_MEDIAN_FACTOR = 3;

export interface DigestChange {
  commit: BriefingCommit;
  number: number | null;
  files: number;
  concepts: string[];
}

export type DigestGroupKind = 'label' | 'directory' | 'other';
export interface DigestGroup {
  key: string;
  kind: DigestGroupKind;
  /** The label or top-level directory as written; '' for the other group, '.' for repository root files. */
  name: string;
  changes: DigestChange[];
  /** Recorded concepts the group's files touch, most changes first. */
  concepts: string[];
}

export type NotableReason = { kind: 'revert' } | { kind: 'breaking' } | { kind: 'reach'; count: number } | { kind: 'size'; count: number };
export interface NotableChange { change: DigestChange; reason: NotableReason }

export interface ChangeDigest {
  changes: number;
  files: number;
  grouping: 'label' | 'directory';
  groups: DigestGroup[];
  notable: NotableChange[];
}

/** The title without a `Merge #N:` prefix; that prefix only records how the change arrived. */
function ownTitle(subject: string) {
  return subject.replace(MERGE_PREFIX, '');
}

/** The title as its author wrote it, with the pull request number shown beside it instead. */
export function changeTitle(subject: string) {
  return ownTitle(subject).replace(TRAILING_PR, '').trim() || subject;
}

export function pullRequestNumber(subject: string): number | null {
  const found = MERGE_PREFIX.exec(subject) ?? TRAILING_PR.exec(subject);
  return found ? Number(found[1]) : null;
}

export function titleLabel(subject: string): string | null {
  const label = CONVENTIONAL_HEAD.exec(ownTitle(subject))?.[1]?.trim().toLowerCase();
  return label || null;
}

export function isRevert(commit: BriefingCommit) {
  return /^revert\b/i.test(ownTitle(commit.subject)) || Boolean(commit.message?.includes('This reverts commit'));
}

export function isMarkedBreaking(commit: BriefingCommit) {
  return CONVENTIONAL_HEAD.exec(ownTitle(commit.subject))?.[2] === '!' || Boolean(commit.message?.includes('BREAKING CHANGE'));
}

/** The top-level directory holding most of a change's files; ties go to the name that sorts first. */
export function mainDirectory(paths: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const slash = path.indexOf('/');
    const directory = slash < 0 ? '.' : path.slice(0, slash);
    counts.set(directory, (counts.get(directory) ?? 0) + 1);
  }
  let best: [string, number] | null = null;
  for (const entry of counts) if (!best || entry[1] > best[1] || (entry[1] === best[1] && entry[0] < best[0])) best = entry;
  return best?.[0] ?? null;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function newestFirst(changes: readonly DigestChange[]) {
  const time = (change: DigestChange) => Date.parse(change.commit.committedAt) || 0;
  return changes.map((change, index) => ({ change, index })).sort((a, b) => time(b.change) - time(a.change) || a.index - b.index).map(entry => entry.change);
}

function rankedConcepts(changes: readonly DigestChange[]) {
  const counts = new Map<string, number>();
  for (const change of changes) for (const concept of change.concepts) counts.set(concept, (counts.get(concept) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([concept]) => concept);
}

function pickNotable(changes: readonly DigestChange[]): NotableChange[] {
  const picked: NotableChange[] = [];
  const taken = new Set<DigestChange>();
  const take = (candidates: DigestChange[], reason: (change: DigestChange) => NotableReason) => {
    for (const change of candidates) {
      if (picked.length === NOTABLE_LIMIT) return;
      if (taken.has(change)) continue;
      taken.add(change);
      picked.push({ change, reason: reason(change) });
    }
  };
  const newest = newestFirst(changes);
  const sizeFloor = Math.max(SIZE_FLOOR_FILES, SIZE_MEDIAN_FACTOR * median(changes.map(change => change.files)));
  const byMost = (count: (change: DigestChange) => number) => (a: DigestChange, b: DigestChange) => count(b) - count(a);
  take(newest.filter(change => isRevert(change.commit)), () => ({ kind: 'revert' }));
  take(newest.filter(change => isMarkedBreaking(change.commit)), () => ({ kind: 'breaking' }));
  take(newest.filter(change => change.concepts.length >= 2).sort(byMost(change => change.concepts.length)), change => ({ kind: 'reach', count: change.concepts.length }));
  take(newest.filter(change => change.files >= sizeFloor).sort(byMost(change => change.files)), change => ({ kind: 'size', count: change.files }));
  return picked;
}

/**
 * Groups by the label in each title, or by top-level directory when fewer than two labels exist;
 * the seven largest are named and the rest join one last group. O(changes × paths + groups log groups).
 */
export function buildChangeDigest(commits: readonly BriefingCommit[], conceptsByPath: ReadonlyMap<string, readonly string[]>): ChangeDigest {
  const changes: DigestChange[] = commits.map(commit => ({
    commit,
    number: pullRequestNumber(commit.subject),
    files: new Set(commit.paths).size,
    concepts: [...new Set(commit.paths.flatMap(path => conceptsByPath.get(path) ?? []))],
  }));
  const labels = changes.map(change => titleLabel(change.commit.subject));
  const grouping = new Set(labels.filter(Boolean)).size >= 2 ? 'label' : 'directory';
  const names = grouping === 'label' ? labels : changes.map(change => mainDirectory(change.commit.paths));
  const buckets = new Map<string, DigestChange[]>();
  const unnamed: DigestChange[] = [];
  changes.forEach((change, index) => {
    const name = names[index];
    if (!name) { unnamed.push(change); return; }
    const bucket = buckets.get(name) ?? [];
    bucket.push(change);
    buckets.set(name, bucket);
  });
  const ranked = [...buckets].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const named = ranked.slice(0, NAMED_GROUP_LIMIT);
  const rest = [...ranked.slice(NAMED_GROUP_LIMIT).flatMap(([, bucket]) => bucket), ...unnamed];
  const group = (kind: DigestGroupKind, name: string, members: DigestChange[]): DigestGroup => {
    const ordered = newestFirst(members);
    return { key: `${kind}:${name}`, kind, name, changes: ordered, concepts: rankedConcepts(ordered) };
  };
  const groups = named.map(([name, members]) => group(grouping, name, members));
  if (rest.length) groups.push(group('other', '', rest));
  return {
    changes: changes.length,
    files: new Set(commits.flatMap(commit => commit.paths)).size,
    grouping,
    groups,
    notable: pickNotable(changes),
  };
}

/** The local day of the newest change, or null when none has a readable time. */
export function latestChangeDay(commits: readonly BriefingCommit[]): string | null {
  let newest = Number.NEGATIVE_INFINITY;
  for (const commit of commits) newest = Math.max(newest, Date.parse(commit.committedAt) || Number.NEGATIVE_INFINITY);
  return Number.isFinite(newest) ? localDate(new Date(newest)) : null;
}
