import { describe, expect, it } from "vitest";

import { computeConcentricLayout, type LayoutGraphNode } from "@/widgets/topology-map-v2/model/layout";
import { DENSITY_GATE_THRESHOLD } from "@/widgets/topology-map-v2/model/density-gate";

/**
 * 배치 완화는 **그려질 노드에만** 돈다는 계약.
 *
 * 배경(2026-07-31 실측): 씨앗 배치(부채꼴 + phyllotaxis)는 싸고 완화가 비싸다 —
 * N=3,000 에서 씨앗 4.3ms 대 전체 2,253ms 로 **완화가 99.8%** 다. 그런데 그
 * 완화의 대부분은 화면에 한 번도 그려지지 않는 노드를 위한 것이었다: 밀도
 * 게이트가 자식 12개 초과 부모를 접어 element 의 **95%**가 칩 뒤에 숨는다.
 *
 * 안 그리는 것을 위해 겹침을 푸는 계산이 느린 PC 에서 **13.5초 프리즈**를
 * 만들었다(CPU 6배 스로틀 실측, 라운드 42). 범위를 좁히면 같은 볼트가 7.5ms —
 * **284배**이고 겹침 품질은 오히려 낫다.
 *
 * ⚠️ **게이트는 ms 가 아니라 횟수/집합으로 잠근다.** `architecture.md` 선례:
 * *"성능 예산은 기계마다 달라 플레이크가 되지만 '닫혀 있으면 순회 0회'는 어느
 * 기계에서나 참이다."* 그래서 여기서는 시간을 재지 않고 **완화가 실제로 움직인
 * 노드가 범위 안에 갇히는가**를 본다.
 */

const RINGS = { domain: 250, capability: 145, element: 90 };
const RADII = { project: 30, domain: 17, capability: 11, element: 7 };

/** 한 부모가 임계를 넘는 자식을 갖는 볼트 — 게이트가 접을 대상이 실재한다. */
function denseVault(childCount: number): LayoutGraphNode[] {
  const nodes: LayoutGraphNode[] = [
    { id: "p", kind: "project", parentId: null },
    { id: "d0", kind: "domain", parentId: "p" },
    { id: "d1", kind: "domain", parentId: "p" },
    { id: "c0", kind: "capability", parentId: "d0" },
    { id: "c1", kind: "capability", parentId: "d1" },
  ];
  for (let i = 0; i < childCount; i += 1) {
    nodes.push({ id: `e${i}`, kind: "element", parentId: "c0" });
  }
  return nodes;
}

const place = (nodes: readonly LayoutGraphNode[], relaxScope?: ReadonlySet<string>) =>
  new Map(
    computeConcentricLayout(nodes, RINGS, { radii: RADII, relaxScope }).map((p) => [p.id, p]),
  );

const movedIds = (
  nodes: readonly LayoutGraphNode[],
  relaxScope?: ReadonlySet<string>,
): Set<string> => {
  const seeded = place(nodes.map((n) => ({ ...n })), new Set());
  const relaxed = place(nodes, relaxScope);
  const moved = new Set<string>();
  for (const [id, seed] of seeded) {
    const after = relaxed.get(id);
    if (!after) continue;
    if (Math.hypot(seed.x - after.x, seed.y - after.y) > 0.01) moved.add(id);
  }
  return moved;
};

describe("layout relax scope contract", () => {
  it("범위 밖 노드는 **한 톨도 움직이지 않는다** (완화 대상에서 아예 빠진다)", () => {
    const nodes = denseVault(DENSITY_GATE_THRESHOLD * 4);
    // 게이트가 접을 서브트리(c0 의 자식 전부)를 범위에서 뺀다.
    const scope = new Set(nodes.filter((n) => n.parentId !== "c0").map((n) => n.id));
    const moved = movedIds(nodes, scope);
    const outsideMoved = [...moved].filter((id) => !scope.has(id));
    expect(outsideMoved).toEqual([]);
  });

  it("범위를 생략하면 종전 동작 — 전부 완화 대상이다", () => {
    const nodes = denseVault(DENSITY_GATE_THRESHOLD * 4);
    const withScope = movedIds(nodes, new Set(nodes.map((n) => n.id)));
    const withoutScope = movedIds(nodes);
    expect([...withoutScope].sort()).toEqual([...withScope].sort());
  });

  it("좌표 구멍이 없다 — 범위 밖 노드도 **씨앗 좌표를 갖는다**", () => {
    // 티어가 열리거나 칩을 펼칠 때 좌표가 비어 있으면 노드가 원점에 쌓인다.
    // 완화만 건너뛸 뿐 배치는 전부 한다는 것이 이 설계의 전제다.
    const nodes = denseVault(DENSITY_GATE_THRESHOLD * 4);
    const scope = new Set(["p", "d0", "d1", "c0", "c1"]);
    const placed = place(nodes, scope);
    expect(placed.size).toBe(nodes.length);
    const atOrigin = [...placed.values()].filter((p) => p.x === 0 && p.y === 0);
    // 원점은 project 하나뿐이어야 한다 — 나머지가 원점이면 씨앗이 안 돈 것이다.
    expect(atOrigin.map((p) => p.id)).toEqual(["p"]);
  });

  it("범위가 비면 완화를 아예 건너뛴다 — 아무도 안 움직인다", () => {
    const nodes = denseVault(DENSITY_GATE_THRESHOLD * 4);
    expect(movedIds(nodes, new Set()).size).toBe(0);
  });

  it("범위 밖은 **장애물로도 남지 않는다** — 있든 없든 범위 안 좌표가 같다", () => {
    // 처음엔 범위 밖을 `pinned: true` 로 items 에 남겼다. 이동은 막혔지만
    // 그리드 재구축과 쌍 열거는 그대로 돌아 **비용이 하나도 안 줄었다**
    // (실측: N=3,000 이 2,081ms 로 변동 없음 → 제외 후 21ms).
    //
    // 관측 가능한 불변식은 이것이다: 범위 밖 노드가 **몇 개든** 범위 안 노드의
    // 좌표가 바뀌지 않는다. 장애물로 남기면 그 순간 좌표가 달라지므로, 다음
    // 사람이 되돌리면 여기서 걸린다(겹침 유무 같은 우연한 기하에 기대지 않는다).
    const scope = new Set(["p", "d0", "d1", "c0", "c1"]);
    const few = place(denseVault(DENSITY_GATE_THRESHOLD * 2), scope);
    const many = place(denseVault(DENSITY_GATE_THRESHOLD * 20), scope);
    for (const id of scope) {
      const a = few.get(id);
      const b = many.get(id);
      expect(a, id).toBeDefined();
      expect(b, id).toBeDefined();
      expect(Math.hypot(a!.x - b!.x, a!.y - b!.y), id).toBeLessThan(0.001);
    }
  });

  it("범위 안 노드는 여전히 겹침이 풀린다 — 좁혔다고 품질을 잃지 않는다", () => {
    const nodes = denseVault(DENSITY_GATE_THRESHOLD * 4);
    const scope = new Set(nodes.filter((n) => n.parentId !== "c0").map((n) => n.id));
    const placed = place(nodes, scope);
    let collisions = 0;
    const inScope = [...placed.values()].filter((p) => scope.has(p.id));
    for (let i = 0; i < inScope.length; i += 1) {
      for (let j = i + 1; j < inScope.length; j += 1) {
        const a = inScope[i];
        const b = inScope[j];
        const kindOf = (id: string) => nodes.find((n) => n.id === id)!.kind;
        const min = RADII[kindOf(a.id)] + RADII[kindOf(b.id)];
        if (Math.hypot(a.x - b.x, a.y - b.y) < min) collisions += 1;
      }
    }
    expect(collisions).toBe(0);
  });
});
