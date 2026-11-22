import { describe, expect, it } from "vitest";
import {
  classifyPorcelainChange,
  formatSnapshotSummary,
  parsePorcelainStatus,
} from "@/shared/lib/git/atlas-git-changes";

/**
 * Atlas Git summary arithmetic of the web Atlas Git panel (`src/shared/lib/git/atlas-git-changes.ts`),
 * pinned to fixed outputs. `src-tauri/src/git/changes.rs` is the Rust mirror; its unit tests verify the
 * same fixtures, so the two surfaces report the same history.
 */

// `-z` record form, as both parsers read it: git's default quotePath C-quotes non-ASCII paths.
// A rename record is `XY new\0orig\0`, new path first.
const row = (index: string, worktree: string, path: string, renamedFrom: string | null = null) => ({
  index,
  worktree,
  path,
  renamedFrom,
});

const PORCELAIN_FIXTURES = [
  {
    name: "mixed add/modify/delete",
    input: "?? docs/new.md\0 M docs/edit.md\0D  docs/gone.md\0",
    rows: [row("?", "?", "docs/new.md"), row(" ", "M", "docs/edit.md"), row("D", " ", "docs/gone.md")],
    statuses: ["added", "modified", "deleted"],
  },
  {
    name: "rename with arrow",
    input: "R  docs/new.md\0docs/old.md\0",
    rows: [row("R", " ", "docs/new.md", "docs/old.md")],
    statuses: ["renamed"],
  },
  {
    name: "staged add + worktree modify",
    input: "A  docs/a.md\0MM docs/b.md\0",
    rows: [row("A", " ", "docs/a.md"), row("M", "M", "docs/b.md")],
    statuses: ["added", "modified"],
  },
  {
    name: "korean filename stays raw",
    input: "?? docs/\ud55c\uae00.md\0",
    rows: [row("?", "?", "docs/\ud55c\uae00.md")],
    statuses: ["added"],
  },
  { name: "empty output", input: "", rows: [], statuses: [] },
];

const CHANGE_FIXTURES = [
  {
    name: "one added one modified",
    changes: [
      { status: "added", kind: "capability", slug: "capabilities/foo" },
      { status: "modified", kind: "element", slug: "elements/bar" },
    ],
    summary: "ontology snapshot: +1 concept, ~1 updated (capabilities/foo, elements/bar)",
  },
  {
    name: "five added (slug truncation)",
    changes: Array.from({ length: 5 }, (_, i) => ({
      status: "added",
      kind: null,
      slug: `n${i}`,
    })),
    summary: "ontology snapshot: +5 concepts (n0, n1, n2, +2)",
  },
  {
    name: "rename + delete",
    changes: [
      { status: "renamed", kind: null, slug: "moved" },
      { status: "deleted", kind: null, slug: "gone" },
    ],
    summary: "ontology snapshot: \u21921 renamed, -1 removed (moved, gone)",
  },
  { name: "no changes", changes: [], summary: "ontology snapshot: no concept changes" },
];

describe("atlas-git summary contract", () => {
  for (const fixture of PORCELAIN_FIXTURES) {
    it(`porcelain parsing + classification: ${fixture.name}`, () => {
      const rows = parsePorcelainStatus(fixture.input);
      expect(rows).toEqual(fixture.rows);
      expect(rows.map(classifyPorcelainChange)).toEqual(fixture.statuses);
    });
  }

  for (const fixture of CHANGE_FIXTURES) {
    it(`snapshot summary line: ${fixture.name}`, () => {
      expect(formatSnapshotSummary(fixture.changes)).toBe(fixture.summary);
    });
  }
});
