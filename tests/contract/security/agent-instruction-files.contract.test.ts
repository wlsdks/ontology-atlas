import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { standingApproval } from "@/features/acp-session/model/permissions/standing-approval";
import { AGENT_FILE_RULES } from "@/entities/agent-files";
import { CASES } from "../../fixtures/agent-files-cases.mjs";
import golden from "../../fixtures/unwritable-slug-golden.json";

/** What the script server answered for each slug (recorded 2026-11-28): refused at all, and refused as instructions. */
const recorded = golden.slugs as Record<string, { refused: boolean; asInstructions: boolean }>;
function serverVerdict(slug: string) {
  const verdict = recorded[slug];
  if (!verdict) throw new Error(`no recorded verdict for ${JSON.stringify(slug)}; record it in unwritable-slug-golden.json`);
  return verdict;
}

const instructionRecords = CASES.flatMap((c) => c.expected.records).filter((record) => record.kind === "instructions");

// The server's answers are the recorded ones; the app side runs live.
describe("vault write tools refuse every file the agent-files classifier calls instructions", () => {
  it("has a shared case for every instruction rule the classifier defines", () => {
    const ruled = AGENT_FILE_RULES.filter((rule) => rule.kind === "instructions").map((rule) => rule.id);
    expect([...new Set(instructionRecords.map((record) => record.ruleId))].sort()).toEqual([...ruled].sort());
  });

  it("refuses a write to each instruction file in the shared cases", () => {
    for (const { path } of instructionRecords) {
      expect(serverVerdict(path.replace(/\.md$/, "")).refused, path).toBe(true);
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
      const serverRefusesAsInstructions = serverVerdict(slug).asInstructions;
      expect(standingApproval(vaultEdit(`${slug}.md`), context) === null, slug).toBe(serverRefusesAsInstructions);
    }
  });

  it("agrees with the server on invisible and control characters", () => {
    for (const code of [0x00, 0x07, 0x1b, 0x7f, 0x85, 0xad, 0x200b, 0x200e, 0x202e, 0x2028, 0x2029, 0x2060, 0xfeff, 0x41]) {
      const slug = `notes/a${String.fromCodePoint(code)}b`;
      const serverRefuses = serverVerdict(slug).refused;
      expect(standingApproval(vaultEdit(`${slug}.md`), context) === null, code.toString(16)).toBe(serverRefuses);
    }
  });
});

describe("the Rust server names the same instruction files as the vault write tools", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../../src-tauri/crates/confined-files/src/slug_rules.rs", import.meta.url)),
    "utf8",
  );
  const list = /AGENT_INSTRUCTION_FILE_STEMS: \[&str; \d+\] = \[([^\]]*)\]/.exec(source)?.[1] ?? "";
  const rustStems = [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const refusedAsInstructions = (stem: string) => serverVerdict(stem).asInstructions;

  it("reads a non-empty list from the Rust source", () => {
    expect(rustStems.length).toBeGreaterThan(0);
  });

  it("lists exactly the stems the script server refused as instructions", () => {
    const pool = new Set([
      ...rustStems,
      ...["agents", "agents.override", "claude", "claude.local", "gemini", "readme", "copilot-instructions", "notes"],
      ...instructionRecords.map((record) => record.path.replace(/\.md$/i, "").split("/").at(-1)!.toLowerCase()),
    ]);
    for (const stem of pool) {
      expect(rustStems.includes(stem), stem).toBe(refusedAsInstructions(stem));
    }
  });
});
