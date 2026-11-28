import { describe, expect, it } from "vitest";

import {
  buildAgentAnalyzePrompt,
  buildAgentSetupPrompt,
} from "@/shared/config/agent/agent-prompts";

import { advertisedToolNames } from "../server-session/tool-surface";

/**
 * **Instructions that fail the moment they are pasted are a trap, not help.**
 *
 * These prompts are strings a user copies verbatim into their own agent. If even one
 * tool name in them does not exist, the agent stops at that line and the user digs
 * through their own configuration, never suspecting the sentence we handed them.
 *
 * So the names are **compared against the MCP server's real tool list** — the surface the
 * server embeds is the source of truth, not a second list we maintain by hand (a duplicate
 * starts drifting immediately).
 *
 * Two unusable things are blocked alongside: skills that exist only in our repository
 * (`/ontology-*`) and `npx ontology-atlas`, which is not in the registry. Both are
 * 404s in a user's environment.
 */
function registeredToolNames(): Set<string> {
  return new Set(advertisedToolNames());
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
  // Vault relation types — vocabulary from the vault schema.
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

    expect(prompt).toMatch(/do not write to the vault yet/i);
    expect(prompt, "ordinary writing must write only what the person approved").toMatch(/write what they\s+approve/i);
    expect(prompt).not.toMatch(/write only approved items/i);
    expect(prompt).toMatch(/human review/i);
    expect(prompt).toMatch(/approv(al|ed|e)/i);
  });

  it("when the path is unknown it says so in a sentence, leaving no blank slot", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: null });
    expect(prompt).toContain("the folder you are opened in");
  });

  /**
   * The only route to a written vault is the reviewed batch: the tools that land it are the ones
   * the server serves, named in the order the construction card runs them. The bulk proposal and
   * its evaluator are cut, so the prompt must not send an agent after them.
   */
  it("names the reviewed-batch write path in order, each tool one the server serves", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });
    const path = ["add_concepts", "add_relations", "validate_vault", "connect_project_source", "finalize_project_meaning"];
    for (const tool of path) {
      expect(registered.has(tool), `${tool} must still be a tool the server serves`).toBe(true);
    }
    // validate_vault is also named in step 1, so each tool is searched for after the one before it.
    let from = prompt.indexOf("add_concepts");
    for (const tool of path.slice(1)) {
      const at = prompt.indexOf(tool, from);
      expect(at, `${tool} follows the tool before it in the prompt`).toBeGreaterThan(from);
      from = at;
    }
    expect(from).toBeGreaterThan(-1);
    expect(prompt).toMatch(/a few concepts at a time/i);
  });

  it("does not send the agent after the cut bulk proposal or its independent evaluator", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });
    expect(prompt).not.toMatch(/canWrite|writePlan|proposalValidation|evaluator|digest|qualification below/i);
  });
});
