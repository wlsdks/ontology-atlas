import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import { buildAgentBriefingPacket } from "./agent-briefing-packet";

function node(id: string, kind: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}
function edge(id: string, from: string, to: string): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type: "contains",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

// A small graph: project → domain → two capabilities, capability → element.
const nodes: KnowledgeGraphNode[] = [
  node("project:app", "project"),
  node("domain:auth", "domain"),
  node("capability:token-issue", "capability"),
  node("capability:permission", "capability"),
  node("element:jwt", "element"),
];
const edges: KnowledgeGraphEdge[] = [
  edge("e1", "project:app", "domain:auth"),
  edge("e2", "domain:auth", "capability:token-issue"),
  edge("e3", "domain:auth", "capability:permission"),
  edge("e4", "capability:token-issue", "element:jwt"),
];
const tree = { orphans: [] as KnowledgeGraphNode[] };

describe("buildAgentBriefingPacket", () => {
  const packet = buildAgentBriefingPacket(nodes, edges, tree);

  it("starts with the framing intro and mental-model and readiness headers", () => {
    expect(packet.briefing).toContain("agent onboarding brief");
    expect(packet.briefing).toContain("Claude Code / Codex / Cursor");
    expect(packet.briefing).toContain("## Mental model & readiness");
  });

  it("places the business-to-code lens before readiness", () => {
    const businessLensIndex = packet.briefing.indexOf("## Business-to-code ontology lens");
    const readinessIndex = packet.briefing.indexOf("## Mental model & readiness");

    expect(businessLensIndex).toBeGreaterThan(-1);
    expect(businessLensIndex).toBeLessThan(readinessIndex);
    expect(packet.briefing).toContain(
      "Read the business outcome first, then business/product domains, capabilities, and implementation evidence.",
    );
    expect(packet.briefing).toContain("business domains: domain:auth");
    expect(packet.briefing).toContain(
      "capability outcomes: capability:token-issue, capability:permission",
    );
    expect(packet.briefing).toContain(
      "implementation evidence: element:jwt proves or supports capability behavior; do not treat paths, APIs, routes, or commands as the ontology root.",
    );
  });

  it("includes per-kind counts in the census", () => {
    expect(packet.briefing).toMatch(/census: .*project 1/);
    expect(packet.briefing).toContain("domain 1");
    expect(packet.briefing).toContain("capability 2");
    expect(packet.briefing).toContain("element 1");
  });

  it("shows readiness status, score and blockers in the header", () => {
    expect(packet.briefing).toMatch(/readiness: (ready|needs-links|needs-shape) \(score \d+\/100\)/);
    expect(packet.briefing).toContain("blockers: unknown");
    expect(packet.readiness.status).toMatch(/^(ready|needs-links|needs-shape)$/);
    expect(packet.readiness.score).toBeGreaterThanOrEqual(0);
  });

  it("includes the handoff body", () => {
    // Composed by buildAgentHandoffPrompt — these must all land in one briefing.
    expect(packet.briefing).toContain("query_ontology");
    expect(packet.briefing.toLowerCase()).toContain("guardrail");
    expect(packet.briefing).toContain("CLI fallback");
    expect(packet.briefing).toContain("Project ontology indexing checkpoint");
    expect(packet.briefing).toContain("meaningGate.implementationEvidence.reviewRequiredRows");
    expect(packet.briefing).toContain("Kind classification contract before writing frontmatter");
    expect(packet.briefing).toContain("Do not classify from the label alone");
    expect(packet.briefing).toContain("Classify from evidence in this order");
    expect(packet.briefing).toContain("project: product/system scope root");
    expect(packet.briefing).toContain("domain: shared vocabulary boundary");
    expect(packet.briefing).toContain("capability: user-visible behavior");
    expect(packet.briefing).toContain("element: concrete implementation part");
    expect(packet.briefing).toContain("High-confidence gate");
    expect(packet.briefing).toContain("Containment spine");
    expect(packet.briefing).toContain("Color contract");
    expect(packet.briefing).toContain("source path, symbol, route, command, or MCP tool evidence");
    expect(packet.briefing).toContain("why not the nearest adjacent kind");
    expect(packet.briefing).toContain("ontology color feels wrong");
  });

  it("returns recommended hub entrypoints", () => {
    expect(Array.isArray(packet.entrypoints)).toBe(true);
  });

  it("reports an empty census for an empty vault", () => {
    const empty = buildAgentBriefingPacket([], [], { orphans: [] });
    expect(empty.briefing).toContain("agent onboarding brief");
    expect(empty.briefing).toContain("census: empty vault");
  });
});
