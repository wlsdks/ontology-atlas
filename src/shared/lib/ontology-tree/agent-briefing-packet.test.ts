import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
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

// 작은 그래프: project → domain → 2 capability, capability → element.
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

  it("framing 인트로 + mental-model/readiness 헤더로 시작한다", () => {
    expect(packet.briefing).toContain("agent onboarding brief");
    expect(packet.briefing).toContain("Claude Code / Codex / Cursor");
    expect(packet.briefing).toContain("## Mental model & readiness");
  });

  it("census 에 kind 별 카운트를 담는다", () => {
    expect(packet.briefing).toMatch(/census: .*project 1/);
    expect(packet.briefing).toContain("domain 1");
    expect(packet.briefing).toContain("capability 2");
    expect(packet.briefing).toContain("element 1");
  });

  it("readiness status/score + blocker 를 헤더에 노출", () => {
    expect(packet.briefing).toMatch(/readiness: (ready|needs-links|needs-shape) \(score \d+\/100\)/);
    expect(packet.briefing).toContain("blockers: unknown");
    expect(packet.readiness.status).toMatch(/^(ready|needs-links|needs-shape)$/);
    expect(packet.readiness.score).toBeGreaterThanOrEqual(0);
  });

  it("handoff 본문(run order + query_ontology payload + write guardrails)을 포함한다", () => {
    // buildAgentHandoffPrompt 합성물 — 단일 브리핑에 통합돼야 함
    expect(packet.briefing).toContain("query_ontology");
    expect(packet.briefing.toLowerCase()).toContain("guardrail");
    expect(packet.briefing).toContain("CLI fallback");
    expect(packet.briefing).toContain("Kind classification contract before writing frontmatter");
    expect(packet.briefing).toContain("domain: shared vocabulary boundary");
    expect(packet.briefing).toContain("capability: user-visible behavior");
    expect(packet.briefing).toContain("element: concrete implementation part");
  });

  it("entrypoints(추천 hub) 를 함께 반환한다", () => {
    expect(Array.isArray(packet.entrypoints)).toBe(true);
  });

  it("빈 vault 도 안전 — census 'empty vault', 깨지지 않음", () => {
    const empty = buildAgentBriefingPacket([], [], { orphans: [] });
    expect(empty.briefing).toContain("agent onboarding brief");
    expect(empty.briefing).toContain("census: empty vault");
  });
});
