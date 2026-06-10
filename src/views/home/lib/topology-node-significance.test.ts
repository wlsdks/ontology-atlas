import { describe, expect, it } from "vitest";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import type {
  TopologyOntologyDrawerModel,
  TopologyOntologyDrawerRelation,
} from "./topology-ontology-drawer";
import {
  buildNodeSignificance,
  normalizeKindLabelKey,
} from "./topology-node-significance";

function node(extra: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id: "capabilities/mcp-server",
    title: "MCP Server",
    kind: "capability",
    projectIds: ["ontology-atlas"],
    summary: "AI agent surface.",
    evidenceIds: ["capabilities/mcp-server"],
    lastApprovedAt: new Date("2026-01-01T00:00:00Z"),
    lastApprovedBy: "stark",
    ...extra,
  };
}

function outgoingRelation(
  toId: string,
  toTitle: string,
): TopologyOntologyDrawerRelation {
  const edge: KnowledgeGraphEdge = {
    id: `e:${toId}`,
    from: "capabilities/mcp-server",
    to: toId,
    type: "depends_on",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-01-01T00:00:00Z"),
    lastApprovedBy: "stark",
  };
  return {
    edge,
    other: {
      id: toId,
      title: toTitle,
      kind: "element",
      projectIds: [],
      evidenceIds: [],
      lastApprovedAt: new Date("2026-01-01T00:00:00Z"),
      lastApprovedBy: "stark",
    },
    direction: "outgoing",
  };
}

function model(
  extra: Partial<TopologyOntologyDrawerModel> = {},
): TopologyOntologyDrawerModel {
  return {
    sourceSlug: "capabilities/mcp-server",
    ownerDomain: { id: "domains/ai-agent-partner", title: "AI Agent Partner" },
    incomingCount: 1,
    outgoingCount: 2,
    relationCounts: [],
    previewRelations: [
      outgoingRelation("elements/mcp-sdk", "MCP SDK"),
      outgoingRelation("elements/parser", "Parser"),
    ],
    reach: { dependents: 7, dependencies: 3 },
    impactSummary: { level: "bidirectional", firstIncoming: null, firstOutgoing: null },
    collaborator: { lens: "capability", review: "trace_impact", chips: [] },
    ...extra,
  };
}

describe("buildNodeSignificance", () => {
  it("carries the raw kind and owning domain title for the 'what is it' line", () => {
    const result = buildNodeSignificance(node(), model());
    expect(result.kind).toBe("capability");
    expect(result.ownerDomainTitle).toBe("AI Agent Partner");
  });

  it("reports a null domain title when the node has no owning domain", () => {
    const result = buildNodeSignificance(node(), model({ ownerDomain: null }));
    expect(result.ownerDomainTitle).toBeNull();
  });

  it("marks a node 'core' when enough places depend on it (fan-in >= threshold)", () => {
    const result = buildNodeSignificance(node(), model({ incomingCount: 4 }));
    expect(result.importance.level).toBe("core");
    expect(result.importance.usedByCount).toBe(4);
  });

  it("marks a barely-connected node 'leaf' (total degree <= 1)", () => {
    const result = buildNodeSignificance(
      node(),
      model({ incomingCount: 0, outgoingCount: 1, previewRelations: [] }),
    );
    expect(result.importance.level).toBe("leaf");
  });

  it("marks a mid-degree node 'supporting'", () => {
    const result = buildNodeSignificance(
      node(),
      model({ incomingCount: 1, outgoingCount: 2 }),
    );
    expect(result.importance.level).toBe("supporting");
  });

  it("lists outgoing dependency names up to the name limit and reports the full count", () => {
    const result = buildNodeSignificance(
      node(),
      model({
        outgoingCount: 5,
        previewRelations: [
          outgoingRelation("elements/a", "Alpha"),
          outgoingRelation("elements/b", "Bravo"),
          outgoingRelation("elements/c", "Charlie"),
        ],
      }),
      { nameLimit: 2 },
    );
    expect(result.dependsOn.count).toBe(5);
    expect(result.dependsOn.names).toEqual(["Alpha", "Bravo"]);
  });

  it("exposes the transitive blast radius as the impact reach count", () => {
    const result = buildNodeSignificance(node(), model({ reach: { dependents: 12, dependencies: 0 } }));
    expect(result.impact.reachCount).toBe(12);
  });

  it("prefers an authored significance override for the importance line when present", () => {
    const result = buildNodeSignificance(node(), model(), {
      authoredSignificance: "  Everything routes through this engine.  ",
    });
    expect(result.importance.authored).toBe("Everything routes through this engine.");
    // level is still derived for styling
    expect(result.importance.level).toBe("supporting");
  });

  it("ignores a blank authored override", () => {
    const result = buildNodeSignificance(node(), model(), {
      authoredSignificance: "   ",
    });
    expect(result.importance.authored).toBeNull();
  });
});

describe("normalizeKindLabelKey", () => {
  it("passes through a known kind", () => {
    expect(normalizeKindLabelKey("capability")).toBe("capability");
    expect(normalizeKindLabelKey("domain")).toBe("domain");
  });

  it("falls back to 'unknown' for an unrecognized kind so i18n never misses a key", () => {
    expect(normalizeKindLabelKey("widget")).toBe("unknown");
    expect(normalizeKindLabelKey("")).toBe("unknown");
  });
});
