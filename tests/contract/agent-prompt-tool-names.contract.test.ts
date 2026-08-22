import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildAgentAnalyzePrompt,
  buildAgentSetupPrompt,
} from "@/shared/config/agent-prompts";

/**
 * **Instructions that fail the moment they are pasted are a trap, not help.**
 *
 * These prompts are strings a user copies verbatim into their own agent. If even one
 * tool name in them does not exist, the agent stops at that line and the user digs
 * through their own configuration, never suspecting the sentence we handed them.
 *
 * So the names are **compared against the MCP server's real tool list** — the server
 * source is the source of truth, not a second list we maintain by hand (a duplicate
 * starts drifting immediately).
 *
 * Two unusable things are blocked alongside: skills that exist only in our repository
 * (`/ontology-*`) and `npx ontology-atlas`, which is not in the registry. Both are
 * 404s in a user's environment.
 */
const MCP_INDEX = join(process.cwd(), "mcp", "src", "index.js");

function registeredToolNames(): Set<string> {
  const source = readFileSync(MCP_INDEX, "utf8");
  const names = new Set<string>();
  for (const match of source.matchAll(/name:\s*["']([a-z][a-z0-9_]*)["']/g)) {
    names.add(match[1]);
  }
  return names;
}

/**
 * Selects only the `snake_case` tokens in a prompt that are **tool names**.
 *
 * Two other vocabularies share that syntax without being tools: the vault schema's
 * **relation types** (`depends_on` and friends) and agent **config file names**
 * (`mcp_config.json`). Neither belongs in the MCP tool list, so counting them as
 * tools would turn this gate falsely red every time — and then nobody looks at it.
 */
const NOT_TOOLS = new Set([
  // Vault relation types — vocabulary from `mcp/src/schema.mjs`.
  "depends_on",
  "is_a",
  "relates_to",
  // Agent config file names.
  "mcp_config",
]);

function citedToolNames(prompt: string): string[] {
  const cited = new Set<string>();
  for (const match of prompt.matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)) {
    if (!NOT_TOOLS.has(match[1])) cited.add(match[1]);
  }
  return [...cited];
}

describe("복사 지시문 — 실재하는 것만 부른다", () => {
  const registered = registeredToolNames();

  it("탐지기가 빈 집합 위에서 돌지 않는다 — MCP 도구 목록이 실제로 읽힌다", () => {
    expect(registered.size).toBeGreaterThan(20);
    expect(registered.has("connection_info")).toBe(true);
  });

  for (const [label, prompt] of [
    ["analyze", buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" })],
    ["setup", buildAgentSetupPrompt({ vaultPath: "/tmp/vault" })],
  ] as const) {
    it(`${label} 프롬프트가 부르는 도구는 전부 MCP 에 등록돼 있다`, () => {
      const unknown = citedToolNames(prompt).filter((n) => !registered.has(n));
      expect(unknown).toEqual([]);
    });

    it(`${label} 프롬프트는 사용자 환경에 없는 경로를 안 부른다`, () => {
      expect(prompt).not.toContain("npx ontology-atlas");
      expect(prompt).not.toMatch(/\/ontology-(bootstrap|sync|extract)/);
    });

    it(`${label} 프롬프트는 볼트 경로를 문장 안에 싣는다`, () => {
      // Without the path the agent does not know which folder is meant — the hard-coded
      // `.` incident was exactly that shape.
      expect(prompt).toContain("/tmp/vault");
    });
  }

  it("analyze 프롬프트는 **승인 전 쓰기 금지**를 명시한다", () => {
    /*
     * Setup prompts of this kind usually end in autonomous execution. This paragraph is
     * where the contract that a human arbitrates meaning is written into the instructions
     * themselves — delete it and our prompt becomes a translation of somebody else's.
     */
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });
    expect(prompt).toMatch(/do not call add_concept/i);
    expect(prompt).toMatch(/approved/i);
  });

  it("경로를 모르면 그 사실을 문장으로 말한다 — 빈 자리를 남기지 않는다", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: null });
    expect(prompt).toContain("the folder you are opened in");
  });
});
