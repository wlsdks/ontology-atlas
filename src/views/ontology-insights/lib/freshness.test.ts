import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeFreshnessSummary } from "./freshness";

function node(id: string, kind: string, opts: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
    ...opts,
  };
}
function edge(from: string, to: string, type: string): KnowledgeGraphEdge {
  return { id: `${from}--${type}-->${to}`, from, to, type, projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "vault-frontmatter" };
}

const NOW = new Date("2026-07-18T12:00:00.000Z");

describe("computeFreshnessSummary", () => {
  it("buckets a domain's recent updates into the current week and reports the latest date", () => {
    const nodes = [
      node("domain:views", "domain", { evidenceIds: ["domain-views"] }),
      node("capability:a", "capability", { evidenceIds: ["capability-a"] }),
    ];
    const edges = [edge("domain:views", "capability:a", "contains")];
    const docs = new Map([
      ["domain-views", "2026-05-01T00:00:00.000Z"],
      ["capability-a", "2026-07-17T00:00:00.000Z"], // 1 day ago -> current week
    ]);

    const summary = computeFreshnessSummary(nodes, edges, docs, NOW);

    expect(summary.domainRows).toHaveLength(1);
    const row = summary.domainRows[0];
    expect(row.domainId).toBe("domain:views");
    expect(row.weeks).toHaveLength(12);
    expect(row.weeks[11].isCurrentWeek).toBe(true);
    expect(row.weeks[11].level).toBeGreaterThanOrEqual(1);
    // 셀 툴팁 진실원 — level 은 3에서 포화되므로 원본 건수도 함께 노출한다.
    expect(row.weeks[11].count).toBe(1);
    // domain-views 자신의 갱신(5/1, 11주 전)은 weeks[0] 버킷 — 중간 주는 0.
    expect(row.weeks[0].count).toBe(1);
    expect(row.weeks[5].count).toBe(0);
    expect(row.daysAgo).toBe(1);
    expect(row.stale).toBe(false);
  });

  it("marks a domain stale when its most recent update is older than 90 days", () => {
    const nodes = [
      node("domain:core", "domain", { evidenceIds: ["domain-core"] }),
      node("capability:old", "capability", { evidenceIds: ["capability-old"] }),
    ];
    const edges = [edge("domain:core", "capability:old", "contains")];
    const docs = new Map([["capability-old", "2026-01-01T00:00:00.000Z"]]);

    const summary = computeFreshnessSummary(nodes, edges, docs, NOW);
    expect(summary.domainRows[0].stale).toBe(true);
    expect(summary.domainRows[0].daysAgo).toBeGreaterThan(90);
  });

  it("sorts recent updates newest-first and caps to the limit", () => {
    const nodes = [
      node("element:a", "element", { evidenceIds: ["a"], title: "A" }),
      node("element:b", "element", { evidenceIds: ["b"], title: "B" }),
      node("element:c", "element", { evidenceIds: ["c"], title: "C" }),
    ];
    const docs = new Map([
      ["a", "2026-07-01T00:00:00.000Z"],
      ["b", "2026-07-15T00:00:00.000Z"],
      ["c", "2026-06-01T00:00:00.000Z"],
    ]);
    const summary = computeFreshnessSummary(nodes, [], docs, NOW, { recentLimit: 2 });
    expect(summary.recent).toHaveLength(2);
    expect(summary.recent[0].nodeId).toBe("element:b");
    expect(summary.recent[1].nodeId).toBe("element:a");
  });

  it("counts stale nodes only when a real date is known (unknown dates are excluded, not assumed stale)", () => {
    const nodes = [
      node("capability:known-stale", "capability", { evidenceIds: ["k1"] }),
      node("capability:known-fresh", "capability", { evidenceIds: ["k2"] }),
      node("capability:unknown", "capability", { evidenceIds: [] }),
    ];
    const docs = new Map([
      ["k1", "2025-01-01T00:00:00.000Z"],
      ["k2", "2026-07-16T00:00:00.000Z"],
    ]);
    const summary = computeFreshnessSummary(nodes, [], docs, NOW);
    expect(summary.staleCount).toBe(1);
  });

  it("returns empty results for an empty graph", () => {
    const summary = computeFreshnessSummary([], [], new Map(), NOW);
    expect(summary).toEqual({
      domainRows: [],
      recent: [],
      recentEvidence: [],
      recentEvidenceTotal: 0,
      staleCount: 0,
      weeklyTotals: new Array(12).fill(0),
    });
  });

  it("sums real per-domain update counts into a single weekly trend series (신선도 탭 스파크라인 진실원)", () => {
    const nodes = [
      node("domain:views", "domain", { evidenceIds: ["domain-views"] }),
      node("domain:core", "domain", { evidenceIds: ["domain-core"] }),
      node("capability:a", "capability", { evidenceIds: ["capability-a"] }),
      node("capability:b", "capability", { evidenceIds: ["capability-b"] }),
    ];
    const edges = [
      edge("domain:views", "capability:a", "contains"),
      edge("domain:core", "capability:b", "contains"),
    ];
    const docs = new Map([
      ["capability-a", "2026-07-17T00:00:00.000Z"], // 1 day ago -> current week
      ["capability-b", "2026-07-16T00:00:00.000Z"], // 2 days ago -> current week
    ]);

    const summary = computeFreshnessSummary(nodes, edges, docs, NOW);

    expect(summary.weeklyTotals).toHaveLength(12);
    // both updates land in the current (last) week bucket, summed across domains
    expect(summary.weeklyTotals[11]).toBe(2);
    expect(summary.weeklyTotals.slice(0, 11).every((n) => n === 0)).toBe(true);
  });
  it("최근 갱신은 자기 문서를 가진 개념만 세운다 — 파생 이름은 접힌 근거 계층으로", () => {
    // 파생 노드의 "갱신일" 은 자기 것이 아니라 자기를 인용한 문서의 mtime 이다.
    // 두 파생(`.claude/` · `.codex/`)은 같은 제목이라 참조 원문 없이는 구별되지
    // 않는다 — 그 값을 행에 실어야 두 줄이 다른 사실을 말한다.
    const nodes = [
      node("capability:written", "capability", {
        title: "Written by hand",
        evidenceIds: ["ontology/capabilities/written"],
      }),
      node("element:hook-a", "element", {
        title: "Inject Ontology Summary",
        evidenceIds: ["ontology/capabilities/written"],
        hasOwnDocument: false,
        ref: ".claude/hooks/inject-ontology-summary.sh",
      }),
      node("element:hook-b", "element", {
        title: "Inject Ontology Summary",
        evidenceIds: ["ontology/capabilities/written"],
        hasOwnDocument: false,
        ref: ".codex/hooks/inject-ontology-summary.sh",
      }),
    ];
    const docs = new Map([["ontology/capabilities/written", "2026-07-17T00:00:00.000Z"]]);

    const summary = computeFreshnessSummary(nodes, [], docs, NOW);

    expect(summary.recent.map((r) => r.nodeId)).toEqual(["capability:written"]);
    expect(summary.recent[0]?.ref).toBeUndefined();
    expect(summary.recentEvidenceTotal).toBe(2);
    expect(summary.recentEvidence.map((r) => r.ref)).toEqual([
      ".claude/hooks/inject-ontology-summary.sh",
      ".codex/hooks/inject-ontology-summary.sh",
    ]);
  });
});
