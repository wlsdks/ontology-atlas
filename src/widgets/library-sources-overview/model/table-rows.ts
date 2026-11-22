import { SOURCE_STATE_COUNT } from "./source-states";
import type { SourceGroup } from "./source-group-index";

/** Five or more folders with the same counts in every state share one row. */
export const ALIKE_MIN_FOLDERS = 5;

export type SourceSortColumn = "name" | "sources" | "withPage" | "waiting" | "latest";
export type SourceSortDirection = "ascending" | "descending";

export interface SourceSort {
  column: SourceSortColumn;
  direction: SourceSortDirection;
}

export const DEFAULT_SOURCE_SORT: SourceSort = { column: "waiting", direction: "descending" };

/** A first press sorts names A to Z and numbers most first; a second press on the same header reverses it. */
export function nextSourceSort(current: SourceSort, column: SourceSortColumn): SourceSort {
  if (current.column === column) {
    return { column, direction: current.direction === "ascending" ? "descending" : "ascending" };
  }
  return { column, direction: column === "name" ? "ascending" : "descending" };
}

/** One table row: a group, or the alike folders that share a row with the names that bound them. */
export interface SourceTableRow {
  key: string;
  group: SourceGroup;
  members: readonly SourceGroup[] | null;
  /** The first and last member by name, for an alike row. */
  range: { first: SourceGroup; last: SourceGroup } | null;
}

export const ALIKE_KEY_PREFIX = "alike:";

function countsKey(group: SourceGroup): string {
  let key = `${group.waiting}`;
  for (let i = 0; i < SOURCE_STATE_COUNT; i += 1) key += `|${group.byState[i]}`;
  return key;
}

interface FoldEntry {
  group: SourceGroup;
  revision: number;
  writing: boolean;
  /** The fold pass that last listed it, for a complete fold to find the groups that left. */
  listedIn: number;
  /** Its alike bucket; null when it never folds (root, type, being written) or is empty. */
  bucket: AlikeBucket | null;
  row: SourceTableRow;
}

interface AlikeBucket {
  countsKey: string;
  rowKey: string;
  members: Set<SourceGroup>;
  /** The members first and last by name; null once one of them left, until the row is rebuilt. */
  first: SourceGroup | null;
  last: SourceGroup | null;
  row: SourceTableRow | null;
}

/**
 * Folds alike folders into one row each and keeps everything between calls: a call re-buckets only
 * the groups handed to it whose revision or writing state changed, O(changed), and returns the same
 * array while no row was added, removed or replaced. An alike row keeps its key (its counts) while
 * members join or leave. Only first-level folders fold; the root, file types and a folder being
 * written stay rows of their own.
 */
export class AlikeFolds {
  private readonly entries = new Map<string, FoldEntry>();
  private readonly buckets = new Map<string, AlikeBucket>();
  /** Shown rows by key, in the order they were first shown. */
  private readonly shown = new Map<string, SourceTableRow>();
  private rows: SourceTableRow[] = [];
  private shownChanged = true;
  private writing: ReadonlySet<string> = new Set();
  /** Buckets whose row must be built again at the end of the fold. */
  private readonly stale = new Set<AlikeBucket>();
  private pass = 0;
  /** Groups re-bucketed by the last `fold`: its work beyond one compare per group handed in. */
  movedInLastFold = 0;

  /**
   * `groups` holds every listed group when `complete`, and a group missing from it has left; otherwise
   * it holds the groups that changed, an emptied one at total 0, and the rest are as they were.
   */
  fold(groups: readonly SourceGroup[], writing: ReadonlySet<string>, complete = true): SourceTableRow[] {
    this.pass += 1;
    this.movedInLastFold = 0;
    for (const group of groups) this.update(group, writing.has(group.key));
    if (writing !== this.writing) {
      for (const key of this.writing) if (!writing.has(key)) this.recheck(key, false);
      for (const key of writing) if (!this.writing.has(key)) this.recheck(key, true);
      this.writing = writing;
    }
    if (complete) {
      for (const entry of [...this.entries.values()]) if (entry.listedIn !== this.pass) this.remove(entry);
    }
    for (const bucket of this.stale) {
      if (bucket.members.size >= ALIKE_MIN_FOLDERS) this.show(bucket.rowKey, (bucket.row = alikeRow(bucket)));
    }
    this.stale.clear();
    if (this.shownChanged) {
      this.rows = [...this.shown.values()];
      this.shownChanged = false;
    }
    return this.rows;
  }

  /** The row a group is drawn in now: its own, or its alike row. */
  rowOf(key: string): SourceTableRow | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    return entry.bucket && entry.bucket.members.size >= ALIKE_MIN_FOLDERS ? entry.bucket.row : entry.row;
  }

  private update(group: SourceGroup, isWriting: boolean): void {
    let entry = this.entries.get(group.key);
    if (group.total === 0) {
      if (entry) this.remove(entry);
      return;
    }
    if (!entry) {
      entry = { group, revision: -1, writing: false, listedIn: 0, bucket: null, row: { key: group.key, group, members: null, range: null } };
      this.entries.set(group.key, entry);
      this.show(group.key, entry.row);
    }
    entry.listedIn = this.pass;
    if (entry.revision === group.revision && entry.writing === isWriting) return;
    entry.revision = group.revision;
    entry.writing = isWriting;
    this.movedInLastFold += 1;
    this.place(entry, group.kind === "folder" && !isWriting ? countsKey(group) : null);
  }

  private recheck(key: string, isWriting: boolean): void {
    const entry = this.entries.get(key);
    if (entry && entry.writing !== isWriting) this.update(entry.group, isWriting);
  }

  private remove(entry: FoldEntry): void {
    this.place(entry, null);
    this.entries.delete(entry.group.key);
    this.hide(entry.group.key);
  }

  /** Moves an entry to the bucket of `countsKey` (null for none), showing and hiding rows as buckets cross the fold size. */
  private place(entry: FoldEntry, countsKey: string | null): void {
    if ((entry.bucket?.countsKey ?? null) === countsKey) return;
    const old = entry.bucket;
    if (old) {
      old.members.delete(entry.group);
      if (old.first === entry.group || old.last === entry.group) old.first = old.last = null;
      if (old.members.size === ALIKE_MIN_FOLDERS - 1) {
        this.hide(old.rowKey);
        for (const member of old.members) this.show(member.key, this.entries.get(member.key)!.row);
      } else if (old.members.size >= ALIKE_MIN_FOLDERS) this.rebuild(old);
      if (old.members.size === 0) {
        this.buckets.delete(old.countsKey);
        this.stale.delete(old);
      }
    }
    entry.bucket = null;
    if (countsKey === null) {
      if (old && old.members.size + 1 >= ALIKE_MIN_FOLDERS) this.show(entry.group.key, entry.row);
      return;
    }
    let bucket = this.buckets.get(countsKey);
    if (!bucket) {
      bucket = { countsKey, rowKey: `${ALIKE_KEY_PREFIX}${countsKey}`, members: new Set(), first: entry.group, last: entry.group, row: null };
      this.buckets.set(countsKey, bucket);
    }
    entry.bucket = bucket;
    bucket.members.add(entry.group);
    if (bucket.first && entry.group.sortName < bucket.first.sortName) bucket.first = entry.group;
    if (bucket.last && entry.group.sortName > bucket.last.sortName) bucket.last = entry.group;
    if (old && old.members.size + 1 >= ALIKE_MIN_FOLDERS) this.show(entry.group.key, entry.row);
    if (bucket.members.size === ALIKE_MIN_FOLDERS) {
      for (const member of bucket.members) this.hide(member.key);
      this.rebuild(bucket);
    } else if (bucket.members.size > ALIKE_MIN_FOLDERS) {
      this.hide(entry.group.key);
      this.rebuild(bucket);
    }
  }

  /** Drops the bucket's row so `fold` builds it again in its place, keeping its key. */
  private rebuild(bucket: AlikeBucket): void {
    bucket.row = null;
    this.stale.add(bucket);
  }

  private show(key: string, row: SourceTableRow): void {
    if (this.shown.get(key) === row) return;
    this.shown.set(key, row);
    this.shownChanged = true;
  }

  private hide(key: string): void {
    if (this.shown.delete(key)) this.shownChanged = true;
  }
}

let alikeRevision = 0;

/**
 * One row for an alike bucket. Its members share every count, so totals are the first member's times
 * the size; the range is kept as members join and found again by one pass only once an end left.
 */
function alikeRow(bucket: AlikeBucket): SourceTableRow {
  const set = bucket.members;
  if (!bucket.first || !bucket.last) {
    let first: SourceGroup | null = null;
    let last: SourceGroup | null = null;
    for (const member of set) {
      if (!first || member.sortName < first.sortName) first = member;
      if (!last || member.sortName > last.sortName) last = member;
    }
    bucket.first = first;
    bucket.last = last;
  }
  const first = bucket.first!;
  const size = set.size;
  const byState = new Int32Array(SOURCE_STATE_COUNT);
  for (let i = 0; i < SOURCE_STATE_COUNT; i += 1) byState[i] = first.byState[i]! * size;
  let members: readonly SourceGroup[] | null = null;
  alikeRevision += 1;
  return {
    key: bucket.rowKey,
    group: { key: bucket.rowKey, kind: "folder", name: first.name, sortName: first.sortName, total: first.total * size, byState, waiting: first.waiting * size, revision: alikeRevision },
    // Listed on first read: a bucket of 50,000 one-file folders is copied only when asked for.
    get members() {
      return (members ??= [...set]);
    },
    range: { first, last: bucket.last! },
  };
}

/**
 * Orders rows by the sorted column, then by Waiting (most first), Sources (most first) and name.
 * Keys are read once into typed arrays and names compare by their padded sort name, so 50,000 rows
 * sort without a collator call: O(G log G).
 */
export function sortTableRows(
  rows: readonly SourceTableRow[],
  sort: SourceSort,
  latestDay: (row: SourceTableRow) => number,
): SourceTableRow[] {
  const count = rows.length;
  const primary = new Float64Array(count);
  const waiting = new Int32Array(count);
  const total = new Int32Array(count);
  const names: string[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const group = rows[i]!.group;
    const sources = group.total;
    waiting[i] = group.waiting;
    total[i] = sources;
    names[i] = group.sortName;
    primary[i] =
      sort.column === "sources" ? sources
      : sort.column === "withPage" ? (sources === 0 ? 0 : group.byState[0]! / sources)
      : sort.column === "latest" ? latestDay(rows[i]!)
      : sort.column === "waiting" ? group.waiting
      : 0;
  }
  const sign = sort.direction === "ascending" ? 1 : -1;
  const byName = (a: number, b: number) => (names[a]! < names[b]! ? -1 : names[a]! > names[b]! ? 1 : 0);
  const order = Array.from({ length: count }, (_, i) => i);
  order.sort((a, b) => {
    if (sort.column === "name") return byName(a, b) * sign;
    if (primary[a] !== primary[b]) return (primary[a]! - primary[b]!) * sign;
    if (waiting[a] !== waiting[b]) return waiting[b]! - waiting[a]!;
    if (total[a] !== total[b]) return total[b]! - total[a]!;
    return byName(a, b);
  });
  return order.map((i) => rows[i]!);
}

/** The newest page day of a row: for an alike row, of its newest member. -1 when none is dated. */
export function rowLatestDay(row: SourceTableRow, latestDay: (group: SourceGroup) => number): number {
  if (!row.members) return latestDay(row.group);
  let latest = -1;
  for (const member of row.members) latest = Math.max(latest, latestDay(member));
  return latest;
}
