import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  MEANINGFUL_ONTOLOGY_KINDS,
  buildMeaningfulOntologyStats,
  isMeaningfulOntologyKind,
} from "./kind-stats";

function n(id: string, kind: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    parentId: null,
    summary: "",
    accountId: null,
    source: "extraction",
  } as unknown as KnowledgeGraphNode;
}

describe("isMeaningfulOntologyKind", () => {
  it("includes domain / capability / element / unknown", () => {
    for (const k of MEANINGFUL_ONTOLOGY_KINDS) {
      expect(isMeaningfulOntologyKind(k)).toBe(true);
    }
  });

  it("excludes project / document and unknown values", () => {
    expect(isMeaningfulOntologyKind("project")).toBe(false);
    expect(isMeaningfulOntologyKind("document")).toBe(false);
    expect(isMeaningfulOntologyKind("decision")).toBe(false);
    expect(isMeaningfulOntologyKind("")).toBe(false);
    expect(isMeaningfulOntologyKind(null)).toBe(false);
    expect(isMeaningfulOntologyKind(undefined)).toBe(false);
  });
});

describe("buildMeaningfulOntologyStats", () => {
  it("returns dense byKind map ordered as MEANINGFUL_ONTOLOGY_KINDS", () => {
    const nodes = [
      n("dom1", "domain"),
      n("dom2", "domain"),
      n("cap1", "capability"),
      n("el1", "element"),
      n("el2", "element"),
      n("el3", "element"),
      n("u1", "unknown"),
      n("p1", "project"),
      n("d1", "document"),
    ];
    const stats = buildMeaningfulOntologyStats(nodes);
    expect(stats.total).toBe(7);
    expect(stats.byKind).toEqual({
      domain: 2,
      capability: 1,
      element: 3,
      unknown: 1,
    });
  });

  it("returns zero-filled map for empty input (no surface fragility)", () => {
    const stats = buildMeaningfulOntologyStats([]);
    expect(stats.total).toBe(0);
    expect(stats.byKind).toEqual({
      domain: 0,
      capability: 0,
      element: 0,
      unknown: 0,
    });
  });
});
