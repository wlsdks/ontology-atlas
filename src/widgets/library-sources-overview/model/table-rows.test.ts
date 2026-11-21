import { describe, expect, it } from "vitest";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { SourceGroupIndex } from "./source-group-index";
import { DEFAULT_SOURCE_SORT, foldAlikeFolders, nextSourceSort, sortTableRows } from "./table-rows";

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

describe("foldAlikeFolders", () => {
  it("folds five folders with the same counts into one row, names in natural order", () => {
    const index = indexOf(...["batch-10", "batch-3", "batch-4", "batch-5", "batch-6"].map((name) => rows(name, 4, 1)), rows("other", 2, 2));
    const folded = foldAlikeFolders(index.list("folder"), new Set());
    expect(folded).toHaveLength(2);
    const alike = folded.find((row) => row.members)!;
    expect(alike.members!.map((member) => member.name)).toEqual(["batch-3", "batch-4", "batch-5", "batch-6", "batch-10"]);
    expect(alike.group.total).toBe(25);
    expect(alike.group.waiting).toBe(5);
  });

  it("keeps four alike folders apart", () => {
    const index = indexOf(...["a", "b", "c", "d"].map((name) => rows(name, 1, 1)));
    expect(foldAlikeFolders(index.list("folder"), new Set()).every((row) => row.members === null)).toBe(true);
  });

  it("never folds a folder being written", () => {
    const index = indexOf(...["a", "b", "c", "d", "e"].map((name) => rows(name, 1, 1)));
    const folded = foldAlikeFolders(index.list("folder"), new Set(["folder:c"]));
    expect(folded).toHaveLength(5);
    expect(folded.some((row) => row.members)).toBe(false);
  });
});

describe("sortTableRows", () => {
  it("orders by waiting, then sources, then name with numbers in natural order", () => {
    const index = indexOf(rows("batch-10", 0, 2), rows("batch-2", 0, 2), rows("big", 5, 2), rows("done", 9, 0), rows("most", 0, 7));
    const sorted = sortTableRows(foldAlikeFolders(index.list("folder"), new Set()), DEFAULT_SOURCE_SORT, noDay);
    expect(sorted.map((row) => row.group.name)).toEqual(["most", "big", "batch-2", "batch-10", "done"]);
  });

  it("reverses only the pressed column on a second press", () => {
    const index = indexOf(rows("a", 1, 3), rows("b", 3, 1), rows("c", 2, 2));
    const all = foldAlikeFolders(index.list("folder"), new Set());
    const byShare = nextSourceSort(DEFAULT_SOURCE_SORT, "withPage");
    expect(byShare).toEqual({ column: "withPage", direction: "descending" });
    expect(sortTableRows(all, byShare, noDay).map((row) => row.group.name)).toEqual(["b", "c", "a"]);
    const reversed = nextSourceSort(byShare, "withPage");
    expect(sortTableRows(all, reversed, noDay).map((row) => row.group.name)).toEqual(["a", "c", "b"]);
    expect(nextSourceSort(DEFAULT_SOURCE_SORT, "name")).toEqual({ column: "name", direction: "ascending" });
  });
});
