import { describe, expect, it } from "vitest";
import {
  classifyPorcelainChange,
  countChangesByStatus,
  formatSnapshotSummary,
  groupChangesByKind,
  parsePorcelainStatus,
} from "./atlas-git-changes";

describe("parsePorcelainStatus", () => {
  it("parses status codes and paths", () => {
    const rows = parsePorcelainStatus("?? docs/new.md\n M docs/edit.md\nD  docs/gone.md\n");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ index: "?", worktree: "?", path: "docs/new.md", renamedFrom: null });
    expect(rows[1]).toEqual({ index: " ", worktree: "M", path: "docs/edit.md", renamedFrom: null });
    expect(rows[2].index).toBe("D");
  });

  it("parses rename rows with the previous path", () => {
    const rows = parsePorcelainStatus("R  docs/old.md -> docs/new.md\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].index).toBe("R");
    expect(rows[0].renamedFrom).toBe("docs/old.md");
    expect(rows[0].path).toBe("docs/new.md");
  });

  it("returns an empty array for empty output", () => {
    expect(parsePorcelainStatus("")).toEqual([]);
  });
});

describe("classifyPorcelainChange", () => {
  it("maps porcelain codes to change statuses", () => {
    expect(classifyPorcelainChange({ index: "?", worktree: "?" })).toBe("added");
    expect(classifyPorcelainChange({ index: "A", worktree: " " })).toBe("added");
    expect(classifyPorcelainChange({ index: " ", worktree: "M" })).toBe("modified");
    expect(classifyPorcelainChange({ index: "D", worktree: " " })).toBe("deleted");
    expect(classifyPorcelainChange({ index: " ", worktree: "D" })).toBe("deleted");
    expect(classifyPorcelainChange({ index: "R", worktree: " " })).toBe("renamed");
  });
});

describe("countChangesByStatus", () => {
  it("counts each status and the total", () => {
    const counts = countChangesByStatus([
      { status: "added", slug: "a" },
      { status: "added", slug: "b" },
      { status: "modified", slug: "c" },
      { status: "deleted", slug: "d" },
      { status: "renamed", slug: "e" },
    ]);
    expect(counts).toEqual({ added: 2, modified: 1, deleted: 1, renamed: 1, total: 5 });
  });

  it("returns zeros for no changes", () => {
    expect(countChangesByStatus([])).toEqual({
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      total: 0,
    });
  });
});

describe("groupChangesByKind", () => {
  it("groups by kind in first-appearance order with slugs", () => {
    const groups = groupChangesByKind([
      { status: "added", kind: "capability", slug: "capabilities/foo" },
      { status: "modified", kind: "element", slug: "elements/bar" },
      { status: "modified", kind: "capability", slug: "capabilities/baz" },
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["capability", "element"]);
    expect(groups[0].counts).toEqual({ added: 1, modified: 1, deleted: 0, renamed: 0, total: 2 });
    expect(groups[0].slugs).toEqual(["capabilities/foo", "capabilities/baz"]);
  });

  it("places the kind-less group last", () => {
    const groups = groupChangesByKind([
      { status: "modified", kind: null, slug: "README" },
      { status: "added", kind: "domain", slug: "domains/core" },
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["domain", null]);
  });
});

describe("formatSnapshotSummary", () => {
  it("builds the headline with counts and representative slugs", () => {
    const summary = formatSnapshotSummary([
      { status: "added", slug: "a" },
      { status: "modified", slug: "b" },
    ]);
    expect(summary).toBe("ontology snapshot: +1 concept, ~1 updated (a, b)");
  });

  it("truncates the slug list at 3 with an overflow marker", () => {
    const summary = formatSnapshotSummary(
      Array.from({ length: 5 }, (_, i) => ({ status: "added", slug: `n${i}` })),
    );
    expect(summary).toBe("ontology snapshot: +5 concepts (n0, n1, n2, +2)");
  });

  it("mentions renames and removals", () => {
    const summary = formatSnapshotSummary([
      { status: "renamed", slug: "x" },
      { status: "deleted", slug: "y" },
    ]);
    expect(summary).toContain("→1 renamed");
    expect(summary).toContain("-1 removed");
  });

  it("falls back to 'no concept changes' for an empty set", () => {
    expect(formatSnapshotSummary([])).toBe("ontology snapshot: no concept changes");
  });
});
