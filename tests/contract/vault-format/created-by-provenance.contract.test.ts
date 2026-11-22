import { describe, expect, it } from "vitest";

import {
  buildFrontmatter as buildMcp,
  missingExpectedFields as missingMcp,
  agentCreatedBy as agentMcp,
  CREATED_BY_KEY as KEY_MCP,
  CREATED_BY_HUMAN as HUMAN_MCP,
  CREATED_BY_AGENT_UNKNOWN as UNKNOWN_MCP,
  VAULT_KINDS as KINDS_MCP,
  VAULT_KIND_SCHEMA as SCHEMA_MCP,
} from "../../../mcp/src/schema.mjs";
import { parseFilter } from "../../../mcp/src/query.mjs";
import { buildNewNodeDoc } from "@/entities/docs-vault";
import { buildProposal } from "@/features/vault-agent/model/proposals/proposal-builder";
import { VAULT_CREATED_BY_HUMAN } from "@/entities/docs-vault";

const TEST_UID = "01890f3e-7b5d-4c0a-8f14-123456789abc";

/**
 * Value is `human` or `agent:<name>`, shared by mcp and web; normalisation preserves but never
 * invents a value; absence is unknown, not a defect. MCP write paths are covered by
 * `mcp/src/integration.test.mjs`.
 */

/** The `.mjs` schema is untyped — narrowed only at the indexing site. */
function schemaFor(schema: unknown, kind: string): { optional: string[] } {
  return (schema as Record<string, { optional: string[] }>)[kind];
}
function fmOf(frontmatter: unknown): Record<string, unknown> {
  return frontmatter as Record<string, unknown>;
}

describe("created_by value convention: mcp and web use the same constants", () => {
  it("the key name and the human value are identical in mcp and web", () => {
    expect(KEY_MCP).toBe("created_by");
    expect(HUMAN_MCP).toBe("human");
    expect(VAULT_CREATED_BY_HUMAN).toBe(HUMAN_MCP);
  });

  it("agentCreatedBy produces `agent:<name>`", () => {
    expect(agentMcp("codex")).toBe("agent:codex");
    expect(agentMcp("  claude-code  ")).toBe("agent:claude-code");
  });

  it("when the name is unknown it falls to agent:unknown rather than human", () => {
    // The path proves an agent wrote it but not which agent. Even then there must be no
    // route that falls back to human.
    for (const noName of [null, undefined, "", "   "]) {
      expect(agentMcp(noName)).toBe(UNKNOWN_MCP);
    }
    expect(UNKNOWN_MCP).toBe("agent:unknown");
    expect(UNKNOWN_MCP.startsWith("agent:")).toBe(true);
    expect(UNKNOWN_MCP).not.toBe(HUMAN_MCP);
  });
});

describe("schema: registered as an optional field and preserved across a round trip", () => {
  it("every kind accepts created_by as optional", () => {
    for (const kind of KINDS_MCP as string[]) {
      expect(schemaFor(SCHEMA_MCP, kind).optional).toContain(KEY_MCP);
    }
  });

  it("a given value stays as it is, for both human and agent", () => {
    const base = { uid: TEST_UID, slug: "capabilities/x", kind: "capability", title: "X" };
    expect(fmOf(buildMcp({ ...base, created_by: HUMAN_MCP })).created_by).toBe("human");
    expect(fmOf(buildMcp({ ...base, created_by: agentMcp("codex") })).created_by).toBe(
      "agent:codex",
    );
  });

  it("when no value is given the key itself does not appear, with zero retroactive derivation", () => {
    for (const kind of KINDS_MCP) {
      const input = { uid: TEST_UID, slug: `${kind}-x`, kind, title: "X" };
      const fm = buildMcp(input);
      expect(Object.prototype.hasOwnProperty.call(fm, KEY_MCP)).toBe(false);
    }
  });

  it("absence is not a defect, so no kind produces a validation warning", () => {
    for (const kind of KINDS_MCP) {
      const fm = { slug: "x", kind, title: "X", domain: "d" };
      expect(missingMcp(kind, fm)).not.toContain(KEY_MCP);
    }
  });
});

describe("query filter: \"show only what people made\"", () => {
  const human = { slug: "a", frontmatter: { kind: "capability", created_by: "human" } };
  const agent = { slug: "b", frontmatter: { kind: "capability", created_by: "agent:codex" } };
  const unknown = { slug: "c", frontmatter: { kind: "capability" } };

  it("created_by=human picks human authorship only", () => {
    const { match } = parseFilter("created_by=human");
    expect([human, agent, unknown].filter(match).map((d) => d.slug)).toEqual(["a"]);
  });

  it("a node without a stamp is not counted as human", () => {
    const { match } = parseFilter("created_by=human");
    expect(match(unknown)).toBe(false);
  });

  it("`agent:<name>` can be addressed with quotes", () => {
    const { match } = parseFilter('created_by="agent:codex"');
    expect([human, agent, unknown].filter(match).map((d) => d.slug)).toEqual(["b"]);
  });

  it("combines with other predicates", () => {
    const { match } = parseFilter("kind=capability AND created_by=human");
    expect([human, agent, unknown].filter(match).map((d) => d.slug)).toEqual(["a"]);
  });
});

describe("map concept creation: a node a person made", () => {
  it("a directly saved document carries created_by: human", () => {
    const { markdown } = buildNewNodeDoc({
      kind: "capability",
      title: "토큰 발급",
      domain: "auth",
      createdBy: "human",
    });
    expect(markdown).toContain("created_by: human");
  });

  it("the human stamp lives only inside the frontmatter and does not pollute the body", () => {
    const { markdown } = buildNewNodeDoc({
      kind: "domain",
      title: "Auth",
      createdBy: "human",
    });
    const [, frontmatter, body] = markdown.split("---");
    expect(frontmatter).toContain("created_by: human");
    expect(body).not.toContain("created_by");
  });
});

describe("internal chat panel apply: the draft author is the agent", () => {
  const port = {
    nodes: [],
    edges: [],
    docs: [],
    readDocText: async () => null,
  };
  const labels = {
    createFile: (path: string) => `create ${path}`,
    modifyFile: (path: string) => `modify ${path}`,
    addRelation: () => "relation",
  };

  it("a new node proposed by the panel is stamped agent:<provider>", async () => {
    const proposal = await buildProposal({
      intents: [
        { name: "add_concept", args: { slug: "capabilities/x", kind: "capability", title: "X" } },
      ] as never,
      port,
      readNodesThisTurn: [],
      vaultIsGit: false,
      locale: "ko",
      labels,
      agentName: "anthropic",
    });
    const after = proposal?.changes[0]?.files[0]?.after ?? "";
    expect(after).toContain('created_by: "agent:anthropic"');
    // A person clicking "apply" is approval, not authorship — it does not flip to human.
    expect(after).not.toContain("created_by: human");
  });

  it("when the provider is unknown it is agent:unknown rather than human", async () => {
    const proposal = await buildProposal({
      intents: [
        { name: "add_concept", args: { slug: "capabilities/y", kind: "capability", title: "Y" } },
      ] as never,
      port,
      readNodesThisTurn: [],
      vaultIsGit: false,
      locale: "ko",
      labels,
      agentName: null,
    });
    const after = proposal?.changes[0]?.files[0]?.after ?? "";
    expect(after).toContain('created_by: "agent:unknown"');
  });
});
