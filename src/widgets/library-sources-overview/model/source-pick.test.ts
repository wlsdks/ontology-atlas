import { describe, expect, it } from "vitest";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { SourceGroupIndex } from "./source-group-index";
import { pickedRowOf, pickedWaitingSources, pickWithNoFolderLeft, type SourcePick } from "./source-pick";
import { AlikeFolds } from "./table-rows";

function source(folder: string, name: string, state: LibrarySourceRow["state"]): LibrarySourceRow {
  return { path: `sources/${folder}/${name}.md`, name: `${name}.md`, format: "md", bytes: 1, mtime: 0, state, citedBy: [] };
}

describe("pickedRowOf", () => {
  const rows = [source("a", "one", "not-compiled"), source("b", "two", "compiled")];
  const index = new SourceGroupIndex();
  index.sync(rows);
  const folds = new AlikeFolds();
  folds.fold(index.list("folder"), new Set());
  const folderKey = (folder: string) => index.keyOf(`sources/${folder}/${folder === "a" ? "one" : "two"}.md`, "folder")!;

  it("finds the row drawing the first picked folder that is still counted", () => {
    const pick: SourcePick = { grouping: "folder", keys: ["folder:gone", folderKey("b")], name: "b" };
    expect(pickedRowOf(folds, pick, "folder")?.key).toBe(folderKey("b"));
  });

  it("finds nothing for a pick made under the other grouping, or for no pick", () => {
    const pick: SourcePick = { grouping: "type", keys: [folderKey("a")], name: "a" };
    expect(pickedRowOf(folds, pick, "folder")).toBeNull();
    expect(pickedRowOf(folds, null, "folder")).toBeNull();
  });
});

describe("pickedWaitingSources", () => {
  const sources = [
    source("a", "one", "not-compiled"),
    source("a", "two", "compiled"),
    source("b", "three", "not-compiled"),
    source("a", "four", "stale"),
  ];
  const index = new SourceGroupIndex();
  index.sync(sources);
  const keyOf = (path: string, grouping: "folder" | "type") => index.keyOf(path, grouping);
  const pick: SourcePick = { grouping: "folder", keys: [index.keyOf("sources/a/one.md", "folder")!], name: "a" };

  it("lists only the picked folder's sources that still need a page, in row order", () => {
    expect(pickedWaitingSources(sources, keyOf, pick, 10).map((row) => row.name)).toEqual(["one.md", "four.md"]);
  });

  it("stops at the limit and lists nothing without a pick", () => {
    expect(pickedWaitingSources(sources, keyOf, pick, 1).map((row) => row.name)).toEqual(["one.md"]);
    expect(pickedWaitingSources(sources, keyOf, null, 10)).toEqual([]);
  });
});

describe("pickWithNoFolderLeft", () => {
  const pick: SourcePick = { grouping: "folder", keys: ["x", "y"], name: "x" };

  it("names the pick only when every folder in it is gone and the count is complete", () => {
    expect(pickWithNoFolderLeft(pick, { counted: true, hasGroup: () => false })).toBe(pick);
    expect(pickWithNoFolderLeft(pick, { counted: true, hasGroup: (key) => key === "y" })).toBeNull();
    expect(pickWithNoFolderLeft(pick, { counted: false, hasGroup: () => false })).toBeNull();
    expect(pickWithNoFolderLeft(null, { counted: true, hasGroup: () => false })).toBeNull();
  });
});
