import { describe, expect, it } from "vitest";

import { deriveSkillProcess, sha256Digest } from "./process-ir";

const skill = (body: string) =>
  `---\nname: process-test\ndescription: Exercise a numbered process\n---\n\n${body}`;

describe("skill process IR", () => {
  it("derives one source-bound top-level step without inventing an edge", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("1. Read the current source.\n"),
    });

    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.process).toMatchObject({
      irVersion: "skillProcessIR:v1",
      source: {
        path: "skills/process-test/SKILL.md",
        digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      scanTruncated: false,
      diagnostics: [],
      steps: [
        {
          ordinal: 1,
          exactText: "Read the current source.",
          sourceSpan: {
            start: { line: 6, column: 4 },
            end: { line: 6, column: 28 },
          },
        },
      ],
      resources: [],
      edges: [],
    });
    expect(result.process.steps[0].stepId).toMatch(/^step:[a-f0-9]{16}$/);
  });

  it("fails closed instead of returning a partial process for an empty numbered item", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("1.\n2. This step alone must not become a ready process.\n"),
    });

    expect(result).toMatchObject({
      state: "unavailable",
      scanTruncated: false,
      diagnostics: [{ code: "skill_markdown_unsupported", severity: "error" }],
    });
  });

  it("preserves a 27-step corpus, multiline/nested text, source order, and resource truth", () => {
    const bodyLines = [
      "# Procedure",
      "```md",
      "99. A fenced example is not a process step.",
      "```",
      "> 98. A quoted example is not a process step.",
    ];
    for (let ordinal = 1; ordinal <= 27; ordinal += 1) {
      if (ordinal === 3) {
        bodyLines.push(
          "3. Inspect the attached resources.",
          "   - Read references/guide.md.",
          "   - Run scripts/check.ts.",
          "     1. Keep this nested item inside step three.",
        );
      } else if (ordinal === 7) {
        bodyLines.push("7. Preserve a blank continuation.", "", "   Continue after the blank.");
      } else {
        bodyLines.push(`${ordinal}${ordinal === 2 ? ")" : "."} Exact step ${ordinal}.`);
      }
    }
    const raw = skill(`${bodyLines.join("\n")}\n`);
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: raw,
      existingPaths: new Set([
        "skills/process-test/references/guide.md",
        "skills/process-test/scripts/check.ts",
      ]),
    });

    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.process.steps).toHaveLength(27);
    expect(result.process.steps.map((step) => step.ordinal)).toEqual(
      Array.from({ length: 27 }, (_, index) => index + 1),
    );
    expect(result.process.steps[2].exactText).toBe(
      "Inspect the attached resources.\n" +
        "   - Read references/guide.md.\n" +
        "   - Run scripts/check.ts.\n" +
        "     1. Keep this nested item inside step three.",
    );
    expect(result.process.steps[6].exactText).toBe(
      "Preserve a blank continuation.\n\n   Continue after the blank.",
    );
    expect(result.process.steps[2].sourceSpan.end.line).toBe(
      raw.split("\n").findIndex((line) => line.includes("Keep this nested item")) + 1,
    );
    expect(result.process.resources).toEqual([
      {
        path: "skills/process-test/references/guide.md",
        kind: "reference",
        exists: true,
        referencedByStepIds: [result.process.steps[2].stepId],
      },
      {
        path: "skills/process-test/scripts/check.ts",
        kind: "script",
        exists: true,
        referencedByStepIds: [result.process.steps[2].stepId],
      },
    ]);
    expect(result.process.diagnostics).toEqual([]);
    expect(result.process.edges).toHaveLength(0);
  });

  it("fails closed when an unsupported 10-digit list marker sits beside supported steps", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("1234567890. This is outside the Markdown ordered-list range.\n1. Valid alone is partial.\n"),
    });

    expect(result).toMatchObject({
      state: "unavailable",
      diagnostics: [{ code: "skill_markdown_unsupported", severity: "error" }],
    });
  });

  it.each([
    ["duplicate", "1. First.\n1. Duplicate."],
    ["descending", "2. Starts late.\n1. Goes backward."],
    ["gapped", "1. First.\n3. Skips the second step."],
  ])("fails closed when numbered step ordinals are %s", (_label, body) => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill(body),
    });

    expect(result).toMatchObject({
      state: "unavailable",
      scanTruncated: false,
      diagnostics: [
        {
          code: "step_ordinals_invalid",
          severity: "error",
        },
      ],
    });
  });

  it("uses standard UTF-8 SHA-256 and keeps step IDs stable across unrelated source lines", () => {
    expect(sha256Digest("abc")).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const before = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("# Before\n1. Stable exact step.\n"),
    });
    const after = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("# Before\nNew unrelated prose.\n\n1. Stable exact step.\n"),
    });
    expect(before.state).toBe("ready");
    expect(after.state).toBe("ready");
    if (before.state !== "ready" || after.state !== "ready") return;
    expect(after.process.steps[0].stepId).toBe(before.process.steps[0].stepId);
    expect(after.process.steps[0].sourceSpan.start.line).toBeGreaterThan(
      before.process.steps[0].sourceSpan.start.line,
    );
    expect(after.process.source.digest).not.toBe(before.process.source.digest);
  });

  it("reports missing and unverified resource existence without inventing backlinks", () => {
    const source = skill(
      "1. Read references/missing.md and scripts/check.ts.\n" +
        "2. Read references/missing.md again.\n",
    );
    const missing = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: source,
      existingPaths: new Set(["skills/process-test/scripts/check.ts"]),
    });
    expect(missing.state).toBe("ready");
    if (missing.state !== "ready") return;
    expect(missing.process.resources).toEqual([
      {
        path: "skills/process-test/references/missing.md",
        kind: "reference",
        exists: false,
        referencedByStepIds: missing.process.steps.map((step) => step.stepId),
      },
      {
        path: "skills/process-test/scripts/check.ts",
        kind: "script",
        exists: true,
        referencedByStepIds: [missing.process.steps[0].stepId],
      },
    ]);
    expect(missing.process.diagnostics).toMatchObject([
      { code: "resource_missing", severity: "warning" },
    ]);

    const unverified = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: source,
    });
    expect(unverified.state).toBe("ready");
    if (unverified.state !== "ready") return;
    expect(unverified.process.resources.map((resource) => resource.exists)).toEqual([null, null]);
    expect(unverified.process.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "resource_existence_unverified",
      "resource_existence_unverified",
    ]);
  });

  it("keeps source identity and diagnostics while truncated or absent processes fail closed", () => {
    const truncated = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("1. A complete-looking step.\n"),
      scanTruncated: true,
    });
    expect(truncated).toMatchObject({
      state: "unavailable",
      source: {
        path: "skills/process-test/SKILL.md",
        digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      scanTruncated: true,
      diagnostics: [{ code: "scan_truncated" }],
    });

    const absent = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("- An unordered instruction is not a numbered process.\n"),
    });
    expect(absent).toMatchObject({
      state: "unavailable",
      scanTruncated: false,
      diagnostics: [{ code: "numbered_steps_unavailable" }],
    });
  });

  it("preserves CRLF inside a multiline step and refuses skill-folder escapes", () => {
    const crlf = skill("1. First line.\r\n   Second line.\r\n2. Next.\r\n");
    const ready = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: crlf,
    });
    expect(ready.state).toBe("ready");
    if (ready.state !== "ready") return;
    expect(ready.process.steps[0].exactText).toBe("First line.\r\n   Second line.");

    const escaped = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("1. Read references/../secret.md.\n"),
    });
    expect(escaped).toMatchObject({
      state: "unavailable",
      diagnostics: [{ code: "resource_path_unsupported", severity: "error" }],
    });
  });
});

/**
 * **절차를 제목으로 쓴 스킬** (2026-08-18).
 *
 * 실측이 이 갈래를 열었다 — 이 저장소의 실제 스킬 18개 중 절차가 읽히던 것은
 * 9개였고, 못 읽은 9개 중 여덟이 `## 1.` / `### 0.` 처럼 **서수를 단 제목**으로
 * 절차를 적고 있었다. 번호도 제목도 원문에 있는데 목록 서수만 보던 파서의 시야
 * 밖이었을 뿐이다. 이 묶음이 잠그는 것은 셋이다: 읽는가 · **기존 결과를 안
 * 건드리는가** · 애매한 것은 여전히 거절하는가.
 */
describe("제목 서수로 적은 절차", () => {
  it("서수를 단 제목을 단계로 읽는다 — 카드에 싣는 것은 제목 한 줄", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("## 1. 잰다\n\n본문 한 줄.\n\n## 2. 고친다\n\n또 한 줄.\n"),
    });

    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.process.steps.map((step) => [step.ordinal, step.exactText])).toEqual([
      [1, "잰다"],
      [2, "고친다"],
    ]);
    // 자리는 제목 줄이다 — 본문까지 실으면 카드가 문서 전문이 된다.
    expect(result.process.steps[0].sourceSpan.start).toEqual({ line: 6, column: 7 });
    expect(result.process.steps[0].sourceSpan.end.line).toBe(6);
  });

  it("0 으로 시작하는 절차도 받는다 — 실재하는 관례다", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("## 0. 고정한다\n\n## 1. 잰다\n\n## 2. 고친다\n"),
    });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    // 원문 번호는 제목에 그대로 남고, 화면이 세는 수는 1 부터다.
    expect(result.process.steps.map((step) => step.ordinal)).toEqual([1, 2, 3]);
    expect(result.process.steps[0].exactText).toBe("고정한다");
  });

  it("가장 얕은 층 하나만 센다 — 소절까지 세면 절차가 아니라 목차다", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("## 1. 잰다\n\n### 1. 준비\n\n### 2. 실행\n\n## 2. 고친다\n"),
    });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.process.steps.map((step) => step.exactText)).toEqual(["잰다", "고친다"]);
  });

  it("절 본문에서 딸린 파일을 찾는다 — 스킬이 파일 이름을 대는 곳이 거기다", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("## 1. 잰다\n\n`scripts/measure.mjs` 를 돌린다.\n\n## 2. 고친다\n"),
      existingPaths: new Set(["skills/process-test/scripts/measure.mjs"]),
    });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.process.resources).toMatchObject([
      { path: "skills/process-test/scripts/measure.mjs", exists: true },
    ]);
    expect(result.process.resources[0].referencedByStepIds).toEqual([
      result.process.steps[0].stepId,
    ]);
  });

  it("목록 서수가 절차를 이루면 제목은 안 본다 — 지금 읽히는 것들이 안 바뀐다", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("## 1. 머리\n\n1. 첫 단계\n2. 둘째 단계\n\n## 2. 다른 머리\n"),
    });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.process.steps.map((step) => step.exactText)).toEqual([
      "첫 단계",
      "둘째 단계",
    ]);
  });

  it("절 안쪽 번호 목록이 조각날 때는 제목 절차가 이긴다", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      // 절마다 1. 로 다시 시작하는 목록 — 그대로 세면 1,2,1 이라 절차가 아니다.
      text: skill("## 1. 머리\n\n1. 가\n2. 나\n\n## 2. 다른 머리\n\n1. 다\n"),
    });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.process.steps.map((step) => step.exactText)).toEqual(["머리", "다른 머리"]);
  });

  it("코드 블록 안의 제목은 제목이 아니다", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("```sh\n# 1. 이건 주석이다\n# 2. 이것도\n```\n\n산문만 있다.\n"),
    });
    expect(result.state).toBe("unavailable");
    if (result.state !== "unavailable") return;
    expect(result.diagnostics.map((d) => d.code)).toContain("numbered_steps_unavailable");
  });

  it("건너뛰거나 되돌아가는 번호는 거절한다 — 추측해서 메우지 않는다", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("## 1. 하나\n\n## 3. 셋\n\n## 4. 넷\n"),
    });
    expect(result.state).toBe("unavailable");
  });

  it("제목 하나뿐이면 절차로 보지 않는다", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/process-test/SKILL.md",
      text: skill("## 1. 하나뿐\n\n본문.\n"),
    });
    expect(result.state).toBe("unavailable");
  });
});
