import { describe, expect, it } from "vitest";
import type { DoNextQueue } from "./do-next-queue";
import type { DependencyCyclesResult } from "./dependency-cycles";
import { pickTodaysTouchUps, TOUCH_UP_MIN_VAULT_NODES } from "./todays-touch-ups";

const noCycles: DependencyCyclesResult = {
  cycles: [],
  totalCycles: 0,
  hiddenCycles: 0,
  activeCycleIds: [],
  limited: false,
};

function neglected(nodeId: string, degree: number, agoDays: number): DoNextQueue["rows"][number] {
  return {
    id: `neglected-hub:${nodeId}`,
    rowKind: "neglected-hub",
    nodeId,
    title: nodeId,
    nodeKind: "capability",
    degree,
    agoDays,
    handoffPayload: `hub ${nodeId}`,
  };
}

function orphan(nodeId: string): DoNextQueue["rows"][number] {
  return { id: `orphan:${nodeId}`, rowKind: "orphan", nodeId, title: nodeId, nodeKind: "element", handoffPayload: `o ${nodeId}` };
}

function promotion(nodeId: string): DoNextQueue["rows"][number] {
  return { id: `promotion:${nodeId}`, rowKind: "promotion", nodeId, title: nodeId, nodeKind: "element", handoffPayload: `p ${nodeId}` };
}

function queueOf(rows: DoNextQueue["rows"]): DoNextQueue {
  return {
    rows,
    activeRowIds: rows.map((row) => row.id),
    counts: {
      neglectedHub: rows.filter((r) => r.rowKind === "neglected-hub").length,
      orphan: rows.filter((r) => r.rowKind === "orphan").length,
      promotion: rows.filter((r) => r.rowKind === "promotion").length,
    },
  };
}

const resolvers = {
  totalNodes: 100,
  cycleTitle: (id: string) => id.toUpperCase(),
  cycleHandoff: (c: { id: string }) => `cycle handoff ${c.id}`,
};

describe("pickTodaysTouchUps (③ 오늘의 손질 절단)", () => {
  it("우선순위 강제-검토(사이클) > 방치 허브 > 승격 후보 순으로 3건을 절단한다", () => {
    const cycles: DependencyCyclesResult = {
      cycles: [{ id: "capability:a capability:b", length: 2, nodeIds: ["capability:a", "capability:b"], hiddenNodeCount: 0 }],
      totalCycles: 1,
      hiddenCycles: 0,
      activeCycleIds: ["capability:a capability:b"],
      limited: false,
    };
    const queue = queueOf([neglected("n1", 12, 40), neglected("n2", 8, 33), promotion("p1"), orphan("o1")]);
    const picked = pickTodaysTouchUps(queue, cycles, resolvers);
    expect(picked.map((p) => p.source)).toEqual(["cycle", "neglected-hub", "neglected-hub"]);
    // 사이클 행은 첫 노드로 딥링크하고 title/handoff 를 resolver 로 채운다.
    expect(picked[0]).toMatchObject({ nodeId: "capability:a", title: "CAPABILITY:A", handoffPayload: "cycle handoff capability:a capability:b" });
    // 고아는 밴드 대상이 아니다.
    expect(picked.some((p) => p.source === "promotion")).toBe(false);
  });

  it("사이클이 없으면 방치 허브 → 승격 후보로 채운다", () => {
    const queue = queueOf([neglected("n1", 12, 40), promotion("p1"), promotion("p2")]);
    const picked = pickTodaysTouchUps(queue, noCycles, resolvers);
    expect(picked.map((p) => p.source)).toEqual(["neglected-hub", "promotion", "promotion"]);
    const hub = picked[0];
    expect(hub.reason).toEqual({ kind: "neglected-hub", degree: 12, agoDays: 40 });
  });

  it("콜드스타트 가드 — 소형 vault 는 3건이 있어도 빈 배열", () => {
    const queue = queueOf([neglected("n1", 12, 40), promotion("p1"), promotion("p2")]);
    const picked = pickTodaysTouchUps(queue, noCycles, { ...resolvers, totalNodes: TOUCH_UP_MIN_VAULT_NODES - 1 });
    expect(picked).toEqual([]);
  });

  it("콜드스타트 가드 — 3건을 못 채우면 빈 배열(빈 밴드 방지)", () => {
    const queue = queueOf([neglected("n1", 12, 40), orphan("o1"), orphan("o2")]);
    const picked = pickTodaysTouchUps(queue, noCycles, resolvers);
    // 방치 1 + 승격 0 = 1건 < 3 → 미표시 (고아는 밴드에서 제외).
    expect(picked).toEqual([]);
  });

  it("검토 왕복 중에는 1–2건만 남아도 밴드를 유지한다", () => {
    const queue = queueOf([neglected("n1", 12, 40)]);
    const picked = pickTodaysTouchUps(queue, noCycles, {
      ...resolvers,
      reviewId: "promotion:cleared",
    });
    expect(picked.map((item) => item.id)).toEqual(["neglected-hub:n1"]);
  });

  it("현재 exact row id가 살아 있으면 같은 node의 다른 kind가 아니라 그 행을 먼저 둔다", () => {
    const queue = queueOf([
      neglected("shared", 12, 40),
      promotion("shared"),
      promotion("other"),
    ]);
    const picked = pickTodaysTouchUps(queue, noCycles, {
      ...resolvers,
      reviewId: "promotion:shared",
    });
    expect(picked[0].id).toBe("promotion:shared");
  });
});
