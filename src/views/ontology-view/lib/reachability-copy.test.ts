import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { resolveReachabilityQuerySlug } from "./reachability-copy";

const APPROVED_AT = new Date("2026-05-24T00:00:00Z");

function node(partial: Partial<KnowledgeGraphNode>): KnowledgeGraphNode {
  return {
    id: "capability:cli",
    title: "CLI",
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: APPROVED_AT,
    lastApprovedBy: "test",
    ...partial,
  };
}

describe("resolveReachabilityQuerySlug", () => {
  it("resolves canonical frontmatter nodes to MCP slugs", () => {
    expect(
      resolveReachabilityQuerySlug(
        node({
          id: "capability:cli-developer-entry",
          kind: "capability",
          evidenceIds: ["ontology/capabilities/cli-developer-entry"],
        }),
      ),
    ).toBe("capabilities/cli-developer-entry");

    expect(
      resolveReachabilityQuerySlug(
        node({
          id: "domain:views",
          kind: "domain",
          evidenceIds: ["domains/views"],
        }),
      ),
    ).toBe("domains/views");
  });

  it("keeps stub or synthetic nodes from producing failing MCP commands", () => {
    expect(
      resolveReachabilityQuerySlug(
        node({
          id: "element:clisrccommandsaddmjs",
          kind: "element",
          evidenceIds: ["ontology/capabilities/cli-developer-entry"],
        }),
      ),
    ).toBeNull();
    expect(resolveReachabilityQuerySlug(node({ id: "unknown:missing", kind: "unknown" }))).toBeNull();
  });
});
