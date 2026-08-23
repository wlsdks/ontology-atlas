import { describe, expect, it } from "vitest";

import {
  computeConcentricLayout,
  relaxNewlyVisible,
  type LayoutGraphNode,
  type LayoutPoint,
} from "@/widgets/topology-map-v2/model/layout";
import { DENSITY_GATE_THRESHOLD } from "@/widgets/topology-map-v2/model/density-gate";

/**
 * The contract that layout relaxation runs **only on nodes that will be drawn**.
 *
 * Background (measured 2026-07-31): seed placement (fan + phyllotaxis) is cheap
 * and relaxation is expensive — at N=3,000 the seed takes 4.3ms against 2,253ms
 * total, so **relaxation is 99.8%** of it. And most of that relaxation was for
 * nodes never drawn at all: the density gate folds parents with more than 12
 * children, hiding **95%** of elements behind a chip.
 *
 * Resolving overlaps for things that are not drawn produced a **13.5 second
 * freeze** on a slow machine (measured under 6× CPU throttling, round 42).
 * Narrowing the scope takes the same vault to 7.5ms — **284×** faster, with
 * better overlap quality.
 *
 * ⚠️ **The gate locks counts and sets, not milliseconds.** Precedent from
 * `architecture.md`: *"Performance budgets differ per machine and become flaky, but 'closed means zero traversals' is true on every machine."*
 * So nothing is timed here; what is measured is **whether the nodes relaxation
 * actually moved stay inside the scope**.
 */

const RINGS = { domain: 250, capability: 145, element: 90 };
const RADII = { project: 30, domain: 17, capability: 11, element: 7 };

/** A vault where one parent exceeds the child threshold, so the gate really has something to fold. */
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
    // Exclude the subtree the gate will fold (all of c0's children) from the scope.
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
    // If coordinates are empty when a tier opens or a chip expands, nodes pile up at
    // the origin. This design assumes placement always runs and only relaxation is
    // skipped.
    const nodes = denseVault(DENSITY_GATE_THRESHOLD * 4);
    const scope = new Set(["p", "d0", "d1", "c0", "c1"]);
    const placed = place(nodes, scope);
    expect(placed.size).toBe(nodes.length);
    const atOrigin = [...placed.values()].filter((p) => p.x === 0 && p.y === 0);
    // Only the project may sit at the origin — anything else there means the seed never ran.
    expect(atOrigin.map((p) => p.id)).toEqual(["p"]);
  });

  it("범위가 비면 완화를 아예 건너뛴다 — 아무도 안 움직인다", () => {
    const nodes = denseVault(DENSITY_GATE_THRESHOLD * 4);
    expect(movedIds(nodes, new Set()).size).toBe(0);
  });

  it("범위 밖은 **장애물로도 남지 않는다** — 있든 없든 범위 안 좌표가 같다", () => {
    // The first attempt left out-of-scope nodes in items as `pinned: true`. Movement
    // was blocked but grid rebuilds and pair enumeration still ran, so **the cost did
    // not fall at all** (measured: N=3,000 stayed at 2,081ms; excluding them gave
    // 21ms).
    //
    // The observable invariant is this: **however many** out-of-scope nodes exist, the
    // coordinates of in-scope nodes do not change. Leaving them as obstacles changes
    // those coordinates immediately, so reverting is caught here — without relying on
    // incidental geometry such as whether an overlap happens to occur.
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
     * Within one parent, phyllotaxis spacing already prevents collisions (measured 0
     * overlaps), but **fans of different parents do overlap** — 5 cases when 3 expand,
     * 18 at 6, 70 at 12. Relaxing everything accumulates cost (341ms at 24) and
     * **moves nodes the user was already looking at** (up to 15 units). So only the
     * newly visible ones are relaxed, locally.
     */
    /** A vault where two parents sit close enough that their fans really overlap. */
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
      // Neighbours (sibling fans in the same domain) naturally influence each other —
      // that is the overlap this function resolves. What is pinned here is that
      // **distant nodes are never looked at**, so the per-click cost is the same
      // whether 2 or 24 clusters are already expanded (measured 2026-07-31: 107–134
      // items per click, independent of click order).
      const near = twoFans(DENSITY_GATE_THRESHOLD * 3);
      // One more fan of the same size in the opposite domain — spatially distant.
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
      // The seed state must really contain overlaps for this contract to guard anything (no vacuous assertion).
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
