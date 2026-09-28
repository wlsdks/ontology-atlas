import { describe, expect, it } from "vitest";

import { AGENT_FILE_RULES } from "../../cli/src/lib/agent-files.mjs";
import { unwritableSlugIssue } from "../../mcp/src/schema.mjs";
import { CASES } from "../fixtures/agent-files-cases.mjs";

const instructionRecords = CASES.flatMap((c) => c.expected.records).filter((record) => record.kind === "instructions");

describe("vault write tools refuse every file the agent-files classifier calls instructions", () => {
  it("has a shared case for every instruction rule the classifier defines", () => {
    const ruled = AGENT_FILE_RULES.filter((rule) => rule.kind === "instructions").map((rule) => rule.id);
    expect([...new Set(instructionRecords.map((record) => record.ruleId))].sort()).toEqual([...ruled].sort());
  });

  it("refuses a write to each instruction file in the shared cases", () => {
    for (const { path } of instructionRecords) {
      expect(unwritableSlugIssue(path.replace(/\.md$/, "")), path).not.toBeNull();
    }
  });
});
