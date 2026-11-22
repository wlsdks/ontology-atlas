import { describe, expect, it } from "vitest";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { FoldCursor } from "./fold-cursor";
import { SourceGroupIndex } from "./source-group-index";

function source(folder: string, name: string): LibrarySourceRow {
  return { path: `sources/${folder}/${name}.md`, name: `${name}.md`, format: "md", bytes: 1, mtime: 0, state: "not-compiled", citedBy: [] };
}

describe("FoldCursor", () => {
  it("shows a folder that arrived after its first read without losing the ones before it", () => {
    const index = new SourceGroupIndex();
    const cursor = new FoldCursor();
    const first = [source("a", "one")];
    index.sync(first);
    expect(cursor.rows(index, "folder", new Set()).map((row) => row.group.name)).toEqual(["a"]);

    index.sync([...first, source("b", "two")]);
    expect(cursor.rows(index, "folder", new Set()).map((row) => row.group.name).sort()).toEqual(["a", "b"]);
  });

  it("keeps the same rows when nothing changed since the last read", () => {
    const index = new SourceGroupIndex();
    const cursor = new FoldCursor();
    index.sync([source("a", "one")]);
    const rows = cursor.rows(index, "folder", new Set());
    expect(cursor.rows(index, "folder", new Set())).toBe(rows);
  });
});
