import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildProjectOntologyMetrics } from "./project-ontology-metrics";

function n(id: string, kind: string, projectIds: string[] = []): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds,
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

function e(id: string, from: string, to: string, type = "contains"): KnowledgeGraphEdge {
  return { id, from, to, type, projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "test" };
}

describe("buildProjectOntologyMetrics", () => {
  it("returns all zeros for a project with no matching nodes", () => {
    const metrics = buildProjectOntologyMetrics([], [], "ontology-atlas");
    expect(metrics).toEqual({ domains: 0, capabilities: 0, elements: 0, documents: 0, relations: 0 });
  });

  it("counts each meaningful kind for nodes tagged with the project slug", () => {
    const nodes = [
      n("project:ontology-atlas", "project", []),
      n("domain:views", "domain", ["ontology-atlas"]),
      n("domain:vault", "domain", ["ontology-atlas"]),
      n("capability:mcp-server", "capability", ["ontology-atlas"]),
      n("element:cli", "element", ["ontology-atlas"]),
      n("document:readme", "document", ["ontology-atlas"]),
    ];
    const metrics = buildProjectOntologyMetrics(nodes, [], "ontology-atlas");
    expect(metrics).toEqual({ domains: 2, capabilities: 1, elements: 1, documents: 1, relations: 0 });
  });

  it("ignores nodes tagged with a different project slug", () => {
    const nodes = [n("domain:other", "domain", ["other-project"])];
    const metrics = buildProjectOntologyMetrics(nodes, [], "ontology-atlas");
    expect(metrics.domains).toBe(0);
  });

  it("counts a relation only when BOTH endpoints belong to the project", () => {
    const nodes = [
      n("domain:views", "domain", ["ontology-atlas"]),
      n("capability:mcp-server", "capability", ["ontology-atlas"]),
      n("domain:external", "domain", ["other-project"]),
    ];
    const edges = [
      e("e1", "domain:views", "capability:mcp-server"),
      e("e2", "domain:views", "domain:external", "related_to"),
    ];
    const metrics = buildProjectOntologyMetrics(nodes, edges, "ontology-atlas");
    expect(metrics.relations).toBe(1);
  });

  it("a node listed under multiple projects counts toward each project independently", () => {
    const nodes = [n("domain:shared", "domain", ["alpha", "beta"])];
    expect(buildProjectOntologyMetrics(nodes, [], "alpha").domains).toBe(1);
    expect(buildProjectOntologyMetrics(nodes, [], "beta").domains).toBe(1);
  });

  it("counts a document via its relates edge even though documents never get projectIds from containment", () => {
    // Real vault shape: document.md only ever carries `relates:` (a
    // related_to edge) — it never has a `domain:`/contains edge, so the
    // containment BFS in derivationToInsight never stamps it with
    // projectIds. Without a fallback this metric would always read 0.
    const nodes = [
      n("domain:views", "domain", ["ontology-atlas"]),
      n("document:audit", "document", []),
    ];
    const edges = [e("e1", "document:audit", "domain:views", "related_to")];
    const metrics = buildProjectOntologyMetrics(nodes, edges, "ontology-atlas");
    expect(metrics.documents).toBe(1);
  });

  it("does not count a document with no edge into this project's nodes", () => {
    const nodes = [
      n("domain:views", "domain", ["ontology-atlas"]),
      n("document:unrelated", "document", []),
    ];
    const metrics = buildProjectOntologyMetrics(nodes, [], "ontology-atlas");
    expect(metrics.documents).toBe(0);
  });

  it("does not double count a document that already has projectIds AND a connecting edge", () => {
    const nodes = [
      n("domain:views", "domain", ["ontology-atlas"]),
      n("document:audit", "document", ["ontology-atlas"]),
    ];
    const edges = [e("e1", "document:audit", "domain:views", "related_to")];
    const metrics = buildProjectOntologyMetrics(nodes, edges, "ontology-atlas");
    expect(metrics.documents).toBe(1);
  });
});
