import { describe, expect, it } from "vitest";

import {
  computeRealmLayout,
  computeVisibleBounds,
  computeVisibleWardingRadius,
  computeWardingRadius,
  extractRealmSubtree,
  realmLayoutKind,
  realmMaxDepth,
  realmRingsForDepth,
  WARDING_VISIBLE_MARGIN_RATIO,
  WARDING_VISIBLE_MIN_MARGIN,
} from "./realm";
import { computeConcentricLayout, type LayoutRadii, type LayoutRings } from "./layout";

const RINGS: LayoutRings = { domain: 250, capability: 145, element: 90 };
const RADII: LayoutRadii = { project: 25, domain: 17, capability: 11, element: 7 };

/**
 * childrenByParent 픽스처: capability `c` 루트, 그 아래 element e1/e2,
 * e1 아래 손자 g1. 형제 도메인 d2 는 서브트리 밖.
 *   c ─ e1 ─ g1
 *     └ e2
 *   d2 (밖)
 */
function fixtureChildren(): Map<string, string[]> {
  return new Map<string, string[]>([
    ["c", ["e1", "e2"]],
    ["e1", ["g1"]],
    ["d2", ["x1"]],
  ]);
}

describe("extractRealmSubtree", () => {
  it("collects the transitive containment closure with depths from the root", () => {
    const sub = extractRealmSubtree("c", fixtureChildren());
    expect([...sub.memberIds].sort()).toEqual(["c", "e1", "e2", "g1"]);
    expect(sub.depthById.get("c")).toBe(0);
    expect(sub.depthById.get("e1")).toBe(1);
    expect(sub.depthById.get("e2")).toBe(1);
    expect(sub.depthById.get("g1")).toBe(2);
    expect(sub.parentById.get("g1")).toBe("e1");
    expect(sub.parentById.has("c")).toBe(false);
  });

  it("excludes sibling subtrees outside the root", () => {
    const sub = extractRealmSubtree("c", fixtureChildren());
    expect(sub.memberIds.has("d2")).toBe(false);
    expect(sub.memberIds.has("x1")).toBe(false);
  });

  it("terminates on cycles (revisit guard)", () => {
    const cyclic = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["a", "c"]],
    ]);
    const sub = extractRealmSubtree("a", cyclic);
    expect([...sub.memberIds].sort()).toEqual(["a", "b", "c"]);
    expect(sub.depthById.get("a")).toBe(0);
    expect(sub.depthById.get("b")).toBe(1);
    expect(sub.depthById.get("c")).toBe(2);
  });

  it("is a singleton when the root has no children", () => {
    const sub = extractRealmSubtree("leaf", new Map());
    expect([...sub.memberIds]).toEqual(["leaf"]);
    expect(sub.depthById.get("leaf")).toBe(0);
  });
});

describe("realmLayoutKind", () => {
  it("maps depth to ring kind regardless of render kind", () => {
    expect(realmLayoutKind(0)).toBe("project");
    expect(realmLayoutKind(1)).toBe("domain");
    expect(realmLayoutKind(2)).toBe("capability");
    expect(realmLayoutKind(3)).toBe("element");
    expect(realmLayoutKind(9)).toBe("element");
  });
});

describe("realmMaxDepth", () => {
  it("is 0 for a root-only subtree (no children)", () => {
    const sub = extractRealmSubtree("leaf", new Map());
    expect(realmMaxDepth(sub)).toBe(0);
  });

  it("is the chain length for a linear chain", () => {
    const chain = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", ["d"]],
    ]);
    const sub = extractRealmSubtree("a", chain);
    expect(realmMaxDepth(sub)).toBe(3);
  });

  it("is 1 for a fan (root with only direct children)", () => {
    const fan = new Map<string, string[]>([["root", ["a", "b", "c"]]]);
    const sub = extractRealmSubtree("root", fan);
    expect(realmMaxDepth(sub)).toBe(1);
  });
});

describe("realmRingsForDepth", () => {
  const BASE: LayoutRings = { domain: 250, capability: 145, element: 90 };
  const FILL = { depth1: 130, depth2: 190, depth3: 250 };

  it("pulls rings in for a shallow (maxDepth=1) subtree", () => {
    const rings = realmRingsForDepth(1, BASE, FILL);
    expect(rings.domain).toBeCloseTo(130, 5);
    expect(rings.capability).toBeCloseTo(75.4, 5);
    expect(rings.element).toBeCloseTo(46.8, 5);
  });

  it("pulls rings in less for maxDepth=2", () => {
    const rings = realmRingsForDepth(2, BASE, FILL);
    expect(rings.domain).toBeCloseTo(190, 5);
    expect(rings.capability).toBeCloseTo(110.2, 5);
    expect(rings.element).toBeCloseTo(68.4, 5);
  });

  it("is byte-identical to base rings at maxDepth>=3 (deep realms unaffected — regression guard)", () => {
    expect(realmRingsForDepth(3, BASE, FILL)).toEqual(BASE);
    expect(realmRingsForDepth(5, BASE, FILL)).toEqual(BASE);
  });

  it("is deterministic — same input yields the same output", () => {
    expect(realmRingsForDepth(1, BASE, FILL)).toEqual(realmRingsForDepth(1, BASE, FILL));
  });
});

describe("computeRealmLayout", () => {
  it("places the root at the origin and depth-1 children on the domain ring", () => {
    const sub = extractRealmSubtree("c", fixtureChildren());
    const layout = computeRealmLayout(sub, RINGS, RADII);
    const root = layout.get("c");
    expect(root).toEqual({ id: "c", x: 0, y: 0 });
    // depth-1 children (e1, e2) fan around the domain ring — at exactly the
    // ring radius from the origin (same invariant layout.test pins for domains).
    for (const id of ["e1", "e2"]) {
      const p = layout.get(id);
      expect(p).toBeDefined();
      // Two depth-1 siblings sit on the ring at radius `domain` before de-pileup;
      // the de-pileup only nudges local overlaps, so they stay near the ring.
      const r = Math.hypot(p!.x, p!.y);
      expect(r).toBeGreaterThan(RINGS.domain * 0.5);
    }
  });

  it("is deterministic — same subtree yields byte-identical coordinates", () => {
    const a = computeRealmLayout(extractRealmSubtree("c", fixtureChildren()), RINGS, RADII);
    const b = computeRealmLayout(extractRealmSubtree("c", fixtureChildren()), RINGS, RADII);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});

describe("computeRealmLayout — 소수-자식 수평 구도 (소유자 실보고 2026-07-23)", () => {
  it("depth1 자식 2개는 수평축에 앉는다 — 첫 자식 왼쪽, 둘째 오른쪽", () => {
    const sub = extractRealmSubtree("c", new Map([["c", ["e1", "e2"]]]));
    const layout = computeRealmLayout(sub, RINGS, RADII);
    expect(layout.get("c")).toEqual({ id: "c", x: 0, y: 0 });
    const e1 = layout.get("e1")!;
    const e2 = layout.get("e2")!;
    // TAU 등분(위/아래 덤벨)의 −90° 강체 회전: (0,−R)→(−R,0), (0,R)→(R,0).
    expect(e1.x).toBeLessThan(0);
    expect(Math.abs(e1.y)).toBeLessThan(1e-9);
    expect(e2.x).toBeGreaterThan(0);
    expect(Math.abs(e2.y)).toBeLessThan(1e-9);
  });

  it("depth1 자식 1개는 수평축(왼쪽)에 앉는다 — 같은 −90° 강체 회전 규칙", () => {
    const sub = extractRealmSubtree("c", new Map([["c", ["only"]]]));
    const layout = computeRealmLayout(sub, RINGS, RADII);
    const only = layout.get("only")!;
    expect(only.x).toBeLessThan(0); // (0,−R)→(−R,0)
    expect(Math.abs(only.y)).toBeLessThan(1e-9);
  });

  it("회전은 강체다 — 미회전 concentric 레이아웃의 정확한 (x,y)→(y,−x) 사상", () => {
    const children = new Map([
      ["c", ["e1", "e2"]],
      ["e1", ["g1"]],
    ]);
    const sub = extractRealmSubtree("c", children);
    const rotated = computeRealmLayout(sub, RINGS, RADII);
    // 동일 입력을 직접 concentric 에 태운 미회전 기준과 좌표 단위로 대조한다.
    const rawInput = [...sub.depthById.keys()].map((id) => ({
      id,
      kind: realmLayoutKind(sub.depthById.get(id) ?? 0),
      parentId: id === sub.rootId ? null : sub.parentById.get(id) ?? null,
    }));
    const raw = new Map(computeConcentricLayout(rawInput, RINGS, { radii: RADII }).map((p) => [p.id, p]));
    for (const id of ["e1", "e2", "g1"]) {
      const r = raw.get(id)!;
      const p = rotated.get(id)!;
      expect(p.x).toBeCloseTo(r.y, 10);
      expect(p.y).toBeCloseTo(-r.x, 10);
    }
  });

  it("depth1 자식 3개 이상은 미회전 — 첫 자식이 위(-90°) 그대로 (깊은/넓은 영역 회귀 0)", () => {
    const sub = extractRealmSubtree("c", new Map([["c", ["a", "b", "d"]]]));
    const layout = computeRealmLayout(sub, RINGS, RADII);
    const a = layout.get("a")!;
    // TAU 등분 시작각 −90°: 첫 자식은 위쪽(x≈0, y<0).
    expect(Math.abs(a.x)).toBeLessThan(1e-9);
    expect(a.y).toBeLessThan(0);
  });
});

describe("computeWardingRadius", () => {
  it("is the farthest point distance plus margin (deterministic)", () => {
    const center = { x: 0, y: 0 };
    const points = [
      { x: 30, y: 40 }, // dist 50
      { x: 0, y: 100 }, // dist 100
      { x: -60, y: 0 }, // dist 60
    ];
    expect(computeWardingRadius(points, center, 24)).toBe(124);
  });

  it("returns just the margin when only the root is present", () => {
    expect(computeWardingRadius([], { x: 0, y: 0 }, 24)).toBe(24);
  });

  it("respects a non-origin center", () => {
    const r = computeWardingRadius([{ x: 100, y: 0 }], { x: 40, y: 0 }, 10);
    expect(r).toBe(70);
  });
});

describe("computeVisibleWardingRadius (S9 결함 2)", () => {
  it("가장 먼 reach + 콘텐츠 비례 마진", () => {
    // outer=200 → margin = max(40, 200*0.1=20) = 40 → 240.
    expect(computeVisibleWardingRadius([50, 120, 200])).toBe(200 + Math.max(WARDING_VISIBLE_MIN_MARGIN, 200 * WARDING_VISIBLE_MARGIN_RATIO));
    expect(computeVisibleWardingRadius([50, 120, 200])).toBe(240);
    // outer=800 → margin = max(40, 80) = 80 → 880.
    expect(computeVisibleWardingRadius([800])).toBe(800 + 800 * WARDING_VISIBLE_MARGIN_RATIO);
  });

  it("가시 집합이 줄면(접힘) 반경이 줄어든다", () => {
    const full = computeVisibleWardingRadius([100, 400, 900]);
    const folded = computeVisibleWardingRadius([100, 400]); // 900 짜리(접힌 자식) 제외
    expect(folded).toBeLessThan(full);
  });

  it("가시 멤버가 없으면(루트만) 하한 마진만 남는다", () => {
    expect(computeVisibleWardingRadius([])).toBe(WARDING_VISIBLE_MIN_MARGIN);
  });
});

describe("computeVisibleBounds (S9 결함 2)", () => {
  const fallback = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  it("점집합 bbox + 마진", () => {
    const b = computeVisibleBounds([{ x: -10, y: 20 }, { x: 30, y: -5 }], 4, fallback);
    expect(b).toEqual({ minX: -14, minY: -9, maxX: 34, maxY: 24 });
  });
  it("점이 없으면 fallback 을 그대로 돌려준다", () => {
    expect(computeVisibleBounds([], 4, fallback)).toBe(fallback);
  });
});
