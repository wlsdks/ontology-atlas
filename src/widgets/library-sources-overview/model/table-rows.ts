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

/** One table row: a group, or the alike folders that share a row (`members` in name order). */
export interface SourceTableRow {
  key: string;
  group: SourceGroup;
  members: readonly SourceGroup[] | null;
}

export const ALIKE_KEY_PREFIX = "alike:";

function countsKey(group: SourceGroup): string {
  let key = `${group.waiting}`;
  for (let i = 0; i < SOURCE_STATE_COUNT; i += 1) key += `|${group.byState[i]}`;
  return key;
}

/**
 * Folds alike folders into one row each: O(G) over G groups. Only first-level folders fold; the
 * root, file types and any folder being written stay rows of their own. `members` are in name order.
 */
export function foldAlikeFolders(groups: readonly SourceGroup[], writing: ReadonlySet<string>): SourceTableRow[] {
  const buckets = new Map<string, SourceGroup[]>();
  for (const group of groups) {
    if (group.kind !== "folder" || writing.has(group.key)) continue;
    const key = countsKey(group);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(group);
    else buckets.set(key, [group]);
  }
  const folded = new Set<SourceGroup>();
  const rows: SourceTableRow[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < ALIKE_MIN_FOLDERS) continue;
    bucket.sort((a, b) => (a.sortName < b.sortName ? -1 : a.sortName > b.sortName ? 1 : 0));
    for (const member of bucket) folded.add(member);
    rows.push({ key: `${ALIKE_KEY_PREFIX}${bucket[0]!.key}`, group: alikeTotals(bucket), members: bucket });
  }
  for (const group of groups) if (!folded.has(group)) rows.push({ key: group.key, group, members: null });
  return rows;
}

/** The summed counts of alike folders, read live from the members so a late change still shows. */
function alikeTotals(members: readonly SourceGroup[]): SourceGroup {
  const first = members[0]!;
  return {
    key: `${ALIKE_KEY_PREFIX}${first.key}`,
    kind: "folder",
    name: first.name,
    sortName: first.sortName,
    get total() {
      return members.reduce((sum, member) => sum + member.total, 0);
    },
    get byState() {
      const sum = new Int32Array(SOURCE_STATE_COUNT);
      for (const member of members) for (let i = 0; i < SOURCE_STATE_COUNT; i += 1) sum[i]! += member.byState[i]!;
      return sum;
    },
    get waiting() {
      return members.reduce((sum, member) => sum + member.waiting, 0);
    },
    get revision() {
      return members.reduce((sum, member) => sum + member.revision, 0);
    },
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
