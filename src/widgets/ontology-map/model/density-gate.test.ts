import { describe, expect, it } from "vitest";

import {
  chipAnchorRadius,
  computeDensityGate,
  DENSITY_GATE_THRESHOLD,
  DEFAULT_CHIP_RING,
  EXPANDED_CHIP_CLEARANCE,
  type DensityGateParentGeometry,
} from "./density-gate";

/** Builds N child ids. */
function children(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
}

const NO_GEO = new Map<string, DensityGateParentGeometry>();

describe("computeDensityGate", () => {
  it("임계 이하 부모는 접지 않는다 (clustered 없음, 칩 없음)", () => {
    const childrenByParent = new Map<string, readonly string[]>([
      ["d", children("cap", DENSITY_GATE_THRESHOLD)], // exactly at the threshold: no folding
    ]);
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(),
      parentGeometry: new Map([["d", { x: 0, y: 0, angle: 0 }]]),
    });
    expect(result.clusteredIds.size).toBe(0);
    expect(result.chips).toHaveLength(0);
  });

  it("임계 초과 미확장 부모는 자식 전부를 clustered 로 접고 칩 하나를 낸다", () => {
    const kids = children("cap", DENSITY_GATE_THRESHOLD + 1); // 13 of them
    const childrenByParent = new Map<string, readonly string[]>([["d", kids]]);
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(),
      parentGeometry: new Map([["d", { x: 10, y: 0, angle: 0, ring: 100 }]]),
    });
    for (const kid of kids) expect(result.clusteredIds.has(kid)).toBe(true);
    expect(result.clusteredIds.has("d")).toBe(false); // the parent itself stays visible
    expect(result.chips).toHaveLength(1);
    expect(result.chips[0]).toMatchObject({ parentId: "d", count: 13, expanded: false });
    // anchor = parent + outward(angle 0) × ring(100) = (10+100, 0)
    expect(result.chips[0].anchor.x).toBeCloseTo(110, 6);
    expect(result.chips[0].anchor.y).toBeCloseTo(0, 6);
  });

  it("확장된 밀집 부모는 자식을 드러내고(clustered 없음) 접기 칩(expanded=true)을 낸다", () => {
    const kids = children("cap", 20);
    const result = computeDensityGate({
      childrenByParent: new Map([["d", kids]]),
      expandedParents: new Set(["d"]),
      parentGeometry: new Map([["d", { x: 0, y: 0, angle: 0 }]]),
    });
    expect(result.clusteredIds.size).toBe(0);
    expect(result.chips).toHaveLength(1);
    expect(result.chips[0]).toMatchObject({ parentId: "d", expanded: true, count: 20 });
  });

  it("접힌 부모의 손자(서브트리 전체)도 clustered 다", () => {
    const caps = children("cap", 20);
    const childrenByParent = new Map<string, readonly string[]>([
      ["d", caps],
      ["cap-0", ["el-a", "el-b"]], // grandchildren
    ]);
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(),
      parentGeometry: new Map([["d", { x: 0, y: 0, angle: 0 }]]),
    });
    expect(result.clusteredIds.has("cap-0")).toBe(true);
    expect(result.clusteredIds.has("el-a")).toBe(true);
    expect(result.clusteredIds.has("el-b")).toBe(true);
  });

  it("중첩: 상위가 접혀 있으면 하위 밀집 부모의 칩은 나오지 않는다", () => {
    const caps = children("cap", 20);
    const els = children("el", 20);
    const childrenByParent = new Map<string, readonly string[]>([
      ["d", caps],
      ["cap-0", els], // cap-0 is crowded too, but d is collapsed so it is hidden
    ]);
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(),
      parentGeometry: new Map([
        ["d", { x: 0, y: 0, angle: 0 }],
        ["cap-0", { x: 5, y: 5, angle: 0 }],
      ]),
    });
    // Only d emits a chip; cap-0 is clustered and so emits none.
    expect(result.chips.map((c) => c.parentId)).toEqual(["d"]);
  });

  it("중첩: 상위를 펼치면 하위 밀집 부모의 칩이 등장한다", () => {
    const caps = children("cap", 20);
    const els = children("el", 20);
    const childrenByParent = new Map<string, readonly string[]>([
      ["d", caps],
      ["cap-0", els],
    ]);
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(["d"]), // d expanded, cap-0 still collapsed
      parentGeometry: new Map([
        ["d", { x: 0, y: 0, angle: 0 }],
        ["cap-0", { x: 5, y: 5, angle: 0 }],
      ]),
    });
    // d gets an expanded chip and cap-0 a collapsed one; both are visible.
    const byId = new Map(result.chips.map((c) => [c.parentId, c]));
    expect(byId.get("d")?.expanded).toBe(true);
    expect(byId.get("cap-0")?.expanded).toBe(false);
    // el-* stay clustered because cap-0 is collapsed
    expect(result.clusteredIds.has("el-0")).toBe(true);
    // cap-0 itself is visible now that d is expanded
    expect(result.clusteredIds.has("cap-0")).toBe(false);
  });

  it("지오메트리가 없는 부모는 칩을 낼 수 없어 건너뛴다(그래도 clustered 는 유지)", () => {
    const kids = children("cap", 20);
    const result = computeDensityGate({
      childrenByParent: new Map([["d", kids]]),
      expandedParents: new Set(),
      parentGeometry: NO_GEO,
    });
    expect(result.chips).toHaveLength(0);
    expect(result.clusteredIds.has("cap-0")).toBe(true);
  });

  it("ring 미지정 시 DEFAULT_CHIP_RING 을 쓴다", () => {
    const result = computeDensityGate({
      childrenByParent: new Map([["d", children("cap", 20)]]),
      expandedParents: new Set(),
      parentGeometry: new Map([["d", { x: 0, y: 0, angle: Math.PI / 2 }]]), // outward = +y
    });
    expect(result.chips[0].anchor.x).toBeCloseTo(0, 6);
    expect(result.chips[0].anchor.y).toBeCloseTo(DEFAULT_CHIP_RING, 6);
  });

  it("결정론: 같은 입력을 두 번 돌리면 같은 결과", () => {
    const childrenByParent = new Map<string, readonly string[]>([
      ["d1", children("a", 20)],
      ["d2", children("b", 15)],
      ["d3", children("c", 3)],
    ]);
    const geo = new Map<string, DensityGateParentGeometry>([
      ["d1", { x: 1, y: 2, angle: 0.3 }],
      ["d2", { x: 3, y: 4, angle: 1.1 }],
    ]);
    const args = { childrenByParent, expandedParents: new Set<string>(), parentGeometry: geo };
    const a = computeDensityGate(args);
    const b = computeDensityGate(args);
    expect(b.chips).toEqual(a.chips);
    expect([...b.clusteredIds].sort()).toEqual([...a.clusteredIds].sort());
    // Chip order follows childrenByParent insertion order; d3 is below the threshold.
    expect(a.chips.map((c) => c.parentId)).toEqual(["d1", "d2"]);
  });

  it("domain 자식은 게이트에서 면제된다 — 프로젝트의 14개 도메인은 접히지 않는다 (Part 0)", () => {
    // Reproduced with `/?synth=2000`: a project with 14 direct domains exceeds
    // the threshold of 12, but they are the spine and must not fold. Exempting
    // domains through kindOf leaves zero chips and zero clustered nodes.
    const domainKids = children("domain", 14);
    const result = computeDensityGate({
      childrenByParent: new Map([["project", domainKids]]),
      expandedParents: new Set(),
      parentGeometry: new Map([["project", { x: 0, y: 0, angle: 0 }]]),
      kindOf: () => "domain",
    });
    expect(result.chips).toHaveLength(0);
    expect(result.clusteredIds.size).toBe(0);
  });

  it("혼합 자식: domain 은 보이고 capability 만 게이트로 접힌다 (Part 0)", () => {
    // A project with 2 domains plus 13 capabilities as direct children — unusual,
    // but guarded: only the 13 capabilities exceed 12 and fold, the 2 domains stay.
    const kids = [...children("domain", 2), ...children("cap", 13)];
    const kind = (id: string) => (id.startsWith("domain") ? "domain" : "capability");
    const result = computeDensityGate({
      childrenByParent: new Map([["p", kids]]),
      expandedParents: new Set(),
      parentGeometry: new Map([["p", { x: 0, y: 0, angle: 0 }]]),
      kindOf: kind,
    });
    expect(result.chips).toHaveLength(1);
    expect(result.chips[0]).toMatchObject({ parentId: "p", count: 13, expanded: false });
    // Domain children are never clustered; only capability children are.
    expect(result.clusteredIds.has("domain-0")).toBe(false);
    expect(result.clusteredIds.has("domain-1")).toBe(false);
    expect(result.clusteredIds.has("cap-0")).toBe(true);
  });

  it("커스텀 threshold 를 존중한다", () => {
    const result = computeDensityGate({
      childrenByParent: new Map([["d", children("cap", 5)]]),
      expandedParents: new Set(),
      parentGeometry: new Map([["d", { x: 0, y: 0, angle: 0 }]]),
      threshold: 4, // 5 > 4, so it folds
    });
    expect(result.chips).toHaveLength(1);
    expect(result.clusteredIds.has("cap-0")).toBe(true);
  });

  // Expanded chips are pushed outside the child disc so they never overlap a child node or label.
  it("펼침 칩 anchor 는 자식 링 바깥(접힘보다 EXPANDED_CHIP_CLEARANCE 만큼 멀다)", () => {
    const kids = children("cap", 20);
    const geo = new Map<string, DensityGateParentGeometry>([["d", { x: 0, y: 0, angle: 0, ring: 100 }]]);
    const collapsed = computeDensityGate({
      childrenByParent: new Map([["d", kids]]),
      expandedParents: new Set(),
      parentGeometry: geo,
    });
    const expanded = computeDensityGate({
      childrenByParent: new Map([["d", kids]]),
      expandedParents: new Set(["d"]),
      parentGeometry: geo,
    });
    // Collapsed sits on the child ring (100); expanded is ring + clearance.
    expect(collapsed.chips[0].anchor.x).toBeCloseTo(100, 6);
    expect(expanded.chips[0].anchor.x).toBeCloseTo(100 + EXPANDED_CHIP_CLEARANCE, 6);
    // The expanded chip is safely outside the child ring, so it cannot overlap a child.
    const parentToExpanded = Math.hypot(expanded.chips[0].anchor.x, expanded.chips[0].anchor.y);
    expect(parentToExpanded).toBeGreaterThan(100);
    expect(parentToExpanded).toBeGreaterThan(Math.hypot(collapsed.chips[0].anchor.x, collapsed.chips[0].anchor.y));
  });
});

describe("chipAnchorRadius", () => {
  it("접힘=자식 링, 펼침=자식 링 + 여유", () => {
    expect(chipAnchorRadius(100, false)).toBe(100);
    expect(chipAnchorRadius(100, true)).toBe(100 + EXPANDED_CHIP_CLEARANCE);
  });
  it("펼침 반경은 항상 접힘보다 크다(디스크 밖 보장)", () => {
    for (const ring of [40, 90, 145, 250]) {
      expect(chipAnchorRadius(ring, true)).toBeGreaterThan(chipAnchorRadius(ring, false));
    }
  });
});
