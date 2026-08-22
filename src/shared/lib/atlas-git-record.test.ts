import { describe, expect, it } from "vitest";

import {
  describeChangePath,
  describeSnapshotSubject,
  parseUnifiedDiff,
  splitConceptChanges,
} from "./atlas-git-record";

describe("splitConceptChanges", () => {
  it("kind 가 있는 변경만 개념으로 센다 — 판단 대상과 동반 파일을 가른다", () => {
    const { concepts, others } = splitConceptChanges([
      { status: "added", kind: "capability", slug: "capabilities/foo" },
      { status: "modified", kind: null, slug: ".gitignore" },
      { status: "modified", kind: "element", slug: "elements/bar" },
      { status: "added", kind: undefined, slug: "package.json" },
    ]);
    expect(concepts.map((c) => c.slug)).toEqual(["capabilities/foo", "elements/bar"]);
    expect(others.map((c) => c.slug)).toEqual([".gitignore", "package.json"]);
  });

  it("등장 순을 지킨다 — 목록의 읽기 순서가 곧 파일의 순서다", () => {
    const { concepts } = splitConceptChanges([
      { status: "added", kind: "domain", slug: "b" },
      { status: "added", kind: "domain", slug: "a" },
    ]);
    expect(concepts.map((c) => c.slug)).toEqual(["b", "a"]);
  });
});

describe("describeChangePath", () => {
  it("이름과 자리를 가른다", () => {
    expect(describeChangePath("capabilities/map-label-budget")).toEqual({
      name: "map-label-budget",
      place: "capabilities",
    });
  });

  it("개념 경로의 .md 확장자는 이름이 아니다", () => {
    expect(describeChangePath("docs/ontology/elements/foo.md", { isConcept: true })).toEqual({
      name: "foo",
      place: "docs/ontology/elements",
    });
  });

  it("개념이 아닌 파일은 확장자가 정체의 일부라 그대로 둔다", () => {
    expect(describeChangePath("scripts/perf-graph.mjs")).toEqual({
      name: "perf-graph.mjs",
      place: "scripts",
    });
  });

  it("폴더가 없으면 자리는 빈 문자열이다", () => {
    expect(describeChangePath(".gitignore")).toEqual({ name: ".gitignore", place: "" });
  });
});

describe("parseUnifiedDiff", () => {
  const DIFF = [
    "diff --git a/docs/a.md b/docs/a.md",
    "index 4a1c0de..8b71f92 100644",
    "--- a/docs/a.md",
    "+++ b/docs/a.md",
    "@@ -12,6 +12,9 @@ relations:",
    "   depends_on:",
    "-    - elements/old",
    "+    - elements/new",
    "@@ -30,2 +33,2 @@",
    " tail",
    "diff --git a/docs/b.md b/docs/b.md",
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    "+++ b/docs/b.md",
    "@@ -0,0 +1,2 @@",
    "+first",
    "+second",
    "\\ No newline at end of file",
    "",
  ].join("\n");

  it("파일별로 가르고 새 경로를 쓴다", () => {
    expect(parseUnifiedDiff(DIFF).map((f) => f.path)).toEqual(["docs/a.md", "docs/b.md"]);
  });

  it("git 배관(diff --git · index · --- · +++ · new file mode)을 한 줄도 남기지 않는다", () => {
    const text = parseUnifiedDiff(DIFF)
      .flatMap((f) => f.lines.map((l) => l.text))
      .join("\n");
    expect(text).not.toContain("diff --git");
    expect(text).not.toContain("index 4a1c0de");
    expect(text).not.toContain("new file mode");
    expect(text).not.toContain("No newline");
  });

  it("헝크 좌표는 버리되 생략이 있었다는 사실은 남긴다", () => {
    const [first] = parseUnifiedDiff(DIFF);
    expect(first!.lines.map((l) => l.kind)).toEqual([
      "context",
      "removed",
      "added",
      "skip",
      "context",
    ]);
    // No elision marker before the first hunk means the diff starts at the top of the file.
    expect(first!.lines[0]!.kind).not.toBe("skip");
  });

  it("늘어난 줄 · 줄어든 줄을 센다", () => {
    const [a, b] = parseUnifiedDiff(DIFF);
    expect({ added: a!.added, removed: a!.removed }).toEqual({ added: 1, removed: 1 });
    expect({ added: b!.added, removed: b!.removed }).toEqual({ added: 2, removed: 0 });
  });

  it("빈 입력은 빈 배열이다", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
    expect(parseUnifiedDiff("   ")).toEqual([]);
  });

  it("`+++`/`---` 를 늘고 준 줄로 세지 않는다 — 헤더가 줄 판정보다 먼저다", () => {
    // Regression guard: if the header filter runs **after** the `+`/`-` test, the two file
    // path lines count as one added and one removed line, inflating every file's totals by
    // +1 / −1.
    const [file] = parseUnifiedDiff(DIFF);
    expect(file!.lines.some((l) => l.text.includes("docs/a.md"))).toBe(false);
  });

  it("헝크 머리(@@)가 없는 짧은 diff 도 읽는다", () => {
    // Some tools and fixtures emit a `+` line directly after `diff --git`. The header filter is
    // explicit, so this is safe even without a hunk check.
    const files = parseUnifiedDiff("diff --git a/docs/x.md b/docs/x.md\n+new line\n");
    expect(files).toHaveLength(1);
    expect(files[0]!.lines).toEqual([{ kind: "added", text: "new line" }]);
  });
});

describe("describeSnapshotSubject", () => {
  it("우리 형식의 커밋 제목을 숫자와 이름으로 되읽는다", () => {
    const parsed = describeSnapshotSubject(
      "ontology snapshot: +2 concepts, ~1 updated (capabilities/foo, elements/bar, +3)",
    );
    expect(parsed.matched).toBe(true);
    expect(parsed.added).toBe(2);
    expect(parsed.updated).toBe(1);
    expect(parsed.slugs).toEqual(["capabilities/foo", "elements/bar"]);
    expect(parsed.overflow).toBe(3);
  });

  it("이름 변경 · 삭제도 읽는다", () => {
    const parsed = describeSnapshotSubject(
      "ontology snapshot: →1 renamed, -2 removed (elements/gone)",
    );
    expect(parsed).toMatchObject({ matched: true, renamed: 1, removed: 2, overflow: 0 });
  });

  it("단수형(+1 concept)도 같은 형식이다", () => {
    expect(describeSnapshotSubject("ontology snapshot: +1 concept (domains/record)")).toMatchObject({
      matched: true,
      added: 1,
      slugs: ["domains/record"],
    });
  });

  it("변경이 없던 스냅샷도 우리 형식이다", () => {
    expect(describeSnapshotSubject("ontology snapshot: no concept changes")).toMatchObject({
      matched: true,
      added: 0,
      updated: 0,
      slugs: [],
    });
  });

  it("우리 형식이 아니면 손대지 않는다 — 사람이 쓴 문장이 곧 사람의 말이다", () => {
    const parsed = describeSnapshotSubject("fix: 라벨 예산 상한 회귀 정정");
    expect(parsed.matched).toBe(false);
    expect(parsed.raw).toBe("fix: 라벨 예산 상한 회귀 정정");
    expect(parsed.slugs).toEqual([]);
  });
});
