import { sourceNeedsCompile, VAULT_SOURCES_DIR, type LibrarySourceRow } from "@/entities/docs-vault";

import { SOURCE_STATE_COUNT, sourceStateIndex } from "./source-states";

export type SourceGrouping = "folder" | "type";

/** `root` holds the files directly in `sources/`; a folder row counts everything beneath it. */
export type SourceGroupKind = "folder" | "root" | "type";

export interface SourceGroup {
  readonly key: string;
  readonly kind: SourceGroupKind;
  /** The folder's name, or the file type's extension (`''` when it has none). */
  readonly name: string;
  /** Lower case with digit runs padded, so plain `<` orders `batch-2` before `batch-10`. */
  readonly sortName: string;
  readonly total: number;
  /** Counts in `SOURCE_STATE_ORDER`. */
  readonly byState: Readonly<Int32Array>;
  /** Sources the write button acts on (`sourceNeedsCompile`). */
  readonly waiting: number;
  /** Bumped on every change, so a row can tell a new count from a re-render. */
  readonly revision: number;
}

interface MutableGroup {
  key: string;
  kind: SourceGroupKind;
  name: string;
  sortName: string;
  total: number;
  byState: Int32Array;
  waiting: number;
  revision: number;
  /** Day number of each `compiled` row's page → how many rows carry it; a handful of keys. */
  days: Map<number, number>;
  /** The sync pass that last changed it, so a pass counts each group once. */
  touchedIn: number;
  /** The sync pass that last logged it, so the change log holds a group once per pass. */
  loggedIn: number;
}

/** Groups changed since a cursor, or null when the log no longer reaches back to it (read them all). */
export interface SourceGroupChanges {
  groups: readonly SourceGroup[] | null;
  cursor: number;
}

/** What one `sync` step did. */
export interface SourceGroupSync {
  /** True when every row of the array has been applied. */
  done: boolean;
  /** Distinct folder groups whose counts changed in this step. */
  foldersTouched: number;
  /** Rows read in this step. */
  rowsRead: number;
  /** Rows whose path, state or page day differed from what was counted, so their counts moved. */
  rowsApplied: number;
}

const ROOT_KEY = "root";
const SOURCES_PREFIX = `${VAULT_SOURCES_DIR}/`;
const NON_ASCII = /[^\u0000-\u007f]/;
/** Rows between two clock reads while a step runs against a deadline. */
const CLOCK_EVERY_ROWS = 256;
/** Entries the change log keeps beyond twice the groups before it restarts; a reader then reads all. */
const LOG_SLACK = 4096;
const NO_DAY = -1;

function nfc(value: string): string {
  return NON_ASCII.test(value) ? value.normalize("NFC") : value;
}

export function naturalSortName(name: string): string {
  return name.toLowerCase().replace(/\d+/g, (digits) => digits.padStart(12, "0"));
}

/** The first-level folder under `sources/` a path sits in, or null for a file directly in it. */
export function firstLevelFolder(path: string): string | null {
  const start = path.startsWith(SOURCES_PREFIX) ? SOURCES_PREFIX.length : 0;
  const slash = path.indexOf("/", start);
  return slash < 0 ? null : nfc(path.slice(start, slash));
}

/** The key of the group a source counts in under `grouping`, as the index keys it. */
export function sourceGroupKey(row: Pick<LibrarySourceRow, "path" | "format">, grouping: SourceGrouping): string {
  if (grouping === "type") return `type:${row.format}`;
  const folderName = firstLevelFolder(row.path);
  return folderName === null ? ROOT_KEY : `folder:${folderName}`;
}

/**
 * Per-folder and per-file-type counts of the sources, kept up to date in place. Each published array
 * is compared row by row with the last one: an unchanged row object costs one comparison, a changed
 * one moves its counts between groups, and only the groups a change reaches are touched. A step can
 * stop at a deadline and resume, so a 50,000-row array never holds the main thread.
 *
 * Memory: one map entry and four typed-array slots per source, no object per source.
 */
export class SourceGroupIndex {
  private readonly slotOf = new Map<string, number>();
  private folderOf = new Int32Array(256);
  private typeOf = new Int32Array(256);
  /** State index × 2 + waiting bit. */
  private stateOf = new Uint8Array(256);
  private dayOf = new Int32Array(256);
  private readonly freeSlots: number[] = [];
  private nextSlot = 0;

  private readonly groups: MutableGroup[] = [];
  private readonly groupIdOf = new Map<string, number>();
  private folderGroups = 0;
  private typeGroups = 0;

  private applied: readonly LibrarySourceRow[] = [];
  private pending: readonly LibrarySourceRow[] | null = null;
  private cursor = 0;
  private pass = 0;
  /** Distinct folder groups changed in the running step. */
  private touched = 0;
  /** Groups changed per pass, in order; `logStart` is the cursor of its first entry. */
  private log: MutableGroup[] = [];
  private logStart = 0;

  /** Applies `rows` until done or until `deadline` (a `performance.now()` value) passes. */
  sync(rows: readonly LibrarySourceRow[], deadline = Infinity, now: () => number = defaultNow): SourceGroupSync {
    if (this.pending !== rows) {
      this.pending = rows;
      this.cursor = 0;
    }
    this.pass += 1;
    this.touched = 0;
    if (this.log.length > 2 * this.groups.length + LOG_SLACK) {
      this.logStart += this.log.length;
      this.log = [];
    }
    let rowsApplied = 0;
    const start = this.cursor;
    const previous = this.applied;
    let index = start;
    for (; index < rows.length; index += 1) {
      if ((index - start) % CLOCK_EVERY_ROWS === CLOCK_EVERY_ROWS - 1 && now() > deadline) break;
      const row = rows[index]!;
      if (previous[index] === row) continue;
      if (this.applyRow(row)) rowsApplied += 1;
    }
    this.cursor = index;
    const done = index >= rows.length;
    if (done) {
      if (this.slotOf.size > rows.length) rowsApplied += this.removeAbsent(rows);
      this.applied = rows;
      this.pending = null;
      this.cursor = 0;
    }
    return { done, foldersTouched: this.touched, rowsRead: index - start, rowsApplied };
  }

  /**
   * The groups of `grouping` whose counts changed since `cursor` (an emptied one included, at total 0),
   * O(changes); a group may repeat. A cursor of -1, or one the log no longer reaches, gets null.
   */
  changesSince(cursor: number, grouping: SourceGrouping): SourceGroupChanges {
    const end = this.logStart + this.log.length;
    if (cursor < this.logStart) return { groups: null, cursor: end };
    const groups: SourceGroup[] = [];
    for (let i = cursor - this.logStart; i < this.log.length; i += 1) {
      const group = this.log[i]!;
      if ((group.kind === "type") === (grouping === "type")) groups.push(group);
    }
    return { groups, cursor: end };
  }

  /** Groups with at least one source, in no particular order. */
  list(grouping: SourceGrouping): SourceGroup[] {
    const out: SourceGroup[] = [];
    for (const group of this.groups) {
      if (group.total > 0 && (group.kind === "type") === (grouping === "type")) out.push(group);
    }
    return out;
  }

  get(key: string): SourceGroup | undefined {
    const id = this.groupIdOf.get(key);
    const group = id === undefined ? undefined : this.groups[id];
    return group && group.total > 0 ? group : undefined;
  }

  /** The key of the group a source path counts in, or undefined when it is not counted. */
  keyOf(path: string, grouping: SourceGrouping): string | undefined {
    const slot = this.slotOf.get(path);
    if (slot === undefined) return undefined;
    return this.groups[grouping === "type" ? this.typeOf[slot]! : this.folderOf[slot]!]?.key;
  }

  /** Folder groups (the root included), first-level folders (the root left out) and file types holding a source. */
  get shape(): { folders: number; firstLevel: number; types: number } {
    const root = this.get(ROOT_KEY) ? 1 : 0;
    return { folders: this.folderGroups, firstLevel: this.folderGroups - root, types: this.typeGroups };
  }

  /** The newest believed page day in a group: -1 when no page is dated on or before `today`. */
  latestDay(group: SourceGroup, today: number): number {
    let latest = NO_DAY;
    for (const day of (group as MutableGroup).days.keys()) if (day <= today && day > latest) latest = day;
    return latest;
  }

  /** Returns whether the row's counts moved. */
  private applyRow(row: LibrarySourceRow): boolean {
    const state = sourceStateIndex(row.state) * 2 + (sourceNeedsCompile(row) ? 1 : 0);
    const day = row.state === "compiled" && row.compiledDay !== undefined && row.compiledDay >= 0 ? row.compiledDay : NO_DAY;
    const known = this.slotOf.get(row.path);
    if (known !== undefined) {
      if (this.stateOf[known] === state && this.dayOf[known] === day) return false;
      const folder = this.groups[this.folderOf[known]!]!;
      const type = this.groups[this.typeOf[known]!]!;
      this.count(folder, known, -1);
      this.count(type, known, -1);
      this.stateOf[known] = state;
      this.dayOf[known] = day;
      this.count(folder, known, 1);
      this.count(type, known, 1);
      this.touch(folder);
      return true;
    }
    const slot = this.allocate();
    this.slotOf.set(row.path, slot);
    const folderName = firstLevelFolder(row.path);
    const folder = this.group(sourceGroupKey(row, "folder"), folderName === null ? "root" : "folder", folderName ?? VAULT_SOURCES_DIR);
    const type = this.group(sourceGroupKey(row, "type"), "type", row.format);
    this.folderOf[slot] = this.groupIdOf.get(folder.key)!;
    this.typeOf[slot] = this.groupIdOf.get(type.key)!;
    this.stateOf[slot] = state;
    this.dayOf[slot] = day;
    this.count(folder, slot, 1);
    this.count(type, slot, 1);
    this.touch(folder);
    return true;
  }

  /** Drops sources no longer in `rows`: one pass, run only when the array lost rows. Returns how many. */
  private removeAbsent(rows: readonly LibrarySourceRow[]): number {
    const present = new Set<string>();
    for (const row of rows) present.add(row.path);
    let removed = 0;
    for (const [path, slot] of this.slotOf) {
      if (present.has(path)) continue;
      const folder = this.groups[this.folderOf[slot]!]!;
      this.count(folder, slot, -1);
      this.count(this.groups[this.typeOf[slot]!]!, slot, -1);
      this.touch(folder);
      removed += 1;
      this.slotOf.delete(path);
      this.freeSlots.push(slot);
    }
    return removed;
  }

  private count(group: MutableGroup, slot: number, sign: 1 | -1): void {
    const wasEmpty = group.total === 0;
    const packed = this.stateOf[slot]!;
    group.total += sign;
    group.byState[packed >> 1]! += sign;
    group.waiting += (packed & 1) * sign;
    group.revision += 1;
    if (group.loggedIn !== this.pass) {
      group.loggedIn = this.pass;
      this.log.push(group);
    }
    const day = this.dayOf[slot]!;
    if (day !== NO_DAY) {
      const next = (group.days.get(day) ?? 0) + sign;
      if (next > 0) group.days.set(day, next);
      else group.days.delete(day);
    }
    if (wasEmpty !== (group.total === 0)) {
      const delta = wasEmpty ? 1 : -1;
      if (group.kind === "type") this.typeGroups += delta;
      else this.folderGroups += delta;
    }
  }

  private touch(folder: MutableGroup): void {
    if (folder.touchedIn === this.pass) return;
    folder.touchedIn = this.pass;
    this.touched += 1;
  }

  private group(key: string, kind: SourceGroupKind, name: string): MutableGroup {
    const id = this.groupIdOf.get(key);
    if (id !== undefined) return this.groups[id]!;
    const group: MutableGroup = {
      key,
      kind,
      name,
      sortName: naturalSortName(name),
      total: 0,
      byState: new Int32Array(SOURCE_STATE_COUNT),
      waiting: 0,
      revision: 0,
      days: new Map(),
      touchedIn: 0,
      loggedIn: 0,
    };
    this.groupIdOf.set(key, this.groups.length);
    this.groups.push(group);
    return group;
  }

  private allocate(): number {
    const free = this.freeSlots.pop();
    if (free !== undefined) return free;
    const slot = this.nextSlot;
    this.nextSlot += 1;
    if (slot >= this.folderOf.length) {
      const size = this.folderOf.length * 2;
      this.folderOf = grow(this.folderOf, new Int32Array(size));
      this.typeOf = grow(this.typeOf, new Int32Array(size));
      this.stateOf = grow(this.stateOf, new Uint8Array(size));
      this.dayOf = grow(this.dayOf, new Int32Array(size));
    }
    return slot;
  }
}

function grow<T extends Int32Array | Uint8Array>(from: T, to: T): T {
  to.set(from);
  return to;
}

function defaultNow(): number {
  return performance.now();
}
