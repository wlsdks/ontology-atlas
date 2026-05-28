import { describe, expect, it } from "vitest";
import { formatBuilderProofPacket } from "./builder-proof-packet";

describe("formatBuilderProofPacket", () => {
  it("formats an overview proof packet when no node is selected", () => {
    const packet = formatBuilderProofPacket();

    expect(packet).toContain("# Builder graph proof");
    expect(packet).toContain("Setup gate:");
    expect(packet).toContain(
      "0. oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
    );
    expect(packet).toContain("1. oh-my-ontology agent-brief [vault] --graph-db-pack");
    expect(packet).toContain("query_ontology({\"operation\":\"workspace_brief\"");
    expect(packet).toContain("query_ontology({\"operation\":\"query_plan\",\"targetOperation\":\"match_nodes\"");
    expect(packet).toContain("query_ontology({\"operation\":\"facets\"");
    expect(packet).toContain("query_ontology({\"operation\":\"schema\"");
    expect(packet).toContain(
      'query_ontology({"operation":"match_edges","fromKind":"capability","toKind":"element","type":"elements"',
    );
    expect(packet).toContain("oh-my-ontology match-nodes [vault] --plan");
    expect(packet).toContain("oh-my-ontology match-edges [vault] --plan");
    expect(packet).toContain(
      "oh-my-ontology match-edges [vault] --plan --from-kind capability --to-kind element --type elements",
    );
    expect(packet).toContain("oh-my-ontology match-nodes [vault]");
    expect(packet).toContain("Run the setup gate first");
    expect(packet).toContain("Report totalMatches, limited, and returned row count");
    expect(packet).toContain("report relationType and via");
    expect(packet).toContain("evidence.pathsComplete");
    expect(packet).toContain("# Post-change ontology sync gate");
  });

  it("formats a focused proof packet for the selected vault slug", () => {
    const packet = formatBuilderProofPacket("capabilities/mcp-server");

    expect(packet).toContain("- Scope: selected node capabilities/mcp-server");
    expect(packet).toContain(
      'query_ontology({"operation":"node_profile","slug":"capabilities/mcp-server"',
    );
    expect(packet).toContain(
      'query_ontology({"operation":"match_edges","from":"capabilities/mcp-server"',
    );
    expect(packet).toContain(
      'query_ontology({"operation":"query_plan","targetOperation":"match_edges","from":"capabilities/mcp-server"',
    );
    expect(packet).toContain(
      'query_ontology({"operation":"query_plan","targetOperation":"match_edges","to":"capabilities/mcp-server"',
    );
    expect(packet).toContain(
      'query_ontology({"operation":"query_plan","targetOperation":"match_edges","fromKind":"capability","toKind":"element","type":"elements"',
    );
    expect(packet).toContain(
      'query_ontology({"operation":"match_edges","fromKind":"capability","toKind":"element","type":"elements"',
    );
    expect(packet).toContain(
      'query_ontology({"operation":"query_plan","targetOperation":"all_paths","from":"capabilities/mcp-server","to":"<target-slug>"',
    );
    expect(packet).toContain(
      'query_ontology({"operation":"all_paths","from":"capabilities/mcp-server","to":"<target-slug>"',
    );
    expect(packet).toContain(
      'query_ontology({"operation":"relation_check","from":"capabilities/mcp-server","to":"<target-slug>","type":"<relation-type>"})',
    );
    expect(packet).toContain(
      "oh-my-ontology blast-radius 'capabilities/mcp-server' [vault]",
    );
    expect(packet).toContain(
      "oh-my-ontology match-edges [vault] --plan --from 'capabilities/mcp-server'",
    );
    expect(packet).toContain(
      "oh-my-ontology match-edges [vault] --plan --to 'capabilities/mcp-server'",
    );
    expect(packet).toContain(
      "oh-my-ontology match-edges [vault] --plan --from-kind capability --to-kind element --type elements",
    );
    expect(packet).toContain(
      "oh-my-ontology all-paths 'capabilities/mcp-server' '<target-slug>' [vault] --plan",
    );
    expect(packet).toContain(
      "oh-my-ontology relation-check 'capabilities/mcp-server' '<target-slug>' '<relation-type>' [vault]",
    );
    expect(packet).toContain("# Post-change ontology sync gate");
  });

  it("shell-quotes selected slugs in CLI fallbacks", () => {
    const packet = formatBuilderProofPacket("capabilities/bob's-builder");

    expect(packet).toContain("oh-my-ontology node 'capabilities/bob'\\''s-builder' [vault]");
  });
});
