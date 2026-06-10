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

/** 부모 → 자식 열까지의 가로 간격 — 짧을수록 가지로 읽힌다 (패널 #4). */
const CHILD_COLUMN_OFFSET = 200;
/** 1열 → 2열 사이 가로 간격. */
const CHILD_COLUMN_GAP = 330;
/** 형제 카드 사이 세로 간격 — ego reframe 후 카드 높이(px)를 여유 있게 덮는다. */
const CHILD_ROW_SPACING = 60;
/** 이 수를 넘으면 두 열로 분할해 열 높이를 제한 — 단일 열이 기본(2열은
 *  부모→안쪽 열 엣지가 바깥 열을 관통해 어수선해진다). */
const CHILD_SINGLE_COLUMN_MAX = 28;

/**
 * 클릭-레벨 확장 좌표 — MindNode/tidy-tree 문법 (Reingold–Tilford 계열의
 * 로컬 단순화). 펼친 부모의 자식들은 글로벌 링이 아니라 *부모 바로 옆*
 * tidy 세로 열(필요시 2열)에 붙는다 — 부모-자식 엣지가 짧아져 화면을
 * 가로지르는 "빗자루" 다발이 구조적으로 사라진다. anchor(project/domain)와
 * 다른 도메인 landmark 는 불변. 물리/난수 0 — replay-identical.
 */
export function buildRevealRadialLayout(
  skeleton: OntologySkeleton,
  nodes: readonly KnowledgeGraphNode[],
  reveal: RevealState,
  options: SkeletonLayoutOptions = {},
): SkeletonRadialLayout {
  // 골격 anchor 는 타원 stretch 적용본 — 자식 열은 *stretch 후* 공간에서
  // 부모 기준 고정 오프셋으로 배치한다. stretch 전에 배치하면 로컬 간격이
  // aspectX 배 늘어나 부모-자식이 화면에서 멀어진다(가독 저하).
  const base = buildSkeletonRadialLayout(skeleton, nodes, options);
  if (!reveal.scopeDomainSlug && !reveal.scopeCapabilitySlug) {
    return base;
  }

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

  /**
   * 부모 옆 tidy 열 배치 — 자식들을 부모의 바깥쪽(중심 반대 방향)에 세로
   * 열로, 열의 y 중심 = 부모 y. CHILD_SINGLE_COLUMN_MAX 초과 시 2열.
   */
  const placeChildColumn = (
    parent: SkeletonLayoutPoint,
    children: readonly string[],
    tier: 2 | 3,
  ) => {
    if (children.length === 0) return;
    const outward = Math.sign(parent.x - cx) || 1;
    const columns = children.length > CHILD_SINGLE_COLUMN_MAX ? 2 : 1;
    const perColumn = Math.ceil(children.length / columns);
    children.forEach((slug, i) => {
      const col = Math.floor(i / perColumn);
      const row = i % perColumn;
      const rowsInCol =
        col === columns - 1 ? children.length - perColumn * (columns - 1) : perColumn;
      const x = parent.x + outward * (CHILD_COLUMN_OFFSET + col * CHILD_COLUMN_GAP);
      const y = parent.y + (row - (rowsInCol - 1) / 2) * CHILD_ROW_SPACING;
      place(slug, x, y, tier);
    });
  };

  // 펼친 도메인 — 역량 열.
  if (reveal.scopeDomainSlug && reveal.domainCapabilitySlugs.length > 0) {
    const domainPoint = pointById.get(reveal.scopeDomainSlug);
    if (domainPoint) {
      placeChildColumn(domainPoint, reveal.domainCapabilitySlugs, 2);
    }
  }

  // 펼친 역량 — 요소 열 (역량의 새 위치 기준, 한 단계 더 바깥).
  if (reveal.scopeCapabilitySlug) {
    let capPoint = pointById.get(reveal.scopeCapabilitySlug);
    if (!capPoint) {
      // 도메인 scope 없이 도달한 역량(드묾) — 중심 위 12시 방향에 결정론 배치.
      place(reveal.scopeCapabilitySlug, cx, cy + Math.sin(START_ANGLE) * 200, 2);
      capPoint = pointById.get(reveal.scopeCapabilitySlug)!;
    }
    placeChildColumn(capPoint, reveal.capabilityElementSlugs, 3);
  }

  return {
    width: base.width,
    height: base.height,
    center: base.center,
    points,
    pointById,
  };
}
