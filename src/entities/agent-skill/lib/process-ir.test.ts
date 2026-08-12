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
