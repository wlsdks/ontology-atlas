import type { ReleaseWalk, TaggedCommit } from '@/shared/lib/git/tauri-change-briefing';
import { workKinds, type WorkKinds } from './change-digest';

/** The text before the version number, the version, an optional pre-release suffix and build metadata. */
const TAG_VERSION = /^(.*?)(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export interface TagVersion { prefix: string; major: number; minor: number; patch: number; pre: string | null }
export type ReleaseSize = 'major' | 'minor' | 'patch';

export interface Release {
  commit: string;
  /** Every name on the tagged commit, the one that names the release first. */
  names: string[];
  committedAt: number;
  /** The sequence its first name belongs to; null for a name without a version, which stands alone. */
  sequence: string | null;
  version: TagVersion | null;
  /** The version in each sequence the commit is tagged in. */
  versions: ReadonlyMap<string, TagVersion>;
  size: ReleaseSize;
  preRelease: boolean;
}

export function parseTagName(name: string): TagVersion | null {
  const found = TAG_VERSION.exec(name);
  if (!found) return null;
  return { prefix: found[1], major: Number(found[2]), minor: Number(found[3]), patch: Number(found[4] ?? 0), pre: found[5] ?? null };
}

function sizeOf(version: TagVersion | null): ReleaseSize {
  if (!version || version.patch !== 0) return 'patch';
  return version.minor === 0 && version.major !== 0 ? 'major' : 'minor';
}

/** A versioned final name first, then a pre-release, then a name without a version; ties by name. */
function nameRank(name: string) {
  const version = parseTagName(name);
  return version ? (version.pre ? 1 : 0) : 2;
}

/** One release per tagged commit, newest commit date first. O(tags log tags). */
export function releasesFromTags(tags: readonly TaggedCommit[]): Release[] {
  return tags.map(tag => {
    const names = [...tag.names].sort((a, b) => nameRank(a) - nameRank(b) || (a < b ? -1 : a > b ? 1 : 0));
    const versions = new Map<string, TagVersion>();
    for (const name of names) {
      const version = parseTagName(name);
      if (version && !versions.has(version.prefix)) versions.set(version.prefix, version);
    }
    const version = parseTagName(names[0] ?? '');
    return { commit: tag.commit, names, committedAt: tag.committedAt, sequence: version?.prefix ?? null, version, versions, size: sizeOf(version), preRelease: Boolean(version?.pre) };
  }).sort((a, b) => b.committedAt - a.committedAt || (a.commit < b.commit ? -1 : 1));
}

/** The walked part of a first-parent line: each commit's type and the tagged commits met. */
export interface LineWalk {
  types: string[];
  /** A type index per walked commit, newest first; -1 for a title without a type. */
  kinds: number[];
  positions: ReadonlyMap<string, number>;
  ended: boolean;
}

export const EMPTY_WALK: LineWalk = { types: [], kinds: [], positions: new Map(), ended: false };

/** Appends one step, re-indexing its types into the walk's table. O(step). */
export function appendWalk(walk: LineWalk, step: ReleaseWalk): LineWalk {
  if (step.skip !== walk.kinds.length) return walk;
  const types = [...walk.types];
  const remap = step.types.map(type => {
    const known = types.indexOf(type);
    if (known >= 0) return known;
    types.push(type);
    return types.length - 1;
  });
  const positions = new Map(walk.positions);
  for (const mark of step.marks) if (!positions.has(mark.commit)) positions.set(mark.commit, mark.position);
  return { types, kinds: [...walk.kinds, ...step.kinds.map(kind => kind < 0 ? -1 : remap[kind] ?? -1)], positions, ended: step.ended };
}

/** Whether `candidate` can start `release`: the same sequence, and a final skips its own pre-releases. */
function startsSequence(release: Release, candidate: Release) {
  if (release.sequence === null || !release.version) return false;
  const earlier = candidate.versions.get(release.sequence);
  if (!earlier) return false;
  const own = release.version;
  return release.preRelease || !earlier.pre || earlier.major !== own.major || earlier.minor !== own.minor || earlier.patch !== own.patch;
}

export type Placement = 'line' | 'off' | 'unknown';
/** Where a span starts: a release's commit, or null for the first commit. */
export interface SpanStart { commit: string | null; position: number }

export interface ReleaseRow {
  release: Release;
  placement: Placement;
  position: number | null;
  start: SpanStart | null;
  count: number | null;
  kinds: WorkKinds | null;
  /** Counts under each of `kinds`, the remainder last; null without kinds. */
  kindCounts: number[] | null;
}

function kindsOver(walk: LineWalk, from: number, to: number) {
  const changes = walk.kinds.slice(from, to).map(kind => ({ type: kind < 0 ? null : walk.types[kind] ?? null }));
  const kinds = workKinds(changes);
  if (!kinds) return { kinds: null, kindCounts: null };
  const index = new Map(kinds.kinds.map((kind, at) => [kind.type, at]));
  const counts = Array.from({ length: kinds.kinds.length + 1 }, () => 0);
  for (const { type } of changes) counts[(type !== null ? index.get(type) : undefined) ?? kinds.kinds.length] += 1;
  return { kinds, kindCounts: counts };
}

/** Tagged commits a walk met, nearest the tip first. */
function walkOrder(walk: LineWalk): [string, number][] {
  return [...walk.positions].sort((a, b) => a[1] - b[1]);
}

/** The start of a release at `position` on a walk: the nearest tagged commit behind it that starts its sequence. O(tagged commits behind it). */
export function startOnWalk(release: Release, position: number, walk: LineWalk, byCommit: ReadonlyMap<string, Release>, order = walkOrder(walk)): SpanStart | null {
  const firstCommit = walk.ended ? { commit: null, position: walk.kinds.length } : null;
  if (release.sequence === null) return firstCommit;
  let low = 0;
  let high = order.length;
  while (low < high) { const middle = (low + high) >> 1; if (order[middle][1] <= position) low = middle + 1; else high = middle; }
  for (let index = low; index < order.length; index++) {
    const [commit, at] = order[index];
    const candidate = byCommit.get(commit);
    if (candidate && startsSequence(release, candidate)) return { commit, position: at };
  }
  return firstCommit;
}

function measured(release: Release, placement: Placement, position: number | null, start: SpanStart | null, walk: LineWalk): ReleaseRow {
  const counted = position !== null && start !== null;
  return { release, placement, position, start, count: counted ? start.position - position : null, ...(counted ? kindsOver(walk, position, start.position) : { kinds: null, kindCounts: null }) };
}

/**
 * Rows in the order of the read branch, newest first; a tag off the branch sits at its date, and one
 * the walk has not reached yet keeps its date order. O(releases × tagged commits walked).
 */
export function releaseRows(releases: readonly Release[], line: LineWalk, offWalks: ReadonlyMap<string, LineWalk>): ReleaseRow[] {
  const byCommit = new Map(releases.map(release => [release.commit, release]));
  const order = walkOrder(line);
  const onLine: ReleaseRow[] = [];
  const elsewhere: ReleaseRow[] = [];
  for (const release of releases) {
    const position = line.positions.get(release.commit);
    if (position !== undefined) { onLine.push(measured(release, 'line', position, startOnWalk(release, position, line, byCommit, order), line)); continue; }
    const own = offWalks.get(release.commit);
    const placement: Placement = line.ended ? 'off' : 'unknown';
    elsewhere.push(own ? measured(release, placement, 0, startOnWalk(release, 0, own, byCommit), own) : measured(release, placement, null, null, line));
  }
  onLine.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const rows: ReleaseRow[] = [];
  let next = 0;
  for (const row of onLine) {
    while (next < elsewhere.length && elsewhere[next].release.committedAt >= row.release.committedAt) rows.push(elsewhere[next++]);
    rows.push(row);
  }
  return [...rows, ...elsewhere.slice(next)];
}

export interface UnreleasedSpan { base: string | null; count: number | null; kinds: WorkKinds | null; kindCounts: number[] | null; after: Release | null }

/** The changes on the read branch after the newest release on it. */
export function unreleasedSpan(rows: readonly ReleaseRow[], line: LineWalk): UnreleasedSpan {
  const newest = rows.find(row => row.placement === 'line' && row.position !== null);
  const end = newest?.position ?? (line.ended ? line.kinds.length : null);
  if (end === null) return { base: null, count: null, kinds: null, kindCounts: null, after: null };
  return { base: newest?.release.commit ?? null, count: end, ...kindsOver(line, 0, end), after: newest?.release ?? null };
}

/**
 * The releases a span can start from, nearest first: for a release on the read branch (or
 * Unreleased, `selected` null) every older release on it; for one off the branch, the releases in its
 * own history. The first commit is always offered beside them.
 */
export function sinceChoices(rows: readonly ReleaseRow[], selected: ReleaseRow | null, walk: LineWalk): ReleaseRow[] {
  const from = selected && selected.placement !== 'line' ? 0 : selected?.position ?? -1;
  const at = (row: ReleaseRow) => walk.positions.get(row.release.commit) ?? -1;
  return rows.filter(row => row !== selected && at(row) > from).sort((a, b) => at(a) - at(b));
}

/** The sequences two or more names start, in first-seen order; a bare version's sequence is ''. */
export function sequencesOf(releases: readonly Release[]): string[] {
  const seen = new Set<string>();
  for (const release of releases) for (const prefix of release.versions.keys()) seen.add(prefix);
  return [...seen];
}

const fold = (value: string) => value.normalize('NFC').toLocaleLowerCase();

/** Rows a name contains `query` in, optionally only one sequence's. O(rows × names). */
export function filterRows(rows: readonly ReleaseRow[], query: string, sequence: string | null): ReleaseRow[] {
  const needle = fold(query.trim());
  return rows.filter(row => (sequence === null || row.release.versions.has(sequence)) && (!needle || row.release.names.some(name => fold(name).includes(needle))));
}
