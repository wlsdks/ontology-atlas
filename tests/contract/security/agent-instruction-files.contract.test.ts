import { describe, expect, it } from "vitest";

import { standingApproval } from "@/features/acp-session/model/permissions/standing-approval";
import { AGENT_FILE_RULES } from "../../../cli/src/lib/agent-setup/agent-files.mjs";
import { unwritableSlugIssue } from "../../../mcp/src/schema.mjs";
import { CASES } from "../../fixtures/agent-files-cases.mjs";

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

describe("auto-approve refuses every file the vault write tools refuse as instructions", () => {
  const context = { enabled: true, vaultRoot: "/vault", vaultMcpServerName: "atlas-vault" };
  const vaultEdit = (relativePath: string) => ({
    title: "Edit", toolCallId: "call-1", toolName: "Edit", toolKind: "edit", filePath: `/vault/${relativePath}`,
    rawInput: {}, reviewKind: "permission" as const, pathVerdict: "allow-inside-vault" as const,
    options: [{ optionId: "allow-once", kind: "allow_once", name: "Yes" }],
  });
  const stemVariants = ["agents", "agents.override", "claude", "claude.local", "gemini", "readme", "notes"]
    .flatMap((stem) => [stem, stem.toUpperCase(), `docs/${stem}`]);

  it("refuses an edit of each instruction file in the shared cases", () => {
    for (const { path } of instructionRecords) {
      expect(standingApproval(vaultEdit(path), context), path).toBeNull();
    }
  });

  it("agrees with the server on every instruction stem in any letter case", () => {
    for (const slug of stemVariants) {
      const serverRefusesAsInstructions = /instructions/.test(unwritableSlugIssue(slug) ?? "");
      expect(standingApproval(vaultEdit(`${slug}.md`), context) === null, slug).toBe(serverRefusesAsInstructions);
    }
  });

  it("agrees with the server on invisible and control characters", () => {
    for (const code of [0x00, 0x07, 0x1b, 0x7f, 0x85, 0xad, 0x200b, 0x200e, 0x202e, 0x2028, 0x2029, 0x2060, 0xfeff, 0x41]) {
      const slug = `notes/a${String.fromCodePoint(code)}b`;
      const serverRefuses = unwritableSlugIssue(slug) !== null;
      expect(standingApproval(vaultEdit(`${slug}.md`), context) === null, code.toString(16)).toBe(serverRefuses);
    }
  });
});
