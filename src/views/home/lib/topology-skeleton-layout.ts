import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologySkeleton } from "./topology-ontology-skeleton";
import type { RevealState } from "./topology-reveal-state";

/**
 * One placed skeleton node. tier 0 = project (center), 1 = domain, 2 =
 * capability(landmark/펼침), 3 = element(클릭 확장에서만 등장).
 */
export interface SkeletonLayoutPoint {
  id: string;
  x: number;
  y: number;
  tier: 0 | 1 | 2 | 3;
}

export interface SkeletonRadialLayout {
  width: number;
  height: number;
  center: { x: number; y: number };
  points: SkeletonLayoutPoint[];
  pointById: Map<string, SkeletonLayoutPoint>;
}

export interface SkeletonLayoutOptions {
  width?: number;
  height?: number;
  /** Safety margin so outer-ring labels stay inside the viewport. */
  padding?: number;
  /** Ring-1 (domain) radius as a fraction of the outer radius. */
  innerRadiusRatio?: number;
  /**
   * Fraction of a domain's angular wedge its landmarks may span (0..1). Smaller =
   * landmarks hug their domain's spoke more tightly. Default 0.4.
   */
  clusterSpread?: number;
  /**
   * 가로 늘림 배수 (default 1 = 원). 와이드 뷰포트에서 정원 레이아웃은
   * autoRescale 후 좌우가 비고 세로 거리가 멀어 보인다 — 타원으로 화면
   * 비율에 맞춘다. x 성분에만 곱한다 (중심 기준).
   */
  aspectX?: number;
}

const START_ANGLE = -Math.PI / 2; // 12 o'clock, clockwise (matches buildRadialEgoLayout)
const DEFAULT_PADDING = 40;
const DEFAULT_INNER_RATIO = 0.5;
const DEFAULT_CLUSTER_SPREAD = 0.4;

/**
 * Deterministic tiered radial layout over the containment skeleton — the
 * structural-skeleton entry idiom the luminary panel resolved on (NOT a force
 * layout, which encodes nothing by position and re-settles non-deterministically).
 *
 * Project at the center; domains evenly on ring 1 (12-o'clock, slug order);
 * each domain's landmark capabilities clustered on ring 2 within that domain's
 * angular wedge. Pure & replay-identical: position encodes tier/ownership so a
 * reader answers "what level / who owns this" by eye.
 */
export function buildSkeletonRadialLayout(
  skeleton: OntologySkeleton,
  nodes: readonly KnowledgeGraphNode[],
  options: SkeletonLayoutOptions = {},
): SkeletonRadialLayout {
  const width = options.width ?? 1000;
  const height = options.height ?? 1000;
  const padding = options.padding ?? DEFAULT_PADDING;
  const innerRatio = options.innerRadiusRatio ?? DEFAULT_INNER_RATIO;
  const clusterSpread = options.clusterSpread ?? DEFAULT_CLUSTER_SPREAD;
  const aspectX = options.aspectX ?? 1;

  const cx = width / 2;
  const cy = height / 2;
  const center = { x: cx, y: cy };
  const outerRadius = Math.max(0, Math.min(width, height) / 2 - padding);
  const innerRadius = outerRadius * innerRatio;

  const kindBySlug = new Map(nodes.map((node) => [node.id, node.kind]));
  const points: SkeletonLayoutPoint[] = [];
  const pointById = new Map<string, SkeletonLayoutPoint>();

  const place = (id: string, x: number, y: number, tier: 0 | 1 | 2) => {
    // 타원 — x 성분만 aspectX 배 (중심 기준).
    const point: SkeletonLayoutPoint = {
      id,
      x: cx + (x - cx) * aspectX,
      y,
      tier,
    };
    points.push(point);
    pointById.set(id, point);
  };

  // tier 0 — the project at the center (first by slug if several; extras fall
  // through to ring 1 with domains so they still get placed deterministically).
  const projects = [...skeleton.skeletonSlugs]
    .filter((slug) => kindBySlug.get(slug) === "project")
    .sort();
  const centerProject = projects[0] ?? null;
  if (centerProject) place(centerProject, cx, cy, 0);

  // tier 1 — domains (+ any extra projects) evenly on the inner ring.
  const ring1 = [
    ...projects.slice(1),
    ...[...skeleton.skeletonSlugs].filter((slug) => kindBySlug.get(slug) === "domain"),
  ].sort();

  const angleByRing1 = new Map<string, number>();
  if (ring1.length > 0) {
    const step = (Math.PI * 2) / ring1.length;
    ring1.forEach((slug, i) => {
      const theta = START_ANGLE + step * i;
      angleByRing1.set(slug, theta);
      place(slug, cx + Math.cos(theta) * innerRadius, cy + Math.sin(theta) * innerRadius, 1);
    });
  }

  // tier 2 — landmark capabilities clustered within their owning domain's wedge.
  const wedge = ring1.length > 0 ? (Math.PI * 2) / ring1.length : Math.PI * 2;
  const sectorHalf = (wedge / 2) * clusterSpread;
  for (const [domainSlug, landmarks] of skeleton.landmarksByDomain) {
    const domainAngle = angleByRing1.get(domainSlug);
    if (domainAngle === undefined) continue;
    const ordered = landmarks; // already ranked deterministically upstream
    ordered.forEach((slug, i) => {
      const theta =
        ordered.length === 1
          ? domainAngle
          : domainAngle - sectorHalf + ((2 * sectorHalf) / (ordered.length - 1)) * i;
      place(slug, cx + Math.cos(theta) * outerRadius, cy + Math.sin(theta) * outerRadius, 2);
    });
  }

  return { width, height, center, points, pointById };
}

/** 펼친 도메인의 역량들이 wedge 를 쓰는 비율 — 진입(0.4)보다 넓게 편다. */
const REVEAL_CLUSTER_SPREAD = 0.8;
/** 요소 ring 반경 = outer ring × 이 배수 (역량 바깥 한 단계, 카드 간격 타이트하게). */
const ELEMENT_RADIUS_RATIO = 1.28;
/** 요소 사이 최대 각 간격(rad) — 적은 요소가 wedge 전체로 흩어지지 않게. */
const ELEMENT_ARC_STEP = 0.22;

/**
 * 클릭-레벨 확장 좌표 — 골격 레이아웃 위에 RevealState 의 펼침을 결정론적으로
 * 얹는다. anchor(project/domain)와 다른 도메인의 landmark 는 *불변*; 펼친
 * 도메인의 역량 전체는 그 도메인 wedge 안 outer ring 에 재분배되고, 펼친
 * 역량의 요소는 역량 각도를 중심으로 한 호(tier 3, ring 바깥)에 배치된다.
 * 물리/난수 0 — 같은 입력이면 replay-identical.
 */
export function buildRevealRadialLayout(
  skeleton: OntologySkeleton,
  nodes: readonly KnowledgeGraphNode[],
  reveal: RevealState,
  options: SkeletonLayoutOptions = {},
): SkeletonRadialLayout {
  // 각도 산술(atan2/wedge)은 *원* 공간에서만 정확 — 타원 stretch 는 모든
  // 배치가 끝난 뒤 마지막에 한 번 적용한다.
  const aspectX = options.aspectX ?? 1;
  const circleOptions = { ...options, aspectX: 1 };
  const applyAspect = (layout: SkeletonRadialLayout): SkeletonRadialLayout => {
    if (aspectX === 1) return layout;
    for (const pt of layout.points) {
      pt.x = layout.center.x + (pt.x - layout.center.x) * aspectX;
    }
    return layout;
  };
  const base = buildSkeletonRadialLayout(skeleton, nodes, circleOptions);
  if (!reveal.scopeDomainSlug && !reveal.scopeCapabilitySlug) {
    return applyAspect(base);
  }

  const padding = options.padding ?? DEFAULT_PADDING;
  const outerRadius = Math.max(0, Math.min(base.width, base.height) / 2 - padding);
  const { x: cx, y: cy } = base.center;

  const points = base.points.map((pt) => ({ ...pt }));
  const pointById = new Map(points.map((pt) => [pt.id, pt]));
  const place = (id: string, x: number, y: number, tier: 0 | 1 | 2 | 3) => {
    const existing = pointById.get(id);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.tier = tier;
      return;
    }
    const point: SkeletonLayoutPoint = { id, x, y, tier };
    points.push(point);
    pointById.set(id, point);
  };
  const angleOf = (pt: SkeletonLayoutPoint) => Math.atan2(pt.y - cy, pt.x - cx);

  const ring1Count = points.filter((pt) => pt.tier === 1).length;
  const wedge = ring1Count > 0 ? (Math.PI * 2) / ring1Count : Math.PI * 2;

  // 펼친 도메인 — 역량 전체를 wedge 안 outer ring 에 균등 재분배.
  if (reveal.scopeDomainSlug && reveal.domainCapabilitySlugs.length > 0) {
    const domainPoint = pointById.get(reveal.scopeDomainSlug);
    if (domainPoint) {
      const domainAngle = angleOf(domainPoint);
      const half = (wedge / 2) * REVEAL_CLUSTER_SPREAD;
      const caps = reveal.domainCapabilitySlugs;
      caps.forEach((slug, i) => {
        const theta =
          caps.length === 1
            ? domainAngle
            : domainAngle - half + ((2 * half) / (caps.length - 1)) * i;
        place(slug, cx + Math.cos(theta) * outerRadius, cy + Math.sin(theta) * outerRadius, 2);
      });
    }
  }

  // 펼친 역량 — 요소를 역량 각도 중심의 짧은 호(tier 3)에 배치.
  if (reveal.scopeCapabilitySlug) {
    let capPoint = pointById.get(reveal.scopeCapabilitySlug);
    if (!capPoint) {
      // 도메인 wedge 밖의 역량(드묾) — 12시 방향 outer ring 에 결정론 배치.
      place(
        reveal.scopeCapabilitySlug,
        cx + Math.cos(START_ANGLE) * outerRadius,
        cy + Math.sin(START_ANGLE) * outerRadius,
        2,
      );
      capPoint = pointById.get(reveal.scopeCapabilitySlug)!;
    }
    const capAngle = angleOf(capPoint);
    const elements = reveal.capabilityElementSlugs;
    const elementRadius = outerRadius * ELEMENT_RADIUS_RATIO;
    const totalArc =
      elements.length <= 1
        ? 0
        : Math.min(wedge * REVEAL_CLUSTER_SPREAD, ELEMENT_ARC_STEP * (elements.length - 1));
    elements.forEach((slug, i) => {
      const theta =
        elements.length === 1
          ? capAngle
          : capAngle - totalArc / 2 + (totalArc / (elements.length - 1)) * i;
      place(slug, cx + Math.cos(theta) * elementRadius, cy + Math.sin(theta) * elementRadius, 3);
    });
  }

  return applyAspect({
    width: base.width,
    height: base.height,
    center: base.center,
    points,
    pointById,
  });
}
