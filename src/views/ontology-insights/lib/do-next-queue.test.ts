import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildDoNextQueue } from "./do-next-queue";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-07-21T12:00:00Z");

function n(id: string, kind: string, slug?: string, title = id): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: slug ? [slug] : [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  } as KnowledgeGraphNode;
}

function e(from: string, to: string, type = "relates"): KnowledgeGraphEdge {
  return { from, to, type } as KnowledgeGraphEdge;
}

function iso(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString();
}

describe("buildDoNextQueue (S5 — 할 일 큐)", () => {
  it("방치된 허브 — degree 높고 오래된 노드를 degree×경과일 순으로", () => {
    const hub = n("capability:hub", "capability", "capabilities/hub", "Hub");
    const spokes = Array.from({ length: 5 }, (_, i) => n(`element:s${i}`, "element", `elements/s${i}`));
    const edges = spokes.map((s) => e(s.id, hub.id));
    const fresh = new Map([["capabilities/hub", iso(60)]]);
    const queue = buildDoNextQueue([hub, ...spokes], edges, fresh, { now: NOW });
    const hubRow = queue.rows.find((r) => r.rowKind === "neglected-hub");
    expect(hubRow).toMatchObject({ nodeId: "capability:hub", degree: 5, agoDays: 60 });
    expect(hubRow?.handoffPayload).toContain('blast_radius');
    expect(hubRow?.handoffPayload).toContain("capabilities/hub");
    expect(hubRow?.handoffPayload).toMatch(/patch_concept.*get_concept.*health/);
    expect(hubRow?.handoffPayload).toContain('operation:"health"');
  });

  it("최근 갱신된 허브·갱신 시점 미상 허브는 방치로 단정하지 않는다", () => {
    const hub = n("capability:hub", "capability", "capabilities/hub");
    const unknown = n("capability:u", "capability"); // evidence 없음
    const spokes = Array.from({ length: 5 }, (_, i) => n(`element:s${i}`, "element"));
    const edges = [
      ...spokes.map((s) => e(s.id, hub.id)),
      ...spokes.map((s) => e(s.id, unknown.id)),
    ];
    const fresh = new Map([["capabilities/hub", iso(3)]]);
    const queue = buildDoNextQueue([hub, unknown, ...spokes], edges, fresh, { now: NOW });
    expect(queue.counts.neglectedHub).toBe(0);
  });

  it("고아·승격은 지도 health 칩과 같은 entities 신호를 재사용하고, 핸드오프는 vault slug 를 쓴다", () => {
    const orphan = n("element:alone", "element", "elements/alone", "Alone");
    const other = n("capability:c", "capability", "capabilities/c");
    const queue = buildDoNextQueue([orphan, other], [], new Map(), { now: NOW });
    const orphanRows = queue.rows.filter((r) => r.rowKind === "orphan");
    expect(orphanRows.map((r) => r.nodeId)).toContain("element:alone");
    const row = orphanRows.find((r) => r.nodeId === "element:alone");
    expect(row?.handoffPayload).toContain('elements/alone');
    expect(row?.handoffPayload).toContain("add_relation");
    expect(row?.handoffPayload).toContain("why");
    expect(row?.handoffPayload).toMatch(/add_relation.*find_neighbors.*health/);
    expect(row?.handoffPayload).toContain('operation:"health"');
  });

  it("승격 후보 핸드오프도 쓰기 뒤 health 재검증으로 닫는다", () => {
    const hub = n("element:core", "element", "elements/core", "Core");
    const spokes = Array.from({ length: 4 }, (_, i) =>
      n(`element:s${i}`, "element", `elements/s${i}`),
    );
    const edges = spokes.map((spoke) => e(spoke.id, hub.id));
    const queue = buildDoNextQueue([hub, ...spokes], edges, new Map(), { now: NOW });
    const promotion = queue.rows.find(
      (row) => row.rowKind === "promotion" && row.nodeId === hub.id,
    );

    expect(promotion?.handoffPayload).toContain('operation:"node_profile"');
    expect(promotion?.handoffPayload).toMatch(/신설.*node_profile.*health/);
    expect(promotion?.handoffPayload).toContain('operation:"health"');
  });

  it("유형별 perKindLimit 로 자르되 counts 는 전체를 정직하게 보고한다", () => {
    const orphans = Array.from({ length: 8 }, (_, i) => n(`element:o${i}`, "element", `elements/o${i}`));
    const queue = buildDoNextQueue(orphans, [], new Map(), { now: NOW, perKindLimit: 3 });
    expect(queue.rows.filter((r) => r.rowKind === "orphan")).toHaveLength(3);
    expect(queue.counts.orphan).toBe(8);
    expect(queue.activeRowIds.filter((id) => id.startsWith("orphan:"))).toHaveLength(8);
    expect(queue.activeRowIds).toContain("orphan:element:o7");
  });
});
