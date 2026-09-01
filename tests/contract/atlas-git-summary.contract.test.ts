import { describe, expect, it } from "vitest";
import {
  classifyPorcelainChange,
  formatSnapshotSummary as formatTs,
  parsePorcelainStatus,
} from "@/shared/lib/atlas-git-changes";
import {
  classifyChange as classifyCli,
  formatSnapshotSummary as formatCli,
  getPorcelainStatus as getPorcelainCli,
} from "../../cli/src/lib/git-snapshot.mjs";

/**
 * Atlas Git summary arithmetic, 2-way contract — the same logic lives in two places:
 *   - cli/src/lib/git-snapshot.mjs (developer CLI `node $ATLAS/cli/src/index.mjs snapshot`)
 *   - src/shared/lib/atlas-git-changes.ts (the web Atlas Git panel)
 * (Rust `src-tauri/src/git.rs` is a third mirror — its own Rust unit tests verify
 * the same fixture intent.)
 *
 * If the web panel reports different commit messages or counts than the CLI, the
 * user sees two different histories on the two surfaces. This test blocks that
 * drift.
 */

// `-z` record form — the form both parsers read since the CLI moved off the
// newline output (git's default core.quotePath C-quoted non-ASCII paths and a
// Korean filename broke the snapshot; bug sweep 2026-09-01). A rename record
// is `XY new\0orig\0`, new path first.
const PORCELAIN_FIXTURES = [
  { name: "mixed add/modify/delete", input: "?? docs/new.md\0 M docs/edit.md\0D  docs/gone.md\0" },
  { name: "rename with arrow", input: "R  docs/new.md\0docs/old.md\0" },
  { name: "staged add + worktree modify", input: "A  docs/a.md\0MM docs/b.md\0" },
  { name: "korean filename stays raw", input: "?? docs/\ud55c\uae00.md\0" },
  { name: "empty output", input: "" },
];

const CHANGE_FIXTURES = [
  {
    name: "one added one modified",
    changes: [
      { status: "added", kind: "capability", slug: "capabilities/foo" },
      { status: "modified", kind: "element", slug: "elements/bar" },
    ],
  },
  {
    name: "five added (slug truncation)",
    changes: Array.from({ length: 5 }, (_, i) => ({
      status: "added",
      kind: null,
      slug: `n${i}`,
    })),
  },
  {
    name: "rename + delete",
    changes: [
      { status: "renamed", kind: null, slug: "moved" },
      { status: "deleted", kind: null, slug: "gone" },
    ],
  },
  { name: "no changes", changes: [] },
];

describe("atlas-git summary contract — web mirror agrees with the CLI", () => {
  for (const fixture of PORCELAIN_FIXTURES) {
    it(`porcelain parsing + classification: ${fixture.name}`, () => {
      // The CLI's parser sits behind an injectable run, so it is driven by a fake run
      // that returns the fixture text (zero real git processes).
      const cliRows = getPorcelainCli({
        repoRoot: "/repo",
        pathspec: ".",
        run: () => fixture.input,
      });
      if (cliRows === null) throw new Error("CLI parser unexpectedly returned null");
      const tsRows = parsePorcelainStatus(fixture.input);
      expect(tsRows).toEqual(cliRows);
      for (let i = 0; i < tsRows.length; i += 1) {
        expect(classifyPorcelainChange(tsRows[i])).toBe(classifyCli(cliRows[i]));
      }
    });
  }

  for (const fixture of CHANGE_FIXTURES) {
    it(`snapshot summary line: ${fixture.name}`, () => {
      expect(formatTs(fixture.changes)).toBe(formatCli(fixture.changes));
    });
  }
});
