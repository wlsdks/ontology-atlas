import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildNewNodeDoc } from "@/entities/docs-vault";
import { buildProposal } from "@/features/vault-agent/model/proposals/proposal-builder";
import { VAULT_CREATED_BY_HUMAN } from "@/entities/docs-vault";

/**
 * Value is `human` or `agent:<name>`, shared by the server and the app; normalisation preserves but
 * never invents a value; absence is unknown, not a defect. The server's own write paths, schema
 * and `created_by=` filter are tested in its crates.
 */

const serverWriteSupport = readFileSync(
  resolve(__dirname, "../../../src-tauri/crates/mcp-server/src/tools/writes/write_support.rs"),
  "utf8",
);

describe("created_by value convention: the server and the app use the same values", () => {
  it("the human value is `human`", () => {
    expect(VAULT_CREATED_BY_HUMAN).toBe("human");
  });

  it("the server stamps `agent:<name>`, and `agent:unknown` rather than `human` when the name is unknown", () => {
    // The path proves an agent wrote it but not which agent; there is no route that falls back to
    // human. The app's chat panel stamps the same two shapes (below).
    expect(serverWriteSupport).toContain('format!("agent:{name}")');
    expect(serverWriteSupport).toContain('"agent:unknown".to_string()');
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
