import { describe, expect, it } from "vitest";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { SourceGroupIndex } from "./source-group-index";
import { AlikeFolds, DEFAULT_SOURCE_SORT, nextSourceSort, rowLatestDay, sortTableRows } from "./table-rows";

function rows(folder: string, compiled: number, waiting: number): LibrarySourceRow[] {
  return Array.from({ length: compiled + waiting }, (_, i) => ({
    path: `sources/${folder}/doc-${i}.md`,
    name: `doc-${i}.md`,
    format: "md",
    bytes: 1,
    mtime: 0,
    state: i < compiled ? ("compiled" as const) : ("not-compiled" as const),
    citedBy: [],
  }));
}

function indexOf(...groups: LibrarySourceRow[][]): SourceGroupIndex {
  const index = new SourceGroupIndex();
  index.sync(groups.flat());
  return index;
}

const noDay = () => -1;

describe("AlikeFolds", () => {
  it("folds five folders with the same counts into one row, bounded by the first and last name in natural order", () => {
    const index = indexOf(...["batch-10", "batch-3", "batch-4", "batch-5", "batch-6"].map((name) => rows(name, 4, 1)), rows("other", 2, 2));
    const folded = new AlikeFolds().fold(index.list("folder"), new Set());
    expect(folded).toHaveLength(2);
    const alike = folded.find((row) => row.members)!;
    expect([alike.range!.first.name, alike.range!.last.name]).toEqual(["batch-3", "batch-10"]);
    expect(alike.group.total).toBe(25);
    expect(alike.group.waiting).toBe(5);
  });

  it("keeps four alike folders apart", () => {
    const index = indexOf(...["a", "b", "c", "d"].map((name) => rows(name, 1, 1)));
    expect(new AlikeFolds().fold(index.list("folder"), new Set()).every((row) => row.members === null)).toBe(true);
  });

  it("never folds a folder being written", () => {
    const index = indexOf(...["a", "b", "c", "d", "e"].map((name) => rows(name, 1, 1)));
    const folded = new AlikeFolds().fold(index.list("folder"), new Set(["folder:c"]));
    expect(folded).toHaveLength(5);
    expect(folded.some((row) => row.members)).toBe(false);
  });

  it("keeps an alike row's key while a member leaves it, and re-buckets only the groups that changed", () => {
    const index = indexOf(...["z1", "z2", "z3", "z4", "z5", "z6"].map((name) => rows(name, 0, 3)), ...["a1", "a2", "a3", "a4", "a5"].map((name) => rows(name, 0, 2)));
    const folds = new AlikeFolds();
    const before = folds.fold(index.list("folder"), new Set());
    expect(folds.movedInLastFold).toBe(11);
    const after = folds.fold(index.list("folder"), new Set(["folder:z1"]));
    expect(folds.movedInLastFold).toBe(1);
    expect(after.filter((row) => row.members).map((row) => row.key).sort()).toEqual(before.filter((row) => row.members).map((row) => row.key).sort());
    expect(after.map((row) => row.key)).toContain("folder:z1");
    folds.fold(index.list("folder"), new Set(["folder:z1"]));
    expect(folds.movedInLastFold).toBe(0);
  });

  it("folds only the groups the index logged since the last read, and keeps the rows while none joined or left", () => {
    const folders = Array.from({ length: 2000 }, (_, i) => rows(`f${i}`, 0, 1));
    const index = indexOf(...folders);
    const folds = new AlikeFolds();
    const first = folds.fold(index.list("folder"), new Set());
    let cursor = index.changesSince(-1, "folder").cursor;
    expect(first).toHaveLength(1);

    const written = folders.flat().map((row, i) => (i < 3 ? { ...row, state: "compiled" as const } : row));
    index.sync(written);
    const changes = index.changesSince(cursor, "folder");
    cursor = changes.cursor;
    expect(changes.groups!.map((group) => group.key)).toEqual(["folder:f0", "folder:f1", "folder:f2"]);
    const after = folds.fold(changes.groups!, new Set(), false);
    expect(folds.movedInLastFold).toBe(3);
    expect(after.map((row) => row.key)).toEqual([first[0]!.key, "folder:f0", "folder:f1", "folder:f2"]);
    expect(after[0]!.members).toHaveLength(1997);
    expect(folds.rowOf("folder:f5")).toBe(after[0]);

    const restated = written.map((row) => ({ ...row }));
    index.sync(restated);
    const none = index.changesSince(cursor, "folder");
    expect(none.groups).toEqual([]);
    expect(folds.fold(none.groups!, new Set(), false)).toBe(after);
  });
});

describe("sortTableRows", () => {
  it("orders by waiting, then sources, then name with numbers in natural order", () => {
    const index = indexOf(rows("batch-10", 0, 2), rows("batch-2", 0, 2), rows("big", 5, 2), rows("done", 9, 0), rows("most", 0, 7));
    const sorted = sortTableRows(new AlikeFolds().fold(index.list("folder"), new Set()), DEFAULT_SOURCE_SORT, noDay);
    expect(sorted.map((row) => row.group.name)).toEqual(["most", "big", "batch-2", "batch-10", "done"]);
  });

  it("reverses only the pressed column on a second press", () => {
    const index = indexOf(rows("a", 1, 3), rows("b", 3, 1), rows("c", 2, 2));
    const all = new AlikeFolds().fold(index.list("folder"), new Set());
    const byShare = nextSourceSort(DEFAULT_SOURCE_SORT, "withPage");
    expect(byShare).toEqual({ column: "withPage", direction: "descending" });
    expect(sortTableRows(all, byShare, noDay).map((row) => row.group.name)).toEqual(["b", "c", "a"]);
    const reversed = nextSourceSort(byShare, "withPage");
    expect(sortTableRows(all, reversed, noDay).map((row) => row.group.name)).toEqual(["a", "c", "b"]);
    expect(nextSourceSort(DEFAULT_SOURCE_SORT, "name")).toEqual({ column: "name", direction: "ascending" });
  });
});

describe("rowLatestDay", () => {
  it("is the newest day among the members of an alike row, and -1 when none is dated", () => {
    const index = indexOf(...["a", "b", "c", "d", "e"].map((name) => rows(name, 1, 1)));
    const alike = new AlikeFolds().fold(index.list("folder"), new Set()).find((row) => row.members)!;
    const dayByFolder = new Map(alike.members!.map((member, position) => [member, position === 3 ? 40 : position]));
    expect(rowLatestDay(alike, (group) => dayByFolder.get(group) ?? -1)).toBe(40);
    expect(rowLatestDay(alike, () => -1)).toBe(-1);
  });

  it("asks for the row's own group when it is not an alike row", () => {
    const index = indexOf(rows("solo", 1, 1));
    const [only] = new AlikeFolds().fold(index.list("folder"), new Set());
    expect(rowLatestDay(only!, (group) => (group === only!.group ? 7 : -1))).toBe(7);
  });
});
