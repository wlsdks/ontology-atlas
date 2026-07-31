import { describe, expect, it } from "vitest";

import {
  computeConcentricLayout,
  relaxNewlyVisible,
  type LayoutGraphNode,
  type LayoutPoint,
} from "@/widgets/topology-map-v2/model/layout";
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

  describe("펼침 시 국소 재완화 (relaxNewlyVisible)", () => {
    /**
     * 한 부모의 자식끼리는 phyllotaxis 간격이 이미 충돌을 막지만(실측 겹침 0),
     * **다른 부모의 부채와는 겹친다** — 3개 펼침 5건 · 6개 18건 · 12개 70건.
     * 전체 재완화는 비용이 누적되고(24개에서 341ms) **이미 보고 있던 노드가
     * 움직인다**(최대 15 유닛). 그래서 새로 보이는 것만 국소로 푼다.
     */
    /** 두 부모가 서로 가까워 부채가 실제로 겹치는 볼트. */
    function twoFans(childCount: number): LayoutGraphNode[] {
      const nodes: LayoutGraphNode[] = [
        { id: "p", kind: "project", parentId: null },
        { id: "d0", kind: "domain", parentId: "p" },
        { id: "c0", kind: "capability", parentId: "d0" },
        { id: "c1", kind: "capability", parentId: "d0" },
      ];
      for (let i = 0; i < childCount; i += 1) {
        nodes.push({ id: `a${i}`, kind: "element", parentId: "c0" });
        nodes.push({ id: `b${i}`, kind: "element", parentId: "c1" });
      }
      return nodes;
    }

    const seedAll = (nodes: readonly LayoutGraphNode[]) =>
      new Map<string, LayoutPoint>(
        computeConcentricLayout(nodes, RINGS, { radii: RADII, relaxScope: new Set() }).map((p) => [
          p.id,
          { ...p },
        ]),
      );

    it("bbox 밖의 **먼** 노드는 결과에 영향을 주지 않는다 — 비용이 클릭 수와 무관한 이유", () => {
      // 이웃(같은 도메인의 형제 부채)은 당연히 영향을 준다 — 그게 이 함수가
      // 푸는 겹침이다. 여기서 고정하는 것은 **먼 노드는 아예 안 본다** 는 것:
      // 그래서 이미 펼친 클러스터가 2개든 24개든 클릭당 비용이 같다
      // (실측 2026-07-31: 클릭당 items 107~134개, 클릭 순서와 무관).
      const near = twoFans(DENSITY_GATE_THRESHOLD * 3);
      // 반대편 도메인에 같은 크기의 부채를 하나 더 — 공간적으로 멀다.
      const withFar: LayoutGraphNode[] = [
        ...near,
        { id: "dFar", kind: "domain", parentId: "p" },
        { id: "cFar", kind: "capability", parentId: "dFar" },
        ...Array.from({ length: DENSITY_GATE_THRESHOLD * 3 }, (_, i) => ({
          id: `f${i}`,
          kind: "element" as const,
          parentId: "cFar",
        })),
      ];
      const newly = new Set(near.filter((n) => n.parentId === "c0").map((n) => n.id));
      const placedNear = new Set(near.filter((n) => n.parentId !== "c0").map((n) => n.id));
      const placedAll = new Set(withFar.filter((n) => n.parentId !== "c0").map((n) => n.id));

      const a = seedAll(withFar);
      relaxNewlyVisible(a, withFar, newly, placedNear, { radii: RADII });
      const b = seedAll(withFar);
      relaxNewlyVisible(b, withFar, newly, placedAll, { radii: RADII });

      for (const id of newly) {
        expect(
          Math.hypot(a.get(id)!.x - b.get(id)!.x, a.get(id)!.y - b.get(id)!.y),
          id,
        ).toBeLessThan(0.001);
      }
    });

    it("이미 놓인 노드는 **한 톨도 움직이지 않는다** — 발밑이 흔들리지 않는다", () => {
      const nodes = twoFans(DENSITY_GATE_THRESHOLD * 3);
      const placed = new Set(nodes.filter((n) => n.parentId !== "c0").map((n) => n.id));
      const newly = new Set(nodes.filter((n) => n.parentId === "c0").map((n) => n.id));

      const before = seedAll(nodes);
      const after = seedAll(nodes);
      relaxNewlyVisible(after, nodes, newly, placed, { radii: RADII });

      for (const id of placed) {
        const a = before.get(id)!;
        const b = after.get(id)!;
        expect(Math.hypot(a.x - b.x, a.y - b.y), id).toBeLessThan(0.001);
      }
    });

    it("새로 보이는 노드는 이웃과의 겹침이 풀린다", () => {
      const nodes = twoFans(DENSITY_GATE_THRESHOLD * 3);
      const placed = new Set(nodes.filter((n) => n.parentId !== "c0").map((n) => n.id));
      const newly = new Set(nodes.filter((n) => n.parentId === "c0").map((n) => n.id));
      const kindOf = (id: string) => nodes.find((n) => n.id === id)!.kind;
      const count = (pts: Map<string, LayoutPoint>) => {
        let c = 0;
        for (const id of newly) {
          for (const other of [...newly, ...placed]) {
            if (other === id) continue;
            const a = pts.get(id)!;
            const b = pts.get(other)!;
            if (Math.hypot(a.x - b.x, a.y - b.y) < RADII[kindOf(id)] + RADII[kindOf(other)]) c += 1;
          }
        }
        return c;
      };
      const pts = seedAll(nodes);
      const seeded = count(pts);
      relaxNewlyVisible(pts, nodes, newly, placed, { radii: RADII });
      const relaxed = count(pts);
      // 씨앗 상태에 겹침이 실재해야 이 계약이 무언가를 지킨다(빈 진술 방지).
      expect(seeded).toBeGreaterThan(0);
      expect(relaxed).toBeLessThan(seeded);
    });

    it("새로 보이는 것이 없으면 아무 일도 안 한다", () => {
      const nodes = twoFans(DENSITY_GATE_THRESHOLD * 3);
      const before = seedAll(nodes);
      const after = seedAll(nodes);
      relaxNewlyVisible(after, nodes, new Set(), new Set(nodes.map((n) => n.id)), { radii: RADII });
      for (const [id, a] of before) {
        const b = after.get(id)!;
        expect(Math.hypot(a.x - b.x, a.y - b.y), id).toBeLessThan(0.001);
      }
    });
  });
});
