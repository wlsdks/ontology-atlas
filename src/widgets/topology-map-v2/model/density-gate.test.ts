import { describe, expect, it } from "vitest";

import {
  chipAnchorRadius,
  computeDensityGate,
  DENSITY_GATE_THRESHOLD,
  DEFAULT_CHIP_RING,
  EXPANDED_CHIP_CLEARANCE,
  type DensityGateParentGeometry,
} from "./density-gate";

/** N개의 자식 id 를 만든다. */
function children(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
}

const NO_GEO = new Map<string, DensityGateParentGeometry>();

describe("computeDensityGate", () => {
  it("임계 이하 부모는 접지 않는다 (clustered 없음, 칩 없음)", () => {
    const childrenByParent = new Map<string, readonly string[]>([
      ["d", children("cap", DENSITY_GATE_THRESHOLD)], // 정확히 임계 = 접지 않음
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
    const kids = children("cap", DENSITY_GATE_THRESHOLD + 1); // 13개
    const childrenByParent = new Map<string, readonly string[]>([["d", kids]]);
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(),
      parentGeometry: new Map([["d", { x: 10, y: 0, angle: 0, ring: 100 }]]),
    });
    for (const kid of kids) expect(result.clusteredIds.has(kid)).toBe(true);
    expect(result.clusteredIds.has("d")).toBe(false); // 부모 자신은 보인다
    expect(result.chips).toHaveLength(1);
    expect(result.chips[0]).toMatchObject({ parentId: "d", count: 13, expanded: false });
    // anchor = 부모 + outward(angle 0) × ring(100) = (10+100, 0)
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
      ["cap-0", ["el-a", "el-b"]], // 손자
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
      ["cap-0", els], // cap-0 도 밀집이지만 d 가 접혀 숨김
    ]);
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(),
      parentGeometry: new Map([
        ["d", { x: 0, y: 0, angle: 0 }],
        ["cap-0", { x: 5, y: 5, angle: 0 }],
      ]),
    });
    // d 칩만 나온다 (cap-0 은 clustered → 칩 없음)
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
      expandedParents: new Set(["d"]), // d 펼침, cap-0 는 여전히 접힘
      parentGeometry: new Map([
        ["d", { x: 0, y: 0, angle: 0 }],
        ["cap-0", { x: 5, y: 5, angle: 0 }],
      ]),
    });
    // d 는 펼침 칩, cap-0 는 접힘 칩 — 둘 다 보인다
    const byId = new Map(result.chips.map((c) => [c.parentId, c]));
    expect(byId.get("d")?.expanded).toBe(true);
    expect(byId.get("cap-0")?.expanded).toBe(false);
    // el-* 는 cap-0 이 접혀 여전히 clustered
    expect(result.clusteredIds.has("el-0")).toBe(true);
    // cap-0 자신은 d 가 펼쳐져 보인다
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
    // 칩 순서 = childrenByParent 삽입 순서 (d3 는 임계 이하라 제외)
    expect(a.chips.map((c) => c.parentId)).toEqual(["d1", "d2"]);
  });

  it("domain 자식은 게이트에서 면제된다 — 프로젝트의 14개 도메인은 접히지 않는다 (Part 0)", () => {
    // 실증(`/?synth=2000`): 프로젝트가 직속 도메인 14개(임계 12 초과)를 가져도
    // 스파인이라 접히면 안 된다. kindOf 로 domain 을 면제하면 칩/클러스터 0.
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
    // 프로젝트가 도메인 2개 + capability 13개를 직속으로 가질 때(비정형이나
    // 방어) — 게이트는 capability 13 > 12 만 세어 접고, 도메인 2개는 계속 보인다.
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
    // 도메인 자식은 clustered 아님(계속 보임), capability 자식만 clustered.
    expect(result.clusteredIds.has("domain-0")).toBe(false);
    expect(result.clusteredIds.has("domain-1")).toBe(false);
    expect(result.clusteredIds.has("cap-0")).toBe(true);
  });

  it("커스텀 threshold 를 존중한다", () => {
    const result = computeDensityGate({
      childrenByParent: new Map([["d", children("cap", 5)]]),
      expandedParents: new Set(),
      parentGeometry: new Map([["d", { x: 0, y: 0, angle: 0 }]]),
      threshold: 4, // 5 > 4 → 접힘
    });
    expect(result.chips).toHaveLength(1);
    expect(result.clusteredIds.has("cap-0")).toBe(true);
  });

  // S8 결함 1 — 펼침 칩은 자식 디스크 바깥으로 밀어 자식 노드/라벨과 안 겹치게.
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
    // 접힘: 자식 링 위(ring 100), 펼침: ring + clearance.
    expect(collapsed.chips[0].anchor.x).toBeCloseTo(100, 6);
    expect(expanded.chips[0].anchor.x).toBeCloseTo(100 + EXPANDED_CHIP_CLEARANCE, 6);
    // 펼침 칩이 자식 링(디스크 반경)보다 확실히 바깥이라 자식과 안 겹친다.
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
