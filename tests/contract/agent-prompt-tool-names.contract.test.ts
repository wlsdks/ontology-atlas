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
    // Whitespace-tolerant: the instruction is hard-wrapped, and a line break
    // falling between "Do" and "not" is not a change of meaning.
    expect(prompt).toMatch(/do\s+not call add_concept/i);
    expect(prompt).toMatch(/approv(al|ed)/i);
  });

  it("경로를 모르면 그 사실을 문장으로 말한다 — 빈 자리를 남기지 않는다", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: null });
    expect(prompt).toContain("the folder you are opened in");
  });

  /**
   * **A prompt that names the write tools must name the field that authorizes them.**
   *
   * This one used to end "write only approved items". A walkthrough pasted it into a
   * fresh agent, approved the proposal, and got nothing written: the server answered
   * `canWrite: false`, because acceptance binds to a generated plan digest that a
   * blanket approval predates. The instruction had promised a path the server
   * refuses and named none of the fields that would explain the refusal, so the
   * person had no way to learn what they had missed.
   *
   * The gate was right. The second, hand-shortened copy of the lifecycle was wrong —
   * and a second hand-written copy of a contract is exactly what drifted when the
   * insights surface disagreed with the CLI about what a node is.
   *
   * These two assertions are the cheapest thing that keeps the copies honest: the
   * field names come from the server's own required output schema, so a prompt
   * cannot again promise a write while staying silent about what authorizes one.
   */
  it("쓰기 도구를 부르는 프롬프트는 그 쓰기를 허가하는 필드도 말한다", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });
    const namesWriteTools = /add_concepts?|add_relations?/.test(prompt);
    expect(namesWriteTools).toBe(true);

    const source = readFileSync(MCP_INDEX, "utf8");
    for (const field of ["canWrite", "writePlan", "nextStep"]) {
      expect(
        source.includes(`${field}:`),
        `${field} must still be part of the server's response for this prompt to name it`,
      ).toBe(true);
      expect(
        prompt,
        `the prompt names write tools, so it must also name ${field} — otherwise it promises a write the server may refuse without saying why`,
      ).toContain(field);
    }
  });

  /**
   * **Do not send a single-context agent after a state it cannot honestly reach.**
   *
   * Writing needs a qualification packet whose evaluator is not its builder; the
   * server fails closed on `maker-self-evaluation` when the two ids match, and the
   * lifecycle tells an agent that cannot run an independent lane to stop and ask
   * for a handoff. An instruction that says "keep going until canWrite is true"
   * leaves such an agent looping or inventing the second actor — and the first
   * repair of this prompt said exactly that.
   *
   * The independence rule is read from the server rather than restated, so this
   * fails if that boundary ever moves.
   */
  it("혼자서는 닿을 수 없는 상태를 쫓으라고 시키지 않는다", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });
    const source = readFileSync(MCP_INDEX, "utf8");
    expect(
      source.includes("maker-independence") || source.includes("source-hidden"),
      "the server must still require an evaluator distinct from the builder",
    ).toBe(true);

    expect(prompt).not.toMatch(/keep following it until canWrite is true/i);
    expect(prompt).toMatch(/independent evaluation/i);
    expect(prompt).toMatch(/do not fabricate an evaluator/i);
    expect(prompt).toMatch(/proposal, and stop\./i);
  });

  /**
   * The digest is a pure function of the submitted proposal, so a proposal carried
   * back verbatim reproduces the digest the human accepted. A fresh session that
   * re-authors instead invalidates its own approval, which is what made the
   * walkthrough's three turns produce three different plans.
   */
  it("사람이 본 그 제안을 그대로 보관하라고 말한다", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });
    expect(prompt).toMatch(/save the exact proposal/i);
    expect(prompt).toMatch(/verbatim reproduces the same\s+digest/i);
  });

  it("analyze 프롬프트는 승인만으로 쓰기가 되는 것처럼 말하지 않는다", () => {
    // The exact sentence that produced the dead end, and the shape of any successor.
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });
    expect(prompt).not.toMatch(/write only approved items/i);
    expect(prompt).toMatch(/approval alone does not\s+make it true/i);
  });
});
