import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildNodeProfileCliCommand,
  buildNodeProfileMcpCall,
  buildReachabilityCliCommand,
  buildReachabilityMcpCall,
  resolveReachabilityQuerySlug,
} from "./reachability-copy";

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

describe("reachability copy helpers", () => {
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

  it("builds copyable MCP and CLI reachability calls", () => {
    const args = {
      slug: "capabilities/cli-developer-entry",
      direction: "incoming" as const,
      depth: 2 as const,
      limit: 12,
    };

    expect(buildReachabilityMcpCall(args)).toBe(
      'query_ontology({"operation":"reachability","slug":"capabilities/cli-developer-entry","direction":"incoming","depth":2,"limit":12})',
    );
    expect(buildReachabilityCliCommand(args)).toBe(
      "oh-my-ontology reachability capabilities/cli-developer-entry --direction incoming --depth 2 --limit 12",
    );
  });

  it("builds copyable MCP and CLI node profile calls", () => {
    const args = {
      slug: "capabilities/cli-developer-entry",
      limit: 8,
    };

    expect(buildNodeProfileMcpCall(args)).toBe(
      'query_ontology({"operation":"node_profile","slug":"capabilities/cli-developer-entry","limit":8})',
    );
    expect(buildNodeProfileCliCommand(args)).toBe(
      "oh-my-ontology node capabilities/cli-developer-entry --limit 8",
    );
  });
});
