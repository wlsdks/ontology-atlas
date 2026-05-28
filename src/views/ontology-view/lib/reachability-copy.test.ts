import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildAgentContextBundle,
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

  it("builds an agent-ready node proof bundle with graph DB checks", () => {
    const bundle = buildAgentContextBundle({
      slug: "capabilities/cli-developer-entry",
      direction: "outgoing",
      depth: 3,
      reachabilityLimit: 12,
      profileLimit: 8,
    });

    expect(bundle).toContain("# Selected ontology node proof");
    expect(bundle).toContain(
      '1. query_ontology({"operation":"node_profile","slug":"capabilities/cli-developer-entry","limit":8})',
    );
    expect(bundle).toContain(
      '2. query_ontology({"operation":"blast_radius","slug":"capabilities/cli-developer-entry","depth":2,"direction":"incoming"})',
    );
    expect(bundle).toContain(
      '3. query_ontology({"operation":"match_edges","from":"capabilities/cli-developer-entry","limit":10})',
    );
    expect(bundle).toContain(
      '4. query_ontology({"operation":"match_edges","to":"capabilities/cli-developer-entry","limit":10})',
    );
    expect(bundle).toContain(
      '5. query_ontology({"operation":"reachability","slug":"capabilities/cli-developer-entry","direction":"outgoing","depth":3,"limit":12})',
    );
    expect(bundle).toContain(
      '6. query_ontology({"operation":"query_plan","targetOperation":"all_paths","from":"capabilities/cli-developer-entry","to":"<target-slug>","maxHops":4,"searchBudget":1000,"limit":10})',
    );
    expect(bundle).toContain(
      '7. query_ontology({"operation":"all_paths","from":"capabilities/cli-developer-entry","to":"<target-slug>","maxHops":4,"searchBudget":1000,"limit":10})',
    );
    expect(bundle).toContain(
      '8. query_ontology({"operation":"relation_check","from":"capabilities/cli-developer-entry","to":"<target-slug>","type":"<relation-type>"})',
    );
    expect(bundle).toContain("oh-my-ontology match-edges [vault] --from capabilities/cli-developer-entry --limit 10");
    expect(bundle).toContain(
      "oh-my-ontology all-paths capabilities/cli-developer-entry '<target-slug>' [vault] --plan --max-hops 4 --limit 10 --search-budget 1000",
    );
    expect(bundle).toContain(
      "oh-my-ontology relation-check capabilities/cli-developer-entry '<target-slug>' '<relation-type>' [vault]",
    );
    expect(bundle).toContain("Report totalMatches, limited, and returned row count");
    expect(bundle).toContain("For all_paths, report limit, searchBudget");
    expect(bundle).toContain("# Post-change ontology sync gate");
    expect(bundle).toContain("it starts with 12 runtime graph DB checks");
    expect(bundle).toContain("## Runtime graph DB gate");
    expect(bundle).toContain("12 checks · pnpm dogfood:graph-db");
  });

  it("shell-quotes selected slugs in bundled CLI edge scans", () => {
    const bundle = buildAgentContextBundle({
      slug: "capabilities/bob's-builder",
      direction: "incoming",
      depth: 1,
      reachabilityLimit: 12,
      profileLimit: 8,
    });

    expect(bundle).toContain(
      "oh-my-ontology match-edges [vault] --from 'capabilities/bob'\\''s-builder' --limit 10",
    );
  });
});
