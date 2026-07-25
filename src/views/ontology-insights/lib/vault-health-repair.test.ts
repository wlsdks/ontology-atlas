import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildVaultHealthRepair } from "./vault-health-repair";

function node(id: string, title: string): KnowledgeGraphNode {
  return {
    id,
    title,
    kind: id.split(":")[0],
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

const nodes = [node("capability:invoice", "Invoice"), node("domain:billing", "Billing")];

describe("buildVaultHealthRepair", () => {
  it("reports zero and no target on a clean verdict", () => {
    const result = buildVaultHealthRepair({ missingContainment: [], islands: [] }, nodes);
    expect(result).toEqual({ islandCount: 0, missingContainmentCount: 0, actionTarget: null });
  });

  it("maps a missing-containment slug to a graph node id by tail", () => {
    const result = buildVaultHealthRepair(
      {
        missingContainment: [{ slug: "capabilities/invoice", domain: "domains/billing" }],
        islands: [["domains/billing", "capabilities/invoice"]],
      },
      nodes,
    );
    expect(result.missingContainmentCount).toBe(1);
    expect(result.islandCount).toBe(1);
    // containment ranks above island
    expect(result.actionTarget).toEqual({
      slug: "capability:invoice",
      title: "Invoice",
      kind: "containment",
    });
  });

  it("falls back to an island member when no containment node resolves", () => {
    const result = buildVaultHealthRepair(
      {
        missingContainment: [{ slug: "capabilities/unknown", domain: "domains/x" }],
        islands: [["capabilities/invoice"]],
      },
      nodes,
    );
    expect(result.actionTarget).toEqual({
      slug: "capability:invoice",
      title: "Invoice",
      kind: "island",
    });
  });
});
