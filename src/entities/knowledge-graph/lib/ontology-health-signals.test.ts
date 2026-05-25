import { describe, expect, it } from "vitest";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "../model";
import { buildOntologyHealthSignals } from "./ontology-health-signals";

const APPROVED_BY = "test";
const NOW = new Date("2026-05-25T00:00:00Z");

function node(
  id: string,
  kind: string,
  title = id,
  lastApprovedAt = new Date("2026-05-20T00:00:00Z"),
): KnowledgeGraphNode {
  return {
    id,
    kind,
    title,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt,
    lastApprovedBy: APPROVED_BY,
  };
}

function edge(from: string, to: string, type = "depends_on"): KnowledgeGraphEdge {
  return {
    id: `${from}->${to}:${type}`,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: NOW,
    lastApprovedBy: APPROVED_BY,
  };
}

describe("buildOntologyHealthSignals", () => {
  it("detects ontology orphan and high fan-in review candidates", () => {
    const signals = buildOntologyHealthSignals(
      [
        node("project", "project", "Project"),
        node("domains/core", "domain", "Core"),
        node("capabilities/shared", "capability", "Shared"),
        node("elements/orphan", "element", "Orphan"),
      ],
      [
        edge("domains/core", "capabilities/shared"),
        edge("elements/a", "capabilities/shared"),
        edge("elements/b", "capabilities/shared"),
        edge("elements/c", "capabilities/shared"),
      ],
      { now: NOW, promotionMinFanIn: 4 },
    );

    expect(signals.orphan).toEqual([{ slug: "elements/orphan", name: "Orphan" }]);
    expect(signals.promotion).toEqual([
      { slug: "capabilities/shared", name: "Shared" },
    ]);
  });

  it("skips sentinel vault dates when checking stale nodes", () => {
    const signals = buildOntologyHealthSignals(
      [
        node("capabilities/live", "capability", "Live", new Date(0)),
        node("capabilities/old", "capability", "Old", new Date("2026-04-01T00:00:00Z")),
      ],
      [edge("capabilities/live", "capabilities/old")],
      { now: NOW, staleDaysThreshold: 30 },
    );

    expect(signals.stale).toEqual([{ slug: "capabilities/old", name: "Old" }]);
    expect(signals.stale).not.toContainEqual({
      slug: "capabilities/live",
      name: "Live",
    });
  });
});
