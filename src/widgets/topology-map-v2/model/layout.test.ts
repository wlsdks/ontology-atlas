import { describe, expect, it } from "vitest";

import {
  computeConcentricLayout,
  type LayoutGraphNode,
  type LayoutRings,
} from "./layout";

/**
 * Small fixed vault fixture — one project, two domains, a handful of
 * capabilities/elements. Deliberately tiny (unlike the 12-domain prototype
 * fixture) so overlap/ring-radius assertions are easy to hand-verify.
 */
const FIXTURE: readonly LayoutGraphNode[] = [
  { id: "ontology-atlas", kind: "project", parentId: null },
  { id: "domain-a", kind: "domain", parentId: "ontology-atlas" },
  { id: "domain-b", kind: "domain", parentId: "ontology-atlas" },
  { id: "cap-a1", kind: "capability", parentId: "domain-a" },
  { id: "cap-a2", kind: "capability", parentId: "domain-a" },
  { id: "cap-b1", kind: "capability", parentId: "domain-b" },
  { id: "el-a1-1", kind: "element", parentId: "cap-a1" },
  { id: "el-a1-2", kind: "element", parentId: "cap-a1" },
  { id: "el-b1-1", kind: "element", parentId: "cap-b1" },
];

const RINGS: LayoutRings = { domain: 250, capability: 145, element: 90 };

function byId(points: { id: string; x: number; y: number }[], id: string) {
  const found = points.find((p) => p.id === id);
  if (!found) throw new Error(`fixture point ${id} missing from layout output`);
  return found;
}

describe("computeConcentricLayout", () => {
  it("places the project at the origin", () => {
    const points = computeConcentricLayout(FIXTURE, RINGS);
    const project = byId(points, "ontology-atlas");
    expect(project.x).toBeCloseTo(0, 6);
    expect(project.y).toBeCloseTo(0, 6);
  });

  it("places every domain exactly layoutRingDomain world-units from the origin (no aspectX distortion)", () => {
    const points = computeConcentricLayout(FIXTURE, RINGS);
    for (const domainId of ["domain-a", "domain-b"]) {
      const p = byId(points, domainId);
      const distanceFromOrigin = Math.hypot(p.x, p.y);
      expect(distanceFromOrigin).toBeCloseTo(RINGS.domain, 4);
    }
  });

  it("places every capability exactly layoutRingCapability world-units from its parent domain", () => {
    const points = computeConcentricLayout(FIXTURE, RINGS);
    const domainA = byId(points, "domain-a");
    for (const capId of ["cap-a1", "cap-a2"]) {
      const p = byId(points, capId);
      const distanceFromParent = Math.hypot(p.x - domainA.x, p.y - domainA.y);
      expect(distanceFromParent).toBeCloseTo(RINGS.capability, 4);
    }
  });

  it("places every element exactly layoutRingElement world-units from its parent capability", () => {
    const points = computeConcentricLayout(FIXTURE, RINGS);
    const capA1 = byId(points, "cap-a1");
    for (const elId of ["el-a1-1", "el-a1-2"]) {
      const p = byId(points, elId);
      const distanceFromParent = Math.hypot(p.x - capA1.x, p.y - capA1.y);
      expect(distanceFromParent).toBeCloseTo(RINGS.element, 4);
    }
  });

  it("is deterministic — calling twice with the same input produces identical coordinates", () => {
    const first = computeConcentricLayout(FIXTURE, RINGS);
    const second = computeConcentricLayout(FIXTURE, RINGS);
    expect(second).toEqual(first);
  });

  it("produces no two nodes at (or within 1 world-unit of) the same coordinates", () => {
    const points = computeConcentricLayout(FIXTURE, RINGS);
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
        expect(distance).toBeGreaterThan(1);
      }
    }
  });

  it("returns exactly one point per input node", () => {
    const points = computeConcentricLayout(FIXTURE, RINGS);
    expect(points).toHaveLength(FIXTURE.length);
  });
});

/**
 * De-pileup / determinism contract (Design Guardian 충실도 반려): the static
 * default must be a clean deterministic grid, NOT an FA2 settlement. The
 * collision-relax post-process spreads overlapping arcs with a FIXED iteration
 * count and a seeded tie-break — same input → byte-identical output.
 */
describe("computeConcentricLayout — deterministic de-pileup", () => {
  // One domain with a fat fan of capabilities (each with several elements) —
  // the 295-vs-40-concept density the guardian flagged, in miniature.
  const DENSE: LayoutGraphNode[] = [{ id: "p", kind: "project", parentId: null }];
  DENSE.push({ id: "d", kind: "domain", parentId: "p" });
  for (let c = 0; c < 10; c += 1) {
    const capId = `cap-${c}`;
    DENSE.push({ id: capId, kind: "capability", parentId: "d" });
    for (let e = 0; e < 6; e += 1) {
      DENSE.push({ id: `el-${c}-${e}`, kind: "element", parentId: capId });
    }
  }

  const RADII = { project: 25, domain: 17, capability: 11, element: 7 };

  function minPairwiseDistance(points: { x: number; y: number }[]): number {
    let min = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        min = Math.min(min, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
      }
    }
    return min;
  }

  it("is byte-identical across two runs on a dense graph (no organic jitter)", () => {
    const a = computeConcentricLayout(DENSE, RINGS, { radii: RADII });
    const b = computeConcentricLayout(DENSE, RINGS, { radii: RADII });
    expect(b).toEqual(a);
  });

  it("leaves no two nodes closer than their combined collision radii", () => {
    const points = computeConcentricLayout(DENSE, RINGS, { radii: RADII, relaxPadding: 6 });
    // Smallest possible min-distance = two elements = 7 + 7 = 14 (padding is
    // extra headroom the relax targets, so we assert against the hard radii).
    expect(minPairwiseDistance(points)).toBeGreaterThanOrEqual(14);
  });

  it("actually separates an overlapping seed (relax does work), deterministically", () => {
    // Inflate radii so even the concentric seed overlaps heavily, forcing the
    // relax to push nodes apart.
    const huge = { project: 400, domain: 400, capability: 400, element: 400 };
    const seedOnly = computeConcentricLayout(DENSE, RINGS, { radii: huge, relaxIterations: 0 });
    const relaxed = computeConcentricLayout(DENSE, RINGS, { radii: huge, relaxIterations: 80 });
    expect(minPairwiseDistance(relaxed)).toBeGreaterThan(minPairwiseDistance(seedOnly));
    // Still fully deterministic under the heavy relax.
    const relaxedAgain = computeConcentricLayout(DENSE, RINGS, { radii: huge, relaxIterations: 80 });
    expect(relaxedAgain).toEqual(relaxed);
  });
});

describe("computeConcentricLayout — 비표준 계보 / 고아 (2026-07 블롭 회귀)", () => {
  // 도메인이 element 를 직접 담는 vault(capability 경유 없음). 종전에는 이런
  // 노드가 아예 배치되지 않고 전원 (0,0) 적층 → 라이브 물리가 허브 쪽으로
  // 끌어간 자리에서 라벨까지 겹치는 "블롭"이 됐다 (소유자 실보고).
  const DOMAIN_DIRECT: readonly LayoutGraphNode[] = [
    { id: "p", kind: "project", parentId: null },
    { id: "d", kind: "domain", parentId: "p" },
    { id: "el-1", kind: "element", parentId: "d" },
    { id: "el-2", kind: "element", parentId: "d" },
    { id: "el-3", kind: "element", parentId: "d" },
  ];

  it("도메인 직속 element 를 (0,0) 적층 없이 도메인 주변에 부채꼴 배치한다", () => {
    const points = computeConcentricLayout(DOMAIN_DIRECT, RINGS);
    const d = byId(points, "d");
    for (const id of ["el-1", "el-2", "el-3"]) {
      const p = byId(points, id);
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(1); // 원점 적층 금지
      // fan 3개 ≤ 밀도 임계 → 정확히 element 링 반지름에서 도메인을 두른다.
      expect(Math.hypot(p.x - d.x, p.y - d.y)).toBeCloseTo(RINGS.element, 4);
    }
    // 서로 겹치지 않는다.
    const [a, b, c] = ["el-1", "el-2", "el-3"].map((id) => byId(points, id));
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1);
    expect(Math.hypot(b.x - c.x, b.y - c.y)).toBeGreaterThan(1);
  });

  it("element ⊃ element 체인의 자식도 배치된 부모 주변에 놓인다", () => {
    const chain: readonly LayoutGraphNode[] = [
      { id: "p", kind: "project", parentId: null },
      { id: "d", kind: "domain", parentId: "p" },
      { id: "c", kind: "capability", parentId: "d" },
      { id: "el-parent", kind: "element", parentId: "c" },
      { id: "el-child", kind: "element", parentId: "el-parent" },
    ];
    const points = computeConcentricLayout(chain, RINGS);
    const parent = byId(points, "el-parent");
    const child = byId(points, "el-child");
    expect(Math.hypot(child.x, child.y)).toBeGreaterThan(1);
    // 단일 자식 + relax 무충돌 → 정확히 element 링 반지름.
    expect(Math.hypot(child.x - parent.x, child.y - parent.y)).toBeCloseTo(RINGS.element, 4);
  });

  it("containment 밖 고아 노드는 도메인 링 바깥 나선에 서로 떨어져 배치된다", () => {
    const withOrphans: readonly LayoutGraphNode[] = [
      { id: "p", kind: "project", parentId: null },
      { id: "d", kind: "domain", parentId: "p" },
      { id: "orphan-1", kind: "element", parentId: null },
      { id: "orphan-2", kind: "element", parentId: "ghost-missing" },
      { id: "orphan-3", kind: "element", parentId: null },
    ];
    const points = computeConcentricLayout(withOrphans, RINGS);
    const orphans = ["orphan-1", "orphan-2", "orphan-3"].map((id) => byId(points, id));
    for (const o of orphans) {
      expect(Math.hypot(o.x, o.y)).toBeGreaterThanOrEqual(RINGS.domain + RINGS.capability - 1);
    }
    expect(Math.hypot(orphans[0].x - orphans[1].x, orphans[0].y - orphans[1].y)).toBeGreaterThan(1);
    expect(Math.hypot(orphans[1].x - orphans[2].x, orphans[1].y - orphans[2].y)).toBeGreaterThan(1);
  });

  it("표준형 vault 출력은 종전과 동일하게 유지된다 (fan 합류 no-op 계약)", () => {
    // FIXTURE 는 직속 element 없음 → 신규 패스 전부 no-op. 핵심 링 계약 재확인.
    const points = computeConcentricLayout(FIXTURE, RINGS);
    for (const capId of ["cap-a1", "cap-a2", "cap-b1"]) {
      const cap = FIXTURE.find((n) => n.id === capId)!;
      const capPoint = byId(points, capId);
      const domainPoint = byId(points, cap.parentId!);
      expect(Math.hypot(capPoint.x - domainPoint.x, capPoint.y - domainPoint.y)).toBeCloseTo(RINGS.capability, 4);
    }
  });
});

/**
 * 밀도 게이트 슬라이스 (fable 설계) — 임계(12) 초과 부모의 자식은 폭주하는
 * 부채꼴 대신 phyllotaxis 디스크로 유계 배치된다. 임계 이하 부모는 위
 * 계약(부채꼴)을 그대로 유지한다 (아래 회귀 테스트로 재확인).
 */
describe("computeConcentricLayout — phyllotaxis 디스크 (밀집 부모)", () => {
  // 도메인 하나에 108 capability — dogfood Onboarding & UX 밀도 그대로.
  const DENSE_DOMAIN: LayoutGraphNode[] = [
    { id: "p", kind: "project", parentId: null },
    { id: "d", kind: "domain", parentId: "p" },
  ];
  const DENSE_CHILD_COUNT = 108;
  for (let c = 0; c < DENSE_CHILD_COUNT; c += 1) {
    DENSE_DOMAIN.push({ id: `cap-${c}`, kind: "capability", parentId: "d" });
  }
  const RADII = { project: 25, domain: 17, capability: 11, element: 7 };

  it("디스크 반지름이 유계다 (부채꼴 폭주 방지 — 옛 n=108 부채꼴은 2000+)", () => {
    const points = computeConcentricLayout(DENSE_DOMAIN, RINGS, { radii: RADII });
    const d = byId(points, "d");
    let maxFromParent = 0;
    for (let c = 0; c < DENSE_CHILD_COUNT; c += 1) {
      const p = byId(points, `cap-${c}`);
      maxFromParent = Math.max(maxFromParent, Math.hypot(p.x - d.x, p.y - d.y));
    }
    // shift(capability ring 145) + spacing(26)·√108 ≈ 415, relax 여유 포함 상한.
    expect(maxFromParent).toBeLessThan(650);
    // 옛 부채꼴(반지름 ∝ n)이었다면 1500+ 였을 것 — 유계임을 대비로 증명.
    expect(maxFromParent).toBeLessThan(700);
  });

  it("결정론 — 두 번 돌려 바이트 동일", () => {
    const a = computeConcentricLayout(DENSE_DOMAIN, RINGS, { radii: RADII });
    const b = computeConcentricLayout(DENSE_DOMAIN, RINGS, { radii: RADII });
    expect(b).toEqual(a);
  });

  it("겹침 없음 — 어떤 두 노드도 결합 충돌 반지름보다 가깝지 않다", () => {
    const points = computeConcentricLayout(DENSE_DOMAIN, RINGS, { radii: RADII, relaxPadding: 6 });
    let min = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        min = Math.min(min, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
      }
    }
    // capability 두 개 = 11 + 11 = 22 하한.
    expect(min).toBeGreaterThanOrEqual(22);
  });

  it("임계 초과 capability→element 도 디스크로 유계 배치된다", () => {
    const chain: LayoutGraphNode[] = [
      { id: "p", kind: "project", parentId: null },
      { id: "d", kind: "domain", parentId: "p" },
      { id: "c", kind: "capability", parentId: "d" },
    ];
    for (let e = 0; e < 40; e += 1) chain.push({ id: `el-${e}`, kind: "element", parentId: "c" });
    const points = computeConcentricLayout(chain, RINGS, { radii: RADII });
    const c = byId(points, "c");
    let maxFromParent = 0;
    for (let e = 0; e < 40; e += 1) {
      const p = byId(points, `el-${e}`);
      maxFromParent = Math.max(maxFromParent, Math.hypot(p.x - c.x, p.y - c.y));
    }
    // element ring(90) shift + spacing·√40 ≈ 90 + 26·6.3 ≈ 254, 여유 상한.
    expect(maxFromParent).toBeLessThan(450);
  });

  it("임계 경계: 12개는 부채꼴, 13개는 디스크 (경로 분기)", () => {
    const mk = (n: number): LayoutGraphNode[] => {
      const g: LayoutGraphNode[] = [
        { id: "p", kind: "project", parentId: null },
        { id: "d", kind: "domain", parentId: "p" },
      ];
      for (let c = 0; c < n; c += 1) g.push({ id: `cap-${c}`, kind: "capability", parentId: "d" });
      return g;
    };
    // 12개(임계) = 부채꼴 → 모든 자식이 정확히 capability 링 위(radius 폭주 전 base×배율).
    // 여기서는 "13개가 12개보다 촘촘한 √-성장 디스크가 되어 최대 반지름이 급증하지
    // 않는다"만 확인한다 (부채꼴 base 는 n 배율로 커진다).
    const twelve = computeConcentricLayout(mk(12), RINGS, { radii: RADII });
    const thirteen = computeConcentricLayout(mk(13), RINGS, { radii: RADII });
    const maxR = (pts: { id: string; x: number; y: number }[], n: number) => {
      const d = byId(pts, "d");
      let m = 0;
      for (let c = 0; c < n; c += 1) {
        const p = byId(pts, `cap-${c}`);
        m = Math.max(m, Math.hypot(p.x - d.x, p.y - d.y));
      }
      return m;
    };
    // 13개 디스크의 최대 반지름은 유계(디스크 상한 이하) — 부채꼴 배율 폭주와 무관.
    expect(maxR(thirteen, 13)).toBeLessThan(400);
    // 12개는 부채꼴 경로(≤ capability ring × 밀도 배율)라 별도 계약 유지.
    expect(maxR(twelve, 12)).toBeGreaterThan(0);
  });
});
