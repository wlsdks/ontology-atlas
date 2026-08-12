import { describe, expect, it } from "vitest";

import { deriveSkillProcess } from "./process-ir";

const skill = (body: string) =>
  `---\nname: semantic-test\ndescription: Exercise exact semantic grammar\n---\n\n${body}`;

describe("skill process exact semantic overlay", () => {
  it("admits an exact whole-step branch label without creating a control-flow edge", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/semantic-test/SKILL.md",
      text: skill("1. If the build is red, go to step 3.\n2. Wait.\n3. Repair it.\n"),
    });

    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    const branch = result.process.steps[0];
    expect(branch.semanticLabels).toEqual([
      {
        kind: "branch",
        guard: "the build is red",
        targetOrdinal: 3,
        sourceSpan: branch.sourceSpan,
        sourceDigest: result.process.source.digest,
      },
    ]);
    expect(result.process.steps[1].semanticLabels).toEqual([]);
    expect(result.process.edges).toEqual([]);
  });

  it("admits an exact retry label with a literal target and condition", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/semantic-test/SKILL.md",
      text: skill("1. Run the check.\n2. Retry step 1 until the smoke test passes.\n"),
    });

    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    const retry = result.process.steps[1];
    expect(retry.semanticLabels).toEqual([
      {
        kind: "retry",
        targetOrdinal: 1,
        condition: "the smoke test passes",
        sourceSpan: retry.sourceSpan,
        sourceDigest: result.process.source.digest,
      },
    ]);
    expect(result.process.edges).toEqual([]);
  });

  it("admits an exact whole-process stop condition", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/semantic-test/SKILL.md",
      text: skill("1. Stop the process if approval is revoked.\n"),
    });

    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    const stop = result.process.steps[0];
    expect(stop.semanticLabels).toEqual([
      {
        kind: "stop",
        condition: "approval is revoked",
        sourceSpan: stop.sourceSpan,
        sourceDigest: result.process.source.digest,
      },
    ]);
  });

  it("admits verification only when target, action, and acceptance criterion are literal", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/semantic-test/SKILL.md",
      text: skill(
        "1. Verify the release archive by comparing its SHA-256; accept when the published digest matches.\n",
      ),
    });

    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    const verify = result.process.steps[0];
    expect(verify.semanticLabels).toEqual([
      {
        kind: "verify",
        target: "the release archive",
        action: "comparing its SHA-256",
        criterion: "the published digest matches",
        sourceSpan: verify.sourceSpan,
        sourceDigest: result.process.source.digest,
      },
    ]);
  });

  it.each([
    "Rollback deadline: stop at 17:00.",
    "Stop mutation after writing the receipt.",
    "The smoke retry passes on the second run.",
    "Record the checksum mismatch for review.",
    "If approval is missing, stop the process.",
    "If the build is red, go to step 2; otherwise continue.",
    "Retry step 9 until the smoke test passes.",
  ])("keeps ambiguous keyword-like text unlabeled with one diagnostic: %s", (exactText) => {
    const result = deriveSkillProcess({
      relativePath: "skills/semantic-test/SKILL.md",
      text: skill(`1. ${exactText}\n`),
    });

    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.process.steps[0].semanticLabels).toEqual([]);
    expect(result.process.diagnostics).toEqual([
      {
        code: "semantic_ambiguous",
        severity: "warning",
        message: "Semantic syntax is ambiguous; no label was derived.",
        sourceSpan: result.process.steps[0].sourceSpan,
        sourceDigest: result.process.source.digest,
      },
    ]);
    expect(result.process.edges).toEqual([]);
  });

  it("leaves ordinary prose unlabeled without manufacturing a warning", () => {
    const result = deriveSkillProcess({
      relativePath: "skills/semantic-test/SKILL.md",
      text: skill("1. Read the current source.\n"),
    });

    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.process.steps[0].semanticLabels).toEqual([]);
    expect(result.process.diagnostics).toEqual([]);
  });
});
