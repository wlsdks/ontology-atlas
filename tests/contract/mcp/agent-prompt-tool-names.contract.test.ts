import { readdirSync, readFileSync } from "node:fs";
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
const MCP_DEFINITIONS = join(process.cwd(), "mcp", "src", "server", "tool-definitions");
const MCP_DEFINITION_FILES = readdirSync(MCP_DEFINITIONS)
  .filter((file) => file.endsWith(".mjs"))
  .map((file) => join(MCP_DEFINITIONS, file));
const MCP_SCHEMAS = join(process.cwd(), "mcp", "src", "server", "tool-schemas");
const MCP_SCHEMA_FILES = readdirSync(MCP_SCHEMAS)
  .filter((file) => file.endsWith(".mjs"))
  .map((file) => join(MCP_SCHEMAS, file));
/** Names and descriptions live in the tool definitions and the schemas they are built from. */
const MCP_SURFACE_FILES = [
  join(process.cwd(), "mcp", "src", "server", "registry.mjs"),
  ...MCP_DEFINITION_FILES,
  ...MCP_SCHEMA_FILES,
];

function registeredToolNames(): Set<string> {
  const source = MCP_DEFINITION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
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

describe("copied instructions name only what exists", () => {
  const registered = registeredToolNames();

  it("the detector does not run on an empty set, since the MCP tool list is actually read", () => {
    expect(registered.size).toBeGreaterThan(20);
    expect(registered.has("connection_info")).toBe(true);
  });

  for (const [label, prompt] of [
    ["analyze", buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" })],
    ["setup", buildAgentSetupPrompt({ vaultPath: "/tmp/vault" })],
  ] as const) {
    it(`every tool the ${label} prompt calls is registered in the MCP`, () => {
      const unknown = citedToolNames(prompt).filter((n) => !registered.has(n));
      expect(unknown).toEqual([]);
    });

    it(`the ${label} prompt names no path that is absent from the user's environment`, () => {
      expect(prompt).not.toContain("npx ontology-atlas");
      expect(prompt).not.toMatch(/\/ontology-(bootstrap|sync|extract)/);
    });

    it(`the ${label} prompt carries the vault path inside the sentence`, () => {
      expect(prompt).toContain("/tmp/vault");
    });
  }

  it("the analyze prompt states **no writes before approval**", () => {
    /*
     * Setup prompts of this kind usually end in autonomous execution. This paragraph is
     * where the contract that a human arbitrates meaning is written into the instructions
     * themselves — delete it and our prompt becomes a translation of somebody else's.
     */
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });

    // Assert the invariant, not one sentence: the bulk `writePlan` is gated and ordinary writing is not;
    // both paths write only what a person approved first.
    expect(
      prompt,
      "the bulk plan must stay unwritten while the server says canWrite is false",
    ).toMatch(/not write the proposal wholesale[\s\S]{0,80}canWrite is\s+false/i);
    expect(
      prompt,
      "the incremental path must write only what the person approved",
    ).toMatch(/write what they\s+approve/i);
    expect(prompt).toMatch(/human review/i);
    expect(prompt).toMatch(/approv(al|ed|e)/i);
  });

  it("when the path is unknown it says so in a sentence, leaving no blank slot", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: null });
    expect(prompt).toContain("the folder you are opened in");
  });

  /**
   * A prompt that names the write tools must name the fields that authorize them, taken from the
   * answer the server builds, since acceptance binds to a generated plan digest.
   */
  it("a prompt that calls a write tool also names the field that permits that write", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });
    const namesWriteTools = /add_concepts?|add_relations?/.test(prompt);
    expect(namesWriteTools).toBe(true);

    // The survey declares no output schema, so the fields are read where the answer is built.
    const source = readFileSync(join(process.cwd(), "mcp", "src", "analyze", "candidates", "repo-structure.mjs"), "utf8");
    for (const field of ["canWrite", "writePlan", "nextStep"]) {
      expect(
        source.includes(`proposalValidation.${field} =`),
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
   *
   * **Stopping was only half the repair.** The first fix made the agent stop
   * honestly, which is where a real installer then sat: told what was missing and
   * never what was available. The bulk `writePlan` is gated, but `add_concepts`
   * and `add_relation` are not, and the shipped growth path uses exactly those.
   * So the prompt must both refuse the unreachable state *and* name the path that
   * stays open. The write tools are read from the server's own tool list, so this
   * fails if that boundary ever moves too.
   */
  it("does not chase a state it cannot reach alone, and names the open path instead", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });
    const source = MCP_SURFACE_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(
      source.includes("maker-independence") || source.includes("source-hidden"),
      "the server must still require an evaluator distinct from the builder",
    ).toBe(true);

    expect(prompt).not.toMatch(/keep following it until canWrite is true/i);
    expect(prompt).toMatch(/independent evaluation/i);
    expect(prompt).toMatch(/do not fabricate an evaluator/i);
    expect(prompt).toMatch(/stop pursuing the\s+whole plan/i);

    expect(
      source.includes("'add_concepts'") || source.includes('"add_concepts"'),
      "the incremental path the prompt offers must still be a tool the server serves",
    ).toBe(true);
    expect(
      prompt,
      "an agent that cannot run the evaluation lane must be given the ungated path, not left at a dead end",
    ).toMatch(/a few concepts at a time/i);
    expect(prompt).toMatch(/not gated on the qualification/i);
  });

  /**
   * The digest is a pure function of the submitted proposal, so a proposal carried
   * back verbatim reproduces the digest the human accepted. A fresh session that
   * re-authors instead invalidates its own approval, which is what made the
   * walkthrough's three turns produce three different plans.
   */
  it("tells the agent to store the proposal the person saw exactly as shown", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });
    expect(prompt).toMatch(/save the exact proposal/i);
    expect(prompt).toMatch(/verbatim reproduces the same\s+digest/i);
  });

  it("the analyze prompt does not suggest that approval alone performs the write", () => {
    // The exact sentence that produced the dead end, and the shape of any successor.
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });
    expect(prompt).not.toMatch(/write only approved items/i);
    expect(prompt).toMatch(/approval alone does not\s+make it true/i);
  });
});
