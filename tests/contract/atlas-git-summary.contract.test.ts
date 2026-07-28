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
 * Atlas Git 요약 산식 2-way contract — 같은 로직이 두 곳에 산다:
 *   - cli/src/lib/git-snapshot.mjs (developer CLI `node $ATLAS/cli/src/index.mjs snapshot`)
 *   - src/shared/lib/atlas-git-changes.ts (웹 Atlas Git 패널)
 * (Rust `src-tauri/src/git.rs` 는 세 번째 미러 — Rust 자체 단위 테스트가
 * 같은 fixture 의도를 검증한다.)
 *
 * 웹 패널이 CLI 와 다른 커밋 메시지/카운트를 말하면 사용자는 두 표면에서
 * 서로 다른 "발자취" 를 보게 된다 — 이 테스트가 그 drift 를 차단한다.
 */

const PORCELAIN_FIXTURES = [
  { name: "mixed add/modify/delete", input: "?? docs/new.md\n M docs/edit.md\nD  docs/gone.md\n" },
  { name: "rename with arrow", input: "R  docs/old.md -> docs/new.md\n" },
  { name: "staged add + worktree modify", input: "A  docs/a.md\nMM docs/b.md\n" },
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
      // CLI 의 파서는 injectable run 뒤에 있으므로 fixture 텍스트를 돌려주는
      // fake run 으로 구동한다 (실 git 프로세스 0).
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
