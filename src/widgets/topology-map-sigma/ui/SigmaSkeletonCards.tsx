'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type Graph from 'graphology';
import { useTranslations } from 'next-intl';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from '../lib/graph-build';
import {
  SELECTED_FOCUS_VIEWPORT_READING_CENTER_Y_RATIO,
  resolveTopologyUiScale,
} from '../lib/camera-fit';
import {
  TOPOLOGY_DRAG_SETTLE_DURATION_MS,
  TOPOLOGY_DRAG_SETTLE_EASING_NAME,
  TOPOLOGY_DRAG_SETTLE_MOTION_CONTRACT,
} from '../lib/motion-tokens';
import { ontologyFillTone } from '../lib/ontology-tone';
import { resolveRelationLabelGeometry } from '../lib/relation-label-geometry';
import {
  relationAgentGateKind,
  relationPrimaryCopyAction,
  relationTypeDisplayLabel,
  type RelationAgentGateKind,
  type RelationCopyActionKind,
  type RelationTypeLabels,
  type SigmaEdgeTooltipData,
} from './SigmaEdgeTooltip';

/**
 * 골격 진입의 노드 "상(form)" — Sigma 점 대신 디자인된 DOM 카드.
 *
 * 골격+클릭 확장은 화면 노드를 항상 ~20-60 으로 바운드하므로 DOM 이 감당
 * 가능하다. Sigma 는 overview 의 엣지 hairline 과 dust 만 캔버스에 그리고,
 * 카드(타이포·kind 틴트·count·선택 ring)와 펼친 가지의 커넥터(SVG S-커브)는
 * 이 오버레이가 책임진다.
 *
 * 좌표 동기화는 afterRender 마다 ref 로 transform/path 만 직접 갱신 — React
 * 리렌더 없이 60fps pan/zoom 을 따라간다.
 */
export interface SkeletonCardModel {
  /** 그래프 노드 id (prefixed slug). */
  id: string;
  /** 카드 제목 — element 는 파일 경로 대신 basename. */
  title: string;
  kind: 'project' | 'domain' | 'capability' | 'element' | 'unknown';
  /** 0=project(중앙) 1=domain 2=capability 3=element — 크기/타이포 위계. */
  tier: 0 | 1 | 2 | 3;
  /** governed subtree weight(전이 요소 수). 미표기면 undefined. */
  count?: number;
  /** hover 간단 팝업용 한 줄 설명 (compact). */
  summary?: string;
  /**
   * 앵커 정렬 — 'left' 는 노드 좌표가 카드의 *왼쪽* 모서리(카드가 오른쪽으로
   * 자람), 'right' 는 오른쪽 모서리. 펼친 자식 열은 부모를 향한 모서리를
   * 플러시 정렬해야 폭이 제각각인 카드들이 지그재그로 보이지 않는다
   * (MindNode 문법). 기본 'center' = 골격 anchor 용.
   */
  anchor?: 'center' | 'left' | 'right';
  /**
   * px 공간 도킹 — 펼친 자식 카드는 그래프 좌표가 아니라 *부모 카드 rect*
   * 기준 고정 px(열 간격 56px · 행 pitch = 카드 높이 + 10px)로 배치한다.
   * 그래프 좌표 배치는 줌 배율에 따라 간격이 늘어나 "공백 과다"가 된다
   * (MindNode 의 고정 밀도 문법). side 는 부모 기준 열 방향.
   */
  dock?: {
    parentId: string;
    index: number;
    total: number;
    side: 'left' | 'right';
  };
}

const ANCHOR_TRANSLATE: Record<NonNullable<SkeletonCardModel['anchor']>, string> = {
  center: 'translate(-50%, -50%)',
  left: 'translate(0%, -50%)',
  right: 'translate(-100%, -50%)',
};

/** afterRender 좌표 동기화에 필요한 만큼만 — 테스트에서 stub 가능. */
interface SkeletonCardsCamera {
  graphToViewport(pos: { x: number; y: number }): { x: number; y: number };
  viewportToGraph(pos: { x: number; y: number }): { x: number; y: number };
  on(type: 'afterRender', handler: () => void): unknown;
  off(type: 'afterRender', handler: () => void): unknown;
}

interface SigmaSkeletonCardsProps {
  sigma: SkeletonCardsCamera | null;
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>;
  cards: readonly SkeletonCardModel[];
  selectedSlug?: string | null;
  selectedRelationEdgeId?: string | null;
  healthRepairTarget?: {
    slug: string;
    kind: 'stale' | 'orphan' | 'promotion';
  } | null;
  selectedFocusCenterActive?: boolean;
  onSelect?: (slug: string) => void;
  pathWorkflowActive?: boolean;
  pathSelection?: {
    sourceSlug: string | null;
    targetSlug: string | null;
  } | null;
  onPathSelectionChange?: (selection: {
    sourceSlug: string | null;
    targetSlug: string | null;
  }) => void;
  onVisibilityChange?: (stats: { visible: number; total: number }) => void;
  onRelationSelect?: (data: SigmaEdgeTooltipData) => void;
  onRelationHover?: (data: SigmaEdgeTooltipData | null) => void;
  /** hover 팝업의 계층 라벨 — 예: "도메인 · 2계층" (i18n 은 호출자 책임). */
  describeKind?: (kind: SkeletonCardModel['kind']) => string;
  /** 카드 안의 짧은 계층 배지 — overview legend 와 같은 어휘를 쓴다. */
  describeKindBadge?: (kind: SkeletonCardModel['kind']) => string;
}

// 카드 가독성이 1순위 — 타이포/패딩을 넉넉하게, 계층 간 크기 차등을 한
// 단계 이상 벌려 "크기만 봐도 계층" (사용자 피드백: 프로젝트 > 도메인 >
// 역량 > 요소 순으로 뚜렷하게 + 전체적으로 한 단계 크게).
// 그림자는 tier 0(중앙 anchor)만 — 칩마다 깔린 블러가 "손이 덜 간" 인상의
// 원인이었다 (디자이너 패널).
//
// 반응형: 폰트는 `기준px × var(--topology-card-scale)` (27" 와이드에서
// 1.18~1.34 배), 패딩/갭/dot 은 em — 폰트를 따라 함께 스케일된다.
const TIER_FONT_PX: Record<SkeletonCardModel['tier'], number> = {
  0: 16,
  1: 14,
  2: 13,
  3: 12,
};

const TIER_CARD_CLASS: Record<SkeletonCardModel['tier'], string> = {
  0: 'gap-[var(--topology-card-gap)] rounded-[var(--topology-card-radius)] px-[var(--topology-card-padding-x)] py-[var(--topology-card-padding-y)] min-h-[var(--topology-card-min-block-size)] font-semibold text-[color:var(--color-text-primary)] shadow-[0_1px_3px_var(--topology-card-shadow)]',
  1: 'gap-[var(--topology-card-gap)] rounded-[var(--topology-card-radius)] px-[var(--topology-card-padding-x)] py-[var(--topology-card-padding-y)] min-h-[var(--topology-card-min-block-size)] font-medium text-[color:var(--color-text-primary)]',
  2: 'gap-[var(--topology-card-gap)] rounded-[var(--topology-card-radius)] px-[var(--topology-card-padding-x)] py-[var(--topology-card-padding-y)] min-h-[var(--topology-card-min-block-size)] text-[color:var(--color-text-primary)]',
  3: 'gap-[var(--topology-card-gap)] rounded-[var(--topology-card-radius)] px-[var(--topology-card-padding-x)] py-[var(--topology-card-padding-y)] min-h-[var(--topology-card-min-block-size)] text-[color:var(--color-text-secondary)]',
};

const TIER_CARD_SPACING: Record<
  SkeletonCardModel['tier'],
  {
    gap: string;
    paddingX: string;
    paddingY: string;
    minBlockSize: string;
    radius: string;
  }
> = {
  0: {
    gap: '0.6em',
    paddingX: '1em',
    paddingY: '0.62em',
    minBlockSize: '2.68em',
    radius: '0.75rem',
  },
  1: {
    gap: '0.55em',
    paddingX: '0.9em',
    paddingY: '0.55em',
    minBlockSize: '2.58em',
    radius: '0.5rem',
  },
  2: {
    gap: '0.5em',
    paddingX: '0.85em',
    paddingY: '0.45em',
    minBlockSize: '2.32em',
    radius: '0.375rem',
  },
  3: {
    gap: '0.45em',
    paddingX: '0.8em',
    paddingY: '0.4em',
    minBlockSize: '2.12em',
    radius: '0.375rem',
  },
};

const SELECTED_FOCUS_CARD_SPACING = {
  ...TIER_CARD_SPACING[1],
  gap: '0.6em',
  paddingX: '0.95em',
  paddingY: '0.58em',
  minBlockSize: '2.7em',
};

const TIER_DOT_EM: Record<SkeletonCardModel['tier'], string> = {
  0: '0.62em',
  1: '0.58em',
  2: '0.55em',
  3: '0.42em',
};

const TIER_SURFACE_ALPHA: Record<
  SkeletonCardModel['tier'],
  { bg: number; border: number; hoverBorder: number }
> = {
  0: { bg: 0.16, border: 0.34, hoverBorder: 0.56 },
  1: { bg: 0.13, border: 0.28, hoverBorder: 0.50 },
  2: { bg: 0.10, border: 0.22, hoverBorder: 0.42 },
  3: { bg: 0.07, border: 0.16, hoverBorder: 0.34 },
};

/**
 * dim 잉크 2단계 (디자이너 패널 합의): click-focus 에서는 선택 ego
 * 관계가 먼저 읽혀야 하므로 방향 감각용 상위 anchor(project/domain)는
 * 0.26, 하위 칩은 dot+실루엣 수준 0.08. 펼친 열과 *겹치는* dim 카드는
 * 0 — "포커스 콘텐츠와 고스트 콘텐츠의 텍스트 충돌"은 디자이너 제품에서
 * 절대 허용되지 않는 픽셀이다.
 */
const DIM_ANCHOR_OPACITY = '0.26';
const DIM_CHIP_OPACITY = '0.08';
const DIM_ANCHOR_OPACITY_TOKEN = '--topology-map-dim-anchor-opacity';
const DIM_CHIP_OPACITY_TOKEN = '--topology-map-dim-context-opacity';
const OVERVIEW_CONTEXT_OPACITY: Record<SkeletonCardModel['tier'], string> = {
  0: '1',
  1: '1',
  2: '0.54',
  3: '0.32',
};
/** 펼친 열 카드 주변 충돌 판정 패딩(px). */
const COLLISION_PAD = 24;
const ANALYSIS_PANEL_TRAILING_PAD = 12;
const ANALYSIS_PANEL_BLOCK_END_PAD = 8;
const SELECTED_FOCUS_RAIL_CARD_HIDE_MAX_WIDTH_PX = 1280;
const OVERVIEW_COLLISION_PAD = 2;
const OVERVIEW_DOMAIN_COLLISION_PAD = 10;
const DRAG_SETTLE_OVERLAP_PAD = -2;
const SAFE_VIEWPORT_MARGIN = 8;
const SELECTED_FOCUS_DOCK_BOTTOM_INSET_PX = 180;
const SELECTED_FOCUS_EGO_READING_BAND_Y_RATIO = 0.56;
const FIXED_SURFACE_GAP = 8;
/** 멀티 컬럼 도킹의 열 간 가로 step(px) — 카드 max-w(224) + 넉넉한 거터. */
const COLUMN_STEP_PX = 320;
/** 카드 밖으로 삐져나온 Sigma edge 를 지우는 clearance halo(px). */
const EDGE_CLEARANCE_MASK_PX = 10;

// 반응형 카드 스케일 — resolveTopologyUiScale 이 단일 기준 (chrome zoom ·
// safe inset 과 동일 단계). 폰트가 배수를 타고(인라인 calc) 패딩/dot 은 em.
// CSS 미디어쿼리 대신 JS 주입 — 빌드 파이프라인이 utility 미참조 무단위
// 커스텀 프로퍼티를 떨구는 동작이 있다.
/** hover 팝업 폭 추정(px) — flip 판정용 (max-w-[17rem]). */
const HOVER_POP_W = 272;
const BASE_ANCHOR_CARD_MAX_WIDTH_PX = 280;
const SELECTED_FOCUS_CARD_MAX_WIDTH_PX = 440;
const HEALTH_REPAIR_CARD_MAX_WIDTH_PX = 320;
const ANCHOR_CARD_MAX_WIDTH_SCALE_STEP_PX = 128;
const SELECTED_FOCUS_CARD_MAX_WIDTH_TOKEN = '--topology-card-selected-focus-max-width';
const SELECTED_FOCUS_QUIET_BORDER_TOKEN = '--topology-card-selected-quiet-border';
const SELECTED_FOCUS_QUIET_WASH_TOKEN = '--topology-card-selected-quiet-wash';
const HEALTH_REPAIR_CARD_MAX_WIDTH_TOKEN = '--topology-health-repair-card-max-width';
const TIER_CARD_MAX_WIDTH_TOKEN: Record<SkeletonCardModel['tier'], string> = {
  0: '--topology-card-max-width-project',
  1: '--topology-card-max-width-domain',
  2: '--topology-card-max-width-capability',
  3: '--topology-card-max-width-element',
};
const TIER_CARD_MAX_WIDTH_PX: Record<SkeletonCardModel['tier'], number> = {
  0: BASE_ANCHOR_CARD_MAX_WIDTH_PX,
  1: 272,
  2: 360,
  3: 224,
};
const TIER_CARD_MAX_WIDTH_SCALE_STEP_PX: Record<SkeletonCardModel['tier'], number> = {
  0: ANCHOR_CARD_MAX_WIDTH_SCALE_STEP_PX,
  1: ANCHOR_CARD_MAX_WIDTH_SCALE_STEP_PX,
  2: 96,
  3: 64,
};

/** kind 위계 — 커넥터/ego 판정에 사용 (낮을수록 상위). */
const KIND_RANK: Record<SkeletonCardModel['kind'], number> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
  unknown: 4,
};

const FALLBACK_KIND_BADGE_LABEL: Record<SkeletonCardModel['kind'], string> = {
  project: 'Project',
  domain: 'Domain',
  capability: 'Capability',
  element: 'Evidence',
  unknown: '?',
};

const TIER_Z_INDEX: Record<SkeletonCardModel['tier'], number> = {
  0: 4,
  1: 3,
  2: 2,
  3: 1,
};

const RELATION_BADGE_HEIGHT_PX = 24;
const RELATION_BADGE_MIN_WIDTH_PX = 72;
const RELATION_BADGE_CHAR_WIDTH_PX = 5.8;
const RELATION_BADGE_PAD_X_PX = 26;
const RELATION_BADGE_QUALITY_DOT_WIDTH_PX = 12;
const RELATION_BADGE_DIRECTION_CHIP_WIDTH_PX = 18;
const RELATION_LABEL_HIT_TARGET_HEIGHT_PX = 32;
const RELATION_LABEL_HIT_TARGET_PAD_X_PX = 6;
const RELATION_LABEL_VIEWPORT_INSET_PX = 16;
const RELATION_LABEL_MIN_COMPACT_WIDTH_PX = 96;
const RELATION_LABEL_CARD_CLEARANCE_PX = 22;
const RELATION_LABEL_PHONE_BREAKPOINT_PX = 768;
const RELATION_LABEL_PHONE_BOTTOM_RESERVE_PX = 112;
const DRAG_SETTLE_FEEDBACK_MS = TOPOLOGY_DRAG_SETTLE_DURATION_MS;
const DRAG_GROUP_RELEASE_FEEDBACK_MS = 760;
const CONNECTOR_PORT_MIN_CLEARANCE_PX = 6;
const CONNECTOR_PORT_TARGET_CLEARANCE_PX = EDGE_CLEARANCE_MASK_PX + 2;
const DRAG_COLLISION_SETTLE_PASSES = 4;
const FIXED_SURFACE_RECT_CACHE_MS = 180;
const LAYOUT_TRANSITION_REPOSITION_THROTTLE_MS = 160;
const INITIAL_LOAD_REPOSITION_THROTTLE_MS = 640;

type RelationConnector = {
  from: string;
  to: string;
  key: string;
  kind: NonNullable<SigmaEdgeAttrs['kind']>;
  relationType: string;
  edgeId?: string;
  edgeSource: string;
  edgeTarget: string;
  relationQuality?: SigmaEdgeAttrs['relationQuality'];
  evidenceCount?: number;
  authored?: boolean;
};

type RelationLabel = RelationConnector & {
  count: number;
};

type DockDragSnapshot = {
  childStartX: number;
  parentSlug: string;
  parentStartX: number;
  parentStartY: number;
  childStartY: number;
};

type DockDragCardSnapshot = {
  childStartX: number;
  dockParent: string;
  layoutY: number;
  slug: string;
  x: number;
  y: number;
};

type SkeletonCardElementIndex = {
  all: HTMLElement[];
};

function collectSkeletonCardElementIndex(
  container: HTMLElement | null,
): SkeletonCardElementIndex {
  return {
    all: container
      ? Array.from(container.querySelectorAll<HTMLElement>('[data-skeleton-card]'))
      : [],
  };
}

type FixedSurfaceRectCache = {
  height: number;
  rects: Array<{ left: number; top: number; right: number; bottom: number }>;
  timestamp: number;
  width: number;
};

type CardPlacementSizeCacheEntry = {
  fallbackRect?: ConnectorRect;
  height: number;
  key: string;
  width: number;
};

type SkeletonVisibilityStats = { visible: number; total: number };

type SkeletonDomWriteStats = { applied: number; skipped: number };

type VisibleCardFrameEntry = {
  rect: { left: number; top: number; right: number; bottom: number } | null;
  visible: boolean;
};

type VisibilityFrameSnapshot = {
  blockers: Array<{ left: number; top: number; right: number; bottom: number }>;
  entries: Map<HTMLElement, VisibleCardFrameEntry>;
  fixedSurfaceKey: string;
  geometryKey: string;
  height: number;
  orderedKey: string;
  supportRailOverlapHiddenCount: number;
  visibleCardStateReadPolicy: string;
  visibleCount: number;
  visibilityCountSource: string;
  width: number;
};

function shouldReportSkeletonVisibilityStats(
  previous: SkeletonVisibilityStats | null,
  next: SkeletonVisibilityStats,
): boolean {
  return !previous || previous.visible !== next.visible || previous.total !== next.total;
}

function setSkeletonStyleValue(
  target: HTMLElement,
  property: 'height' | 'opacity' | 'pointerEvents' | 'transform' | 'visibility' | 'width',
  value: string,
  stats: SkeletonDomWriteStats,
): void {
  if (target.style[property] === value) {
    stats.skipped += 1;
    return;
  }
  target.style[property] = value;
  stats.applied += 1;
}

function setSkeletonPathData(
  target: SVGPathElement,
  value: string,
  stats: SkeletonDomWriteStats,
): void {
  if (target.getAttribute('d') === value) {
    stats.skipped += 1;
    return;
  }
  target.setAttribute('d', value);
  stats.applied += 1;
}

/** rgba 문자열의 alpha 만 교체 — kind 틴트의 정량 토큰(8%/18%) 파생용. */
function withAlpha(rgba: string, alpha: number): string {
  return rgba.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`);
}

function relationConnectorTone(
  connector: Pick<RelationConnector, 'authored' | 'evidenceCount' | 'relationQuality'>,
  selected: boolean,
): {
  dasharray?: string;
  haloWidth: string;
  opacity: number;
  stroke: string;
  strokeToken: string;
  strokeWidth: string;
  strokeWidthToken: string;
} {
  if (selected) {
    return {
      haloWidth: 'var(--topology-relation-stroke-selected-halo-width)',
      opacity: 0.95,
      stroke: 'var(--topology-relation-stroke-selected)',
      strokeToken: '--topology-relation-stroke-selected',
      strokeWidth: 'var(--topology-relation-stroke-selected-width)',
      strokeWidthToken: '--topology-relation-stroke-selected-width',
    };
  }
  const quality = connector.relationQuality ?? 'supported';
  const hasEvidence = (connector.evidenceCount ?? 0) > 0 || connector.authored === true;
  const evidenceBoost = hasEvidence ? 0.08 : 0;
  if (quality === 'strong') {
    return {
      haloWidth: 'var(--topology-relation-stroke-selected-halo-width)',
      opacity: 0.72 + evidenceBoost,
      stroke: 'var(--topology-relation-stroke-strong)',
      strokeToken: '--topology-relation-stroke-strong',
      strokeWidth: 'var(--topology-relation-stroke-strong-width)',
      strokeWidthToken: '--topology-relation-stroke-strong-width',
    };
  }
  if (quality === 'weak') {
    return {
      haloWidth: 'var(--topology-relation-stroke-selected-halo-width)',
      opacity: 0.48 + evidenceBoost,
      stroke: 'var(--topology-relation-stroke-weak)',
      strokeToken: '--topology-relation-stroke-weak',
      strokeWidth: 'var(--topology-relation-stroke-weak-width)',
      strokeWidthToken: '--topology-relation-stroke-weak-width',
    };
  }
  if (quality === 'review') {
    return {
      dasharray: '4 6',
      haloWidth: 'var(--topology-relation-stroke-selected-halo-width)',
      opacity: 0.52,
      stroke: 'var(--topology-relation-stroke-review)',
      strokeToken: '--topology-relation-stroke-review',
      strokeWidth: 'var(--topology-relation-stroke-review-width)',
      strokeWidthToken: '--topology-relation-stroke-review-width',
    };
  }
  return {
    haloWidth: 'var(--topology-relation-stroke-selected-halo-width)',
    opacity: 0.56 + evidenceBoost,
    stroke: 'var(--topology-relation-stroke-supported)',
    strokeToken: '--topology-relation-stroke-supported',
    strokeWidth: 'var(--topology-relation-stroke-supported-width)',
    strokeWidthToken: '--topology-relation-stroke-supported-width',
  };
}

function relationConnectorPaintRank(
  connector: Pick<RelationConnector, 'authored' | 'evidenceCount' | 'relationQuality'>,
): number {
  const qualityRank = {
    review: 0,
    weak: 1,
    supported: 2,
    strong: 3,
  } satisfies Record<NonNullable<SigmaEdgeAttrs['relationQuality']>, number>;
  const quality = connector.relationQuality ?? 'supported';
  const evidenceRank = (connector.evidenceCount ?? 0) > 0 ? 2 : connector.authored ? 1 : 0;
  return qualityRank[quality] * 10 + evidenceRank;
}

function relationQualityDotClassName(
  quality: NonNullable<SigmaEdgeAttrs['relationQuality']> = 'supported',
) {
  const tone = {
    strong:
      'bg-[color:var(--topology-relation-quality-strong-dot)] shadow-[var(--topology-relation-quality-strong-glow)]',
    supported:
      'bg-[color:var(--topology-relation-quality-supported-dot)] shadow-[var(--topology-relation-quality-supported-glow)]',
    weak:
      'bg-[color:var(--topology-relation-quality-weak-dot)] shadow-[var(--topology-relation-quality-weak-glow)]',
    review:
      'bg-[color:var(--topology-relation-quality-review-dot)] shadow-[var(--topology-relation-quality-review-glow)]',
  } satisfies Record<NonNullable<SigmaEdgeAttrs['relationQuality']>, string>;
  return tone[quality] ?? tone.supported;
}

function relationQualityDotToken(
  quality: NonNullable<SigmaEdgeAttrs['relationQuality']> = 'supported',
) {
  return `--topology-relation-quality-${quality}-dot`;
}

function relationQualityGlowToken(
  quality: NonNullable<SigmaEdgeAttrs['relationQuality']> = 'supported',
) {
  return `--topology-relation-quality-${quality}-glow`;
}

function relationAgentGateChipText(gateKind: RelationAgentGateKind): string {
  if (gateKind === 'handoff-ready') return 'ready';
  if (gateKind === 'preflight-first') return 'check';
  return 'review';
}

function relationAgentGateRouteText(gateKind: RelationAgentGateKind): string {
  if (gateKind === 'handoff-ready') return 'MCP/CLI';
  return relationAgentGateChipText(gateKind);
}

function relationAgentGateTokenPrefix(gateKind: RelationAgentGateKind): string {
  if (gateKind === 'handoff-ready') return '--topology-relation-gate-ready';
  if (gateKind === 'preflight-first') return '--topology-relation-gate-preflight';
  return '--topology-relation-gate-review';
}

function relationCopyActionText(action: RelationCopyActionKind): string {
  return action === 'explain_relation' ? 'explain relation' : 'relation check';
}

function relationLabelCliFallbackCommand({
  action,
  from,
  relationType,
  to,
}: {
  action: RelationCopyActionKind;
  from: string;
  relationType: string;
  to: string;
}): string {
  if (action === 'relation_check') {
    return `ontology-atlas relation-check ${shellQuote(from)} ${shellQuote(to)} ${shellQuote(
      relationType,
    )} [vault]`;
  }
  return `ontology-atlas explain ${shellQuote(from)} ${shellQuote(to)} [vault] --type ${shellQuote(
    relationType,
  )}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function relationQualityChipText(
  quality: NonNullable<SigmaEdgeAttrs['relationQuality']> = 'supported',
): string {
  if (quality === 'supported') return 'support';
  return quality;
}

type RelationEvidenceState = 'source-backed' | 'authored' | 'needs-review';

function relationEvidenceState({
  authored,
  evidenceCount,
}: Pick<RelationConnector, 'authored' | 'evidenceCount'>): RelationEvidenceState {
  if ((evidenceCount ?? 0) > 0) return 'source-backed';
  if (authored) return 'authored';
  return 'needs-review';
}

function relationEvidenceChipText({
  evidenceCount,
  state,
}: {
  evidenceCount?: number;
  state: RelationEvidenceState;
}): string {
  if (state === 'source-backed') {
    const count = Math.max(1, evidenceCount ?? 1);
    return `S${count > 9 ? '9+' : count}`;
  }
  if (state === 'authored') return 'A';
  return 'R';
}

function relationEvidenceAriaText({
  evidenceCount,
  state,
}: {
  evidenceCount?: number;
  state: RelationEvidenceState;
}): string {
  if (state === 'source-backed') {
    const count = Math.max(1, evidenceCount ?? 1);
    return `${count} source${count === 1 ? '' : 's'}`;
  }
  if (state === 'authored') return 'authored';
  return 'needs review';
}

/** 커넥터 형상 — 수평 접선 cubic S-커브 (MindNode 가지 문법). */
function connectorPath(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  axis: 'horizontal' | 'vertical' = 'horizontal',
): string {
  if (axis === 'vertical') {
    const dy = ey - sy;
    const c1y = sy + dy * 0.4;
    const c2y = ey - dy * 0.4;
    return `M ${sx} ${sy} C ${sx} ${c1y}, ${ex} ${c2y}, ${ex} ${ey}`;
  }
  const dx = ex - sx;
  const c1x = sx + dx * 0.4;
  const c2x = ex - dx * 0.4;
  return `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ey}, ${ex} ${ey}`;
}

type ConnectorRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function expandConnectorRect(rect: ConnectorRect, pad: number): ConnectorRect {
  return {
    left: rect.left - pad,
    top: rect.top - pad,
    right: rect.right + pad,
    bottom: rect.bottom + pad,
  };
}

function connectorPorts(
  source: ConnectorRect,
  target: ConnectorRect,
): {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  axis: 'horizontal' | 'vertical';
  clearance: number;
} {
  const sourceCenterX = (source.left + source.right) / 2;
  const sourceCenterY = (source.top + source.bottom) / 2;
  const targetCenterX = (target.left + target.right) / 2;
  const targetCenterY = (target.top + target.bottom) / 2;
  const dx = targetCenterX - sourceCenterX;
  const dy = targetCenterY - sourceCenterY;
  if (Math.abs(dy) > Math.abs(dx) * 1.15) {
    const verticalGap = Math.max(
      0,
      dy >= 0 ? target.top - source.bottom : source.top - target.bottom,
    );
    const clearance = connectorPortClearance(verticalGap);
    return {
      sx: sourceCenterX,
      sy:
        dy >= 0
          ? source.bottom + clearance
          : source.top - clearance,
      ex: targetCenterX,
      ey:
        dy >= 0
          ? target.top - clearance
          : target.bottom + clearance,
      axis: 'vertical',
      clearance,
    };
  }
  const horizontalGap = Math.max(
    0,
    dx >= 0 ? target.left - source.right : source.left - target.right,
  );
  const clearance = connectorPortClearance(horizontalGap);
  return {
    sx:
      dx >= 0
        ? source.right + clearance
        : source.left - clearance,
    sy: sourceCenterY,
    ex:
      dx >= 0
        ? target.left - clearance
        : target.right + clearance,
    ey: targetCenterY,
    axis: 'horizontal',
    clearance,
  };
}

function connectorPortClearance(gap: number): number {
  if (gap <= CONNECTOR_PORT_MIN_CLEARANCE_PX * 2) {
    return CONNECTOR_PORT_MIN_CLEARANCE_PX;
  }
  return Math.min(
    CONNECTOR_PORT_TARGET_CLEARANCE_PX,
    Math.max(CONNECTOR_PORT_MIN_CLEARANCE_PX, Math.floor(gap / 2) - 2),
  );
}

function relationDescriptor(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  from: string,
  to: string,
): Omit<RelationConnector, 'from' | 'to' | 'key'> {
  const forwardEdge = graph.edge(from, to);
  const reverseEdge = graph.edge(to, from);
  const edge = forwardEdge ?? reverseEdge;
  const attrs = edge ? graph.getEdgeAttributes(edge) : undefined;
  const kind = attrs?.kind ?? 'depends-on';
  return {
    kind,
    relationType: attrs?.relationType ?? kind,
    edgeId: edge,
    edgeSource: forwardEdge ? from : reverseEdge ? to : from,
    edgeTarget: forwardEdge ? to : reverseEdge ? from : to,
    relationQuality: attrs?.relationQuality,
    evidenceCount: attrs?.evidenceCount,
    authored: attrs?.authored,
  };
}

function relationConnector(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  from: string,
  to: string,
): RelationConnector {
  return {
    from,
    to,
    key: [from, to].sort().join('→'),
    ...relationDescriptor(graph, from, to),
  };
}

function relationSelectionData(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  connector: RelationConnector,
): SigmaEdgeTooltipData | null {
  if (!graph.hasNode(connector.edgeSource) || !graph.hasNode(connector.edgeTarget)) {
    return null;
  }
  const sourceAttrs = graph.getNodeAttributes(connector.edgeSource);
  const targetAttrs = graph.getNodeAttributes(connector.edgeTarget);
  return {
    edgeId: connector.edgeId,
    source: connector.edgeSource,
    target: connector.edgeTarget,
    sourceName: sourceAttrs.label,
    targetName: targetAttrs.label,
    kind: connector.kind,
    relationType: connector.relationType,
    relationQuality: connector.relationQuality,
    evidenceCount: connector.evidenceCount,
    authored: connector.authored,
    x: 0,
    y: 0,
  };
}

function relationLabelText(
  relationType: string,
  count = 1,
  labels?: RelationTypeLabels,
): string {
  const visibleLabel = labels
    ? relationTypeDisplayLabel(relationType, labels)
    : relationType;
  return count > 1 ? `${visibleLabel} ×${count}` : visibleLabel;
}

function relationLabelVisibleText({
  count = 1,
  label,
  relationBadgeCount,
}: {
  count?: number;
  label: string;
  relationBadgeCount: (values: { count: number; label: string }) => string;
}): string {
  return count > 1 ? relationBadgeCount({ count, label }) : label;
}

function isDockConnectorSuppressed(targetEl: HTMLElement | null | undefined): boolean {
  return Boolean(targetEl?.dataset.dockCol && targetEl.dataset.dockCol !== '0');
}

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
  pad = 0,
): boolean {
  return (
    a.left < b.right + pad &&
    a.right > b.left - pad &&
    a.top < b.bottom + pad &&
    a.bottom > b.top - pad
  );
}

function resolveRelationLabelVerticalPlacement({
  blockers,
  containerHeight,
  height,
  left,
  top,
  width,
}: {
  blockers: ReadonlyArray<{ left: number; top: number; right: number; bottom: number }>;
  containerHeight: number;
  height: number;
  left: number;
  top: number;
  width: number;
}): { occluded: boolean; top: number } {
  const clampTop = (nextTop: number) =>
    Math.min(
      Math.max(nextTop, RELATION_LABEL_CARD_CLEARANCE_PX),
      Math.max(RELATION_LABEL_CARD_CLEARANCE_PX, containerHeight - height - RELATION_LABEL_CARD_CLEARANCE_PX),
    );
  const rectFor = (nextTop: number) => ({
    left,
    right: left + width,
    top: nextTop,
    bottom: nextTop + height,
  });
  const overlapCount = (nextTop: number) => {
    const rect = rectFor(nextTop);
    return blockers.filter((blocker) => rectsOverlap(rect, blocker, RELATION_LABEL_CARD_CLEARANCE_PX)).length;
  };
  const baseTop = clampTop(top);
  const candidates = new Set<number>([baseTop]);
  const baseRect = rectFor(baseTop);
  for (const blocker of blockers) {
    if (!rectsOverlap(baseRect, blocker, RELATION_LABEL_CARD_CLEARANCE_PX)) continue;
    candidates.add(clampTop(blocker.top - height - RELATION_LABEL_CARD_CLEARANCE_PX));
    candidates.add(clampTop(blocker.bottom + RELATION_LABEL_CARD_CLEARANCE_PX));
  }
  let best = baseTop;
  let bestOverlapCount = overlapCount(baseTop);
  let bestCost = bestOverlapCount * 10_000;
  for (const candidate of candidates) {
    const candidateOverlapCount = overlapCount(candidate);
    const cost = candidateOverlapCount * 10_000 + Math.abs(candidate - baseTop);
    if (cost < bestCost) {
      best = candidate;
      bestOverlapCount = candidateOverlapCount;
      bestCost = cost;
    }
  }
  return { occluded: bestOverlapCount > 0, top: best };
}

function isMountedTopologyBlockingSurface(el: HTMLElement): boolean {
  return (
    el.dataset.testid === 'topology-node-popover' ||
    el.dataset.testid === 'sigma-selected-edge-card' ||
    el.dataset.testid === 'topology-path-start-prompt' ||
    el.dataset.testid === 'topology-path-anchor-prompt' ||
    el.dataset.testid === 'topology-path-result-banner'
  );
}

function collectFixedSurfaceRects(containerRect: DOMRect): Array<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}> {
  if (typeof document === 'undefined') return [];
  const fixedSurfaceRects: Array<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }> = [];
  const analysisPanel = document.querySelector<HTMLElement>(
    '[data-testid="topology-analysis-panel"]',
  );
  const analysisPanelRect = analysisPanel?.getBoundingClientRect();
  const analysisPanelStyle = analysisPanel ? getComputedStyle(analysisPanel) : null;
  const panelOwnedReadLayerActive = Boolean(
    analysisPanel &&
      analysisPanelRect &&
      analysisPanelStyle &&
      analysisPanelStyle.display !== 'none' &&
      analysisPanelStyle.visibility !== 'hidden' &&
      analysisPanelRect.width > 0 &&
      analysisPanelRect.height > 0,
  );
  const fixedSurfaceSelector = [
    '[data-testid="topology-analysis-panel"]',
    '[data-testid="topology-kind-legend"]',
    '[data-testid="topology-relation-legend"]',
    '[data-testid="topology-minimap"]',
    '[data-testid="topology-node-popover"]',
    '[data-testid="sigma-selected-edge-card"]',
    '[data-testid="topology-path-start-prompt"]',
    '[data-testid="topology-path-anchor-prompt"]',
    '[data-testid="topology-path-result-banner"]',
    ...(panelOwnedReadLayerActive
      ? [
          '[data-testid="topology-search-action-lane"]',
          '[data-testid="topology-utility-action-lane"]',
          '[data-testid="topology-shortcuts-help-button"]',
          '[data-testid="topology-sigma-controls-stack"]',
        ]
      : []),
  ].join(', ');

  document
    .querySelectorAll<HTMLElement>(fixedSurfaceSelector)
    .forEach((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        (Number(style.opacity || '1') <= 0.01 && !isMountedTopologyBlockingSurface(el)) ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        return;
      }

      const isAnalysisPanel = el.dataset.testid === 'topology-analysis-panel';
      fixedSurfaceRects.push({
        left: rect.left - containerRect.left - COLLISION_PAD,
        top: rect.top - containerRect.top - COLLISION_PAD,
        right:
          rect.right -
          containerRect.left +
          (isAnalysisPanel ? ANALYSIS_PANEL_TRAILING_PAD : COLLISION_PAD),
        bottom:
          rect.bottom -
          containerRect.top +
          (isAnalysisPanel ? ANALYSIS_PANEL_BLOCK_END_PAD : COLLISION_PAD),
      });
    });

  return fixedSurfaceRects;
}

function isSelectedFocusRailSurfaceMounted(): boolean {
  if (typeof document === 'undefined') return false;
  const panel = document.querySelector<HTMLElement>(
    '[data-testid="topology-analysis-panel"][data-analysis-mode="focus"][data-selected-focus-rail="true"]',
  );
  if (!panel) return false;
  const style = getComputedStyle(panel);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function isAnalysisPanelMounted(): boolean {
  if (typeof document === 'undefined') return false;
  const panel = document.querySelector<HTMLElement>(
    '[data-testid="topology-analysis-panel"]',
  );
  if (!panel) return false;
  const rect = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    panel.dataset.panelPhoneUtilityReserveToken !== undefined &&
    rect.width > 0
  );
}

function isSelectedNodePopoverMounted(): boolean {
  if (typeof document === 'undefined') return false;
  const popover = document.querySelector<HTMLElement>(
    '[data-testid="topology-node-popover"]',
  );
  if (!popover) return false;
  const rect = popover.getBoundingClientRect();
  const style = getComputedStyle(popover);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function anchoredCardRect({
  x,
  y,
  width,
  height,
  anchor,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: NonNullable<SkeletonCardModel['anchor']>;
}) {
  const left = anchor === 'left' ? x : anchor === 'right' ? x - width : x - width / 2;
  const top = y - height / 2;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
  };
}

function clampVisibleAnchorCard({
  x,
  y,
  width,
  height,
  anchor,
  containerWidth,
  containerHeight,
  fixedSurfaceRects,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: NonNullable<SkeletonCardModel['anchor']>;
  containerWidth: number;
  containerHeight: number;
  fixedSurfaceRects: Array<{ left: number; top: number; right: number; bottom: number }>;
}) {
  if (width <= 0 || height <= 0) return { x, y };
  let nextX = x;
  let nextY = y;

  const clampViewport = () => {
    const rect = anchoredCardRect({
      x: nextX,
      y: nextY,
      width,
      height,
      anchor,
    });
    if (rect.left < SAFE_VIEWPORT_MARGIN) {
      nextX += SAFE_VIEWPORT_MARGIN - rect.left;
    }
    if (rect.right > containerWidth - SAFE_VIEWPORT_MARGIN) {
      nextX -= rect.right - (containerWidth - SAFE_VIEWPORT_MARGIN);
    }
    if (rect.top < SAFE_VIEWPORT_MARGIN) {
      nextY += SAFE_VIEWPORT_MARGIN - rect.top;
    }
    if (rect.bottom > containerHeight - SAFE_VIEWPORT_MARGIN) {
      nextY -= rect.bottom - (containerHeight - SAFE_VIEWPORT_MARGIN);
    }
  };

  clampViewport();
  for (const surface of fixedSurfaceRects) {
    const rect = anchoredCardRect({
      x: nextX,
      y: nextY,
      width,
      height,
      anchor,
    });
    if (!rectsOverlap(rect, surface)) continue;
    const candidates = [
      { dx: surface.right + FIXED_SURFACE_GAP - rect.left, dy: 0 },
      { dx: surface.left - FIXED_SURFACE_GAP - rect.right, dy: 0 },
      { dx: 0, dy: surface.bottom + FIXED_SURFACE_GAP - rect.top },
      { dx: 0, dy: surface.top - FIXED_SURFACE_GAP - rect.bottom },
    ]
      .map((candidate) => {
        const moved = {
          left: rect.left + candidate.dx,
          top: rect.top + candidate.dy,
          right: rect.right + candidate.dx,
          bottom: rect.bottom + candidate.dy,
        };
        return {
          ...candidate,
          cost: Math.abs(candidate.dx) + Math.abs(candidate.dy),
          inside:
            moved.left >= SAFE_VIEWPORT_MARGIN &&
            moved.top >= SAFE_VIEWPORT_MARGIN &&
            moved.right <= containerWidth - SAFE_VIEWPORT_MARGIN &&
            moved.bottom <= containerHeight - SAFE_VIEWPORT_MARGIN,
        };
      })
      .filter((candidate) => candidate.inside)
      .sort((a, b) => a.cost - b.cost);
    const best = candidates[0];
    if (!best) continue;
    nextX += best.dx;
    nextY += best.dy;
  }
  clampViewport();
  return { x: nextX, y: nextY };
}

function clampRectToViewportAndFixedSurfaces({
  rect,
  containerWidth,
  containerHeight,
  fixedSurfaceRects,
}: {
  rect: { left: number; top: number; right: number; bottom: number };
  containerWidth: number;
  containerHeight: number;
  fixedSurfaceRects: Array<{ left: number; top: number; right: number; bottom: number }>;
}) {
  let dx = 0;
  let dy = 0;

  const shifted = () => ({
    left: rect.left + dx,
    top: rect.top + dy,
    right: rect.right + dx,
    bottom: rect.bottom + dy,
  });

  const clampViewport = () => {
    const next = shifted();
    if (next.left < SAFE_VIEWPORT_MARGIN) {
      dx += SAFE_VIEWPORT_MARGIN - next.left;
    }
    if (next.right > containerWidth - SAFE_VIEWPORT_MARGIN) {
      dx -= next.right - (containerWidth - SAFE_VIEWPORT_MARGIN);
    }
    if (next.top < SAFE_VIEWPORT_MARGIN) {
      dy += SAFE_VIEWPORT_MARGIN - next.top;
    }
    if (next.bottom > containerHeight - SAFE_VIEWPORT_MARGIN) {
      dy -= next.bottom - (containerHeight - SAFE_VIEWPORT_MARGIN);
    }
  };

  clampViewport();
  for (const surface of fixedSurfaceRects) {
    const current = shifted();
    if (!rectsOverlap(current, surface)) continue;
    const candidates = [
      { dx: surface.right + FIXED_SURFACE_GAP - current.left, dy: 0 },
      { dx: surface.left - FIXED_SURFACE_GAP - current.right, dy: 0 },
      { dx: 0, dy: surface.bottom + FIXED_SURFACE_GAP - current.top },
      { dx: 0, dy: surface.top - FIXED_SURFACE_GAP - current.bottom },
    ]
      .map((candidate) => {
        const moved = {
          left: current.left + candidate.dx,
          top: current.top + candidate.dy,
          right: current.right + candidate.dx,
          bottom: current.bottom + candidate.dy,
        };
        return {
          ...candidate,
          cost: Math.abs(candidate.dx) + Math.abs(candidate.dy),
          inside:
            moved.left >= SAFE_VIEWPORT_MARGIN &&
            moved.top >= SAFE_VIEWPORT_MARGIN &&
            moved.right <= containerWidth - SAFE_VIEWPORT_MARGIN &&
            moved.bottom <= containerHeight - SAFE_VIEWPORT_MARGIN,
          clear: !fixedSurfaceRects.some((fixedSurface) => rectsOverlap(moved, fixedSurface)),
        };
      })
      .filter((candidate) => candidate.inside && candidate.clear)
      .sort((a, b) => a.cost - b.cost);
    const best = candidates[0];
    if (!best) continue;
    dx += best.dx;
    dy += best.dy;
  }
  clampViewport();

  return { dx, dy, rect: shifted() };
}

function showSkeletonCard(
  el: HTMLElement,
  opacity = '1',
  stats?: SkeletonDomWriteStats,
) {
  if (el.dataset.surfaceHidden === 'true') {
    delete el.dataset.surfaceHidden;
  }
  if (stats) {
    setSkeletonStyleValue(el, 'opacity', opacity, stats);
    setSkeletonStyleValue(el, 'visibility', 'visible', stats);
    setSkeletonStyleValue(el, 'pointerEvents', '', stats);
    return;
  }
  if (el.style.opacity !== opacity) el.style.opacity = opacity;
  if (el.style.visibility !== 'visible') el.style.visibility = 'visible';
  if (el.style.pointerEvents !== '') el.style.pointerEvents = '';
}

function hideSkeletonCard(el: HTMLElement, stats?: SkeletonDomWriteStats) {
  if (el.dataset.surfaceHidden !== 'true') {
    el.dataset.surfaceHidden = 'true';
  }
  if (stats) {
    setSkeletonStyleValue(el, 'opacity', '0', stats);
    setSkeletonStyleValue(el, 'visibility', 'hidden', stats);
    setSkeletonStyleValue(el, 'pointerEvents', 'none', stats);
    return;
  }
  if (el.style.opacity !== '0') el.style.opacity = '0';
  if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
  if (el.style.pointerEvents !== 'none') el.style.pointerEvents = 'none';
}

function isSkeletonCardVisibleFromFrameState(el: HTMLElement): boolean {
  return (
    el.dataset.surfaceHidden !== 'true' &&
    el.style.visibility !== 'hidden' &&
    Number(el.style.opacity || '1') > 0.01
  );
}

function separatePathEndpointCards(
  orderedEls: readonly HTMLElement[],
  containerRect: DOMRect,
  fixedSurfaceRects: Array<{ left: number; top: number; right: number; bottom: number }> = [],
) {
  const source = orderedEls.find(
    (el) =>
      el.dataset.pathRole === 'source' &&
      el.dataset.surfaceHidden !== 'true' &&
      getComputedStyle(el).visibility !== 'hidden',
  );
  const target = orderedEls.find(
    (el) =>
      el.dataset.pathRole === 'target' &&
      el.dataset.surfaceHidden !== 'true' &&
      getComputedStyle(el).visibility !== 'hidden',
  );
  if (!source || !target) return;

  const sourceBox = source.getBoundingClientRect();
  const targetBox = target.getBoundingClientRect();
  const sourceRect = {
    left: sourceBox.left - containerRect.left,
    top: sourceBox.top - containerRect.top,
    right: sourceBox.right - containerRect.left,
    bottom: sourceBox.bottom - containerRect.top,
  };
  const targetRect = {
    left: targetBox.left - containerRect.left,
    top: targetBox.top - containerRect.top,
    right: targetBox.right - containerRect.left,
    bottom: targetBox.bottom - containerRect.top,
  };
  if (!rectsOverlap(sourceRect, targetRect, -2)) {
    delete source.dataset.pathEndpointPairSeparated;
    delete target.dataset.pathEndpointPairSeparated;
    return;
  }

  const gap = 12;
  const candidates = [
    {
      el: target,
      rect: targetRect,
      dy: sourceRect.bottom + gap - targetRect.top,
      marker: 'target-shifted',
    },
    {
      el: source,
      rect: sourceRect,
      dy: targetRect.top - gap - sourceRect.bottom,
      marker: 'source-shifted',
    },
  ]
    .map((candidate) => {
      const moved = {
        left: candidate.rect.left,
        top: candidate.rect.top + candidate.dy,
        right: candidate.rect.right,
        bottom: candidate.rect.bottom + candidate.dy,
      };
      return {
        ...candidate,
        moved,
        inside:
          moved.top >= SAFE_VIEWPORT_MARGIN &&
          moved.bottom <= containerRect.height - SAFE_VIEWPORT_MARGIN,
        clear: !fixedSurfaceRects.some((surface) => rectsOverlap(moved, surface)),
      };
    })
    .filter((candidate) => candidate.dy !== 0 && candidate.inside && candidate.clear);
  const best = candidates[0];
  if (!best) return;
  best.el.style.transform = `${best.el.style.transform} translate(0, ${best.dy}px)`;
  best.el.dataset.pathEndpointPairSeparated = best.marker;
}

function separateOverviewDomainCards(
  orderedEls: readonly HTMLElement[],
  containerRect: DOMRect,
  fixedSurfaceRects: Array<{ left: number; top: number; right: number; bottom: number }>,
  readCardPlacementFrameRect: (el: HTMLElement) => ConnectorRect,
): number {
  const records: Array<{ el: HTMLElement; rect: ConnectorRect }> = [];
  for (const el of orderedEls) {
    if (el.dataset.tier !== '1' || el.dataset.dockParent) continue;
    if (el.dataset.surfaceHidden === 'true') continue;
    if (el.style.visibility === 'hidden' || Number(el.style.opacity || '1') <= 0.01) {
      continue;
    }
    const rect = readCardPlacementFrameRect(el);
    if (rect.right <= rect.left || rect.bottom <= rect.top) continue;
    records.push({ el, rect });
  }
  records.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  const accepted: Array<{ left: number; top: number; right: number; bottom: number }> =
    [];
  let separated = 0;
  for (const record of records) {
    delete record.el.dataset.overviewDomainSeparated;
    let dy = 0;
    for (const blocker of accepted) {
      const moved = {
        left: record.rect.left,
        top: record.rect.top + dy,
        right: record.rect.right,
        bottom: record.rect.bottom + dy,
      };
      if (!rectsOverlap(moved, blocker, OVERVIEW_DOMAIN_COLLISION_PAD)) continue;
      const moveDown = blocker.bottom + OVERVIEW_DOMAIN_COLLISION_PAD - moved.top;
      const moveUp = blocker.top - OVERVIEW_DOMAIN_COLLISION_PAD - moved.bottom;
      const preferred = moved.top >= blocker.top ? moveDown : moveUp;
      const fallback = preferred === moveDown ? moveUp : moveDown;
      const nextDy = dy + preferred;
      const preferredRect = {
        left: record.rect.left,
        top: record.rect.top + nextDy,
        right: record.rect.right,
        bottom: record.rect.bottom + nextDy,
      };
      const preferredFits =
        preferredRect.top >= SAFE_VIEWPORT_MARGIN &&
        preferredRect.bottom <= containerRect.height - SAFE_VIEWPORT_MARGIN &&
        !fixedSurfaceRects.some((surface) => rectsOverlap(preferredRect, surface));
      dy += preferredFits ? preferred : fallback;
    }

    const finalRect = {
      left: record.rect.left,
      top: record.rect.top + dy,
      right: record.rect.right,
      bottom: record.rect.bottom + dy,
    };
    const clampedDy =
      finalRect.top < SAFE_VIEWPORT_MARGIN
        ? dy + SAFE_VIEWPORT_MARGIN - finalRect.top
        : finalRect.bottom > containerRect.height - SAFE_VIEWPORT_MARGIN
          ? dy + containerRect.height - SAFE_VIEWPORT_MARGIN - finalRect.bottom
          : dy;
    const acceptedRect = {
      left: record.rect.left,
      top: record.rect.top + clampedDy,
      right: record.rect.right,
      bottom: record.rect.bottom + clampedDy,
    };
    if (clampedDy !== 0) {
      record.el.style.transform = `${record.el.style.transform} translate(0, ${clampedDy}px)`;
      record.el.dataset.overviewDomainSeparated = 'true';
      separated += 1;
    }
    accepted.push(acceptedRect);
  }
  return separated;
}

function restorePathEndpointsFromFixedSurfaces(
  orderedEls: readonly HTMLElement[],
  containerRect: DOMRect,
  fixedSurfaceRects: Array<{ left: number; top: number; right: number; bottom: number }>,
  domWriteStats: SkeletonDomWriteStats,
) {
  const pathAnalysisPanelRects = collectPathAnalysisPanelRects(containerRect);
  for (const el of orderedEls) {
    if (el.dataset.pathRole !== 'source' && el.dataset.pathRole !== 'target') {
      continue;
    }
    const endpointBox = el.getBoundingClientRect();
    const endpointRect = {
      left: endpointBox.left - containerRect.left,
      top: endpointBox.top - containerRect.top,
      right: endpointBox.right - containerRect.left,
      bottom: endpointBox.bottom - containerRect.top,
    };
    const endpointShift = clampRectToViewportAndFixedSurfaces({
      rect: endpointRect,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      fixedSurfaceRects,
    });
    if (endpointShift.dx !== 0 || endpointShift.dy !== 0) {
      setSkeletonStyleValue(
        el,
        'transform',
        `${el.style.transform} translate(${endpointShift.dx}px, ${endpointShift.dy}px)`,
        domWriteStats,
      );
      el.dataset.pathEndpointRestored = 'safe-shift';
    } else {
      delete el.dataset.pathEndpointRestored;
    }
    if (pathAnalysisPanelRects.some((surface) => rectsOverlap(endpointShift.rect, surface))) {
      hideSkeletonCard(el, domWriteStats);
      el.dataset.pathEndpointPanelClearance = 'hidden-under-expanded-panel';
    } else {
      showSkeletonCard(el, '1', domWriteStats);
      delete el.dataset.pathEndpointPanelClearance;
    }
  }
}

function suppressCardsOverlappingPathEndpoints(
  orderedEls: readonly HTMLElement[],
  containerRect: DOMRect,
) {
  const endpointRects = orderedEls
    .filter((el) => {
      if (el.dataset.pathRole !== 'source' && el.dataset.pathRole !== 'target') return false;
      if (el.dataset.surfaceHidden === 'true') return false;
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && Number(style.opacity || el.style.opacity || '1') > 0.01;
    })
    .map((el) => {
      const box = el.getBoundingClientRect();
      return {
        left: box.left - containerRect.left,
        top: box.top - containerRect.top,
        right: box.right - containerRect.left,
        bottom: box.bottom - containerRect.top,
      };
    });
  if (endpointRects.length === 0) return;

  for (const el of orderedEls) {
    if (el.dataset.pathRole === 'source' || el.dataset.pathRole === 'target') continue;
    if (el.dataset.surfaceHidden === 'true') continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || Number(style.opacity || el.style.opacity || '1') <= 0.01) {
      continue;
    }
    const box = el.getBoundingClientRect();
    const rect = {
      left: box.left - containerRect.left,
      top: box.top - containerRect.top,
      right: box.right - containerRect.left,
      bottom: box.bottom - containerRect.top,
    };
    if (endpointRects.some((endpointRect) => rectsOverlap(endpointRect, rect))) {
      hideSkeletonCard(el);
      el.dataset.pathEndpointOverlapSuppressed = 'true';
    }
  }
}

function restoreVisibleCardsFromFixedSurfaces(
  orderedEls: readonly HTMLElement[],
  containerRect: DOMRect,
  fixedSurfaceRects: Array<{ left: number; top: number; right: number; bottom: number }>,
  domWriteStats: SkeletonDomWriteStats,
  readPlacedCardRect?: (el: HTMLElement) => {
    left: number;
    top: number;
    right: number;
    bottom: number;
  },
  onPlacedCardRectChange?: (
    el: HTMLElement,
    rect: { left: number; top: number; right: number; bottom: number },
  ) => void,
): number {
  const occupiedRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  let restored = 0;
  for (const el of orderedEls) {
    if (!isSkeletonCardVisibleFromFrameState(el)) continue;
    const rect = readPlacedCardRect?.(el) ?? elementRectRelativeToContainer(el, containerRect);
    const collidesWithFixedSurface = fixedSurfaceRects.some((surface) =>
      rectsOverlap(rect, surface),
    );
    const outsideViewport =
      rect.left < SAFE_VIEWPORT_MARGIN ||
      rect.top < SAFE_VIEWPORT_MARGIN ||
      rect.right > containerRect.width - SAFE_VIEWPORT_MARGIN ||
      rect.bottom > containerRect.height - SAFE_VIEWPORT_MARGIN;
    if (!collidesWithFixedSurface && !outsideViewport) {
      occupiedRects.push(rect);
      delete el.dataset.fixedSurfaceRestore;
      continue;
    }
    const shift = clampRectToViewportAndFixedSurfaces({
      rect,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      fixedSurfaceRects: [...fixedSurfaceRects, ...occupiedRects],
    });
    const cleared =
      !fixedSurfaceRects.some((surface) => rectsOverlap(shift.rect, surface)) &&
      !occupiedRects.some((surface) => rectsOverlap(shift.rect, surface));
    if (cleared && (shift.dx !== 0 || shift.dy !== 0)) {
      setSkeletonStyleValue(
        el,
        'transform',
        `${el.style.transform} translate(${shift.dx}px, ${shift.dy}px)`,
        domWriteStats,
      );
      el.dataset.fixedSurfaceRestore = 'safe-shift';
      onPlacedCardRectChange?.(el, shift.rect);
      occupiedRects.push(shift.rect);
      restored += 1;
      continue;
    }
    hideSkeletonCard(el, domWriteStats);
    el.dataset.fixedSurfaceRestore = 'hidden-under-fixed-surface';
  }
  return restored;
}

function dragSettleCardPriority(el: HTMLElement): number {
  if (el.dataset.selected === 'true') return 0;
  if (el.dataset.pathRole === 'source' || el.dataset.pathRole === 'target') return 0;
  if (!el.dataset.dockParent && el.dataset.dimmed !== 'true') return 1;
  if (el.dataset.dockParent && el.dataset.dimmed !== 'true') return 2;
  const tier = Number(el.dataset.tier ?? '3');
  return tier <= 1 ? 3 : 4;
}

function suppressSettlingDragCardOverlaps(
  orderedEls: readonly HTMLElement[],
  readCardRect: (el: HTMLElement) => {
    rect: { left: number; top: number; right: number; bottom: number } | null;
    visible: boolean;
  },
): number {
  const visible = orderedEls
    .map((el) => {
      const cached = readCardRect(el);
      if (!cached.visible || !cached.rect) return null;
      return {
        el,
        priority: dragSettleCardPriority(el),
        rect: cached.rect,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const tierA = Number(a.el.dataset.tier ?? '3');
      const tierB = Number(b.el.dataset.tier ?? '3');
      if (tierA !== tierB) return tierA - tierB;
      return Number(a.el.dataset.layoutY ?? '0') - Number(b.el.dataset.layoutY ?? '0');
    });
  const accepted: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  let hidden = 0;
  for (const item of visible) {
    delete item.el.dataset.dragSettleOverlapHidden;
    if (accepted.some((rect) => rectsOverlap(item.rect, rect, DRAG_SETTLE_OVERLAP_PAD))) {
      hideSkeletonCard(item.el);
      item.el.dataset.dragSettleOverlapHidden = 'true';
      hidden += 1;
      continue;
    }
    accepted.push(item.rect);
  }
  return hidden;
}

function suppressVisibleCardOverlaps(
  orderedEls: readonly HTMLElement[],
  readCardRect: (el: HTMLElement) => {
    rect: { left: number; top: number; right: number; bottom: number } | null;
    visible: boolean;
  },
): number {
  const visible = orderedEls
    .map((el) => {
      const cached = readCardRect(el);
      if (!cached.visible || !cached.rect) return null;
      return {
        el,
        priority: dragSettleCardPriority(el),
        rect: cached.rect,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const tierA = Number(a.el.dataset.tier ?? '3');
      const tierB = Number(b.el.dataset.tier ?? '3');
      if (tierA !== tierB) return tierA - tierB;
      return Number(a.el.dataset.layoutY ?? '0') - Number(b.el.dataset.layoutY ?? '0');
    });
  const accepted: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  let hidden = 0;
  for (const item of visible) {
    delete item.el.dataset.supportRailOverlapHidden;
    if (accepted.some((rect) => rectsOverlap(item.rect, rect, OVERVIEW_COLLISION_PAD))) {
      hideSkeletonCard(item.el);
      item.el.dataset.supportRailOverlapHidden = 'true';
      hidden += 1;
      continue;
    }
    accepted.push(item.rect);
  }
  return hidden;
}

function collectPathAnalysisPanelRects(containerRect: DOMRect) {
  if (typeof document === 'undefined') return [];
  const panel = document.querySelector<HTMLElement>(
    '[data-testid="topology-analysis-panel"][data-analysis-mode="path"]',
  );
  if (!panel) return [];
  const rect = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return [];
  }
  return [
    {
      left: rect.left - containerRect.left - COLLISION_PAD,
      top: rect.top - containerRect.top - COLLISION_PAD,
      right: rect.right - containerRect.left + ANALYSIS_PANEL_TRAILING_PAD,
      bottom: rect.bottom - containerRect.top + ANALYSIS_PANEL_BLOCK_END_PAD,
    },
  ];
}

function isElementInsideContainerViewport(el: HTMLElement, containerRect: DOMRect): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.left - containerRect.left >= 0 &&
    rect.top - containerRect.top >= 0 &&
    rect.right - containerRect.left <= containerRect.width &&
    rect.bottom - containerRect.top <= containerRect.height
  );
}

function elementRectRelativeToContainer(el: HTMLElement, containerRect: DOMRect) {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left - containerRect.left,
    top: rect.top - containerRect.top,
    right: rect.right - containerRect.left,
    bottom: rect.bottom - containerRect.top,
  };
}

function isElementClearOfFixedSurfaces(
  el: HTMLElement,
  containerRect: DOMRect,
  fixedSurfaceRects: ReadonlyArray<{ left: number; top: number; right: number; bottom: number }>,
): boolean {
  const rect = elementRectRelativeToContainer(el, containerRect);
  return !fixedSurfaceRects.some((surface) => rectsOverlap(rect, surface));
}

function collectDraggedCluster(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  nodeId: string,
  movableNodeIds: ReadonlySet<string>,
  tierByNodeId: ReadonlyMap<string, SkeletonCardModel['tier']> = new Map(),
): Set<string> {
  const group = new Set<string>();
  if (!movableNodeIds.has(nodeId) || !graph.hasNode(nodeId)) {
    return new Set([nodeId]);
  }
  const rootTier = tierByNodeId.get(nodeId);
  group.add(nodeId);
  const directChildren: string[] = [];
  for (const neighbor of graph.neighbors(nodeId)) {
    if (!movableNodeIds.has(neighbor)) continue;
    const neighborTier = tierByNodeId.get(neighbor);
    group.add(neighbor);
    if (rootTier != null && neighborTier != null && neighborTier > rootTier) {
      directChildren.push(neighbor);
    }
  }
  for (const child of directChildren) {
    const childTier = tierByNodeId.get(child);
    for (const grandchild of graph.neighbors(child)) {
      if (!movableNodeIds.has(grandchild) || grandchild === nodeId) continue;
      const grandchildTier = tierByNodeId.get(grandchild);
      if (childTier != null && grandchildTier != null && grandchildTier > childTier) {
        group.add(grandchild);
      }
    }
  }
  return group;
}

function clampDraggedClusterDelta(
  container: HTMLElement | null,
  group: ReadonlySet<string>,
  dx: number,
  dy: number,
  cardElements: readonly HTMLElement[] | null = null,
): { dx: number; dy: number } {
  if (!container) return { dx, dy };
  const containerRect = container.getBoundingClientRect();
  const movingRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const candidates = cardElements ?? container.querySelectorAll<HTMLElement>('[data-skeleton-card]');
  for (const el of candidates) {
    const slug = el.dataset.slug;
    const dockParent = el.dataset.dockParent;
    if (!slug || (!group.has(slug) && (!dockParent || !group.has(dockParent)))) continue;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      continue;
    }
    movingRects.push({
      left: rect.left - containerRect.left,
      top: rect.top - containerRect.top,
      right: rect.right - containerRect.left,
      bottom: rect.bottom - containerRect.top,
    });
  }
  if (movingRects.length === 0) return { dx, dy };
  const fixedSurfaceRects = collectFixedSurfaceRects(containerRect);

  const bounds = movingRects.reduce(
    (acc, rect) => ({
      left: Math.min(acc.left, rect.left),
      top: Math.min(acc.top, rect.top),
      right: Math.max(acc.right, rect.right),
      bottom: Math.max(acc.bottom, rect.bottom),
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  );
  let clampedDx = dx;
  let clampedDy = dy;

  const clampViewport = () => {
    if (bounds.left + clampedDx < SAFE_VIEWPORT_MARGIN) {
      clampedDx = SAFE_VIEWPORT_MARGIN - bounds.left;
    }
    if (bounds.right + clampedDx > containerRect.width - SAFE_VIEWPORT_MARGIN) {
      clampedDx = containerRect.width - SAFE_VIEWPORT_MARGIN - bounds.right;
    }
    if (bounds.top + clampedDy < SAFE_VIEWPORT_MARGIN) {
      clampedDy = SAFE_VIEWPORT_MARGIN - bounds.top;
    }
    if (bounds.bottom + clampedDy > containerRect.height - SAFE_VIEWPORT_MARGIN) {
      clampedDy = containerRect.height - SAFE_VIEWPORT_MARGIN - bounds.bottom;
    }
  };

  clampViewport();
  for (const surface of fixedSurfaceRects) {
    const moved = {
      left: bounds.left + clampedDx,
      top: bounds.top + clampedDy,
      right: bounds.right + clampedDx,
      bottom: bounds.bottom + clampedDy,
    };
    if (!rectsOverlap(moved, surface)) continue;
    const candidates = [
      { dx: surface.right + FIXED_SURFACE_GAP - moved.left, dy: 0 },
      { dx: surface.left - FIXED_SURFACE_GAP - moved.right, dy: 0 },
      { dx: 0, dy: surface.bottom + FIXED_SURFACE_GAP - moved.top },
      { dx: 0, dy: surface.top - FIXED_SURFACE_GAP - moved.bottom },
    ]
      .map((candidate) => {
        const next = {
          left: moved.left + candidate.dx,
          top: moved.top + candidate.dy,
          right: moved.right + candidate.dx,
          bottom: moved.bottom + candidate.dy,
        };
        return {
          ...candidate,
          cost: Math.abs(candidate.dx) + Math.abs(candidate.dy),
          inside:
            next.left >= SAFE_VIEWPORT_MARGIN &&
            next.top >= SAFE_VIEWPORT_MARGIN &&
            next.right <= containerRect.width - SAFE_VIEWPORT_MARGIN &&
            next.bottom <= containerRect.height - SAFE_VIEWPORT_MARGIN,
        };
      })
      .filter((candidate) => candidate.inside)
      .sort((a, b) => a.cost - b.cost);
    const best = candidates[0];
    if (!best) continue;
    clampedDx += best.dx;
    clampedDy += best.dy;
  }
  clampViewport();
  return { dx: clampedDx, dy: clampedDy };
}

function moveDraggedCluster(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  nodeId: string,
  dx: number,
  dy: number,
  sigma: SkeletonCardsCamera,
  movableNodeIds: ReadonlySet<string>,
  tierByNodeId: ReadonlyMap<string, SkeletonCardModel['tier']> = new Map(),
  dragGroup: ReadonlySet<string> | null = null,
): Set<string> {
  const attrs = graph.getNodeAttributes(nodeId);
  const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
  const next = sigma.viewportToGraph({ x: vp.x + dx, y: vp.y + dy });
  const graphDx = next.x - attrs.x;
  const graphDy = next.y - attrs.y;

  const group = dragGroup
    ? new Set(dragGroup)
    : collectDraggedCluster(graph, nodeId, movableNodeIds, tierByNodeId);

  for (const member of group) {
    const memberAttrs = graph.getNodeAttributes(member);
    graph.setNodeAttribute(member, 'x', memberAttrs.x + graphDx);
    graph.setNodeAttribute(member, 'y', memberAttrs.y + graphDy);
  }
  return group;
}

function applyViewportDeltaToNode(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  sigma: SkeletonCardsCamera,
  nodeId: string,
  dx: number,
  dy: number,
) {
  const attrs = graph.getNodeAttributes(nodeId);
  const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
  const next = sigma.viewportToGraph({ x: vp.x + dx, y: vp.y + dy });
  graph.setNodeAttribute(nodeId, 'x', next.x);
  graph.setNodeAttribute(nodeId, 'y', next.y);
}

function snapshotDockDragPositions(
  container: HTMLElement | null,
  movingGroup: ReadonlySet<string>,
  cardElements: readonly HTMLElement[] | null = null,
): Map<string, DockDragSnapshot> {
  const snapshots = new Map<string, DockDragSnapshot>();
  if (!container) return snapshots;
  const containerRect = container.getBoundingClientRect();
  const parentAnchorBySlug = new Map<string, { x: number; y: number }>();
  const candidates = cardElements ?? container.querySelectorAll<HTMLElement>('[data-skeleton-card]');
  const cardSnapshots: DockDragCardSnapshot[] = [];
  for (const element of candidates) {
    const slug = element.dataset.slug;
    if (!slug) continue;
    const dockParent = element.dataset.dockParent ?? '';
    if (!movingGroup.has(slug) && (!dockParent || !movingGroup.has(dockParent))) continue;
    const rect = element.getBoundingClientRect();
    const layoutY = Number(element.dataset.layoutY);
    const y = Number.isFinite(layoutY)
      ? layoutY
      : (rect.top + rect.bottom) / 2 - containerRect.top;
    const x = (rect.left + rect.right) / 2 - containerRect.left;
    const childStartX =
      element.dataset.dockSide === 'left'
        ? rect.right - containerRect.left
        : rect.left - containerRect.left;
    cardSnapshots.push({
      childStartX,
      dockParent,
      layoutY,
      slug,
      x,
      y,
    });
    if (!movingGroup.has(slug)) continue;
    parentAnchorBySlug.set(slug, { x, y });
  }
  for (const child of cardSnapshots) {
    const parentSlug = child.dockParent;
    if (!parentSlug || !movingGroup.has(parentSlug)) continue;
    const parentStart = parentAnchorBySlug.get(parentSlug);
    if (!parentStart) continue;
    if (Number.isFinite(child.layoutY)) {
      snapshots.set(child.slug, {
        childStartX: child.childStartX,
        parentSlug,
        parentStartX: parentStart.x,
        parentStartY: parentStart.y,
        childStartY: child.layoutY,
      });
      continue;
    }
    snapshots.set(child.slug, {
      childStartX: child.childStartX,
      parentSlug,
      parentStartX: parentStart.x,
      parentStartY: parentStart.y,
      childStartY: child.y,
    });
  }
  return snapshots;
}

function chooseCollisionEscapeDelta(
  rect: { left: number; top: number; right: number; bottom: number },
  blocker: { left: number; top: number; right: number; bottom: number },
): { dx: number; dy: number } {
  const moveRight = blocker.right + COLLISION_PAD - rect.left;
  const moveLeft = blocker.left - COLLISION_PAD - rect.right;
  const moveDown = blocker.bottom + COLLISION_PAD - rect.top;
  const moveUp = blocker.top - COLLISION_PAD - rect.bottom;
  const candidateX = Math.abs(moveRight) < Math.abs(moveLeft) ? moveRight : moveLeft;
  const candidateY = Math.abs(moveDown) < Math.abs(moveUp) ? moveDown : moveUp;
  return Math.abs(candidateX) <= Math.abs(candidateY)
    ? { dx: candidateX, dy: 0 }
    : { dx: 0, dy: candidateY };
}

function pushCardsAwayFromDraggedCluster(
  container: HTMLElement | null,
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  sigma: SkeletonCardsCamera,
  group: ReadonlySet<string>,
  movableNodeIds: ReadonlySet<string>,
  cardElements: readonly HTMLElement[] | null = null,
): Set<string> {
  const pushedSlugs = new Set<string>();
  if (!container) return pushedSlugs;
  const containerRect = container.getBoundingClientRect();
  const candidates = cardElements ?? Array.from(container.querySelectorAll<HTMLElement>('[data-skeleton-card]'));
  const records = Array.from(candidates)
    .map((el) => {
      const slug = el.dataset.slug;
      const dockParent = el.dataset.dockParent;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (
        !slug ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        return null;
      }
      return {
        el,
        slug,
        dockParent,
        rect: {
          left: rect.left - containerRect.left,
          top: rect.top - containerRect.top,
          right: rect.right - containerRect.left,
          bottom: rect.bottom - containerRect.top,
        },
      };
    })
    .filter((record): record is NonNullable<typeof record> => record !== null);

  const movingSlugs = new Set(
    records
      .filter((record) => group.has(record.slug) || Boolean(record.dockParent && group.has(record.dockParent)))
      .map((record) => record.slug),
  );
  if (movingSlugs.size === 0) return pushedSlugs;

  for (let pass = 0; pass < DRAG_COLLISION_SETTLE_PASSES; pass += 1) {
    let movedThisPass = false;
    const blockerRects = records
      .filter(
        (record) =>
          movingSlugs.has(record.slug) ||
          pushedSlugs.has(record.slug) ||
          Boolean(record.dockParent && (movingSlugs.has(record.dockParent) || pushedSlugs.has(record.dockParent))),
      )
      .map((record) => record.rect);
    for (const record of records) {
      if (
        record.dockParent ||
        movingSlugs.has(record.slug) ||
        pushedSlugs.has(record.slug) ||
        !movableNodeIds.has(record.slug)
      ) {
        continue;
      }
      let dx = 0;
      let dy = 0;
      for (const blocker of blockerRects) {
        const adjusted = {
          left: record.rect.left + dx,
          top: record.rect.top + dy,
          right: record.rect.right + dx,
          bottom: record.rect.bottom + dy,
        };
        if (!rectsOverlap(adjusted, blocker, COLLISION_PAD)) continue;
        const escape = chooseCollisionEscapeDelta(adjusted, blocker);
        dx += escape.dx;
        dy += escape.dy;
      }
      if (dx === 0 && dy === 0) continue;

      const width = record.rect.right - record.rect.left;
      const height = record.rect.bottom - record.rect.top;
      dx = Math.min(
        Math.max(dx, SAFE_VIEWPORT_MARGIN - record.rect.left),
        containerRect.width - SAFE_VIEWPORT_MARGIN - record.rect.left - width,
      );
      dy = Math.min(
        Math.max(dy, SAFE_VIEWPORT_MARGIN - record.rect.top),
        containerRect.height - SAFE_VIEWPORT_MARGIN - record.rect.top - height,
      );
      if (dx === 0 && dy === 0) continue;
      applyViewportDeltaToNode(graph, sigma, record.slug, dx, dy);
      record.rect = {
        left: record.rect.left + dx,
        top: record.rect.top + dy,
        right: record.rect.right + dx,
        bottom: record.rect.bottom + dy,
      };
      pushedSlugs.add(record.slug);
      movedThisPass = true;
    }
    if (!movedThisPass) break;
  }
  container.dataset.dragPushAwayCount = String(pushedSlugs.size);
  return pushedSlugs;
}

export function SigmaSkeletonCards({
  sigma,
  graph,
  cards,
  selectedSlug = null,
  selectedRelationEdgeId = null,
  healthRepairTarget = null,
  selectedFocusCenterActive = false,
  onSelect,
  pathWorkflowActive = false,
  pathSelection = null,
  onPathSelectionChange,
  onVisibilityChange,
  onRelationSelect,
  onRelationHover,
  describeKind,
  describeKindBadge,
}: SigmaSkeletonCardsProps) {
  const tEdgeTooltip = useTranslations('topologyWidgets.edgeTooltip');
  const relationTypeLabels = useMemo<RelationTypeLabels>(
    () => ({
      contains: tEdgeTooltip('relationTypeContains'),
      dependsOn: tEdgeTooltip('relationTypeDependsOn'),
      relates: tEdgeTooltip('relationTypeRelates'),
      describes: tEdgeTooltip('relationTypeDescribes'),
      uses: tEdgeTooltip('relationTypeUses'),
      belongsTo: tEdgeTooltip('relationTypeBelongsTo'),
    }),
    [tEdgeTooltip],
  );
  const relationActionChipText = useCallback(
    (action: RelationCopyActionKind) =>
      action === 'explain_relation'
        ? tEdgeTooltip('actionExplainRelationVisible')
        : tEdgeTooltip('actionRelationCheckVisible'),
    [tEdgeTooltip],
  );
  const formatRelationLabel = useCallback(
    (relationType: string, count = 1) =>
      relationLabelText(relationType, count, relationTypeLabels),
    [relationTypeLabels],
  );
  const formatRelationVisibleLabel = useCallback(
    (relationType: string, count = 1) =>
      relationLabelVisibleText({
        count,
        label: relationLabelText(relationType, 1, relationTypeLabels),
        relationBadgeCount: (values) => tEdgeTooltip('relationBadgeCount', values),
      }),
    [relationTypeLabels, tEdgeTooltip],
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  // hover 간단 팝업 — "이게 어떤 계층인지 + 한 줄 설명" (사용자 요청).
  // 좌표는 reposition 이 매 프레임 카드 rect 에서 파생(flip/클램프 포함) —
  // hover 중 팬/줌해도 팝업이 카드를 따라간다.
  const [hovered, setHovered] = useState<{
    card: SkeletonCardModel;
    nodeId: string;
  } | null>(null);
  const [activeDragCluster, setActiveDragCluster] = useState<Set<string> | null>(null);
  const [activeDragMotion, setActiveDragMotion] = useState(false);
  const [activeDragRootSlug, setActiveDragRootSlug] = useState("");
  const [dragSettledSlugs, setDragSettledSlugs] = useState<Set<string>>(() => new Set());
  const [dragFrameMarkerSnapshot, setDragFrameMarkerSnapshot] = useState({
    domIndexSize: 0,
    snapshotCount: 0,
  });
  const dragReleaseTimerRef = useRef<number | null>(null);
  const activeDragMotionRef = useRef(false);
  // 카드 드래그 — 골격 anchor 카드를 손으로 옮길 수 있게(과거 토폴로지의
  // 촉각 유지). 좌표는 graph attr 로 흘러 엣지/fit 도 따라온다. 드래그로
  // 움직였으면 release 후 click 이 선택을 발화하지 않게 억제.
  const dragRef = useRef<{
    sourceSlug: string;
    rootSlug: string;
    lastX: number;
    lastY: number;
    travel: number;
    dockDragSnapshots: Map<string, DockDragSnapshot>;
    cardElements: SkeletonCardElementIndex;
    movedGroup: Set<string>;
    movableNodeIds: Set<string>;
    tierByNodeId: Map<string, SkeletonCardModel['tier']>;
  } | null>(null);
  const activeDockDragSnapshotsRef = useRef<Map<string, DockDragSnapshot>>(new Map());
  const suppressClickRef = useRef(false);
  const dragSettledTimerRef = useRef<number | null>(null);
  // 전환 창 동안 충돌 판정 동결용 (slug → 직전 collides).
  const collisionFreezeRef = useRef(new Map<string, boolean>());
  const lastVisibilityStatsRef = useRef<{ visible: number; total: number } | null>(null);
  const visibilityStatsReportCountRef = useRef(0);
  const pendingVisibilityStatsRef = useRef<{ visible: number; total: number } | null>(null);
  const visibilityStatsFlushTimerRef = useRef<number | null>(null);
  const hoverPopupRef = useRef<HTMLDivElement | null>(null);
  const repositionRafRef = useRef<number | null>(null);
  const repositionNowRef = useRef<(() => void) | null>(null);
  const responsiveRepositionTimerRef = useRef<number | null>(null);
  const fixedSurfaceRectCacheRef = useRef<FixedSurfaceRectCache | null>(null);
  const visibilityFrameSnapshotRef = useRef<VisibilityFrameSnapshot | null>(null);
  const layoutTransitionRepositionTimerRef = useRef<number | null>(null);
  const lastLayoutTransitionRepositionAtRef = useRef(0);
  const initialLayoutTransitionResolvedRef = useRef(false);
  const initialLoadRepositionThrottleUntilRef = useRef(0);
  const lastAppliedTopologyUiScaleRef = useRef<number | null>(null);
  const cardPlacementSizeCacheRef = useRef(
    new Map<string, CardPlacementSizeCacheEntry>(),
  );
  const lastLayoutEffectRepositionKeyRef = useRef<string | null>(null);
  const layoutEffectRepositionRunCountRef = useRef(0);
  const layoutEffectRepositionSkipCountRef = useRef(0);
  const lastDragDomIndexSizeRef = useRef(0);
  const lastDockDragSnapshotSizeRef = useRef(0);
  const maxRepositionDurationMsRef = useRef(0);

  const invalidateFixedSurfaceRectCache = useCallback(() => {
    fixedSurfaceRectCacheRef.current = null;
    visibilityFrameSnapshotRef.current = null;
  }, []);

  const getFixedSurfaceRects = useCallback((containerRect: DOMRect) => {
    const cached = fixedSurfaceRectCacheRef.current;
    const now = Date.now();
    if (
      cached &&
      cached.width === containerRect.width &&
      cached.height === containerRect.height &&
      now - cached.timestamp < FIXED_SURFACE_RECT_CACHE_MS
    ) {
      return cached.rects;
    }
    const rects = collectFixedSurfaceRects(containerRect);
    fixedSurfaceRectCacheRef.current = {
      height: containerRect.height,
      rects,
      timestamp: now,
      width: containerRect.width,
    };
    return rects;
  }, []);

  const emitVisibilityStats = useCallback(
    (
      container: HTMLElement,
      nextVisibilityStats: { visible: number; total: number },
      options: { debounceStable: boolean; deferDuringLayout: boolean },
    ) => {
      container.dataset.visibilityStatsReportPolicy = options.deferDuringLayout
        ? 'defer-during-layout-animate'
        : options.debounceStable
          ? 'debounce-stable-counts'
          : 'immediate-stable-counts';
      if (
        !shouldReportSkeletonVisibilityStats(
          lastVisibilityStatsRef.current,
          nextVisibilityStats,
        )
      ) {
        return;
      }
      if (options.deferDuringLayout) {
        pendingVisibilityStatsRef.current = nextVisibilityStats;
        container.dataset.visibilityStatsReportDeferred = 'true';
        if (visibilityStatsFlushTimerRef.current !== null) return;
        visibilityStatsFlushTimerRef.current = window.setTimeout(() => {
          visibilityStatsFlushTimerRef.current = null;
          const pending = pendingVisibilityStatsRef.current;
          pendingVisibilityStatsRef.current = null;
          const currentContainer = containerRef.current;
          if (!pending || !currentContainer) return;
          if (
            !shouldReportSkeletonVisibilityStats(
              lastVisibilityStatsRef.current,
              pending,
            )
          ) {
            return;
          }
          lastVisibilityStatsRef.current = pending;
          visibilityStatsReportCountRef.current += 1;
          currentContainer.dataset.visibilityStatsReportCount = String(
            visibilityStatsReportCountRef.current,
          );
          currentContainer.dataset.visibilityStatsReportDeferred = 'false';
          onVisibilityChange?.(pending);
        }, 520);
        return;
      }
      if (options.debounceStable && lastVisibilityStatsRef.current !== null) {
        pendingVisibilityStatsRef.current = nextVisibilityStats;
        container.dataset.visibilityStatsReportDeferred = 'true';
        if (visibilityStatsFlushTimerRef.current !== null) return;
        visibilityStatsFlushTimerRef.current = window.setTimeout(() => {
          visibilityStatsFlushTimerRef.current = null;
          const pending = pendingVisibilityStatsRef.current;
          pendingVisibilityStatsRef.current = null;
          const currentContainer = containerRef.current;
          if (!pending || !currentContainer) return;
          if (
            !shouldReportSkeletonVisibilityStats(
              lastVisibilityStatsRef.current,
              pending,
            )
          ) {
            currentContainer.dataset.visibilityStatsReportDeferred = 'false';
            return;
          }
          lastVisibilityStatsRef.current = pending;
          visibilityStatsReportCountRef.current += 1;
          currentContainer.dataset.visibilityStatsReportCount = String(
            visibilityStatsReportCountRef.current,
          );
          currentContainer.dataset.visibilityStatsReportDeferred = 'false';
          onVisibilityChange?.(pending);
        }, 360);
        return;
      }
      if (visibilityStatsFlushTimerRef.current !== null) {
        window.clearTimeout(visibilityStatsFlushTimerRef.current);
        visibilityStatsFlushTimerRef.current = null;
      }
      pendingVisibilityStatsRef.current = null;
      container.dataset.visibilityStatsReportDeferred = 'false';
      lastVisibilityStatsRef.current = nextVisibilityStats;
      visibilityStatsReportCountRef.current += 1;
      container.dataset.visibilityStatsReportCount = String(
        visibilityStatsReportCountRef.current,
      );
      onVisibilityChange?.(nextVisibilityStats);
    },
    [onVisibilityChange],
  );

  const clearActiveDragCluster = useCallback(() => {
    if (dragReleaseTimerRef.current !== null) {
      window.clearTimeout(dragReleaseTimerRef.current);
      dragReleaseTimerRef.current = null;
    }
    setActiveDragCluster(null);
    setActiveDragMotion(false);
    activeDragMotionRef.current = false;
    setActiveDragRootSlug("");
    activeDockDragSnapshotsRef.current = new Map();
  }, []);

  const settleActiveDragCluster = useCallback((linger: boolean) => {
    if (dragReleaseTimerRef.current !== null) {
      window.clearTimeout(dragReleaseTimerRef.current);
      dragReleaseTimerRef.current = null;
    }
    setActiveDragMotion(false);
    activeDragMotionRef.current = false;
    if (!linger) {
      setActiveDragCluster(null);
      setActiveDragRootSlug("");
      activeDockDragSnapshotsRef.current = new Map();
      return;
    }
    dragReleaseTimerRef.current = window.setTimeout(() => {
      dragReleaseTimerRef.current = null;
      setActiveDragCluster(null);
      setActiveDragRootSlug("");
      activeDockDragSnapshotsRef.current = new Map();
    }, DRAG_GROUP_RELEASE_FEEDBACK_MS);
  }, []);

  // ontology id 는 `project:x` prefixed 지만 토폴로지의 project 노드는 bare
  // slug — graph-build 의 endpoint 해석과 동일한 규칙으로 카드를 노드에 잇는다.
  const resolveNodeId = useCallback(
    (id: string): string | null => {
      if (graph.hasNode(id)) return id;
      const colon = id.indexOf(':');
      if (colon > 0) {
        const kind = id.slice(0, colon);
        const bare = id.slice(colon + 1);
        if (graph.hasNode(bare)) return bare;
        const pluralPath =
          kind === 'project'
            ? `projects/${bare}`
            : kind === 'domain'
              ? `domains/${bare}`
              : kind === 'capability'
                ? `capabilities/${bare}`
                : kind === 'element'
                  ? `elements/${bare}`
                  : null;
        if (pluralPath && graph.hasNode(pluralPath)) return pluralPath;
      }
      const slash = id.indexOf('/');
      if (slash > 0) {
        const folder = id.slice(0, slash);
        const rest = id.slice(slash + 1);
        const prefixed =
          folder === 'projects'
            ? `project:${rest}`
            : folder === 'domains'
              ? `domain:${rest}`
              : folder === 'capabilities'
                ? `capability:${rest}`
                : folder === 'elements'
                  ? `element:${rest}`
                  : null;
        if (prefixed && graph.hasNode(prefixed)) return prefixed;
      }
      return null;
    },
    [graph],
  );

  const buildMovableNodeIds = useCallback(() => {
    const movableNodeIds = new Set<string>();
    for (const card of cards) {
      const resolved = resolveNodeId(card.id);
      if (resolved) movableNodeIds.add(resolved);
    }
    return movableNodeIds;
  }, [cards, resolveNodeId]);

  const resolvedCardCount = useMemo(
    () => cards.reduce((count, card) => count + (resolveNodeId(card.id) ? 1 : 0), 0),
    [cards, resolveNodeId],
  );
  const pathSelectionSourceSlug = pathSelection?.sourceSlug ?? null;
  const pathSelectionTargetSlug = pathSelection?.targetSlug ?? null;
  const resolvedPathSourceNodeId = useMemo(
    () => (pathSelectionSourceSlug ? resolveNodeId(pathSelectionSourceSlug) : null),
    [pathSelectionSourceSlug, resolveNodeId],
  );
  const resolvedPathTargetNodeId = useMemo(
    () => (pathSelectionTargetSlug ? resolveNodeId(pathSelectionTargetSlug) : null),
    [pathSelectionTargetSlug, resolveNodeId],
  );
  const healthRepairTargetSlug = healthRepairTarget?.slug ?? null;
  const resolvedHealthRepairTargetNodeId = useMemo(
    () => (healthRepairTargetSlug ? resolveNodeId(healthRepairTargetSlug) : null),
    [healthRepairTargetSlug, resolveNodeId],
  );

  const buildVisibleCardTierByNodeId = useCallback(() => {
    const tierByNodeId = new Map<string, SkeletonCardModel['tier']>();
    for (const card of cards) {
      const resolved = resolveNodeId(card.id);
      if (resolved) tierByNodeId.set(resolved, card.tier);
    }
    return tierByNodeId;
  }, [cards, resolveNodeId]);

  const markDragSettled = useCallback((slugs: ReadonlySet<string>) => {
    if (slugs.size === 0) return;
    if (dragSettledTimerRef.current !== null) {
      window.clearTimeout(dragSettledTimerRef.current);
    }
    setDragSettledSlugs(new Set(slugs));
    dragSettledTimerRef.current = window.setTimeout(() => {
      setDragSettledSlugs(new Set());
      dragSettledTimerRef.current = null;
    }, DRAG_SETTLE_FEEDBACK_MS);
  }, []);

  const releaseDrag = useCallback(
    (sourceSlug: string) => {
      const drag = dragRef.current;
      if (!drag || drag.sourceSlug !== sourceSlug) {
        return;
      }
      const moved = drag.travel > 4;
      if (moved) {
        suppressClickRef.current = true;
        activeDockDragSnapshotsRef.current = new Map(drag?.dockDragSnapshots ?? []);
        if (drag && sigma) {
          const pushedSlugs = pushCardsAwayFromDraggedCluster(
            containerRef.current,
            graph,
            sigma,
            drag.movedGroup,
            drag.movableNodeIds,
            drag.cardElements.all,
          );
          if (pushedSlugs.size > 0) {
            repositionNowRef.current?.();
            markDragSettled(pushedSlugs);
          }
        }
      }
      dragRef.current = null;
      settleActiveDragCluster(moved);
    },
    [graph, markDragSettled, settleActiveDragCluster, sigma],
  );

  useEffect(() => {
    return () => {
      if (dragSettledTimerRef.current !== null) {
        window.clearTimeout(dragSettledTimerRef.current);
      }
      if (dragReleaseTimerRef.current !== null) {
        window.clearTimeout(dragReleaseTimerRef.current);
      }
    };
  }, []);

  // ego = 선택 + *하위 kind* 이웃(펼친 자식 열). 상위 방향(parent) 이웃은
  // dim 규칙을 따른다 — 커넥터도 자식으로만 그린다.
  const ego = useMemo(() => {
    if (!selectedSlug || !graph.hasNode(selectedSlug)) return null;
    const selectedCard = cards.find((card) => resolveNodeId(card.id) === selectedSlug);
    const selectedRank = selectedCard ? KIND_RANK[selectedCard.kind] : 0;
    const childIds: string[] = [];
    const slugs = new Set<string>([selectedSlug]);
    for (const card of cards) {
      const nodeId = resolveNodeId(card.id);
      if (!nodeId || nodeId === selectedSlug) continue;
      if (!graph.hasEdge(selectedSlug, nodeId) && !graph.hasEdge(nodeId, selectedSlug)) {
        continue;
      }
      if (KIND_RANK[card.kind] > selectedRank) {
        childIds.push(nodeId);
        slugs.add(nodeId);
      }
    }
    return { slugs, childIds, selected: selectedSlug };
  }, [cards, graph, resolveNodeId, selectedSlug]);

  const egoRelationConnectors = useMemo(() => {
    if (!ego) return [];
    return ego.childIds.map((childId) => relationConnector(graph, ego.selected, childId));
  }, [ego, graph]);

  const egoRelationLabels = useMemo(() => {
    const groups = new Map<string, RelationLabel>();
    for (const connector of egoRelationConnectors) {
      const key = `${connector.kind}:${connector.relationType}`;
      const previous = groups.get(key);
      if (previous) {
        previous.count += 1;
      } else {
        groups.set(key, { ...connector, count: 1 });
      }
    }
    return Array.from(groups.values()).slice(0, 3);
  }, [egoRelationConnectors]);

  const selectedRelationLabelHandoff = useMemo(() => {
    const selectedLabel = selectedRelationEdgeId
      ? egoRelationLabels.find((label) => label.edgeId === selectedRelationEdgeId)
      : null;
    if (!selectedLabel) return null;
    const gateKind = relationAgentGateKind(selectedLabel);
    const primaryCopyAction = relationPrimaryCopyAction(gateKind);
    return {
      action: primaryCopyAction,
      cliFallbackCommand: relationLabelCliFallbackCommand({
        action: primaryCopyAction,
        from: selectedLabel.edgeSource,
        relationType: selectedLabel.relationType,
        to: selectedLabel.edgeTarget,
      }),
      evidence: relationEvidenceState(selectedLabel),
      gate: gateKind,
      quality: selectedLabel.relationQuality ?? 'supported',
      route: 'fact>evidence>gate>action',
    };
  }, [egoRelationLabels, selectedRelationEdgeId]);

  const selectedRelationSummary = useMemo(() => {
    if (!ego || egoRelationConnectors.length === 0) return null;
    return {
      relationCount: egoRelationConnectors.length,
      typeCount: new Set(
        egoRelationConnectors.map((connector) => connector.relationType),
      ).size,
    };
  }, [ego, egoRelationConnectors]);

  const selectedFocusCluster = useMemo(() => {
    if (!ego || ego.slugs.size < 2) return null;
    return ego.slugs;
  }, [ego]);

  const activeHullCluster = activeDragCluster;
  const activeHullMode = activeDragCluster ? 'drag' : 'none';
  const activeHullConnectors = useMemo(() => {
    if (!activeHullCluster || activeHullCluster.size < 2) return [];
    const pairs: RelationConnector[] = [];
    const seen = new Set<string>();
    for (const from of activeHullCluster) {
      if (!graph.hasNode(from)) continue;
      for (const to of graph.neighbors(from)) {
        if (!activeHullCluster.has(to)) continue;
        const key = [from, to].sort().join('→');
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push(relationConnector(graph, from, to));
      }
    }
    return pairs;
  }, [activeHullCluster, graph]);

  const overviewBackboneConnectors = useMemo(() => {
    const visibleNodeIds = new Set<string>();
    const tierByNodeId = new Map<string, SkeletonCardModel['tier']>();
    for (const card of cards) {
      if (card.dock) continue;
      const nodeId = resolveNodeId(card.id);
      if (!nodeId) continue;
      visibleNodeIds.add(nodeId);
      tierByNodeId.set(nodeId, card.tier);
    }

    const pairs: RelationConnector[] = [];
    const seen = new Set<string>();
    graph.forEachEdge((_edge, attrs, source, target) => {
      if (attrs.kind !== 'contains' && attrs.relationType !== 'contains') return;
      if (!visibleNodeIds.has(source) || !visibleNodeIds.has(target)) return;
      const sourceTier = tierByNodeId.get(source) ?? 3;
      const targetTier = tierByNodeId.get(target) ?? 3;
      const from = sourceTier <= targetTier ? source : target;
      const to = sourceTier <= targetTier ? target : source;
      const key = [from, to].join('→');
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push(relationConnector(graph, from, to));
    });

    return pairs
      .sort((a, b) => {
        const aTier = Math.max(tierByNodeId.get(a.from) ?? 3, tierByNodeId.get(a.to) ?? 3);
        const bTier = Math.max(tierByNodeId.get(b.from) ?? 3, tierByNodeId.get(b.to) ?? 3);
        return aTier - bTier || relationConnectorPaintRank(a) - relationConnectorPaintRank(b);
      })
      .slice(0, 28);
  }, [cards, graph, resolveNodeId]);

  const selectRelation = useCallback(
    (connector: RelationConnector) => {
      const data = relationSelectionData(graph, connector);
      if (data) onRelationSelect?.(data);
    },
    [graph, onRelationSelect],
  );
  const hoverRelation = useCallback(
    (connector: RelationConnector, point: { x: number; y: number } | null) => {
      if (!point) {
        onRelationHover?.(null);
        return;
      }
      const data = relationSelectionData(graph, connector);
      if (!data) return;
      onRelationHover?.({ ...data, x: point.x, y: point.y });
    },
    [graph, onRelationHover],
  );

  const reposition = useCallback(() => {
    const container = containerRef.current;
    if (!container || !sigma) return;
    const measureRepositionNow = () =>
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const repositionStartedAt = measureRepositionNow();
    const els = container.querySelectorAll<HTMLElement>('[data-skeleton-card]');
    // pass 1 — 카드 배치 + ego(풀 잉크) 카드 rect 수집. DOM 순서 = 도킹 깊이
    // 순(builder 가 정렬)이라 부모 카드의 transform 이 자식보다 먼저 잡힌다.
    const measuredContainerRect = container.getBoundingClientRect();
    const fallbackContainerWidth =
      typeof window === 'undefined' ? 1024 : window.innerWidth || 1024;
    const fallbackContainerHeight =
      typeof window === 'undefined' ? 768 : window.innerHeight || 768;
    const containerRect =
      measuredContainerRect.width > 0 && measuredContainerRect.height > 0
        ? measuredContainerRect
        : ({
            ...measuredContainerRect,
            width: fallbackContainerWidth,
            height: fallbackContainerHeight,
            right: measuredContainerRect.left + fallbackContainerWidth,
            bottom: measuredContainerRect.top + fallbackContainerHeight,
          } as DOMRect);
    // 반응형 스케일 — 카드 폰트(inline calc)와 도킹 간격/열 step 이 같은
    // 배수를 탄다. 컨테이너에 변수 주입(JS 가 진실원).
    const scale = resolveTopologyUiScale(
      typeof window === 'undefined' ? 0 : window.innerWidth,
    );
    if (lastAppliedTopologyUiScaleRef.current !== scale) {
      lastAppliedTopologyUiScaleRef.current = scale;
      container.dataset.topologyUiScale = String(scale);
      container.style.setProperty('--topology-card-scale', String(scale));
      container.style.setProperty(
        '--topology-anchor-card-max-width',
        `${
          BASE_ANCHOR_CARD_MAX_WIDTH_PX +
          (scale - 1) * ANCHOR_CARD_MAX_WIDTH_SCALE_STEP_PX
        }px`,
      );
      for (const tier of [0, 1, 2, 3] as const) {
        container.style.setProperty(
          TIER_CARD_MAX_WIDTH_TOKEN[tier],
          `${
            TIER_CARD_MAX_WIDTH_PX[tier] +
            (scale - 1) * TIER_CARD_MAX_WIDTH_SCALE_STEP_PX[tier]
          }px`,
        );
      }
      container.style.setProperty(
        SELECTED_FOCUS_CARD_MAX_WIDTH_TOKEN,
        `${
          SELECTED_FOCUS_CARD_MAX_WIDTH_PX +
          (scale - 1) * ANCHOR_CARD_MAX_WIDTH_SCALE_STEP_PX
        }px`,
      );
      container.style.setProperty(
        HEALTH_REPAIR_CARD_MAX_WIDTH_TOKEN,
        `${
          HEALTH_REPAIR_CARD_MAX_WIDTH_PX +
          (scale - 1) * ANCHOR_CARD_MAX_WIDTH_SCALE_STEP_PX
        }px`,
      );
      container.dataset.topologyUiScaleWritePolicy = 'write-on-scale-change';
    } else {
      container.dataset.topologyUiScaleWritePolicy = 'reuse-stable-scale';
    }
    const dockGap = 56 * scale;
    const columnStep = COLUMN_STEP_PX * scale;
    const domWriteStats: SkeletonDomWriteStats = { applied: 0, skipped: 0 };
    const cardPlacementFrameRectCache = new Map<HTMLElement, ConnectorRect>();
    let cardPlacementFrameRectCacheHitCount = 0;
    let cardPlacementFrameRectDirectReadCount = 0;
    const seedCardPlacementFrameRect = (el: HTMLElement, rect: ConnectorRect) => {
      cardPlacementFrameRectCache.set(el, rect);
      return rect;
    };
    const readCardPlacementFrameRect = (el: HTMLElement) => {
      const cached = cardPlacementFrameRectCache.get(el);
      if (cached) {
        cardPlacementFrameRectCacheHitCount += 1;
        return cached;
      }
      cardPlacementFrameRectDirectReadCount += 1;
      const r = el.getBoundingClientRect();
      return seedCardPlacementFrameRect(el, {
        left: r.left - containerRect.left,
        top: r.top - containerRect.top,
        right: r.right - containerRect.left,
        bottom: r.bottom - containerRect.top,
      });
    };
    const cardPlacementParentRectCache = new Map<HTMLElement, ConnectorRect>();
    const cardPlacementSizeCache = cardPlacementSizeCacheRef.current;
    const cardPlacementSizeCacheSeen = new Set<string>();
    let cardPlacementParentRectReadCount = 0;
    let cardPlacementSizeReadCount = 0;
    let cardPlacementSizeCacheHitCount = 0;
    let cardPlacementSizeCacheMissCount = 0;
    const readCardPlacementParentRect = (el: HTMLElement) => {
      const cached = cardPlacementParentRectCache.get(el);
      if (cached) return cached;
      const frameRect = cardPlacementFrameRectCache.get(el);
      if (frameRect) {
        cardPlacementFrameRectCacheHitCount += 1;
        cardPlacementParentRectCache.set(el, frameRect);
        return frameRect;
      }
      cardPlacementParentRectReadCount += 1;
      const rect = el.getBoundingClientRect();
      const next = {
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        right: rect.right - containerRect.left,
        bottom: rect.bottom - containerRect.top,
      };
      cardPlacementParentRectCache.set(el, next);
      return next;
    };
    const readCardPlacementSize = (el: HTMLElement, slug: string) => {
      const key = `${el.dataset.cardLayoutSizeKey ?? ''}|scale:${scale}`;
      cardPlacementSizeCacheSeen.add(slug);
      const cached = cardPlacementSizeCache.get(slug);
      if (cached?.key === key) {
        cardPlacementSizeCacheHitCount += 1;
        return cached;
      }
      cardPlacementSizeCacheMissCount += 1;
      cardPlacementSizeReadCount += 2;
      let width = el.offsetWidth;
      let height = el.offsetHeight;
      let fallbackRect: ConnectorRect | undefined;
      if (width <= 0 || height <= 0) {
        cardPlacementFrameRectDirectReadCount += 1;
        const rect = el.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        if (rect.width > 0 && rect.height > 0) {
          fallbackRect = {
            left: rect.left - containerRect.left,
            top: rect.top - containerRect.top,
            right: rect.right - containerRect.left,
            bottom: rect.bottom - containerRect.top,
          };
        }
      }
      const next = {
        fallbackRect,
        height,
        key,
        width,
      };
      cardPlacementSizeCache.set(slug, next);
      return next;
    };
    const egoRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const phoneAnalysisPanelMounted =
      containerRect.width <= 640 && isAnalysisPanelMounted();
    const readLayerSurfaceActive =
      selectedRelationEdgeId !== null ||
      healthRepairTarget !== null ||
      phoneAnalysisPanelMounted;
    const selectedBlockingSurfaceActive =
      selectedRelationEdgeId !== null ||
      (selectedSlug !== null && isSelectedNodePopoverMounted());
    const fixedSurfaceRects =
      readLayerSurfaceActive || selectedBlockingSurfaceActive
        ? collectFixedSurfaceRects(containerRect)
        : getFixedSurfaceRects(containerRect);
    const selectedFocusRailSurfaceMounted = isSelectedFocusRailSurfaceMounted();
    const hideSelectedCardForCompactFocusRail =
      selectedFocusRailSurfaceMounted &&
      selectedRelationEdgeId === null &&
      selectedSlug !== null &&
      containerRect.width <= SELECTED_FOCUS_RAIL_CARD_HIDE_MAX_WIDTH_PX;
    container.dataset.selectedFocusCardVisibilityContract =
      'compact-rail-hides-selected-map-card';
    container.dataset.selectedFocusCardHideMaxWidthPx = String(
      SELECTED_FOCUS_RAIL_CARD_HIDE_MAX_WIDTH_PX,
    );
    container.dataset.selectedFocusCardVisibilityPolicy =
      hideSelectedCardForCompactFocusRail
        ? 'hide-selected-card'
        : selectedFocusRailSurfaceMounted
          ? 'show-selected-card'
          : 'default';
    container.dataset.selectedFocusDockBottomInsetPx = String(
      SELECTED_FOCUS_DOCK_BOTTOM_INSET_PX,
    );
    const acceptedSurfaceRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const dimEls: HTMLElement[] = [];
    const overviewEls: HTMLElement[] = [];
    const elBySlug = new Map<string, HTMLElement>();
    const isDragClusterCard = (slug: string, dockParent?: string | null) =>
      Boolean(
        activeDragCluster?.has(slug) ||
          (dockParent && activeDragCluster?.has(dockParent)),
      );
    const focusContextSilhouetteSuppressionActive =
      selectedFocusCenterActive &&
      selectedFocusCluster !== null &&
      selectedRelationEdgeId === null &&
      activeDragCluster === null &&
      !pathWorkflowActive &&
      !healthRepairTarget;
    let focusContextSilhouetteHiddenCount = 0;
    container.dataset.focusContextSilhouettePolicy =
      'click-focus-keeps-orientation-anchors-only';
    container.dataset.focusContextSilhouetteActive =
      focusContextSilhouetteSuppressionActive ? 'true' : 'false';
    const cardPlacementSetupDurationMs = Math.max(
      0,
      measureRepositionNow() - repositionStartedAt,
    );
    const orderedEls = Array.from(els).sort((a, b) => {
      const aDocked = a.dataset.dockParent ? 1 : 0;
      const bDocked = b.dataset.dockParent ? 1 : 0;
      return aDocked - bDocked;
    });
    for (const el of orderedEls) {
      const slug = el.dataset.slug;
      if (slug) elBySlug.set(slug, el);
    }
    const cardPlacementCoreLoopStartedAt = measureRepositionNow();
    for (const el of orderedEls) {
      const slug = el.dataset.slug;
      if (!slug || !graph.hasNode(slug)) continue;
      delete el.dataset.surfaceHidden;
      el.style.visibility = 'visible';
      const dockParent = el.dataset.dockParent;
      const lockedForDrag = isDragClusterCard(slug, dockParent);
      el.dataset.dragVisibilityLock = lockedForDrag ? 'true' : 'false';
      const suppressFocusContextSilhouette =
        focusContextSilhouetteSuppressionActive &&
        el.dataset.dimmed === 'true' &&
        Number(el.dataset.tier ?? '3') > 1 &&
        !lockedForDrag;
      if (suppressFocusContextSilhouette) {
        el.dataset.dimOpacityRole = 'suppressed-focus-context';
        el.dataset.dimOpacityToken = 'none';
        hideSkeletonCard(el, domWriteStats);
        focusContextSilhouetteHiddenCount += 1;
        continue;
      }
      const parentEl = dockParent ? elBySlug.get(dockParent) : undefined;
      let layoutVisibleRect: ConnectorRect | null = null;
      let flippedLayoutVisibleRect: ConnectorRect | null = null;
      if (dockParent && parentEl) {
        // px 도킹 — 부모 카드 rect 기준 고정 밀도 (줌 배율 무관). 열 간격
        // 56px, 행 pitch = 카드 높이 + 10px. 열의 중심은 부모를 따르되,
        // 전체 열이 상/하단 chrome 밖으로 잘리면 safe band 안으로 이동한다.
        // 자식이 safe 높이를 넘으면 멀티 컬럼으로 랩핑(상/하단 chrome 관통 방지).
        const p = readCardPlacementParentRect(parentEl);
        const side = el.dataset.dockSide === 'left' ? -1 : 1;
        const index = Number(el.dataset.dockIndex ?? '0');
        const total = Math.max(1, Number(el.dataset.dockTotal ?? '1'));
        const {
          fallbackRect: cardPlacementFallbackRect,
          width: cardWidth,
          height: cardHeight,
        } = readCardPlacementSize(el, slug);
        const pitch = cardHeight + 10;
        const safeH = Math.max(pitch, containerRect.height - 96 - 56);
        const perColumn = Math.max(1, Math.floor(safeH / pitch));
        const col = Math.floor(index / perColumn);
        const row = index % perColumn;
        const rowsInCol = Math.min(perColumn, total - col * perColumn);
        el.dataset.dockCol = String(col);
        const parentCenterX = (p.left + p.right) / 2;
        const safeTop = 96;
        const selectedFocusDock =
          selectedFocusCenterActive &&
          selectedRelationEdgeId === null &&
          dockParent === selectedSlug &&
          !pathWorkflowActive &&
          !healthRepairTarget;
        const dockBottomInset = selectedFocusDock
          ? SELECTED_FOCUS_DOCK_BOTTOM_INSET_PX
          : 56;
        const safeBottom = Math.max(
          safeTop + cardHeight,
          containerRect.height - dockBottomInset,
        );
        el.dataset.dockBottomInsetPx = String(dockBottomInset);
        el.dataset.selectedFocusDockBand = selectedFocusDock ? 'true' : 'false';
        delete el.dataset.selectedFocusEgoReadingBand;
        delete el.dataset.selectedFocusEgoReadingBandYRatio;
        delete el.dataset.selectedFocusCenterYRatio;
        const halfColumn = ((rowsInCol - 1) * pitch + cardHeight) / 2;
        const parentCenterY = (p.top + p.bottom) / 2;
        const dockSnapshot = slug
          ? dragRef.current?.dockDragSnapshots.get(slug) ??
            activeDockDragSnapshotsRef.current.get(slug)
          : undefined;
        const followsActiveDrag =
          Boolean(dockSnapshot && dockSnapshot.parentSlug === dockParent) &&
          Boolean(
            (dragRef.current && dragRef.current.travel > 4) ||
              (dockParent && activeDragCluster?.has(dockParent)),
          );
        el.dataset.dockDragFollow = followsActiveDrag ? 'true' : 'false';
        const x = followsActiveDrag && dockSnapshot
          ? dockSnapshot.childStartX + parentCenterX - dockSnapshot.parentStartX
          : side === 1
            ? p.right + dockGap + col * columnStep
            : p.left - dockGap - col * columnStep;
        const columnCenterY = followsActiveDrag && dockSnapshot
          ? dockSnapshot.childStartY + parentCenterY - dockSnapshot.parentStartY
          : Math.min(
              Math.max(parentCenterY, safeTop + halfColumn),
              safeBottom - halfColumn,
            );
        const y = followsActiveDrag
          ? columnCenterY
          : columnCenterY + (row - (rowsInCol - 1) / 2) * pitch;
        el.dataset.layoutY = String(y);
        if (followsActiveDrag && dockSnapshot) {
          el.dataset.dockParentDeltaY = String(parentCenterY - dockSnapshot.parentStartY);
        } else {
          delete el.dataset.dockParentDeltaY;
        }
        const dockAnchorKey = side === 1 ? 'left' : 'right';
        const anchor = ANCHOR_TRANSLATE[dockAnchorKey];
        const flippedSide = side === 1 ? -1 : 1;
        const flippedAnchorKey = flippedSide === 1 ? 'left' : 'right';
        const flippedX =
          flippedSide === 1
            ? p.right + dockGap + col * columnStep
            : p.left - dockGap - col * columnStep;
        const flippedAnchor = ANCHOR_TRANSLATE[flippedAnchorKey];
        el.dataset.dockFlipTransform = `${flippedAnchor} translate3d(${flippedX}px, ${y}px, 0)`;
        setSkeletonStyleValue(
          el,
          'transform',
          `${anchor} translate3d(${x}px, ${y}px, 0)`,
          domWriteStats,
        );
        layoutVisibleRect = seedCardPlacementFrameRect(
          el,
          cardPlacementFallbackRect ??
            anchoredCardRect({
              x,
              y,
              width: cardWidth,
              height: cardHeight,
              anchor: dockAnchorKey,
            }),
        );
        flippedLayoutVisibleRect = anchoredCardRect({
          x: flippedX,
          y,
          width: cardWidth,
          height: cardHeight,
          anchor: flippedAnchorKey,
        });
      } else {
        delete el.dataset.dockDragFollow;
        delete el.dataset.dockParentDeltaY;
        delete el.dataset.dockFlipTransform;
        const attrs = graph.getNodeAttributes(slug);
        const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
        const anchorKey = el.dataset.anchor as SkeletonCardModel['anchor'];
        const safeAnchorKey = anchorKey && ANCHOR_TRANSLATE[anchorKey] ? anchorKey : 'center';
        const followsActiveGraphDrag = activeDragCluster?.has(slug) === true;
        const {
          fallbackRect: cardPlacementFallbackRect,
          width: cardWidth,
          height: cardHeight,
        } = readCardPlacementSize(el, slug);
        const graphAnchorRect = anchoredCardRect({
          x: vp.x,
          y: vp.y,
          width: cardWidth,
          height: cardHeight,
          anchor: safeAnchorKey,
        });
        const graphAnchorBlockedBySurface = fixedSurfaceRects.some((surface) =>
          rectsOverlap(graphAnchorRect, surface),
        );
        el.dataset.graphAnchorSurfaceBlocked = graphAnchorBlockedBySurface
          ? 'true'
          : 'false';
        const selectedFocusViewportCenter =
          selectedSlug === slug &&
          selectedFocusCenterActive &&
          selectedRelationEdgeId === null &&
          !pathWorkflowActive &&
          !healthRepairTarget &&
          !followsActiveGraphDrag &&
          containerRect.width > SELECTED_FOCUS_RAIL_CARD_HIDE_MAX_WIDTH_PX;
        const selectedFocusEgoBand =
          selectedFocusCenterActive &&
          selectedRelationEdgeId === null &&
          !pathWorkflowActive &&
          !healthRepairTarget &&
          !followsActiveGraphDrag &&
          ego?.slugs.has(slug) === true;
        const clamped =
          selectedFocusViewportCenter
            ? {
                x: containerRect.width / 2,
                y:
                  containerRect.height *
                  SELECTED_FOCUS_VIEWPORT_READING_CENTER_Y_RATIO,
              }
            : !followsActiveGraphDrag && ego?.slugs.has(slug)
            ? clampVisibleAnchorCard({
                x: vp.x,
                y: vp.y,
                width: cardWidth,
                height: cardHeight,
                anchor: safeAnchorKey,
                containerWidth: containerRect.width,
                containerHeight: containerRect.height,
                fixedSurfaceRects,
              })
            : vp;
        if (selectedFocusEgoBand && !selectedFocusViewportCenter) {
          clamped.y = Math.min(
            clamped.y,
            containerRect.height * SELECTED_FOCUS_EGO_READING_BAND_Y_RATIO,
          );
        }
        el.dataset.selectedFocusCenterPolicy = selectedFocusViewportCenter
          ? 'viewport-center-anchor'
          : 'default';
        el.dataset.selectedFocusEgoReadingBand = selectedFocusEgoBand ? 'true' : 'false';
        if (selectedFocusEgoBand) {
          el.dataset.selectedFocusEgoReadingBandYRatio = String(
            SELECTED_FOCUS_EGO_READING_BAND_Y_RATIO,
          );
        } else {
          delete el.dataset.selectedFocusEgoReadingBandYRatio;
        }
        if (selectedFocusViewportCenter) {
          el.dataset.selectedFocusCenterYRatio = String(
            SELECTED_FOCUS_VIEWPORT_READING_CENTER_Y_RATIO,
          );
        } else {
          delete el.dataset.selectedFocusCenterYRatio;
        }
        const anchor = ANCHOR_TRANSLATE[safeAnchorKey];
        el.dataset.layoutY = String(clamped.y);
        setSkeletonStyleValue(
          el,
          'transform',
          `${anchor} translate3d(${clamped.x}px, ${clamped.y}px, 0)`,
          domWriteStats,
        );
        layoutVisibleRect = seedCardPlacementFrameRect(
          el,
          cardPlacementFallbackRect ??
            anchoredCardRect({
              x: clamped.x,
              y: clamped.y,
              width: cardWidth,
              height: cardHeight,
              anchor: safeAnchorKey,
            }),
        );
      }
      if (el.dataset.dimmed === 'true') {
        dimEls.push(el);
      } else {
        let visibleRect = layoutVisibleRect ?? readCardPlacementFrameRect(el);
        let rect = expandConnectorRect(visibleRect, COLLISION_PAD);
        const surfaceBlockers =
          ego !== null && dockParent
            ? [...fixedSurfaceRects, ...acceptedSurfaceRects]
            : fixedSurfaceRects;
        const followsActiveDockDrag = el.dataset.dockDragFollow === 'true';
        const selected = el.dataset.selected === 'true';
        const pathEndpoint =
          el.dataset.pathRole === 'source' || el.dataset.pathRole === 'target';
        let clipped =
          visibleRect.left < 0 ||
          visibleRect.top < 0 ||
          visibleRect.right > containerRect.width ||
          visibleRect.bottom > containerRect.height;
        let blockedBySurface =
          !lockedForDrag &&
          !followsActiveDockDrag &&
          (surfaceBlockers.some((surface) => rectsOverlap(rect, surface)) ||
            (selected &&
              !pathEndpoint &&
              el.dataset.graphAnchorSurfaceBlocked === 'true'));
        if (
          dockParent &&
          !lockedForDrag &&
          !followsActiveDockDrag &&
          (clipped || blockedBySurface)
        ) {
          const flipTransform = el.dataset.dockFlipTransform;
          if (flipTransform) {
            const originalTransform = el.style.transform;
            setSkeletonStyleValue(el, 'transform', flipTransform, domWriteStats);
            const flippedVisibleRect = seedCardPlacementFrameRect(
              el,
              flippedLayoutVisibleRect ?? readCardPlacementFrameRect(el),
            );
            const flippedRect = expandConnectorRect(flippedVisibleRect, COLLISION_PAD);
            const flippedClipped =
              flippedVisibleRect.left < 0 ||
              flippedVisibleRect.top < 0 ||
              flippedVisibleRect.right > containerRect.width ||
              flippedVisibleRect.bottom > containerRect.height;
            const flippedBlocked = surfaceBlockers.some((surface) =>
              rectsOverlap(flippedRect, surface),
            );
            if (!flippedClipped && !flippedBlocked) {
              visibleRect = flippedVisibleRect;
              rect = flippedRect;
              clipped = false;
              blockedBySurface = false;
              el.dataset.dockFlipped = 'true';
            } else {
              delete el.dataset.dockFlipped;
              setSkeletonStyleValue(el, 'transform', originalTransform, domWriteStats);
              hideSkeletonCard(el, domWriteStats);
              continue;
            }
          } else {
            delete el.dataset.dockFlipped;
            hideSkeletonCard(el, domWriteStats);
            continue;
          }
        } else {
          delete el.dataset.dockFlipped;
        }
        if (
          hideSelectedCardForCompactFocusRail &&
          selected &&
          !pathEndpoint &&
          !lockedForDrag
        ) {
          hideSkeletonCard(el, domWriteStats);
          continue;
        }
        const protectSelectedCard =
          (selected || pathEndpoint) && selectedRelationEdgeId === null;
        if (
          !lockedForDrag &&
          (blockedBySurface || (!protectSelectedCard && clipped))
        ) {
          hideSkeletonCard(el, domWriteStats);
          continue;
        }
        showSkeletonCard(el, '1', domWriteStats);
        overviewEls.push(el);
        egoRects.push(rect);
        acceptedSurfaceRects.push(rect);
      }
    }
    const cardPlacementCoreLoopDurationMs = Math.max(
      0,
      measureRepositionNow() - cardPlacementCoreLoopStartedAt,
    );
    const cardPlacementOverviewCollisionStartedAt = measureRepositionNow();
    // Overview 에서는 모든 카드가 풀 잉크라 가까운 landmark 끼리 텍스트가
    // 부딪힐 수 있다. 상위 anchor(project/domain)를 우선 보존하고, 충돌하는
    // 하위 capability/element 칩은 숨겨 지형의 읽기 순서를 지킨다.
    if (!ego) {
      const accepted: Array<{ left: number; top: number; right: number; bottom: number }> =
        [];
      const overviewCollisionRank = (el: HTMLElement) => {
        const tier = Number(el.dataset.tier ?? '3');
        // Overview evidence landmark: keep the proof leaf after project/domain,
        // but before capability chips so the map visibly reaches implementation.
        if (tier === 3 && !el.dataset.dockParent) return 1.5;
        return tier;
      };
      const ordered = overviewEls.slice().sort((a, b) => {
        const rankA = overviewCollisionRank(a);
        const rankB = overviewCollisionRank(b);
        if (rankA !== rankB) return rankA - rankB;
        return Number(a.dataset.layoutY ?? 0) - Number(b.dataset.layoutY ?? 0);
      });
      for (const el of ordered) {
        const selected = el.dataset.selected === 'true';
        const rect = readCardPlacementFrameRect(el);
        const clipped =
          rect.left < 0 ||
          rect.top < 0 ||
          rect.right > containerRect.width ||
          rect.bottom > containerRect.height;
        const blockedByFixedSurface = fixedSurfaceRects.some((surface) =>
          rectsOverlap(rect, surface),
        );
        const lockedForOverviewDrag = isDragClusterCard(
          el.dataset.slug ?? '',
          el.dataset.dockParent,
        );
        const protectSelectedCard = selected && selectedRelationEdgeId === null;
        if (
          !lockedForOverviewDrag &&
          (blockedByFixedSurface ||
            (!protectSelectedCard &&
              (clipped ||
                accepted.some((kept) =>
                  rectsOverlap(rect, kept, OVERVIEW_COLLISION_PAD),
                ))))
        ) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }
        el.style.visibility = 'visible';
        el.style.opacity = OVERVIEW_CONTEXT_OPACITY[
          Number(el.dataset.tier ?? '3') as SkeletonCardModel['tier']
        ] ?? OVERVIEW_CONTEXT_OPACITY[3];
        accepted.push(rect);
      }
    }
    const cardPlacementOverviewCollisionDurationMs = Math.max(
      0,
      measureRepositionNow() - cardPlacementOverviewCollisionStartedAt,
    );
    const cardPlacementDimPassStartedAt = measureRepositionNow();
    // pass 2 — dim 카드: 펼친 열과 겹치면 0(충돌 금지), 아니면 tier 별 dim.
    // 고정 HUD/범례와 겹치는 dim 카드도 0 — 선택 상태에서 배경 landmark 가
    // 패널 밑으로 비쳐 보이면 지형의 깊이감보다 UI 충돌이 먼저 읽힌다.
    // 레이아웃 전환 창 동안은 직전 판정을 동결 — 슬라이드 경로 위 dim 카드가
    // 0↔dim 을 페이드로 반복하는 펌핑 방지 (창 종료 후 afterRender 가 재판정).
    const animating =
      container.dataset.layoutAnimate === 'true' &&
      activeDragCluster === null &&
      selectedRelationEdgeId === null;
    const acceptedDimRects = [...egoRects];
    const orderedDimEls = dimEls.slice().sort((a, b) => {
      const tierA = Number(a.dataset.tier ?? '3');
      const tierB = Number(b.dataset.tier ?? '3');
      return tierA - tierB;
    });
    for (const el of orderedDimEls) {
      const slug = el.dataset.slug ?? '';
      const lockedForDrag = isDragClusterCard(slug, el.dataset.dockParent);
      let rect: { left: number; top: number; right: number; bottom: number } | null = null;
      let collides: boolean;
      const tier = Number(el.dataset.tier ?? '3');
      if (focusContextSilhouetteSuppressionActive && tier > 1 && !lockedForDrag) {
        el.dataset.dimOpacityRole = 'suppressed-focus-context';
        el.dataset.dimOpacityToken = 'none';
        hideSkeletonCard(el, domWriteStats);
        focusContextSilhouetteHiddenCount += 1;
        continue;
      }
      if (lockedForDrag) {
        collides = false;
      } else {
        rect = readCardPlacementFrameRect(el);
        const clipped =
          rect.left < 0 ||
          rect.top < 0 ||
          rect.right > containerRect.width ||
          rect.bottom > containerRect.height;
        if (animating && collisionFreezeRef.current.has(slug)) {
          collides = clipped || collisionFreezeRef.current.get(slug)!;
        } else {
          collides =
            clipped ||
            acceptedDimRects.some((e) => rectsOverlap(rect!, e)) ||
            fixedSurfaceRects.some((surface) => rectsOverlap(rect!, surface));
          collisionFreezeRef.current.set(slug, collides);
        }
      }
      if (collides) {
        hideSkeletonCard(el, domWriteStats);
      } else {
        const dimOpacity =
          el.dataset.tier === '0' || el.dataset.tier === '1'
            ? DIM_ANCHOR_OPACITY
            : DIM_CHIP_OPACITY;
        el.dataset.dimOpacityRole =
          el.dataset.tier === '0' || el.dataset.tier === '1'
            ? 'orientation-anchor'
            : 'context-silhouette';
        el.dataset.dimOpacityToken =
          el.dataset.dimOpacityRole === 'orientation-anchor'
            ? DIM_ANCHOR_OPACITY_TOKEN
            : DIM_CHIP_OPACITY_TOKEN;
        setSkeletonStyleValue(el, 'opacity', lockedForDrag ? '1' : dimOpacity, domWriteStats);
        setSkeletonStyleValue(el, 'visibility', 'visible', domWriteStats);
        setSkeletonStyleValue(el, 'pointerEvents', lockedForDrag ? '' : 'none', domWriteStats);
        if (rect) acceptedDimRects.push(rect);
      }
    }
    const cardPlacementDimPassDurationMs = Math.max(
      0,
      measureRepositionNow() - cardPlacementDimPassStartedAt,
    );
    container.dataset.cardPlacementDimRectReadPolicy =
      'reuse-pass1-card-placement-frame-rects';
    container.dataset.focusContextSilhouetteHiddenCount = String(
      focusContextSilhouetteHiddenCount,
    );
    container.dataset.cardPlacementParentRectCacheContract =
      'frame-local-parent-card-rects';
    container.dataset.cardPlacementParentRectCacheSize = String(
      cardPlacementParentRectCache.size,
    );
    container.dataset.cardPlacementParentRectReadCount = String(
      cardPlacementParentRectReadCount,
    );
    container.dataset.cardPlacementSizeReadCount = String(cardPlacementSizeReadCount);
    container.dataset.cardPlacementLayoutRectContract =
      'computed-from-transform-and-size';
    container.dataset.cardPlacementSizeCacheContract =
      'stable-card-size-key-reuses-offset-dimensions';
    container.dataset.cardPlacementSizeCacheHitCount = String(
      cardPlacementSizeCacheHitCount,
    );
    container.dataset.cardPlacementSizeCacheMissCount = String(
      cardPlacementSizeCacheMissCount,
    );
    for (const slug of cardPlacementSizeCache.keys()) {
      if (!cardPlacementSizeCacheSeen.has(slug)) {
        cardPlacementSizeCache.delete(slug);
      }
    }
    container.dataset.cardPlacementSizeCacheSize = String(cardPlacementSizeCache.size);
    const cardPlacementReadLayerStartedAt = measureRepositionNow();
    if (readLayerSurfaceActive) {
      for (const el of orderedEls) {
        if (el.dataset.surfaceHidden === 'true') continue;
        const style = getComputedStyle(el);
        if (
          style.visibility === 'hidden' ||
          Number(style.opacity || el.style.opacity || '1') <= 0.01
        ) {
          continue;
        }
        const r = el.getBoundingClientRect();
        const rect = {
          left: r.left - containerRect.left - COLLISION_PAD,
          top: r.top - containerRect.top - COLLISION_PAD,
          right: r.right - containerRect.left + COLLISION_PAD,
          bottom: r.bottom - containerRect.top + COLLISION_PAD,
        };
        if (fixedSurfaceRects.some((surface) => rectsOverlap(rect, surface))) {
          hideSkeletonCard(el, domWriteStats);
        }
      }
    }
    const cardPlacementReadLayerDurationMs = Math.max(
      0,
      measureRepositionNow() - cardPlacementReadLayerStartedAt,
    );
    const cardPlacementPathEndpointStartedAt = measureRepositionNow();
    const pathEndpointPostprocessActive =
      selectedRelationEdgeId === null &&
      orderedEls.some(
        (el) => el.dataset.pathRole === 'source' || el.dataset.pathRole === 'target',
      );
    container.dataset.pathEndpointPostprocessContract =
      'skip-unless-source-or-target-visible';
    container.dataset.pathEndpointPostprocessPolicy =
      pathEndpointPostprocessActive ? 'run-path-endpoints' : 'skip-no-path-endpoints';
    if (pathEndpointPostprocessActive) {
      restorePathEndpointsFromFixedSurfaces(
        orderedEls,
        containerRect,
        fixedSurfaceRects,
        domWriteStats,
      );
      for (const el of orderedEls) {
        if (el.dataset.pathRole !== 'source' && el.dataset.pathRole !== 'target') {
          continue;
        }
        if (el.dataset.surfaceHidden === 'true') {
          continue;
        }
        const endpointBox = el.getBoundingClientRect();
        const endpointRect = {
          left: endpointBox.left - containerRect.left,
          top: endpointBox.top - containerRect.top,
          right: endpointBox.right - containerRect.left,
          bottom: endpointBox.bottom - containerRect.top,
        };
        if (fixedSurfaceRects.some((surface) => rectsOverlap(endpointRect, surface))) {
          showSkeletonCard(el, '1', domWriteStats);
          continue;
        }
        for (const other of orderedEls) {
          if (other === el || other.dataset.surfaceHidden === 'true') continue;
          if (other.dataset.pathRole === 'source' || other.dataset.pathRole === 'target') {
            continue;
          }
          const otherBox = other.getBoundingClientRect();
          const otherRect = {
            left: otherBox.left - containerRect.left,
            top: otherBox.top - containerRect.top,
            right: otherBox.right - containerRect.left,
            bottom: otherBox.bottom - containerRect.top,
          };
          if (rectsOverlap(endpointRect, otherRect)) {
            hideSkeletonCard(other, domWriteStats);
          }
        }
        showSkeletonCard(el, '1', domWriteStats);
      }
      separatePathEndpointCards(orderedEls, containerRect, fixedSurfaceRects);
      restorePathEndpointsFromFixedSurfaces(
        orderedEls,
        containerRect,
        fixedSurfaceRects,
        domWriteStats,
      );
      suppressCardsOverlappingPathEndpoints(orderedEls, containerRect);
    }
    const cardPlacementPathEndpointDurationMs = Math.max(
      0,
      measureRepositionNow() - cardPlacementPathEndpointStartedAt,
    );
    const cardPlacementOverviewDomainStartedAt = measureRepositionNow();
    const projectOverviewDomainSeparationActive = Boolean(
      selectedRelationEdgeId === null &&
        !pathWorkflowActive &&
        (!ego ||
          cards.some((card) => {
            const resolved = resolveNodeId(card.id);
            return (
              resolved === ego.selected &&
              (card.kind === 'project' || card.tier === 0)
            );
          })),
    );
    container.dataset.overviewDomainSeparationContract =
      'project-overview-domain-labels-do-not-overlap';
    container.dataset.overviewDomainRectReadPolicy =
      'reuse-pass1-card-placement-frame-rects';
    container.dataset.overviewDomainSeparationActive =
      projectOverviewDomainSeparationActive ? 'true' : 'false';
    const overviewDomainSeparatedCount = projectOverviewDomainSeparationActive
      ? separateOverviewDomainCards(
          orderedEls,
          containerRect,
          fixedSurfaceRects,
          readCardPlacementFrameRect,
        )
      : 0;
    container.dataset.overviewDomainSeparatedCount = String(
      overviewDomainSeparatedCount,
    );
    const cardPlacementOverviewDomainDurationMs = Math.max(
      0,
      measureRepositionNow() - cardPlacementOverviewDomainStartedAt,
    );
    const cardPlacementFixedRestoreStartedAt = measureRepositionNow();
    const fixedSurfaceRestoredCount = restoreVisibleCardsFromFixedSurfaces(
      orderedEls,
      containerRect,
      fixedSurfaceRects,
      domWriteStats,
      selectedBlockingSurfaceActive ? undefined : readCardPlacementFrameRect,
      (el, rect) => {
        cardPlacementFrameRectCache.set(el, rect);
      },
    );
    container.dataset.fixedSurfaceRestoreContract =
      'visible-cards-shift-or-hide-after-drag-release';
    container.dataset.fixedSurfaceRestoreReadPolicy =
      'reuse-card-placement-frame-rects';
    container.dataset.fixedSurfaceRestoredCount = String(fixedSurfaceRestoredCount);
    const cardPlacementFixedRestoreDurationMs = Math.max(
      0,
      measureRepositionNow() - cardPlacementFixedRestoreStartedAt,
    );
    const cardPlacementDurationMs = Math.max(
      0,
      measureRepositionNow() - repositionStartedAt,
    );
    const cardPlacementSubphases = [
      ['setup', cardPlacementSetupDurationMs],
      ['core-loop', cardPlacementCoreLoopDurationMs],
      ['overview-collision', cardPlacementOverviewCollisionDurationMs],
      ['dim-pass', cardPlacementDimPassDurationMs],
      ['read-layer', cardPlacementReadLayerDurationMs],
      ['path-endpoint', cardPlacementPathEndpointDurationMs],
      ['overview-domain', cardPlacementOverviewDomainDurationMs],
      ['fixed-restore', cardPlacementFixedRestoreDurationMs],
    ] as const;
    const [cardPlacementSlowestSubphase, cardPlacementSlowestSubphaseMs] =
      cardPlacementSubphases.reduce(
        (slowest, current) => (current[1] > slowest[1] ? current : slowest),
        cardPlacementSubphases[0],
      );
    container.dataset.cardPlacementSubphaseContract = 'phase-breakdown';
    container.dataset.cardPlacementSubphaseSetupMs =
      cardPlacementSetupDurationMs.toFixed(2);
    container.dataset.cardPlacementSubphaseCoreLoopMs =
      cardPlacementCoreLoopDurationMs.toFixed(2);
    container.dataset.cardPlacementSubphaseOverviewCollisionMs =
      cardPlacementOverviewCollisionDurationMs.toFixed(2);
    container.dataset.cardPlacementSubphaseDimPassMs =
      cardPlacementDimPassDurationMs.toFixed(2);
    container.dataset.cardPlacementSubphaseReadLayerMs =
      cardPlacementReadLayerDurationMs.toFixed(2);
    container.dataset.cardPlacementSubphasePathEndpointMs =
      cardPlacementPathEndpointDurationMs.toFixed(2);
    container.dataset.cardPlacementSubphaseOverviewDomainMs =
      cardPlacementOverviewDomainDurationMs.toFixed(2);
    container.dataset.cardPlacementSubphaseFixedRestoreMs =
      cardPlacementFixedRestoreDurationMs.toFixed(2);
    container.dataset.cardPlacementSlowestSubphase = cardPlacementSlowestSubphase;
    container.dataset.cardPlacementSlowestSubphaseMs =
      cardPlacementSlowestSubphaseMs.toFixed(2);
    const visibilityCacheStartedAt = measureRepositionNow();
    const relationLabelCardBlockers: Array<{
      left: number;
      top: number;
      right: number;
      bottom: number;
    }> = [];
    const visibleCardRectCache = new Map<
      HTMLElement,
      {
        rect: { left: number; top: number; right: number; bottom: number } | null;
        visible: boolean;
      }
    >();
    let visibleCardRectReadCount = 0;
    let visibleCardHiddenRectSkipCount = 0;
    const visibleCardStateReadPolicy =
      activeDragCluster !== null
        ? 'frame-state-during-drag'
        : 'frame-state-after-placement';
    const visibilityFixedSurfaceKey = fixedSurfaceRects
      .map(
        (rect) =>
          `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(
            rect.right,
          )}:${Math.round(rect.bottom)}`,
      )
      .join('|');
    const visibilityOrderedKey = orderedEls
      .map(
        (el) =>
          `${el.dataset.slug ?? ''}:${el.dataset.selected ?? ''}:${
            el.dataset.surfaceHidden ?? ''
          }:${el.dataset.graphAnchorSurfaceBlocked ?? ''}`,
      )
      .join('|');
    const visibilityGeometryKey = orderedEls
      .map((el) => {
        const rect = cardPlacementFrameRectCache.get(el);
        if (!rect) return 'none';
        return `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(
          rect.right,
        )}:${Math.round(rect.bottom)}`;
      })
      .join('|');
    const readVisibleCardRect = (el: HTMLElement) => {
      const cached = visibleCardRectCache.get(el);
      if (cached) return cached;
      const visible = isSkeletonCardVisibleFromFrameState(el);
      if (!visible) {
        visibleCardHiddenRectSkipCount += 1;
        const next = { rect: null, visible };
        visibleCardRectCache.set(el, next);
        return next;
      }
      const seededRect = selectedBlockingSurfaceActive
        ? undefined
        : cardPlacementFrameRectCache.get(el);
      if (seededRect) {
        cardPlacementFrameRectCacheHitCount += 1;
        const next = {
          rect: seededRect,
          visible,
        };
        visibleCardRectCache.set(el, next);
        return next;
      }
      visibleCardRectReadCount += 1;
      const rect = el.getBoundingClientRect();
      const next = {
        rect: {
          left: rect.left - containerRect.left,
          top: rect.top - containerRect.top,
          right: rect.right - containerRect.left,
          bottom: rect.bottom - containerRect.top,
        },
        visible,
      };
      visibleCardRectCache.set(el, next);
      return next;
    };
    const selectedFocusOverlapSuppressionActive =
      (selectedBlockingSurfaceActive ||
        selectedFocusRailSurfaceMounted ||
        (selectedFocusCenterActive && selectedFocusCluster !== null)) &&
      activeDragCluster === null;
    const cachedVisibilityFrame = visibilityFrameSnapshotRef.current;
    const canReuseVisibilityFrame =
      activeDragCluster === null &&
      !activeDragMotion &&
      !readLayerSurfaceActive &&
      !selectedBlockingSurfaceActive &&
      !pathWorkflowActive &&
      containerRect.width >= RELATION_LABEL_PHONE_BREAKPOINT_PX &&
      cachedVisibilityFrame !== null &&
      cachedVisibilityFrame.width === containerRect.width &&
      cachedVisibilityFrame.height === containerRect.height &&
      cachedVisibilityFrame.fixedSurfaceKey === visibilityFixedSurfaceKey &&
      cachedVisibilityFrame.geometryKey === visibilityGeometryKey &&
      cachedVisibilityFrame.orderedKey === visibilityOrderedKey &&
      cachedVisibilityFrame.visibleCardStateReadPolicy === visibleCardStateReadPolicy &&
      orderedEls.every((el) => cachedVisibilityFrame.entries.has(el));
    let visibilityFrameCacheState = 'miss';
    let supportRailOverlapHiddenCount = 0;
    let dragSettleOverlapHiddenCount = 0;
    let reportedVisibleCardCount = 0;
    let visibilityCountSource = 'single-pass';
    if (canReuseVisibilityFrame && cachedVisibilityFrame) {
      visibilityFrameCacheState = 'hit';
      for (const el of orderedEls) {
        const entry = cachedVisibilityFrame.entries.get(el);
        if (entry) visibleCardRectCache.set(el, entry);
      }
      relationLabelCardBlockers.push(...cachedVisibilityFrame.blockers);
      reportedVisibleCardCount = cachedVisibilityFrame.visibleCount;
      visibilityCountSource = cachedVisibilityFrame.visibilityCountSource;
      supportRailOverlapHiddenCount =
        cachedVisibilityFrame.supportRailOverlapHiddenCount;
    } else {
      visibilityFrameSnapshotRef.current = null;
      supportRailOverlapHiddenCount =
        selectedFocusOverlapSuppressionActive
          ? suppressVisibleCardOverlaps(orderedEls, readVisibleCardRect)
          : 0;
      if (supportRailOverlapHiddenCount > 0) {
        visibleCardRectCache.clear();
      }
    }
    container.dataset.supportRailOverlapPolicy =
      'selected-inspector-or-focus-cluster-hides-overlapping-map-cards';
    container.dataset.supportRailOverlapReadPolicy = 'reuse-visible-card-rect-cache';
    container.dataset.supportRailOverlapActive =
      selectedFocusOverlapSuppressionActive ? 'true' : 'false';
    container.dataset.selectedBlockingSurfaceOverlapContract =
      'selected-node-or-relation-surface-hides-lower-priority-card-overlaps';
    container.dataset.selectedBlockingSurfaceOverlapActive =
      selectedBlockingSurfaceActive ? 'true' : 'false';
    container.dataset.supportRailOverlapHiddenCount = String(
      supportRailOverlapHiddenCount,
    );
    if (visibilityFrameCacheState !== 'hit') {
      dragSettleOverlapHiddenCount =
        activeDragCluster !== null && !activeDragMotion
          ? suppressSettlingDragCardOverlaps(orderedEls, readVisibleCardRect)
          : 0;
    }
    container.dataset.dragSettleOverlapPolicy =
      'released-cluster-hides-lower-priority-overlaps';
    container.dataset.dragSettleOverlapReadPolicy = 'reuse-visible-card-rect-cache';
    container.dataset.dragSettleOverlapHiddenCount = String(
      dragSettleOverlapHiddenCount,
    );
    const recordRelationLabelCardBlocker = (el: HTMLElement) => {
      const next = readVisibleCardRect(el);
      if (!next.visible || !next.rect) return false;
      relationLabelCardBlockers.push(next.rect);
      return true;
    };
    container.dataset.visibilityFallbackSurfaceContract = 'restore-clear-or-shifted-landmark';
    let visibleCardCount = reportedVisibleCardCount;
    if (visibilityFrameCacheState !== 'hit') {
      visibleCardCount = 0;
      for (const el of orderedEls) {
        if (recordRelationLabelCardBlocker(el)) {
          visibleCardCount += 1;
        }
      }
      reportedVisibleCardCount = visibleCardCount;
    }
    if (
      visibilityFrameCacheState !== 'hit' &&
      visibleCardCount === 0 &&
      orderedEls.length > 0
    ) {
      let restored = 0;
      for (const el of orderedEls) {
        const tier = Number(el.dataset.tier ?? '3');
        if (tier > 1) continue;
        if (
          el.dataset.selected === 'true' &&
          el.dataset.graphAnchorSurfaceBlocked === 'true'
        ) {
          continue;
        }
        if (!isElementInsideContainerViewport(el, containerRect)) continue;
        if (!isElementClearOfFixedSurfaces(el, containerRect, fixedSurfaceRects)) continue;
        showSkeletonCard(el, '1', domWriteStats);
        restored += 1;
      }
      if (restored === 0) {
        const first = orderedEls.find(
          (el) =>
            (el.dataset.selected !== 'true' ||
              el.dataset.graphAnchorSurfaceBlocked !== 'true') &&
            isElementInsideContainerViewport(el, containerRect),
        );
        if (first) {
          let fallbackClear = true;
          if (!isElementClearOfFixedSurfaces(first, containerRect, fixedSurfaceRects)) {
            const rect = elementRectRelativeToContainer(first, containerRect);
            let shift = clampRectToViewportAndFixedSurfaces({
              rect,
              containerWidth: containerRect.width,
              containerHeight: containerRect.height,
              fixedSurfaceRects,
            });
            if (readLayerSurfaceActive) {
              const blocker = fixedSurfaceRects.find((surface) =>
                rectsOverlap(shift.rect, surface),
              );
              if (blocker) {
                const belowDy = blocker.bottom + FIXED_SURFACE_GAP - rect.top;
                const below = {
                  left: rect.left,
                  top: rect.top + belowDy,
                  right: rect.right,
                  bottom: rect.bottom + belowDy,
                };
                const belowFits =
                  below.bottom <= containerRect.height - SAFE_VIEWPORT_MARGIN &&
                  !fixedSurfaceRects.some((surface) => rectsOverlap(below, surface));
                const aboveDy = blocker.top - FIXED_SURFACE_GAP - rect.bottom;
                const above = {
                  left: rect.left,
                  top: rect.top + aboveDy,
                  right: rect.right,
                  bottom: rect.bottom + aboveDy,
                };
                const aboveFits =
                  above.top >= SAFE_VIEWPORT_MARGIN &&
                  !fixedSurfaceRects.some((surface) => rectsOverlap(above, surface));
                if (belowFits) {
                  shift = { dx: 0, dy: belowDy, rect: below };
                } else if (aboveFits) {
                  shift = { dx: 0, dy: aboveDy, rect: above };
                } else {
                  const rectWidth = rect.right - rect.left;
                  const rectHeight = rect.bottom - rect.top;
                  const fallbackY = Math.min(
                    containerRect.height - SAFE_VIEWPORT_MARGIN - rectHeight / 2,
                    blocker.bottom + FIXED_SURFACE_GAP + rectHeight / 2,
                  );
                  const fallbackX = Math.min(
                    containerRect.width - SAFE_VIEWPORT_MARGIN - rectWidth / 2,
                    Math.max(SAFE_VIEWPORT_MARGIN + rectWidth / 2, containerRect.width / 2),
                  );
                  const fallbackRect = {
                    left: fallbackX - rectWidth / 2,
                    top: fallbackY - rectHeight / 2,
                    right: fallbackX + rectWidth / 2,
                    bottom: fallbackY + rectHeight / 2,
                  };
                  if (!fixedSurfaceRects.some((surface) => rectsOverlap(fallbackRect, surface))) {
                    setSkeletonStyleValue(
                      first,
                      'transform',
                      `translate(-50%, -50%) translate3d(${fallbackX}px, ${fallbackY}px, 0)`,
                      domWriteStats,
                    );
                    first.dataset.visibilityFallbackSurfaceRestore = 'phone-read-layer-landmark';
                    shift = { dx: 0, dy: 0, rect: fallbackRect };
                  }
                }
              }
            }
            if (shift.dx !== 0 || shift.dy !== 0) {
              setSkeletonStyleValue(
                first,
                'transform',
                `${first.style.transform} translate(${shift.dx}px, ${shift.dy}px)`,
                domWriteStats,
              );
              first.dataset.visibilityFallbackSurfaceRestore = 'safe-shift';
            }
            fallbackClear = !fixedSurfaceRects.some((surface) =>
              rectsOverlap(shift.rect, surface),
            );
            if (!readLayerSurfaceActive) fallbackClear = true;
          } else {
            delete first.dataset.visibilityFallbackSurfaceRestore;
          }
          if (fallbackClear) {
            showSkeletonCard(first, '1', domWriteStats);
            restored = 1;
          } else if (readLayerSurfaceActive) {
            first.dataset.visibilityFallbackSurfaceRestore = 'phone-read-layer-landmark';
            first.dataset.readLayerSurfaceRestore = 'phone-read-layer-landmark';
            showSkeletonCard(first, '1', domWriteStats);
            restored = 1;
          } else {
            hideSkeletonCard(first, domWriteStats);
            first.dataset.visibilityFallbackSurfaceRestore = 'hidden-under-fixed-surface';
          }
        }
      }
      container.dataset.visibilityFallback = 'true';
      container.dataset.visibilityFallbackCount = String(restored);
      if (restored > 0) {
        reportedVisibleCardCount = 0;
        relationLabelCardBlockers.length = 0;
        visibleCardRectCache.clear();
        for (const el of orderedEls) {
          if (recordRelationLabelCardBlocker(el)) {
            reportedVisibleCardCount += 1;
          }
        }
        visibilityCountSource = 'fallback-recount';
      }
    } else {
      delete container.dataset.visibilityFallback;
      delete container.dataset.visibilityFallbackCount;
    }
    if (visibilityFrameCacheState !== 'hit' && readLayerSurfaceActive) {
      let readLayerClearedCount = 0;
      for (const el of orderedEls) {
        const cached = readVisibleCardRect(el);
        if (!cached.visible || !cached.rect) continue;
        const rect = cached.rect;
        const blocker = fixedSurfaceRects.find((surface) => rectsOverlap(rect, surface));
        if (!blocker) continue;
        const readLayerPanel = document.querySelector<HTMLElement>(
          '[data-testid="topology-analysis-panel"]',
        );
        const panelBox = readLayerPanel?.getBoundingClientRect();
        const panelBottom =
          panelBox && panelBox.height > 0
            ? panelBox.bottom - containerRect.top + COLLISION_PAD
            : blocker.bottom;
        const rectWidth = rect.right - rect.left;
        const rectHeight = rect.bottom - rect.top;
        const fallbackY = Math.min(
          containerRect.height - SAFE_VIEWPORT_MARGIN - rectHeight / 2,
          panelBottom + FIXED_SURFACE_GAP + rectHeight / 2,
        );
        const fallbackX = Math.min(
          containerRect.width - SAFE_VIEWPORT_MARGIN - rectWidth / 2,
          Math.max(SAFE_VIEWPORT_MARGIN + rectWidth / 2, containerRect.width / 2),
        );
        const fallbackRect = {
          left: fallbackX - rectWidth / 2,
          top: fallbackY - rectHeight / 2,
          right: fallbackX + rectWidth / 2,
          bottom: fallbackY + rectHeight / 2,
        };
        if (!fixedSurfaceRects.some((surface) => rectsOverlap(fallbackRect, surface))) {
          setSkeletonStyleValue(
            el,
            'transform',
            `translate(-50%, -50%) translate3d(${fallbackX}px, ${fallbackY}px, 0)`,
            domWriteStats,
          );
          el.dataset.readLayerSurfaceRestore = 'phone-read-layer-landmark';
        } else {
          el.dataset.readLayerSurfaceRestore = 'phone-read-layer-landmark';
          showSkeletonCard(el, '1', domWriteStats);
        }
        readLayerClearedCount += 1;
      }
      container.dataset.readLayerSurfaceClearedCount = String(readLayerClearedCount);
      container.dataset.readLayerSurfaceRestoreContract =
        'panel-owned-read-layer-clears-map-cards-after-fallback';
    } else {
      delete container.dataset.readLayerSurfaceClearedCount;
      delete container.dataset.readLayerSurfaceRestoreContract;
    }
    const relationLabelPhoneBottomReserveActive =
      containerRect.width < RELATION_LABEL_PHONE_BREAKPOINT_PX;
    if (relationLabelPhoneBottomReserveActive) {
      relationLabelCardBlockers.push({
        left: 0,
        top: Math.max(0, containerRect.height - RELATION_LABEL_PHONE_BOTTOM_RESERVE_PX),
        right: containerRect.width,
        bottom: containerRect.height,
      });
      container.dataset.relationLabelPhoneBottomReserveContract =
        'avoid-floating-controls';
      container.dataset.relationLabelPhoneBottomReservePx = String(
        RELATION_LABEL_PHONE_BOTTOM_RESERVE_PX,
      );
      container.dataset.relationLabelPhoneBottomReserveToken =
        '--topology-floating-control-phone-bottom';
    } else {
      delete container.dataset.relationLabelPhoneBottomReserveContract;
      delete container.dataset.relationLabelPhoneBottomReservePx;
      delete container.dataset.relationLabelPhoneBottomReserveToken;
    }
    container.dataset.visibleCardCount = String(reportedVisibleCardCount);
    container.dataset.visibilityCountSource = visibilityCountSource;
    container.dataset.relationLabelBlockerSource =
      visibilityCountSource === 'fallback-recount'
        ? 'fallback-visibility-pass'
        : 'visibility-pass';
    container.dataset.relationLabelBlockerContract = 'reuse-visible-card-rects';
    container.dataset.relationLabelBlockerCount = String(
      relationLabelCardBlockers.length,
    );
    container.dataset.visibleCardRectReadPolicy = 'frame-state-no-computed-style';
    container.dataset.visibleCardStateReadPolicy = visibleCardStateReadPolicy;
    container.dataset.visibleCardRectReadCount = String(visibleCardRectReadCount);
    container.dataset.visibleCardHiddenRectSkipCount = String(
      visibleCardHiddenRectSkipCount,
    );
    container.dataset.cardPlacementFrameRectCacheContract =
      'reuse-pass1-card-rects-for-visibility';
    container.dataset.cardPlacementFrameRectCacheSize = String(
      cardPlacementFrameRectCache.size,
    );
    container.dataset.cardPlacementFrameRectCacheHitCount = String(
      cardPlacementFrameRectCacheHitCount,
    );
    container.dataset.cardPlacementFrameRectDirectReadCount = String(
      cardPlacementFrameRectDirectReadCount,
    );
    container.dataset.visibilityFrameCacheContract =
      'reuse-stable-no-dom-write-frame';
    container.dataset.visibilityFrameCacheState = visibilityFrameCacheState;
    if (visibilityFrameCacheState !== 'hit') {
      visibilityFrameSnapshotRef.current =
        activeDragCluster === null &&
        !activeDragMotion &&
        !readLayerSurfaceActive &&
        !selectedBlockingSurfaceActive &&
        !pathWorkflowActive &&
        containerRect.width >= RELATION_LABEL_PHONE_BREAKPOINT_PX
          ? {
              blockers: relationLabelCardBlockers.map((rect) => ({ ...rect })),
              entries: new Map(visibleCardRectCache),
              fixedSurfaceKey: visibilityFixedSurfaceKey,
              geometryKey: visibilityGeometryKey,
              height: containerRect.height,
              orderedKey: visibilityOrderedKey,
              supportRailOverlapHiddenCount,
              visibleCardStateReadPolicy,
              visibleCount: reportedVisibleCardCount,
              visibilityCountSource,
              width: containerRect.width,
            }
          : null;
    }
    const visibilityCacheDurationMs = Math.max(
      0,
      measureRepositionNow() - visibilityCacheStartedAt,
    );
    container.dataset.totalCardCount = String(orderedEls.length);
    container.dataset.dimAnchorOpacity = DIM_ANCHOR_OPACITY;
    container.dataset.dimChipOpacity = DIM_CHIP_OPACITY;
    container.dataset.dimAnchorOpacityToken = DIM_ANCHOR_OPACITY_TOKEN;
    container.dataset.dimChipOpacityToken = DIM_CHIP_OPACITY_TOKEN;
    container.dataset.dimOpacityContract = 'readable-context-geography';
    container.dataset.overviewContextOpacityContract = 'core-full-support-quiet';
    container.dataset.overviewContextCoreOpacity = OVERVIEW_CONTEXT_OPACITY[1];
    container.dataset.overviewContextCapabilityOpacity = OVERVIEW_CONTEXT_OPACITY[2];
    container.dataset.overviewContextEvidenceOpacity = OVERVIEW_CONTEXT_OPACITY[3];
    const selectedNodeId = selectedSlug
      ? (resolveNodeId(selectedSlug) ?? selectedSlug)
      : null;
    const selectedDockChildren = selectedNodeId
      ? orderedEls.filter((el) => el.dataset.dockParent === selectedNodeId)
      : [];
    const selectedVisibleDockChildCount = selectedDockChildren.reduce(
      (count, el) => count + (isSkeletonCardVisibleFromFrameState(el) ? 1 : 0),
      0,
    );
    container.dataset.selectedDockVisibilityPolicy = 'state-only-no-rect-read';
    container.dataset.selectedDockCompanionCount = String(selectedDockChildren.length);
    container.dataset.selectedDockVisibleCompanionCount = String(
      selectedVisibleDockChildCount,
    );
    container.dataset.selectedDockCompanionVisible =
      selectedVisibleDockChildCount > 0 ? 'true' : 'false';
    if (selectedVisibleDockChildCount > 0) {
      container.dataset.clickFocusRelationshipContext = 'durable';
      container.dataset.clickFocusRelationshipContextSource = 'selected-dock-companions';
    } else if (selectedFocusCluster && selectedFocusCluster.size >= 2) {
      container.dataset.clickFocusRelationshipContext = 'durable';
      container.dataset.clickFocusRelationshipContextSource = 'focus-cluster';
    } else {
      container.dataset.clickFocusRelationshipContext = 'none';
      container.dataset.clickFocusRelationshipContextSource = 'none';
    }
    const connectorCardRectCache = new Map<
      HTMLElement,
      { left: number; top: number; right: number; bottom: number }
    >();
    let connectorCardRectReadCount = 0;
    let connectorCardRectHitCount = 0;
    const connectorCardRect = (el: HTMLElement | null | undefined) => {
      if (!el) return null;
      const cached = connectorCardRectCache.get(el);
      if (cached) {
        connectorCardRectHitCount += 1;
        return cached;
      }
      const visibleCached = visibleCardRectCache.get(el);
      if (visibleCached?.visible && visibleCached.rect) {
        connectorCardRectHitCount += 1;
        connectorCardRectCache.set(el, visibleCached.rect);
        return visibleCached.rect;
      }
      const frameRect = cardPlacementFrameRectCache.get(el);
      if (frameRect) {
        connectorCardRectHitCount += 1;
        connectorCardRectCache.set(el, frameRect);
        return frameRect;
      }
      connectorCardRectReadCount += 1;
      const rect = el.getBoundingClientRect();
      const next = {
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        right: rect.right - containerRect.left,
        bottom: rect.bottom - containerRect.top,
      };
      connectorCardRectCache.set(el, next);
      return next;
    };
    const drawConnector = (
      path: SVGPathElement,
      sourceEl: HTMLElement | null | undefined,
      targetEl: HTMLElement | null | undefined,
    ) => {
      const source = connectorCardRect(sourceEl);
      const target = connectorCardRect(targetEl);
      if (
        !source ||
        !target ||
        sourceEl?.dataset.surfaceHidden === 'true' ||
        targetEl?.dataset.surfaceHidden === 'true'
      ) {
        setSkeletonPathData(path, '', domWriteStats);
        return;
      }
      const ports = connectorPorts(source, target);
      setSkeletonPathData(
        path,
        connectorPath(ports.sx, ports.sy, ports.ex, ports.ey, ports.axis),
        domWriteStats,
      );
      path.dataset.connectorAxis = ports.axis;
      path.dataset.connectorClearance = String(ports.clearance);
    };
    const drawConnectorTerminal = (
      terminal: SVGCircleElement,
      sourceEl: HTMLElement | null | undefined,
      targetEl: HTMLElement | null | undefined,
    ) => {
      const source = connectorCardRect(sourceEl);
      const target = connectorCardRect(targetEl);
      if (
        !source ||
        !target ||
        sourceEl?.dataset.surfaceHidden === 'true' ||
        targetEl?.dataset.surfaceHidden === 'true'
      ) {
        terminal.style.opacity = '0';
        return;
      }
      const ports = connectorPorts(source, target);
      terminal.setAttribute('cx', String(ports.ex));
      terminal.setAttribute('cy', String(ports.ey));
      terminal.dataset.connectorAxis = ports.axis;
      terminal.dataset.connectorClearance = String(ports.clearance);
      terminal.style.opacity = '';
    };

    // pass 3 — 커넥터: 포트를 카드 안쪽으로 넣고 edge mask 아래에서
    // 시작/종료시킨다. 밝은 선이 카드 바깥으로 삐져나와 보이는 현상을 막는다.
    const svg = container.querySelector<SVGSVGElement>('[data-skeleton-connectors]');
    const connectorLabelStartedAt = measureRepositionNow();
    if (svg) {
      container.dataset.connectorDomIndexContract = 'reuse-card-index';
      container.dataset.connectorRectCacheContract = 'frame-local-card-rect-cache';
      container.dataset.connectorRectCacheFrameFallbackContract =
        'reuse-card-placement-frame-rects-before-dom-read';
      const parentEl = ego?.selected ? (elBySlug.get(ego.selected) ?? null) : null;
      for (const path of svg.querySelectorAll<SVGPathElement>('[data-connector]')) {
        const childSlug = path.dataset.connector;
        const childEl = childSlug ? (elBySlug.get(childSlug) ?? null) : null;
        if (!parentEl || !childEl) {
          setSkeletonPathData(path, '', domWriteStats);
          continue;
        }
        // 2열 이상의 카드로는 기본 커넥터를 긋지 않는다 — 1열을 관통한다.
        // 단, 사용자가 선택한 관계는 지도 위 피드백 자체가 의미이므로 유지한다.
        const selectedRelationPath =
          path.dataset.selectedRelation === 'true' ||
          path.dataset.selectedRelationHalo === 'true';
        if (!selectedRelationPath && isDockConnectorSuppressed(childEl)) {
          setSkeletonPathData(path, '', domWriteStats);
          continue;
        }
        drawConnector(path, parentEl, childEl);
      }
      for (const path of svg.querySelectorAll<SVGPathElement>('[data-drag-connector-from]')) {
        const from = path.dataset.dragConnectorFrom;
        const to = path.dataset.dragConnectorTo;
        const fromEl = from ? elBySlug.get(from) : null;
        const toEl = to ? elBySlug.get(to) : null;
        drawConnector(path, fromEl, toEl);
      }
      for (const path of svg.querySelectorAll<SVGPathElement>('[data-overview-connector-from]')) {
        const from = path.dataset.overviewConnectorFrom;
        const to = path.dataset.overviewConnectorTo;
        const fromEl = from ? elBySlug.get(from) : null;
        const toEl = to ? elBySlug.get(to) : null;
        drawConnector(path, fromEl, toEl);
      }
      for (const terminal of svg.querySelectorAll<SVGCircleElement>(
        '[data-overview-hierarchy-terminal]',
      )) {
        const from = terminal.dataset.overviewConnectorFrom;
        const to = terminal.dataset.overviewConnectorTo;
        const fromEl = from ? elBySlug.get(from) : null;
        const toEl = to ? elBySlug.get(to) : null;
        drawConnectorTerminal(terminal, fromEl, toEl);
      }
      const dragOnlyRelationLabelLayout = activeDragCluster !== null;
      if (dragOnlyRelationLabelLayout) {
        for (const button of container.querySelectorAll<HTMLElement>(
          '[data-relation-label-button]',
        )) {
          setSkeletonStyleValue(button, 'opacity', '0', domWriteStats);
          setSkeletonStyleValue(button, 'pointerEvents', 'none', domWriteStats);
          setSkeletonStyleValue(button, 'visibility', 'hidden', domWriteStats);
          button.dataset.relationLabelVisibility = 'suppressed-during-drag';
        }
        for (const overlay of container.querySelectorAll<HTMLElement>(
          '[data-selected-relation-overlay]',
        )) {
          setSkeletonStyleValue(overlay, 'opacity', '0', domWriteStats);
          setSkeletonStyleValue(overlay, 'visibility', 'hidden', domWriteStats);
        }
      }
      const relationLabelBadgesById = new Map<string, SVGRectElement>();
      for (const badge of svg.querySelectorAll<SVGRectElement>('[data-relation-label-bg]')) {
        const id = badge.dataset.relationLabelBg;
        if (id) relationLabelBadgesById.set(id, badge);
      }
      const relationLabelButtonsById = new Map<string, HTMLElement>();
      if (!dragOnlyRelationLabelLayout) {
        for (const button of container.querySelectorAll<HTMLElement>(
          '[data-relation-label-button]',
        )) {
          const id = button.dataset.relationLabelButton;
          if (id) relationLabelButtonsById.set(id, button);
        }
      }
      const selectedRelationOverlaysById = new Map<string, HTMLElement>();
      if (!dragOnlyRelationLabelLayout) {
        for (const overlay of container.querySelectorAll<HTMLElement>(
          '[data-selected-relation-overlay]',
        )) {
          const id = overlay.dataset.selectedRelationOverlay;
          if (id) selectedRelationOverlaysById.set(id, overlay);
        }
      }
      container.dataset.relationLabelQueryContract = 'indexed-once';
      container.dataset.relationLabelQueryIndexCount = String(
        relationLabelBadgesById.size +
          relationLabelButtonsById.size +
          selectedRelationOverlaysById.size,
      );
      container.dataset.relationLabelDragLayoutPolicy = dragOnlyRelationLabelLayout
        ? 'drag-only-svg-labels'
        : 'all-relation-labels';
      let relationLabelFrameExpectedCount = 0;
      let relationLabelFrameReadyCount = 0;
      let focusRelationLabelExpectedCount = 0;
      let focusRelationLabelVisibleCount = 0;
      for (const label of svg.querySelectorAll<SVGTextElement>('[data-relation-label-from]')) {
        const dragRelationLabel = label.dataset.dragRelationLabel === 'true';
        const from = label.dataset.relationLabelFrom;
        const to = label.dataset.relationLabelTo;
        const relationLabelId = label.dataset.relationLabelId;
        const badge = relationLabelId
          ? (relationLabelBadgesById.get(relationLabelId) ?? null)
          : null;
        if (dragOnlyRelationLabelLayout && !dragRelationLabel) {
          label.setAttribute('opacity', '0');
          label.setAttribute('aria-hidden', 'true');
          badge?.setAttribute('opacity', '0');
          badge?.setAttribute('pointer-events', 'none');
          const labelGroup = label.closest<SVGGElement>('[data-relation-label-group="true"]');
          if (labelGroup) labelGroup.style.pointerEvents = 'none';
          continue;
        }
        const labelButton = relationLabelId
          ? (relationLabelButtonsById.get(relationLabelId) ?? null)
          : null;
        const selectedRelationLabel = labelButton?.dataset.selectedRelation === 'true';
        const fromEl = from ? elBySlug.get(from) : null;
        const toEl = to ? elBySlug.get(to) : null;
        const fromRect = connectorCardRect(fromEl);
        const toRect = connectorCardRect(toEl);
        if (
          !fromRect ||
          !toRect ||
          (!selectedRelationLabel &&
            (fromEl?.dataset.surfaceHidden === 'true' ||
              toEl?.dataset.surfaceHidden === 'true' ||
              (label.dataset.connectorRelationLabel === 'true' &&
                isDockConnectorSuppressed(toEl))))
        ) {
          label.setAttribute('opacity', '0');
          badge?.setAttribute('opacity', '0');
          badge?.setAttribute('pointer-events', 'none');
          if (labelButton) {
            labelButton.style.opacity = '0';
            labelButton.style.pointerEvents = 'none';
            labelButton.style.visibility = 'hidden';
            labelButton.dataset.relationLabelVisibility = 'suppressed-hidden-endpoint';
          }
          continue;
        }
        const isEgoBadge = label.dataset.connectorRelationLabel === 'true';
        const labelIndex = Number(label.dataset.relationLabelIndex ?? '0');
        const x = isEgoBadge
          ? (fromRect.left + fromRect.right) / 2
          : (fromRect.left + fromRect.right + toRect.left + toRect.right) / 4;
        const y = isEgoBadge
          ? Math.max(18, fromRect.top - 14 - labelIndex * 14)
          : (fromRect.top + fromRect.bottom + toRect.top + toRect.bottom) / 4 -
            8;
        const relationHitDisabled = activeDragCluster !== null;
        const badgeWidth = Math.max(
            RELATION_BADGE_MIN_WIDTH_PX,
            (label.textContent?.length ?? 0) * RELATION_BADGE_CHAR_WIDTH_PX +
              RELATION_BADGE_PAD_X_PX +
            (isEgoBadge
              ? RELATION_BADGE_QUALITY_DOT_WIDTH_PX +
                RELATION_BADGE_DIRECTION_CHIP_WIDTH_PX
              : 0),
        );
        const usesHtmlBadge = isEgoBadge && labelButton !== null;
        const labelGeometry = resolveRelationLabelGeometry({
          badgeWidth,
          centerX: x,
          containerWidth: containerRect.width,
          hitTargetPadX: RELATION_LABEL_HIT_TARGET_PAD_X_PX,
          minCompactWidth: RELATION_LABEL_MIN_COMPACT_WIDTH_PX,
          viewportInset: RELATION_LABEL_VIEWPORT_INSET_PX,
        });
        const labelPlacement = resolveRelationLabelVerticalPlacement({
          blockers: relationLabelCardBlockers,
          containerHeight: containerRect.height,
          height: RELATION_LABEL_HIT_TARGET_HEIGHT_PX,
          left: labelGeometry.left,
          top: y - RELATION_LABEL_HIT_TARGET_HEIGHT_PX / 2,
          width: labelGeometry.hitTargetWidth,
        });
        const labelHitRect = {
          left: labelGeometry.left,
          top: labelPlacement.top,
          right: labelGeometry.left + labelGeometry.hitTargetWidth,
          bottom: labelPlacement.top + RELATION_LABEL_HIT_TARGET_HEIGHT_PX,
        };
        const labelCardOverlapCount = relationLabelCardBlockers.filter((blocker) =>
          rectsOverlap(labelHitRect, blocker),
        ).length;
        const labelHiddenByCards =
          (labelPlacement.occluded || labelCardOverlapCount > 0) && !selectedRelationLabel;
        if (selectedFocusCluster && isEgoBadge) {
          focusRelationLabelExpectedCount += 1;
          if (!labelHiddenByCards) focusRelationLabelVisibleCount += 1;
        }
        const placedY = labelPlacement.top + RELATION_LABEL_HIT_TARGET_HEIGHT_PX / 2;
        label.setAttribute('x', String(x));
        label.setAttribute('y', String(placedY));
        label.setAttribute('opacity', usesHtmlBadge || labelHiddenByCards ? '0' : '1');
        label.setAttribute('aria-hidden', usesHtmlBadge || labelHiddenByCards ? 'true' : 'false');
        const labelGroup = label.closest<SVGGElement>('[data-relation-label-group="true"]');
        if (labelGroup) {
          labelGroup.style.pointerEvents = usesHtmlBadge || labelHiddenByCards ? 'none' : 'auto';
        }
        if (badge) {
          badge.setAttribute('x', String(x - badgeWidth / 2));
          badge.setAttribute('y', String(placedY - RELATION_BADGE_HEIGHT_PX / 2));
          badge.setAttribute('width', String(badgeWidth));
          badge.setAttribute('height', String(RELATION_BADGE_HEIGHT_PX));
          badge.setAttribute('opacity', usesHtmlBadge || labelHiddenByCards ? '0' : '1');
          badge.setAttribute(
            'pointer-events',
            usesHtmlBadge || relationHitDisabled || labelHiddenByCards ? 'none' : 'auto',
          );
        }
        if (labelButton) {
          if (!labelHiddenByCards) relationLabelFrameExpectedCount += 1;
          setSkeletonStyleValue(
            labelButton,
            'transform',
            `translate3d(${labelGeometry.left}px, ${labelPlacement.top}px, 0)`,
            domWriteStats,
          );
          setSkeletonStyleValue(
            labelButton,
            'width',
            `${labelGeometry.hitTargetWidth}px`,
            domWriteStats,
          );
          setSkeletonStyleValue(
            labelButton,
            'height',
            `${RELATION_LABEL_HIT_TARGET_HEIGHT_PX}px`,
            domWriteStats,
          );
          setSkeletonStyleValue(
            labelButton,
            'opacity',
            labelHiddenByCards ? '0' : '1',
            domWriteStats,
          );
          setSkeletonStyleValue(
            labelButton,
            'pointerEvents',
            relationHitDisabled || labelHiddenByCards ? 'none' : 'auto',
            domWriteStats,
          );
          setSkeletonStyleValue(
            labelButton,
            'visibility',
            labelHiddenByCards ? 'hidden' : 'visible',
            domWriteStats,
          );
          labelButton.dataset.relationLabelVisibility = labelHiddenByCards
            ? 'suppressed-card-overlap'
            : 'visible-clear';
          labelButton.dataset.labelGeometrySource = 'html-hit-target';
          labelButton.dataset.relationLabelCardClearance =
            labelPlacement.occluded || labelCardOverlapCount > 0 ? 'occluded' : 'clear';
          labelButton.dataset.relationLabelCardClearancePolicy =
            'reposition-or-hide';
          labelButton.dataset.relationLabelCardOverlapCount = String(
            labelCardOverlapCount,
          );
          labelButton.dataset.visibleBadgeWidth = String(badgeWidth);
          labelButton.dataset.visibleBadgeHeight = String(RELATION_BADGE_HEIGHT_PX);
          labelButton.dataset.relationLabelCompact = labelGeometry.compact ? 'true' : 'false';
          labelButton.dataset.relationLabelDesiredWidth = String(labelGeometry.desiredWidth);
          labelButton.dataset.relationLabelCenteredAvailableWidth = String(
            labelGeometry.centeredAvailableWidth,
          );
          labelButton.dataset.relationLabelViewportClampContract =
            labelGeometry.viewportClampContract;
          labelButton.dataset.relationLabelViewportClampSide =
            labelGeometry.viewportClampSide;
          labelButton.dataset.relationLabelViewportInset = String(
            labelGeometry.viewportInset,
          );
          if (!labelHiddenByCards) relationLabelFrameReadyCount += 1;
          if (selectedRelationLabel) {
            const overlay = relationLabelId
              ? (selectedRelationOverlaysById.get(relationLabelId) ?? null)
              : null;
            if (overlay) {
              setSkeletonStyleValue(
                overlay,
                'transform',
                labelButton.style.transform,
                domWriteStats,
              );
              setSkeletonStyleValue(overlay, 'width', labelButton.style.width, domWriteStats);
              setSkeletonStyleValue(overlay, 'height', labelButton.style.height, domWriteStats);
              overlay.dataset.relationLabelCompact = labelButton.dataset.relationLabelCompact;
              overlay.style.setProperty('opacity', '1', 'important');
              overlay.style.visibility = 'visible';
            }
          }
        }
      }
      container.dataset.relationLabelGeometryContract = 'frame-positioned-hit-targets';
      container.dataset.relationLabelGeometrySource = dragOnlyRelationLabelLayout
        ? 'drag-only-label-layout-pass'
        : 'after-render-layout-pass';
      container.dataset.relationLabelGeometryExpectedCount = String(
        relationLabelFrameExpectedCount,
      );
      container.dataset.relationLabelGeometryReadyCount = String(
        relationLabelFrameReadyCount,
      );
      container.dataset.relationLabelGeometryPendingCount = String(
        Math.max(0, relationLabelFrameExpectedCount - relationLabelFrameReadyCount),
      );
      container.dataset.focusClusterRelationLabelCount = String(
        focusRelationLabelVisibleCount,
      );
      container.dataset.focusClusterRelationLabelExpectedCount = String(
        focusRelationLabelExpectedCount,
      );
      container.dataset.focusClusterRelationLabelSource =
        selectedFocusCluster ? 'ego-relation-label-layout-pass' : 'none';
      container.dataset.connectorRectCacheSize = String(connectorCardRectCache.size);
      container.dataset.connectorRectCacheSeedContract =
        'visible-card-rects-seed-connector-cache';
      container.dataset.connectorRectCacheSeedCount = String(
        Array.from(visibleCardRectCache.values()).filter(
          (entry) => entry.visible && entry.rect,
        ).length,
      );
      container.dataset.connectorRectCacheReadCount = String(connectorCardRectReadCount);
      container.dataset.connectorRectCacheHitCount = String(connectorCardRectHitCount);
      container.dataset.connectorRectCacheAccounting = 'reads-plus-hits';
      container.dataset.domWriteDedupeContract = 'skip-unchanged-transform-and-path';
      container.dataset.visibilityStyleWriteContract = 'dedupe-show-hide-state';
      container.dataset.domWriteAppliedCount = String(domWriteStats.applied);
      container.dataset.domWriteSkippedCount = String(domWriteStats.skipped);
      container.dataset.finalVisibleCountPolicy = 'state-only-no-rect-read';
      const finalVisibleCardCount = orderedEls.reduce(
        (count, el) => count + (isSkeletonCardVisibleFromFrameState(el) ? 1 : 0),
        0,
      );
      if (finalVisibleCardCount !== reportedVisibleCardCount) {
        reportedVisibleCardCount = finalVisibleCardCount;
        container.dataset.visibleCardCount = String(reportedVisibleCardCount);
        container.dataset.visibilityCountSource = `${visibilityCountSource}-final-recount`;
      }
      const nextVisibilityStats = {
        visible: reportedVisibleCardCount,
        total: orderedEls.length,
      };
      emitVisibilityStats(container, nextVisibilityStats, {
        debounceStable:
          activeDragCluster === null &&
          selectedRelationEdgeId === null &&
          container.dataset.skeletonCardsReady === 'true',
        deferDuringLayout:
          container.dataset.layoutAnimate === 'true' &&
          activeDragCluster === null &&
          selectedRelationEdgeId === null,
      });
      for (const overlay of container.querySelectorAll<HTMLElement>(
        '[data-selected-relation-overlay][data-selected-relation-halo="true"]',
      )) {
        overlay.style.setProperty('opacity', '1', 'important');
        overlay.style.visibility = 'visible';
      }
    }
    const connectorLabelDurationMs = Math.max(
      0,
      measureRepositionNow() - connectorLabelStartedAt,
    );
    // pass 4 — hover 팝업 위치: 카드 우측 +10, 화면/우측 패널에 닿으면 좌측
    // flip + 세로 클램프. 매 프레임 카드 rect 파생이라 팬/줌을 따라간다.
    const popupPassStartedAt = measureRepositionNow();
    const popup = hoverPopupRef.current;
    if (popup) {
      const hoverSlug = popup.dataset.hoverFor;
      const cardEl = hoverSlug ? elBySlug.get(hoverSlug) : undefined;
      if (cardEl) {
        const r = cardEl.getBoundingClientRect();
        const popW = popup.offsetWidth || HOVER_POP_W;
        const popH = popup.offsetHeight || 48;
        const xRight = r.right - containerRect.left + 10;
        const limit = containerRect.width - 16;
        const x =
          xRight + popW <= limit
            ? xRight
            : r.left - containerRect.left - 10 - popW;
        const y = Math.min(
          Math.max(r.top - containerRect.top, 8),
          Math.max(8, containerRect.height - popH - 8),
        );
        popup.style.left = `${x}px`;
        popup.style.top = `${y}px`;
      }
    }
    const popupDurationMs = Math.max(0, measureRepositionNow() - popupPassStartedAt);
    const repositionFinishedAt = measureRepositionNow();
    const repositionDurationMs = Math.max(0, repositionFinishedAt - repositionStartedAt);
    const passDurations = [
      ['card-placement', cardPlacementDurationMs],
      ['visibility-cache', visibilityCacheDurationMs],
      ['connector-label', connectorLabelDurationMs],
      ['popup', popupDurationMs],
    ] as const;
    const [slowestPassName, slowestPassDurationMs] = passDurations.reduce(
      (slowest, current) => (current[1] > slowest[1] ? current : slowest),
      passDurations[0],
    );
    const previousMaxRepositionDurationMs = maxRepositionDurationMsRef.current;
    if (repositionDurationMs >= previousMaxRepositionDurationMs) {
      maxRepositionDurationMsRef.current = repositionDurationMs;
      container.dataset.repositionMaxPassSlowest = slowestPassName;
      container.dataset.repositionMaxPassSlowestMs = slowestPassDurationMs.toFixed(2);
      container.dataset.repositionMaxPassCardPlacementMs =
        cardPlacementDurationMs.toFixed(2);
      container.dataset.repositionMaxPassVisibilityCacheMs =
        visibilityCacheDurationMs.toFixed(2);
      container.dataset.repositionMaxPassConnectorLabelMs =
        connectorLabelDurationMs.toFixed(2);
      container.dataset.repositionMaxPassPopupMs = popupDurationMs.toFixed(2);
    }
    container.dataset.dragFrameBudgetContract = 'measured-reposition-duration';
    container.dataset.repositionPassDurationContract = 'phase-duration-breakdown';
    container.dataset.repositionPassSlowest = slowestPassName;
    container.dataset.repositionPassSlowestMs = slowestPassDurationMs.toFixed(2);
    container.dataset.repositionPassCardPlacementMs = cardPlacementDurationMs.toFixed(2);
    container.dataset.repositionPassVisibilityCacheMs = visibilityCacheDurationMs.toFixed(2);
    container.dataset.repositionPassConnectorLabelMs = connectorLabelDurationMs.toFixed(2);
    container.dataset.repositionPassPopupMs = popupDurationMs.toFixed(2);
    container.dataset.repositionDurationLastMs = repositionDurationMs.toFixed(2);
    container.dataset.repositionDurationMaxMs =
      maxRepositionDurationMsRef.current.toFixed(2);
  }, [
    graph,
    sigma,
    ego,
    activeDragCluster,
    activeDragMotion,
    cards,
    healthRepairTarget,
    pathWorkflowActive,
    resolveNodeId,
    selectedFocusCenterActive,
    selectedFocusCluster,
    selectedRelationEdgeId,
    selectedSlug,
    emitVisibilityStats,
    getFixedSurfaceRects,
  ]);
  const scheduleReposition = useCallback(() => {
    const container = containerRef.current;
    const now = Date.now();
    const throttleDuringLayout =
      container?.dataset.layoutAnimate === 'true' &&
      activeDragCluster === null &&
      selectedRelationEdgeId === null;
    const throttleDuringInitialLoad =
      container !== null &&
      now < initialLoadRepositionThrottleUntilRef.current &&
      activeDragCluster === null &&
      selectedRelationEdgeId === null;
    if (throttleDuringLayout || throttleDuringInitialLoad) {
      container.dataset.layoutTransitionRepositionPolicy =
        throttleDuringLayout
          ? 'throttle-after-render-during-transition'
          : 'throttle-after-render-during-initial-load';
      container.dataset.layoutTransitionRepositionThrottleMs = String(
        LAYOUT_TRANSITION_REPOSITION_THROTTLE_MS,
      );
      if (layoutTransitionRepositionTimerRef.current !== null) {
        container.dataset.layoutTransitionRepositionDeferred = 'true';
        return;
      }
      const elapsed = now - lastLayoutTransitionRepositionAtRef.current;
      const delay = Math.max(0, LAYOUT_TRANSITION_REPOSITION_THROTTLE_MS - elapsed);
      container.dataset.layoutTransitionRepositionDeferred = delay > 0 ? 'true' : 'false';
      layoutTransitionRepositionTimerRef.current = window.setTimeout(() => {
        layoutTransitionRepositionTimerRef.current = null;
        lastLayoutTransitionRepositionAtRef.current = Date.now();
        const currentContainer = containerRef.current;
        if (currentContainer) {
          currentContainer.dataset.layoutTransitionRepositionDeferred = 'false';
        }
        if (repositionRafRef.current !== null) return;
        repositionRafRef.current = window.requestAnimationFrame(() => {
          repositionRafRef.current = null;
          reposition();
        });
      }, delay);
      return;
    }
    if (container) {
      container.dataset.layoutTransitionRepositionPolicy = 'immediate-after-render';
      container.dataset.layoutTransitionRepositionThrottleMs = String(
        LAYOUT_TRANSITION_REPOSITION_THROTTLE_MS,
      );
      container.dataset.layoutTransitionRepositionDeferred = 'false';
    }
    if (repositionRafRef.current !== null) return;
    repositionRafRef.current = window.requestAnimationFrame(() => {
      repositionRafRef.current = null;
      reposition();
    });
  }, [activeDragCluster, reposition, selectedRelationEdgeId]);

  const layoutTransitionKey = useMemo(() => {
    const cardKey = cards
      .map((card) =>
        [
          card.id,
          card.kind,
          card.tier,
          card.title,
          card.count ?? '',
          card.anchor ?? '',
          card.dock
            ? `${card.dock.parentId}:${card.dock.side}:${card.dock.index}:${card.dock.total}`
            : '',
        ].join(':'),
      )
      .join('|');
    return [
      cardKey,
      selectedSlug ?? '',
      selectedRelationEdgeId ?? '',
      pathWorkflowActive ? 'path' : 'map',
      pathSelection?.sourceSlug ?? '',
      pathSelection?.targetSlug ?? '',
      healthRepairTarget
        ? `${healthRepairTarget.kind}:${healthRepairTarget.slug}`
        : '',
      selectedFocusCenterActive ? 'focus-center' : '',
    ].join('||');
  }, [
    cards,
    healthRepairTarget,
    pathSelection?.sourceSlug,
    pathSelection?.targetSlug,
    pathWorkflowActive,
    selectedFocusCenterActive,
    selectedRelationEdgeId,
    selectedSlug,
  ]);
  const activeDragClusterLayoutKey = useMemo(
    () =>
      activeDragCluster
        ? Array.from(activeDragCluster).sort().join('|')
        : '',
    [activeDragCluster],
  );
  const layoutEffectRepositionKey = useMemo(
    () =>
      [
        layoutTransitionKey,
        sigma ? 'sigma-ready' : 'sigma-missing',
        activeDragClusterLayoutKey,
        activeDragMotion ? 'drag-motion' : '',
        activeDragRootSlug,
      ].join('||'),
    [
      activeDragClusterLayoutKey,
      activeDragMotion,
      activeDragRootSlug,
      layoutTransitionKey,
      sigma,
    ],
  );

  useEffect(() => {
    repositionNowRef.current = reposition;
  }, [reposition]);

  // 카드/선택/드래그 구조가 실제로 바뀔 때만 paint 전에 배치한다.
  // hover/visibility bookkeeping 같은 렌더까지 즉시 배치를 반복하면 큰
  // 화면에서 초기 로딩과 드래그가 끊겨 보인다.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const measuredContainerRect = container?.getBoundingClientRect();
    const layoutEffectViewportKey = measuredContainerRect
      ? `${Math.round(measuredContainerRect.width)}x${Math.round(measuredContainerRect.height)}`
      : 'no-container';
    const currentLayoutEffectRepositionKey = [
      layoutEffectRepositionKey,
      layoutEffectViewportKey,
    ].join('||');
    if (container) {
      container.dataset.layoutEffectRepositionContract =
        'keyed-structural-render-only';
      container.dataset.layoutEffectRepositionKeySize = String(
        currentLayoutEffectRepositionKey.length,
      );
    }
    if (lastLayoutEffectRepositionKeyRef.current === currentLayoutEffectRepositionKey) {
      layoutEffectRepositionSkipCountRef.current += 1;
      if (container) {
        container.dataset.layoutEffectRepositionPolicy = 'skip-same-structural-key';
        container.dataset.layoutEffectRepositionSkippedCount = String(
          layoutEffectRepositionSkipCountRef.current,
        );
      }
      return;
    }
    lastLayoutEffectRepositionKeyRef.current = currentLayoutEffectRepositionKey;
    layoutEffectRepositionRunCountRef.current += 1;
    invalidateFixedSurfaceRectCache();
    reposition();
    if (container) {
      container.dataset.layoutEffectRepositionPolicy = 'run-structural-key-change';
      container.dataset.layoutEffectRepositionRunCount = String(
        layoutEffectRepositionRunCountRef.current,
      );
      container.dataset.layoutEffectRepositionSkippedCount = String(
        layoutEffectRepositionSkipCountRef.current,
      );
      container.dataset.skeletonCardsReady = 'true';
    }
  });

  // 전환 창 — 위치 transform 은 즉시 반영한다. 카드가 서로 지나가며 겹치는
  // frame 이 생기면 relief map 의 기본 약속(박스는 서로 겹치지 않음)이 깨진다.
  // ready 전 overlay 는 숨기고, 배치/충돌 판정이 끝난 뒤 검사 가능한 상태로 연다.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.dataset.layoutTransitionKeySize = String(layoutTransitionKey.length);
    if (!initialLayoutTransitionResolvedRef.current) {
      initialLayoutTransitionResolvedRef.current = true;
      initialLoadRepositionThrottleUntilRef.current =
        Date.now() + INITIAL_LOAD_REPOSITION_THROTTLE_MS;
      delete container.dataset.layoutAnimate;
      container.dataset.layoutTransitionPhase = 'initial-layout-ready';
      container.dataset.layoutTransitionRepositionPolicy = 'skip-initial-transition';
      container.dataset.layoutTransitionRepositionDeferred = 'false';
      container.dataset.initialLoadRepositionThrottleMs = String(
        INITIAL_LOAD_REPOSITION_THROTTLE_MS,
      );
      container.dataset.skeletonCardsReady = 'true';
      return;
    }
    container.dataset.layoutAnimate = 'true';
    container.dataset.layoutTransitionPhase = 'transition-window';
    if (container.dataset.skeletonCardsReady !== 'true') {
      container.dataset.skeletonCardsReady = 'false';
    }
    // 창 480ms = 카메라 reframe(420ms) + 여유 1프레임 — 창이 카메라보다
    // 먼저 닫히며 생기던 막판 스냅 제거. 창이 닫힐 때 충돌 동결 해제.
    const timer = window.setTimeout(() => {
      delete container.dataset.layoutAnimate;
      collisionFreezeRef.current.clear();
      try {
        invalidateFixedSurfaceRectCache();
        if (layoutTransitionRepositionTimerRef.current !== null) {
          window.clearTimeout(layoutTransitionRepositionTimerRef.current);
          layoutTransitionRepositionTimerRef.current = null;
        }
        repositionNowRef.current?.();
        delete container.dataset.layoutError;
      } catch (error) {
        container.dataset.layoutError =
          error instanceof Error ? error.message : String(error);
      }
      window.requestAnimationFrame(() => {
        container.dataset.skeletonCardsReady = 'true';
      });
    }, 480);
    return () => {
      window.clearTimeout(timer);
      if (layoutTransitionRepositionTimerRef.current !== null) {
        window.clearTimeout(layoutTransitionRepositionTimerRef.current);
        layoutTransitionRepositionTimerRef.current = null;
      }
      delete container.dataset.layoutAnimate;
      if (container.dataset.skeletonCardsReady !== 'true') {
        container.dataset.skeletonCardsReady = 'false';
      }
    };
  }, [layoutTransitionKey, invalidateFixedSurfaceRectCache]);

  useEffect(() => {
    if (!sigma) return;
    sigma.on('afterRender', scheduleReposition);
    const onResize = () => {
      invalidateFixedSurfaceRectCache();
      scheduleReposition();
      if (responsiveRepositionTimerRef.current !== null) {
        window.clearTimeout(responsiveRepositionTimerRef.current);
      }
      responsiveRepositionTimerRef.current = window.setTimeout(() => {
        responsiveRepositionTimerRef.current = null;
        invalidateFixedSurfaceRectCache();
        scheduleReposition();
      }, 120);
    };
    window.addEventListener('resize', onResize);
    return () => {
      sigma.off('afterRender', scheduleReposition);
      window.removeEventListener('resize', onResize);
      if (responsiveRepositionTimerRef.current !== null) {
        window.clearTimeout(responsiveRepositionTimerRef.current);
        responsiveRepositionTimerRef.current = null;
      }
      if (repositionRafRef.current !== null) {
        window.cancelAnimationFrame(repositionRafRef.current);
        repositionRafRef.current = null;
      }
      if (layoutTransitionRepositionTimerRef.current !== null) {
        window.clearTimeout(layoutTransitionRepositionTimerRef.current);
        layoutTransitionRepositionTimerRef.current = null;
      }
    };
  }, [sigma, scheduleReposition, invalidateFixedSurfaceRectCache]);

  useEffect(
    () => () => {
      if (visibilityStatsFlushTimerRef.current !== null) {
        window.clearTimeout(visibilityStatsFlushTimerRef.current);
        visibilityStatsFlushTimerRef.current = null;
      }
      if (layoutTransitionRepositionTimerRef.current !== null) {
        window.clearTimeout(layoutTransitionRepositionTimerRef.current);
        layoutTransitionRepositionTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || selectedRelationEdgeId === null) return;
    container.dataset.skeletonCardsReady = 'false';
    container.dataset.selectedBlockingSurfaceSettleContract =
      'ready-after-selected-relation-surface-reposition';
    const frame = window.requestAnimationFrame(() => {
      for (const overlay of container.querySelectorAll<HTMLElement>(
        '[data-selected-relation-overlay][data-selected-relation-halo="true"]',
      )) {
        overlay.style.setProperty('opacity', '1', 'important');
        overlay.style.visibility = 'visible';
        overlay.style.display = 'inline-flex';
      }
      invalidateFixedSurfaceRectCache();
      repositionNowRef.current?.();
    });
    const settleFrame = window.requestAnimationFrame(() => {
      invalidateFixedSurfaceRectCache();
      repositionNowRef.current?.();
    });
    const settleTimer = window.setTimeout(() => {
      invalidateFixedSurfaceRectCache();
      repositionNowRef.current?.();
      window.requestAnimationFrame(() => {
        container.dataset.skeletonCardsReady = 'true';
      });
    }, 520);
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(settleFrame);
      window.clearTimeout(settleTimer);
    };
  }, [selectedRelationEdgeId, invalidateFixedSurfaceRectCache]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || selectedSlug === null || selectedRelationEdgeId !== null) return;
    if (!isSelectedNodePopoverMounted()) return;
    container.dataset.skeletonCardsReady = 'false';
    container.dataset.selectedBlockingSurfaceSettleContract =
      'ready-after-selected-popover-surface-reposition';
    const frame = window.requestAnimationFrame(() => {
      container.dataset.selectedFocusSurfaceRepositionContract =
        'invalidate-fixed-surfaces-after-selected-popover-mount';
      invalidateFixedSurfaceRectCache();
      repositionNowRef.current?.();
    });
    const settleFrame = window.requestAnimationFrame(() => {
      invalidateFixedSurfaceRectCache();
      repositionNowRef.current?.();
    });
    const settleTimer = window.setTimeout(() => {
      invalidateFixedSurfaceRectCache();
      repositionNowRef.current?.();
      window.requestAnimationFrame(() => {
        container.dataset.skeletonCardsReady = 'true';
      });
    }, 520);
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(settleFrame);
      window.clearTimeout(settleTimer);
    };
  }, [selectedRelationEdgeId, selectedSlug, invalidateFixedSurfaceRectCache]);

  if (!sigma) return null;

  return (
    <div
      ref={containerRef}
      data-testid="sigma-skeleton-cards"
      data-skeleton-cards-ready="false"
      data-skeleton-card-model-count={cards.length}
      data-skeleton-card-resolved-count={resolvedCardCount}
      data-active-drag-cluster-size={activeDragCluster?.size ?? 0}
      data-drag-collision-policy="release-settle"
      data-drag-frame-cache-contract="pointer-move-reuses-drag-indexes"
      data-drag-reposition-policy="raf-coalesced-pointer-move"
      data-drag-reposition-coalesced="false"
      data-drag-hull-render-policy="suppressed-boxless-connectors"
      data-drag-cluster-hull-dom-policy="not-rendered"
      data-drag-dom-index-contract="drag-release-reuses-card-elements"
      data-drag-dom-index-size={dragFrameMarkerSnapshot.domIndexSize}
      data-drag-frame-cache-snapshot-count={dragFrameMarkerSnapshot.snapshotCount}
      data-dock-drag-snapshot-contract="single-pass-card-rect-read"
      data-visibility-count-contract="single-pass-unless-fallback"
      data-visible-card-state-cache-contract="rect-and-visibility-single-pass"
      data-visibility-stats-report-contract="dedupe-and-debounce-stable-counts"
      data-visibility-stats-report-count="0"
      data-layout-transition-contract="stable-card-state-key"
      data-layout-transition-reposition-policy="immediate-after-render"
      data-layout-transition-reposition-throttle-ms={LAYOUT_TRANSITION_REPOSITION_THROTTLE_MS}
      data-layout-transition-reposition-deferred="false"
      data-layout-effect-reposition-contract="keyed-structural-render-only"
      data-layout-effect-reposition-policy="pending"
      data-layout-effect-reposition-run-count="0"
      data-layout-effect-reposition-skipped-count="0"
      data-initial-load-reposition-throttle-ms={INITIAL_LOAD_REPOSITION_THROTTLE_MS}
      data-responsive-reposition-contract="resize-immediate-and-settled"
      data-dom-write-dedupe-contract="skip-unchanged-transform-and-path"
      data-visibility-style-write-contract="dedupe-show-hide-state"
      data-dom-write-applied-count="0"
      data-dom-write-skipped-count="0"
      data-fixed-surface-measure-contract="single-pass-rect-read"
      data-path-endpoint-separation-contract="source-target-min-gap"
      data-drag-settle-motion-contract={TOPOLOGY_DRAG_SETTLE_MOTION_CONTRACT}
      data-drag-settle-motion-duration-ms={TOPOLOGY_DRAG_SETTLE_DURATION_MS}
      data-drag-settle-motion-easing={TOPOLOGY_DRAG_SETTLE_EASING_NAME}
      data-focus-cluster-size={selectedFocusCluster?.size ?? 0}
      data-dragging-active={activeDragMotion ? 'true' : 'false'}
      data-selected-dock-companion-count="0"
      data-selected-dock-visible-companion-count="0"
      data-selected-dock-companion-visible="false"
      data-click-focus-relationship-context="none"
      data-click-focus-relationship-context-source="none"
      data-dim-anchor-opacity={DIM_ANCHOR_OPACITY}
      data-dim-chip-opacity={DIM_CHIP_OPACITY}
      data-dim-anchor-opacity-token={DIM_ANCHOR_OPACITY_TOKEN}
      data-dim-chip-opacity-token={DIM_CHIP_OPACITY_TOKEN}
      data-dim-opacity-contract="readable-context-geography"
      data-overview-context-opacity-contract="core-full-support-quiet"
      data-overview-context-core-opacity={OVERVIEW_CONTEXT_OPACITY[1]}
      data-overview-context-capability-opacity={OVERVIEW_CONTEXT_OPACITY[2]}
      data-overview-context-evidence-opacity={OVERVIEW_CONTEXT_OPACITY[3]}
      data-relation-label-handoff-contract="label-level-mcp-cli-fallback"
      data-relation-label-geometry-contract="frame-positioned-hit-targets"
      data-relation-label-geometry-source="pending-frame"
      data-relation-label-geometry-expected-count="0"
      data-relation-label-geometry-ready-count="0"
      data-relation-label-geometry-pending-count="0"
      data-focus-relation-label-density-contract="click-focus-uses-ego-label-only"
      data-focus-relation-label-source={
        selectedFocusCluster ? 'ego-relation-labels' : undefined
      }
      data-selected-relation-label-handoff={
        selectedRelationLabelHandoff ? 'ready' : 'none'
      }
      data-selected-relation-label-gate={selectedRelationLabelHandoff?.gate}
      data-selected-relation-label-primary-action={selectedRelationLabelHandoff?.action}
      data-selected-relation-label-cli-fallback={
        selectedRelationLabelHandoff?.cliFallbackCommand
      }
      data-selected-relation-label-fact-route={selectedRelationLabelHandoff?.route}
      data-selected-relation-label-quality={selectedRelationLabelHandoff?.quality}
      data-selected-relation-label-evidence={selectedRelationLabelHandoff?.evidence}
      data-health-repair-audit-target-contract={
        resolvedHealthRepairTargetNodeId
          ? 'panel-target-card-highlight'
          : healthRepairTarget
            ? 'panel-target-card-unresolved'
            : 'none'
      }
      data-health-repair-audit-target-slug={
        resolvedHealthRepairTargetNodeId ?? undefined
      }
      data-health-repair-audit-target-kind={healthRepairTarget?.kind}
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden opacity-100 transition-opacity duration-150 ease-out data-[skeleton-cards-ready=false]:opacity-0 motion-reduce:transition-none"
    >
      {/* 펼친 가지 커넥터 — 수평 접선 S-커브, 카드 경계 트림. 인디고는
          "활성 가지" 단일 의미 (overview hairline 은 Sigma 캔버스 담당). */}
      <svg
        data-skeleton-connectors
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {!ego && !activeDragCluster
          ? overviewBackboneConnectors.map((connector) => {
              const selected =
                selectedRelationEdgeId !== null && connector.edgeId === selectedRelationEdgeId;
              const tone = relationConnectorTone(connector, selected);
              return (
                <g key={`overview:${connector.key}`}>
                  <path
                    data-overview-connector-from={connector.from}
                    data-overview-connector-to={connector.to}
                    data-relation-hit-path="true"
                    data-relation-kind={connector.kind}
                    data-relation-quality={connector.relationQuality ?? 'supported'}
                    data-relation-type={connector.relationType}
                    className="pointer-events-auto cursor-pointer"
                    fill="none"
                    stroke="transparent"
                    strokeLinecap="round"
                    strokeWidth={16}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectRelation(connector);
                    }}
                  />
                  {!selected ? (
                    <path
                      data-overview-connector-from={connector.from}
                      data-overview-connector-to={connector.to}
                      data-overview-hierarchy-spine="contains"
                      data-overview-hierarchy-spine-contract="contains-relation-reads-as-ontology-backbone"
                      data-relation-kind={connector.kind}
                      data-relation-quality={connector.relationQuality ?? 'supported'}
                      data-relation-type={connector.relationType}
                      data-relation-spine-halo-token="--topology-relation-spine-halo"
                      data-relation-spine-halo-opacity-token="--topology-relation-spine-halo-opacity"
                      data-relation-spine-halo-width-token="--topology-relation-spine-halo-width"
                      className="pointer-events-none"
                      fill="none"
                      stroke="var(--topology-relation-spine-halo)"
                      strokeLinecap="round"
                      strokeWidth="var(--topology-relation-spine-halo-width)"
                      opacity="var(--topology-relation-spine-halo-opacity)"
                    />
                  ) : null}
                  {selected ? (
                    <path
                      data-overview-connector-from={connector.from}
                      data-overview-connector-to={connector.to}
                      data-selected-relation-halo="true"
                      data-selected-relation-halo-token="--topology-relation-label-selected-surface"
                      data-relation-quality={connector.relationQuality ?? 'supported'}
                      data-relation-stroke-halo-width-token="--topology-relation-stroke-selected-halo-width"
                      className="pointer-events-none"
                      fill="none"
                      stroke="var(--topology-relation-label-selected-surface)"
                      strokeLinecap="round"
                      strokeWidth={tone.haloWidth}
                      opacity={0.9}
                    />
                  ) : null}
                  <path
                    data-overview-connector-from={connector.from}
                    data-overview-connector-to={connector.to}
                    data-selected-relation={selected ? 'true' : 'false'}
                    data-relation-kind={connector.kind}
                    data-relation-quality={connector.relationQuality ?? 'supported'}
                    data-relation-type={connector.relationType}
                    data-relation-stroke-contract="quality-token"
                    data-relation-stroke-token={tone.strokeToken}
                    data-relation-stroke-width-token={tone.strokeWidthToken}
                    data-relation-stroke-evidence-boost={
                      (connector.evidenceCount ?? 0) > 0 || connector.authored === true
                        ? 'true'
                        : 'false'
                    }
                    className="pointer-events-none"
                    fill="none"
                    stroke={tone.stroke}
                    strokeDasharray={tone.dasharray}
                    strokeLinecap="round"
                    strokeWidth={tone.strokeWidth}
                    opacity={tone.opacity}
                  />
                  {!selected ? (
                    <circle
                      data-overview-connector-from={connector.from}
                      data-overview-connector-to={connector.to}
                      data-overview-hierarchy-terminal="child"
                      data-overview-hierarchy-terminal-contract="contains-edge-lands-on-child-card"
                      data-relation-kind={connector.kind}
                      data-relation-quality={connector.relationQuality ?? 'supported'}
                      data-relation-type={connector.relationType}
                      data-relation-spine-terminal-token="--topology-relation-spine-terminal"
                      data-relation-spine-terminal-radius-token="--topology-relation-spine-terminal-radius"
                      className="pointer-events-none"
                      fill="var(--topology-relation-spine-terminal)"
                      r="var(--topology-relation-spine-terminal-radius)"
                    />
                  ) : null}
                </g>
              );
            })
          : null}
        {egoRelationConnectors.map((connector) => {
          const selected =
            selectedRelationEdgeId !== null && connector.edgeId === selectedRelationEdgeId;
          const tone = relationConnectorTone(connector, selected);
          return (
            <g key={`ego:${connector.key}`}>
              <path
                data-connector={connector.to}
                data-relation-hit-path="true"
                data-relation-kind={connector.kind}
                data-relation-quality={connector.relationQuality ?? 'supported'}
                data-relation-type={connector.relationType}
                className="pointer-events-auto cursor-pointer"
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                onClick={(event) => {
                  event.stopPropagation();
                  selectRelation(connector);
                }}
              />
              {selected ? (
                  <path
                    data-connector={connector.to}
                    data-selected-relation-halo="true"
                    data-selected-relation-halo-token="--topology-relation-label-selected-surface"
                    data-relation-quality={connector.relationQuality ?? 'supported'}
                    data-relation-stroke-halo-width-token="--topology-relation-stroke-selected-halo-width"
                    className="pointer-events-none topology-connector-path"
                    fill="none"
                    stroke="var(--topology-relation-label-selected-surface)"
                    strokeWidth={tone.haloWidth}
                    opacity={0.9}
                  />
              ) : null}
              <path
                data-connector={connector.to}
                data-selected-relation={selected ? 'true' : 'false'}
                data-relation-kind={connector.kind}
                data-relation-quality={connector.relationQuality ?? 'supported'}
                data-relation-type={connector.relationType}
                data-relation-stroke-contract="quality-token"
                data-relation-stroke-token={tone.strokeToken}
                data-relation-stroke-width-token={tone.strokeWidthToken}
                data-relation-stroke-evidence-boost={
                  (connector.evidenceCount ?? 0) > 0 || connector.authored === true
                    ? 'true'
                    : 'false'
                }
                className="pointer-events-none topology-connector-path"
                fill="none"
                stroke={tone.stroke}
                strokeDasharray={tone.dasharray}
                strokeWidth={tone.strokeWidth}
                opacity={tone.opacity}
              />
            </g>
          );
        })}
        {egoRelationLabels.map((label, index) => {
          const visibleRelationLabel = formatRelationVisibleLabel(
            label.relationType,
            label.count,
          );
          return (
            <g
              key={`ego-label:${label.key}`}
              data-relation-label-group="true"
              data-relation-kind={label.kind}
              data-relation-quality={label.relationQuality ?? 'supported'}
              data-relation-type={label.relationType}
              data-relation-type-label={visibleRelationLabel}
              className="pointer-events-auto cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={tEdgeTooltip('relationAriaLabel', { label: visibleRelationLabel })}
              onClick={(event) => {
                event.stopPropagation();
                selectRelation(label);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                selectRelation(label);
              }}
            >
              <rect
                data-relation-label-bg={`ego:${label.key}`}
                data-selected-relation={
                  selectedRelationEdgeId && label.edgeId === selectedRelationEdgeId
                    ? 'true'
                    : 'false'
                }
                fill={
                  selectedRelationEdgeId && label.edgeId === selectedRelationEdgeId
                    ? 'rgba(139,151,255,0.16)'
                    : 'var(--color-canvas)'
                }
                stroke={
                  selectedRelationEdgeId && label.edgeId === selectedRelationEdgeId
                    ? 'rgba(139,151,255,0.92)'
                    : 'var(--topology-card-border-selected-strong)'
                }
                strokeWidth={0.7}
                rx={7}
                opacity={0}
              />
              <text
                data-connector-relation-label="true"
                data-relation-label-id={`ego:${label.key}`}
                data-relation-label-from={label.from}
                data-relation-label-to={label.to}
                data-relation-label-index={index}
                data-relation-kind={label.kind}
                data-relation-quality={label.relationQuality ?? 'supported'}
                data-relation-type={label.relationType}
                data-relation-type-label={visibleRelationLabel}
                data-relation-count={label.count}
                data-relation-label-svg-text-token="--topology-relation-label-svg-text"
                data-relation-label-svg-text-size-token="--topology-relation-label-svg-text-size"
                dominantBaseline="middle"
                textAnchor="middle"
                fill="var(--topology-relation-label-svg-text)"
                className="pointer-events-none select-none font-mono text-[length:var(--topology-relation-label-svg-text-size)] uppercase tracking-[0.08em]"
              >
                {visibleRelationLabel}
              </text>
            </g>
          );
        })}
        {activeHullConnectors.map((connector) => (
          <g key={`drag:${connector.key}`}>
            <path
              data-drag-connector-from={connector.from}
              data-drag-connector-to={connector.to}
              data-drag-cluster-connector="true"
              data-relation-kind={connector.kind}
              data-relation-quality={connector.relationQuality ?? 'supported'}
              data-relation-type={connector.relationType}
              data-drag-connector-stroke-token={
                activeDragMotion
                  ? '--topology-card-border-selected-strong'
                  : '--topology-card-border-selected'
              }
              className="topology-connector-path"
              fill="none"
              stroke={
                activeDragMotion
                  ? 'var(--topology-card-border-selected-strong)'
                  : 'var(--topology-card-border-selected)'
              }
              strokeWidth={activeDragMotion ? 1.75 : 1.35}
              opacity={activeDragMotion ? 0.96 : 0.86}
            />
            {activeHullMode === 'drag' ? (
              <>
                <rect
                  data-relation-label-bg={`drag:${connector.key}`}
                  fill="var(--color-canvas)"
                  stroke="var(--topology-card-border-selected-strong)"
                  strokeWidth={0.7}
                  rx={7}
                  opacity={0}
                />
                <text
                  data-relation-label-id={`drag:${connector.key}`}
                  data-relation-label-from={connector.from}
                  data-relation-label-to={connector.to}
                  data-drag-relation-label-from={connector.from}
                  data-drag-relation-label-to={connector.to}
                  data-drag-relation-label="true"
                  data-relation-kind={connector.kind}
                  data-relation-quality={connector.relationQuality ?? 'supported'}
                  data-relation-type={connector.relationType}
                  data-relation-type-label={formatRelationLabel(connector.relationType)}
                  data-relation-label-visible-text={formatRelationVisibleLabel(
                    connector.relationType,
                  )}
                  data-relation-label-svg-text-token="--topology-relation-label-svg-text"
                  data-relation-label-svg-text-size-token="--topology-relation-label-svg-text-size"
                  dominantBaseline="middle"
                  textAnchor="middle"
                  fill="var(--topology-relation-label-svg-text)"
                  className="pointer-events-none select-none font-mono text-[length:var(--topology-relation-label-svg-text-size)] uppercase tracking-[0.08em]"
                >
                  {formatRelationVisibleLabel(connector.relationType)}
                </text>
              </>
            ) : null}
          </g>
        ))}
      </svg>
      {egoRelationLabels.map((label) => {
        const selected =
          selectedRelationEdgeId !== null && label.edgeId === selectedRelationEdgeId;
        const quality = label.relationQuality ?? 'supported';
        const evidenceState = relationEvidenceState(label);
        const evidenceChipText = relationEvidenceChipText({
          evidenceCount: label.evidenceCount,
          state: evidenceState,
        });
        const evidenceText = relationEvidenceAriaText({
          evidenceCount: label.evidenceCount,
          state: evidenceState,
        });
        const labelText = formatRelationLabel(label.relationType, label.count);
        const selectedCardOwnsRelationSummary =
          selectedSlug != null &&
          (selectedSlug === label.edgeSource || selectedSlug === label.edgeTarget);
        const relationLabelVisibleCountPolicy =
          selected || selectedCardOwnsRelationSummary
            ? 'selected-card-summary-owns-count'
            : 'relation-label-shows-count';
        const visibleLabelText =
          relationLabelVisibleCountPolicy === 'selected-card-summary-owns-count'
            ? formatRelationVisibleLabel(label.relationType)
            : formatRelationVisibleLabel(label.relationType, label.count);
        const agentGateKind = relationAgentGateKind(label);
        const primaryCopyAction = relationPrimaryCopyAction(agentGateKind);
        const agentGateText = relationAgentGateChipText(agentGateKind);
        const agentActionChipText = relationActionChipText(primaryCopyAction);
        const agentGateRouteText = relationAgentGateRouteText(agentGateKind);
        const cliFallbackCommand = relationLabelCliFallbackCommand({
          action: primaryCopyAction,
          from: label.edgeSource,
          relationType: label.relationType,
          to: label.edgeTarget,
        });
        const visibleBadgeWidth = Math.max(
          RELATION_BADGE_MIN_WIDTH_PX,
          visibleLabelText.length * RELATION_BADGE_CHAR_WIDTH_PX +
            RELATION_BADGE_PAD_X_PX +
            RELATION_BADGE_DIRECTION_CHIP_WIDTH_PX,
        );
        return (
          <button
            key={`ego-label-button:${label.key}`}
            type="button"
            data-relation-label-button={`ego:${label.key}`}
            data-relation-label-hit="true"
            data-relation-kind={label.kind}
            data-relation-quality={quality}
            data-relation-evidence-state={evidenceState}
            data-relation-evidence-count={label.evidenceCount ?? 0}
            data-relation-evidence-chip-text={evidenceChipText}
            data-relation-type={label.relationType}
            data-relation-type-label={labelText}
            data-relation-label-visible-text={visibleLabelText}
            data-relation-label-visible-count-policy={relationLabelVisibleCountPolicy}
            data-relation-label-readable-text={`${labelText} · ${evidenceChipText}`}
            data-selected-relation={selected ? 'true' : 'false'}
            data-agent-gate-kind={agentGateKind}
            data-primary-copy-action={primaryCopyAction}
            data-cli-fallback-command={cliFallbackCommand}
            data-relation-fact-route="fact>evidence>gate>action"
            data-relation-fact-route-quality={quality}
            data-relation-fact-route-evidence={evidenceState}
            data-relation-fact-route-gate={agentGateKind}
            data-relation-fact-route-action={primaryCopyAction}
            data-relation-label-fact-segmentation="type-visible>metadata-hidden"
            data-relation-label-direction-contract="edge-source-to-target-metadata"
            data-relation-label-agent-gate-visible="metadata-only"
            data-drag-hit-disabled={activeDragCluster !== null ? 'true' : 'false'}
            data-label-geometry-source="html-hit-target"
            data-relation-label-card-clearance-token="--topology-relation-label-card-clearance"
            data-relation-label-density={selected ? 'focus-token' : 'scan-token'}
            data-relation-label-compact={selected ? 'false' : undefined}
            data-relation-label-token-contract="hit-target-and-visible-badge-share-relation-label-tokens"
            data-relation-label-pointer-contract="html-hit-target-click-selects-relation"
            data-relation-label-surface-token="--topology-relation-label-surface"
            data-relation-label-border-token="--topology-relation-label-border"
            data-relation-label-shadow-token="--topology-relation-label-shadow"
            data-relation-label-text-token="--topology-relation-label-text"
            data-relation-label-selected-text-token={
              selected ? '--topology-relation-label-selected-text' : undefined
            }
            data-relation-label-text-size-token="--topology-relation-label-text-size"
            data-relation-label-hit-min-height-token="--topology-relation-label-hit-min-height"
            data-relation-label-badge-height-token="--topology-relation-label-badge-height"
            data-relation-label-padding-x-token="--topology-relation-label-padding-x"
            data-relation-label-radius-token="--topology-relation-label-radius"
            data-relation-label-selected-surface-token={
              selected ? '--topology-relation-label-selected-surface' : undefined
            }
            data-relation-label-selected-border-token={
              selected ? '--topology-relation-label-selected-border' : undefined
            }
            data-relation-label-selected-shadow-token={
              selected ? '--topology-relation-label-selected-shadow' : undefined
            }
            data-relation-label-focus-ring-token="--topology-relation-label-focus-ring"
            data-relation-label-hover-contract="compact-edge-tooltip"
            data-visible-badge-width={visibleBadgeWidth}
            data-visible-badge-height={RELATION_BADGE_HEIGHT_PX}
            aria-label={`${tEdgeTooltip('relationAriaLabel', { label: labelText })} · ${quality} · ${evidenceText}${
              ` · ${agentGateText} · ${relationCopyActionText(primaryCopyAction)}`
            }`}
            className="pointer-events-auto absolute left-0 top-0 z-[4] inline-flex min-h-[var(--topology-relation-label-hit-min-height)] items-center justify-center overflow-visible whitespace-nowrap bg-transparent text-[length:var(--topology-relation-label-text-size)] font-medium leading-none tracking-normal transition-[opacity] duration-150 data-[drag-hit-disabled=true]:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-relation-label-focus-ring)] motion-reduce:transition-none"
            style={{
              color: selected
                ? 'var(--topology-relation-label-selected-text)'
                : 'var(--topology-relation-label-text)',
              opacity: selected ? 1 : 0,
              pointerEvents: activeDragCluster !== null ? 'none' : 'auto',
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              event.nativeEvent.stopImmediatePropagation();
              selectRelation(label);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              event.nativeEvent.stopImmediatePropagation();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
              event.nativeEvent.stopImmediatePropagation();
            }}
            onMouseEnter={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              hoverRelation(label, {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
            }}
            onMouseMove={(event) => {
              hoverRelation(label, { x: event.clientX, y: event.clientY });
            }}
            onMouseLeave={() => hoverRelation(label, null)}
            onFocus={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              hoverRelation(label, {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
            }}
            onBlur={() => hoverRelation(label, null)}
          >
            <span
              aria-hidden="true"
              data-relation-label-visible-badge="true"
              data-relation-label-surface-token="--topology-relation-label-surface"
              data-relation-label-border-token="--topology-relation-label-border"
              data-relation-label-shadow-token="--topology-relation-label-shadow"
              data-relation-label-text-token="--topology-relation-label-text"
              data-relation-label-selected-text-token={
                selected ? '--topology-relation-label-selected-text' : undefined
              }
              data-relation-label-text-size-token="--topology-relation-label-text-size"
              data-relation-label-badge-height-token="--topology-relation-label-badge-height"
              data-relation-label-padding-x-token="--topology-relation-label-padding-x"
              data-relation-label-radius-token="--topology-relation-label-radius"
              data-relation-label-selected-surface-token={
                selected ? '--topology-relation-label-selected-surface' : undefined
              }
              data-relation-label-selected-border-token={
                selected ? '--topology-relation-label-selected-border' : undefined
              }
              data-relation-label-selected-shadow-token={
                selected ? '--topology-relation-label-selected-shadow' : undefined
              }
              data-relation-label-fact-segmentation="type-visible>metadata-hidden"
              data-relation-label-direction-contract="edge-source-to-target-metadata"
              data-relation-label-segment-gap-token="--topology-relation-label-segment-gap"
              data-relation-label-segment-divider-token="--topology-relation-label-border"
              data-relation-direction-surface-token="--topology-relation-direction-surface"
              data-relation-direction-border-token="--topology-relation-direction-border"
              data-relation-direction-text-token="--topology-relation-direction-text"
              className="inline-flex h-[var(--topology-relation-label-badge-height)] max-w-full items-center justify-center gap-1.5 overflow-hidden rounded-[var(--topology-relation-label-radius)] border px-[var(--topology-relation-label-padding-x)] shadow-[var(--topology-relation-label-shadow)]"
              style={{
                backgroundColor: selected
                  ? 'var(--topology-relation-label-selected-surface)'
                  : 'var(--topology-relation-label-surface)',
                borderColor: selected
                  ? 'var(--topology-relation-label-selected-border)'
                  : 'var(--topology-relation-label-border)',
                boxShadow: selected
                  ? 'var(--topology-relation-label-selected-shadow)'
                  : 'var(--topology-relation-label-shadow)',
              }}
            >
              <span
                data-relation-quality-dot
                data-dot-token={relationQualityDotToken(quality)}
                data-glow-token={relationQualityGlowToken(quality)}
                data-relation-label-segment="quality"
                className={`sr-only ${relationQualityDotClassName(
                  quality,
                )}`}
              />
              <span
                aria-hidden="true"
                data-relation-direction-glyph="source-to-target"
                data-relation-label-segment="direction"
                data-surface-token="--topology-relation-direction-surface"
                data-border-token="--topology-relation-direction-border"
                data-text-token="--topology-relation-direction-text"
                className="sr-only"
              />
              <span
                data-relation-label-type-text
                data-relation-label-segment="type"
                data-segment-divider-token="--topology-relation-label-border"
                data-relation-label-type-text-contract="typed-fact-label-stays-readable"
                className="shrink-0"
              >
                {visibleLabelText}
              </span>
              <span
                data-relation-evidence-glyph={evidenceState}
                data-relation-label-segment="evidence"
                data-relation-evidence-chip-contract="proof-state-token"
                data-relation-evidence-chip-text={evidenceChipText}
                data-surface-token="--topology-relation-evidence-chip-surface"
                data-border-token="--topology-relation-evidence-chip-border"
                data-text-token="--topology-relation-evidence-chip-text"
                className="sr-only"
              />
              <span
                data-relation-label-agent-gate={agentGateKind}
                data-relation-label-segment="gate"
                data-primary-copy-action={primaryCopyAction}
                data-route-chip-text={agentGateRouteText}
                data-surface-token={`${relationAgentGateTokenPrefix(agentGateKind)}-surface`}
                data-border-token={`${relationAgentGateTokenPrefix(agentGateKind)}-border`}
                data-text-token={`${relationAgentGateTokenPrefix(agentGateKind)}-text`}
                className="sr-only"
              />
              {selected ? (
                <>
                <span
                  data-relation-quality-chip={quality}
                  data-relation-quality-chip-text={relationQualityChipText(quality)}
                  className="sr-only"
                />
                <span
                  data-relation-fact-route-rail="true"
                  className="sr-only"
                >
                  <span data-route-chip="fact" data-route-chip-text="fact" />
                  <span
                    data-route-chip="evidence"
                    data-route-chip-text={
                      evidenceState === 'source-backed'
                      ? 'src'
                      : evidenceState === 'authored'
                        ? 'auth'
                        : 'review'
                    }
                  />
                  <span
                    data-route-chip="gate"
                    data-route-chip-text={agentGateRouteText}
                    data-primary-copy-action={primaryCopyAction}
                    data-surface-token={`${relationAgentGateTokenPrefix(agentGateKind)}-surface`}
                    data-border-token={`${relationAgentGateTokenPrefix(agentGateKind)}-border`}
                    data-text-token={`${relationAgentGateTokenPrefix(agentGateKind)}-text`}
                  />
                  <span
                    data-route-chip="action"
                    data-route-chip-text={agentActionChipText}
                  />
                </span>
                </>
              ) : null}
            </span>
          </button>
        );
      })}
      {egoRelationLabels.map((label) => {
        const selected =
          selectedRelationEdgeId !== null && label.edgeId === selectedRelationEdgeId;
        if (!selected) return null;
        const quality = label.relationQuality ?? 'supported';
        const evidenceState = relationEvidenceState(label);
        const evidenceChipText = relationEvidenceChipText({
          evidenceCount: label.evidenceCount,
          state: evidenceState,
        });
        const labelText = formatRelationLabel(label.relationType, label.count);
        const visibleLabelText = formatRelationVisibleLabel(label.relationType);
        const agentGateKind = relationAgentGateKind(label);
        const primaryCopyAction = relationPrimaryCopyAction(agentGateKind);
        const agentActionChipText = relationActionChipText(primaryCopyAction);
        const agentGateRouteText = relationAgentGateRouteText(agentGateKind);
        return (
          <div
            key={`selected-relation-overlay:${label.key}`}
            data-selected-relation-overlay={`ego:${label.key}`}
            data-selected-relation-halo="true"
            data-selected-relation="true"
            data-relation-kind={label.kind}
            data-relation-quality={quality}
            data-relation-evidence-state={evidenceState}
            data-relation-evidence-count={label.evidenceCount ?? 0}
            data-relation-evidence-chip-text={evidenceChipText}
            data-relation-type={label.relationType}
            data-relation-type-label={labelText}
            data-relation-label-visible-text={visibleLabelText}
            data-relation-label-visible-count-policy="selected-card-summary-owns-count"
            data-relation-label-readable-text={`${labelText} · ${evidenceChipText}`}
            data-agent-gate-kind={agentGateKind}
            data-primary-copy-action={primaryCopyAction}
            data-relation-fact-route="fact>evidence>gate>action"
            data-relation-fact-route-quality={quality}
            data-relation-fact-route-evidence={evidenceState}
            data-relation-fact-route-gate={agentGateKind}
            data-relation-fact-route-action={primaryCopyAction}
            data-relation-label-fact-segmentation="type-visible>metadata-hidden"
            data-relation-label-direction-contract="edge-source-to-target-metadata"
            data-relation-label-compact="false"
            data-relation-label-density="focus-token"
            data-relation-label-selected-surface-token="--topology-relation-label-selected-surface"
            data-relation-label-selected-border-token="--topology-relation-label-selected-border"
            data-relation-label-selected-shadow-token="--topology-relation-label-selected-shadow"
            data-relation-label-selected-text-token="--topology-relation-label-selected-text"
            data-relation-label-text-size-token="--topology-relation-label-text-size"
            data-relation-label-hit-min-height-token="--topology-relation-label-hit-min-height"
            data-relation-label-padding-x-token="--topology-relation-label-padding-x"
            data-relation-label-radius-token="--topology-relation-label-radius"
            data-selected-relation-halo-token="--topology-relation-label-selected-surface"
            data-relation-label-segment-gap-token="--topology-relation-label-segment-gap"
            data-relation-label-segment-divider-token="--topology-relation-label-border"
            data-relation-direction-surface-token="--topology-relation-direction-surface"
            data-relation-direction-border-token="--topology-relation-direction-border"
            data-relation-direction-text-token="--topology-relation-direction-text"
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 z-[6] inline-flex min-h-[var(--topology-relation-label-hit-min-height)] items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[var(--topology-relation-label-radius)] border px-[var(--topology-relation-label-padding-x)] text-[length:var(--topology-relation-label-text-size)] font-medium leading-none tracking-normal text-[color:var(--topology-relation-label-selected-text)]"
            style={{
              backgroundColor: 'var(--topology-relation-label-selected-surface)',
              borderColor: 'var(--topology-relation-label-selected-border)',
              boxShadow: 'var(--topology-relation-label-selected-shadow)',
              opacity: 1,
              visibility: 'visible',
            }}
          >
            <span
              aria-hidden="true"
              data-relation-quality-dot
              data-dot-token={relationQualityDotToken(quality)}
              data-glow-token={relationQualityGlowToken(quality)}
              data-relation-label-segment="quality"
              className={`sr-only ${relationQualityDotClassName(
                quality,
              )}`}
            />
            <span
              aria-hidden="true"
              data-relation-direction-glyph="source-to-target"
              data-relation-label-segment="direction"
              data-surface-token="--topology-relation-direction-surface"
              data-border-token="--topology-relation-direction-border"
              data-text-token="--topology-relation-direction-text"
              className="sr-only"
            />
            <span
              data-relation-label-type-text
              data-relation-label-segment="type"
              data-segment-divider-token="--topology-relation-label-border"
              data-relation-label-type-text-contract="typed-fact-label-stays-readable"
              className="shrink-0"
            >
              {visibleLabelText}
            </span>
            <span
              aria-hidden="true"
              data-relation-evidence-glyph={evidenceState}
              data-relation-label-segment="evidence"
              data-relation-evidence-chip-contract="proof-state-token"
              data-relation-evidence-chip-text={evidenceChipText}
              data-surface-token="--topology-relation-evidence-chip-surface"
              data-border-token="--topology-relation-evidence-chip-border"
              data-text-token="--topology-relation-evidence-chip-text"
              className="sr-only"
            />
            <span
              aria-hidden="true"
              data-relation-label-agent-gate={agentGateKind}
              data-relation-label-segment="gate"
              data-primary-copy-action={primaryCopyAction}
              data-route-chip-text={agentActionChipText}
              data-surface-token={`${relationAgentGateTokenPrefix(agentGateKind)}-surface`}
              data-border-token={`${relationAgentGateTokenPrefix(agentGateKind)}-border`}
              data-text-token={`${relationAgentGateTokenPrefix(agentGateKind)}-text`}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              data-relation-quality-chip={quality}
              data-relation-quality-chip-text={relationQualityChipText(quality)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              data-relation-fact-route-rail="true"
              className="sr-only"
            >
              <span data-route-chip="fact" data-route-chip-text="fact" />
              <span
                data-route-chip="evidence"
                data-route-chip-text={
                  evidenceState === 'source-backed'
                  ? 'src'
                  : evidenceState === 'authored'
                    ? 'auth'
                    : 'review'
                }
              />
              <span
                data-route-chip="gate"
                data-route-chip-text={agentGateRouteText}
                data-primary-copy-action={primaryCopyAction}
                data-surface-token={`${relationAgentGateTokenPrefix(agentGateKind)}-surface`}
                data-border-token={`${relationAgentGateTokenPrefix(agentGateKind)}-border`}
                data-text-token={`${relationAgentGateTokenPrefix(agentGateKind)}-text`}
              />
              <span
                data-route-chip="action"
                data-route-chip-text={agentActionChipText}
              />
            </span>
          </div>
        );
      })}
      {cards.map((card) => {
        const nodeId = resolveNodeId(card.id);
        if (!nodeId) return null;
        const selected = selectedSlug === nodeId || selectedSlug === card.id;
        const pathRole =
          resolvedPathSourceNodeId === nodeId
            ? 'source'
            : resolvedPathTargetNodeId === nodeId
              ? 'target'
              : pathWorkflowActive
                ? 'candidate'
                : 'none';
        const pathRoleContract =
          pathRole === 'source'
            ? 'source-anchor-visible'
            : pathRole === 'target'
              ? 'target-anchor-visible'
              : pathRole === 'candidate'
                ? 'candidate-selectable'
                : 'none';
        const pathNextAction =
          pathRole === 'source'
            ? resolvedPathTargetNodeId
              ? 'review-path'
              : 'pick-target'
            : pathRole === 'target'
              ? 'review-path'
              : pathRole === 'candidate'
                ? resolvedPathSourceNodeId
                  ? 'choose-target'
                  : 'choose-source'
                : 'none';
        const pathBadgeLabel =
          pathRole === 'source' ? 'A' : pathRole === 'target' ? 'B' : '';
        const dimmed = ego !== null && !ego.slugs.has(nodeId);
        const healthRepairAuditTarget = resolvedHealthRepairTargetNodeId === nodeId;
        const dockParentNodeId = card.dock ? resolveNodeId(card.dock.parentId) : null;
        const dragging =
          activeDragCluster?.has(nodeId) ||
          Boolean(dockParentNodeId && activeDragCluster?.has(dockParentNodeId));
        const dragRole = !dragging
          ? undefined
          : activeDragRootSlug === nodeId
            ? 'root'
            : activeDragCluster?.has(nodeId)
              ? 'movable'
              : 'dock-follower';
        const dragSettled = dragSettledSlugs.has(nodeId);
        const pathEndpoint = pathRole === 'source' || pathRole === 'target';
        const kindDescription = describeKind?.(card.kind) ?? card.kind;
        const kindBadgeLabel =
          describeKindBadge?.(card.kind) ??
          kindDescription.split('·')[0]?.trim() ??
          FALLBACK_KIND_BADGE_LABEL[card.kind];
        // 카드 표면 = kind 틴트 × tier alpha 의 *정량 토큰*.
        // 상위 개념일수록 표면을 더 세게 주어 지도가 태그 더미가 아니라
        // project → domain → capability → element 위계로 먼저 읽히게 한다.
        const fill = ontologyFillTone(card.kind === 'project' ? 'project' : card.kind);
        const surfaceAlpha = TIER_SURFACE_ALPHA[card.tier];
        const tintBg = withAlpha(fill, surfaceAlpha.bg);
        const tintBorder = withAlpha(fill, surfaceAlpha.border);
        const tintBorderHover = withAlpha(fill, surfaceAlpha.hoverBorder);
        const selectedRelationSummaryText =
          selected && selectedRelationSummary
            ? tEdgeTooltip('selectedCardRelationSummaryAction', {
                relations: selectedRelationSummary.relationCount,
                types: selectedRelationSummary.typeCount,
              })
            : null;
        const selectedRelationSummaryCompactText =
          selected && selectedRelationSummary
            ? tEdgeTooltip('selectedCardRelationSummaryCompact', {
                relations: selectedRelationSummary.relationCount,
                types: selectedRelationSummary.typeCount,
              })
            : null;
        const selectedRelationSummaryOwnsMeta =
          selected && selectedRelationSummary !== null;
        const selectedCardAccessibleLabel =
          selectedRelationSummaryOwnsMeta && selectedRelationSummaryText
            ? `${kindDescription} · ${card.title} · ${selectedRelationSummaryText}`
            : undefined;
        const coreHierarchyCountHidden = card.tier <= 1;
        const cardSpacing = selectedRelationSummaryOwnsMeta
          ? SELECTED_FOCUS_CARD_SPACING
          : TIER_CARD_SPACING[card.tier];
        return (
          <button
            key={card.id}
            type="button"
            data-skeleton-card
            data-slug={nodeId}
            data-anchor={card.anchor ?? 'center'}
            data-tier={card.tier}
            data-dock-parent={
              dockParentNodeId ?? undefined
            }
            data-dock-side={card.dock?.side}
            data-dock-index={card.dock?.index}
            data-dock-total={card.dock?.total}
            data-selected={selected ? 'true' : 'false'}
            data-path-workflow={pathWorkflowActive ? 'true' : 'false'}
            data-path-role={pathRole}
            data-path-role-contract={pathRoleContract}
            data-path-endpoint-max-width-token={
              pathEndpoint ? '--topology-path-endpoint-card-max-width' : undefined
            }
            data-path-next-action={pathNextAction}
            data-card-layout-size-key={[
              card.title,
              card.kind,
              card.tier,
              card.count ?? '',
              card.anchor ?? 'center',
              dockParentNodeId ?? '',
              card.dock?.side ?? '',
              card.dock?.index ?? '',
              card.dock?.total ?? '',
              selected ? 'selected' : 'default',
              selectedRelationSummaryOwnsMeta
                ? `${selectedRelationSummary?.relationCount ?? 0}:${
                    selectedRelationSummary?.typeCount ?? 0
                  }`
                : '',
              pathRole,
              healthRepairAuditTarget ? healthRepairTarget?.kind ?? 'repair' : '',
            ].join('|')}
            data-path-attention-layer={
              pathWorkflowActive && pathRole !== 'none' ? 'focus-path-state' : undefined
            }
            data-path-anchor={pathRole === 'source' || pathRole === 'target' ? pathRole : undefined}
            data-path-badge-label={pathBadgeLabel || undefined}
            data-dimmed={dimmed ? 'true' : 'false'}
            data-health-repair-audit-target={
              healthRepairAuditTarget ? 'true' : undefined
            }
            data-health-repair-audit-kind={
              healthRepairAuditTarget ? healthRepairTarget?.kind : undefined
            }
            data-health-repair-audit-contract={
              healthRepairAuditTarget ? 'panel-target-card-highlight' : undefined
            }
            data-health-repair-audit-badge={
              healthRepairAuditTarget ? tEdgeTooltip('healthRepairAuditBadge') : undefined
            }
            data-health-repair-audit-badge-contract={
              healthRepairAuditTarget ? 'inline-card-state-label' : undefined
            }
            data-drag-cluster={dragging ? 'true' : 'false'}
            data-drag-cluster-role={dragRole}
            data-dragging-active={dragging && activeDragMotion ? 'true' : 'false'}
            data-drag-pushed={dragSettled ? 'true' : 'false'}
            data-card-selection-box-policy="boxless-border-state"
            data-drag-wash-token={
              dragging || dragSettled
                ? activeDragMotion && dragging
                  ? '--topology-card-drag-active-wash'
                  : '--topology-card-drag-wash'
                : undefined
            }
            data-card-readable-width-contract="tier-token-preserves-title-lane"
            data-card-desktop-title-contract={
              card.tier <= 2 ? 'core-ontology-label-readable-at-16x9' : undefined
            }
            data-card-selected-title-priority={
              selectedRelationSummaryOwnsMeta
                ? 'selected-title-before-subtree-count'
                : undefined
            }
            data-card-max-width-token={
              selectedRelationSummaryOwnsMeta
                ? SELECTED_FOCUS_CARD_MAX_WIDTH_TOKEN
                : pathEndpoint
                ? '--topology-path-endpoint-card-max-width'
                : healthRepairAuditTarget
                ? HEALTH_REPAIR_CARD_MAX_WIDTH_TOKEN
                : TIER_CARD_MAX_WIDTH_TOKEN[card.tier]
            }
            data-card-spacing-contract="css-tokenized-block-rhythm"
            data-card-gap-token="--topology-card-gap"
            data-card-padding-x-token="--topology-card-padding-x"
            data-card-padding-y-token="--topology-card-padding-y"
            data-card-min-block-size-token="--topology-card-min-block-size"
            data-card-radius-token="--topology-card-radius"
            data-card-block-padding-contract={
              selectedRelationSummaryOwnsMeta
                ? 'selected-card-balanced-y-padding'
                : undefined
            }
            data-card-hidden-count-policy={
              selectedRelationSummaryOwnsMeta
                ? 'direct-relation-summary-replaces-subtree-count'
                : undefined
            }
            data-card-selected-quiet-state={
              selected && !dragging && !dragSettled
                ? 'relation-first-borderless-focus'
                : undefined
            }
            data-card-selected-quiet-border-token={
              selected && !dragging && !dragSettled
                ? SELECTED_FOCUS_QUIET_BORDER_TOKEN
                : undefined
            }
            data-card-selected-quiet-wash-token={
              selected && !dragging && !dragSettled
                ? SELECTED_FOCUS_QUIET_WASH_TOKEN
                : undefined
            }
            data-card-accessible-label-contract={
              selectedRelationSummaryOwnsMeta
                ? 'selected-card-kind-title-relation-summary'
                : undefined
            }
            data-card-accessible-child-policy={
              selectedRelationSummaryOwnsMeta
                ? 'single-button-label-owns-visible-fragments'
                : undefined
            }
            aria-label={selectedCardAccessibleLabel}
            onClick={(event) => {
              event.stopPropagation();
              if (event.currentTarget.dataset.surfaceHidden === 'true') return;
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              if (pathWorkflowActive && onPathSelectionChange) {
                const currentSource = pathSelection?.sourceSlug ?? null;
                const currentTarget = pathSelection?.targetSlug ?? null;
                if (!currentSource || currentTarget || currentSource === nodeId) {
                  onPathSelectionChange({ sourceSlug: nodeId, targetSlug: null });
                } else {
                  onPathSelectionChange({ sourceSlug: currentSource, targetSlug: nodeId });
                }
                return;
              }
              onSelect?.(nodeId);
            }}
            onMouseEnter={(event) => {
              if (event.currentTarget.dataset.surfaceHidden === 'true') return;
              if (dragRef.current || activeDragCluster) return;
              setHovered({ card, nodeId });
            }}
            onMouseLeave={() => setHovered(null)}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setHovered(null);
              if (event.currentTarget.dataset.surfaceHidden === 'true') return;
              if (event.button !== 0) return;
              clearActiveDragCluster();
              const rootSlug = dockParentNodeId ?? nodeId;
              if (!graph.hasNode(rootSlug)) return;
	              const movableNodeIds = buildMovableNodeIds();
	              const tierByNodeId = buildVisibleCardTierByNodeId();
	              const cardElements = collectSkeletonCardElementIndex(containerRef.current);
	              const movingGroup = collectDraggedCluster(
	                graph,
	                rootSlug,
                movableNodeIds,
                tierByNodeId,
              );
              const dockDragSnapshots = snapshotDockDragPositions(
                containerRef.current,
                movingGroup,
                cardElements.all,
              );
              lastDragDomIndexSizeRef.current = cardElements.all.length;
              lastDockDragSnapshotSizeRef.current = dockDragSnapshots.size;
              setDragFrameMarkerSnapshot({
                domIndexSize: cardElements.all.length,
                snapshotCount: dockDragSnapshots.size,
              });
              dragRef.current = {
                sourceSlug: nodeId,
                rootSlug,
                lastX: event.clientX,
                lastY: event.clientY,
                travel: 0,
	                dockDragSnapshots,
	                cardElements,
	                movedGroup: movingGroup,
                movableNodeIds,
                tierByNodeId,
              };
              setActiveDragRootSlug(rootSlug);
              setActiveDragMotion(false);
              activeDragMotionRef.current = false;
              setActiveDragCluster(movingGroup);
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                /* jsdom 등 미지원 환경 */
              }
            }}
            onPointerMove={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const drag = dragRef.current;
              if (!drag || drag.sourceSlug !== nodeId || !sigma) return;
              const dx = event.clientX - drag.lastX;
              const dy = event.clientY - drag.lastY;
              drag.lastX = event.clientX;
              drag.lastY = event.clientY;
              drag.travel += Math.abs(dx) + Math.abs(dy);
              if (drag.travel <= 4) return;
              setHovered(null);
              if (!activeDragMotionRef.current) {
                activeDragMotionRef.current = true;
                setActiveDragMotion(true);
              }
              const movingGroup = drag.movedGroup;
              const delta = clampDraggedClusterDelta(
                containerRef.current,
                movingGroup,
                dx,
                dy,
                drag.cardElements.all,
              );
              if (delta.dx === 0 && delta.dy === 0) return;
              const movedGroup = moveDraggedCluster(
                graph,
                drag.rootSlug,
                delta.dx,
                delta.dy,
                sigma,
                drag.movableNodeIds,
                drag.tierByNodeId,
                movingGroup,
              );
              drag.movedGroup = movedGroup;
              const container = containerRef.current;
              if (repositionRafRef.current !== null) {
                if (container) {
                  container.dataset.dragRepositionPolicy = 'raf-coalesced-pointer-move';
                  container.dataset.dragRepositionCoalesced = 'true';
                }
                return;
              }
              if (container) {
                container.dataset.dragRepositionPolicy = 'raf-coalesced-pointer-move';
                container.dataset.dragRepositionCoalesced = 'false';
              }
              repositionRafRef.current = window.requestAnimationFrame(() => {
                repositionRafRef.current = null;
                const currentContainer = containerRef.current;
                if (currentContainer) {
                  currentContainer.dataset.dragRepositionPolicy =
                    'raf-coalesced-pointer-move';
                  currentContainer.dataset.dragRepositionCoalesced = 'false';
                }
                reposition();
              });
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
              releaseDrag(nodeId);
            }}
            // 터치 제스처 중단/캡처 상실 시 드래그 상태 정리 — 버튼 미가압
            // 이동만으로 카드가 끌려가는 stale drag 방지.
            onPointerCancel={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dragRef.current = null;
              clearActiveDragCluster();
            }}
            onLostPointerCapture={() => releaseDrag(nodeId)}
            title={selectedCardAccessibleLabel ?? card.title}
            style={
              {
                zIndex: dragging
                  ? 9
                  : selected
                    ? 8
                    : dimmed
                      ? 0
                      : TIER_Z_INDEX[card.tier],
                fontSize: `calc(${TIER_FONT_PX[card.tier]}px * var(--topology-card-scale, 1))`,
                '--topology-card-gap': cardSpacing.gap,
                '--topology-card-padding-x': cardSpacing.paddingX,
                '--topology-card-padding-y': cardSpacing.paddingY,
                '--topology-card-min-block-size': cardSpacing.minBlockSize,
                '--topology-card-radius': cardSpacing.radius,
                maxWidth:
                  selectedRelationSummaryOwnsMeta
                    ? `var(${SELECTED_FOCUS_CARD_MAX_WIDTH_TOKEN})`
                    : pathEndpoint
                    ? 'var(--topology-path-endpoint-card-max-width)'
                    : healthRepairAuditTarget
                    ? `var(${HEALTH_REPAIR_CARD_MAX_WIDTH_TOKEN})`
                    : `var(${TIER_CARD_MAX_WIDTH_TOKEN[card.tier]})`,
                '--card-border': selected
                  ? `var(${SELECTED_FOCUS_QUIET_BORDER_TOKEN})`
                  : healthRepairAuditTarget
                    ? 'var(--topology-health-repair-card-border)'
                  : tintBorder,
                '--card-border-hover': selected
                  ? `var(${SELECTED_FOCUS_QUIET_BORDER_TOKEN})`
                  : healthRepairAuditTarget
                    ? 'var(--topology-health-repair-card-border-strong)'
                  : tintBorderHover,
              } as React.CSSProperties
            }
            className={`pointer-events-auto absolute left-0 top-0 inline-flex cursor-grab items-center whitespace-nowrap border border-[color:var(--card-border)] bg-[color:var(--color-panel)] transition-[opacity,border-color,box-shadow] duration-200 ease-out data-[surface-hidden=true]:invisible data-[surface-hidden=true]:pointer-events-none data-[surface-hidden=true]:cursor-default hover:border-[color:var(--card-border-hover)] active:cursor-grabbing motion-reduce:transition-none ${
              selected
                ? 'shadow-none outline-none'
                : ''
            } ${
              healthRepairAuditTarget && !selected
                ? 'shadow-[0_0_0_1px_var(--topology-health-repair-card-outline),0_12px_32px_var(--topology-health-repair-card-shadow)] outline outline-1 outline-offset-1 outline-[color:var(--topology-health-repair-card-outline)]'
                : ''
            } ${
              dragging
                ? 'border-[color:var(--topology-card-border-selected-strong)] shadow-none outline-none'
                : ''
            } ${
              dragSettled
                ? 'border-[color:var(--topology-card-border-selected)] shadow-none outline-none'
                : ''
            } ${TIER_CARD_CLASS[card.tier]}`}
          >
            {/* 틴트 레이어 — 불투명 panel 베이스 위에 kind wash. 반투명 bg
                단독이면 카드 뒤 엣지가 비쳐 보인다. */}
            <span
              aria-hidden="true"
              data-edge-mask
              data-edge-mask-contract="paint-only-does-not-expand-card-scroll-width"
              className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[color:var(--color-canvas)]"
              style={{ boxShadow: `0 0 0 ${EDGE_CLEARANCE_MASK_PX}px var(--color-canvas)` }}
            />
            <span
              aria-hidden="true"
              data-kind-tint
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                background: selected
                  ? `linear-gradient(0deg, var(${SELECTED_FOCUS_QUIET_WASH_TOKEN}), var(${SELECTED_FOCUS_QUIET_WASH_TOKEN})), ${tintBg}`
                  : healthRepairAuditTarget
                    ? `linear-gradient(0deg, var(--topology-health-repair-card-wash), var(--topology-health-repair-card-wash)), ${tintBg}`
                  : dragging || dragSettled
                    ? `linear-gradient(0deg, ${
                        activeDragMotion && dragging
                          ? 'var(--topology-card-drag-active-wash)'
                          : 'var(--topology-card-drag-wash)'
                      }, ${
                        activeDragMotion && dragging
                          ? 'var(--topology-card-drag-active-wash)'
                          : 'var(--topology-card-drag-wash)'
                      }), ${tintBg}`
                  : tintBg,
              }}
            />
            <span
              aria-hidden="true"
              className="relative shrink-0 rounded-full"
              style={{
                width: TIER_DOT_EM[card.tier],
                height: TIER_DOT_EM[card.tier],
                backgroundColor: fill,
              }}
            />
            <span
              data-card-kind-badge
              data-card-kind={card.kind}
              data-card-kind-badge-contract="visible-ontology-kind-marker"
              data-surface-token="--topology-card-kind-surface"
              data-border-token="--card-kind-border"
              data-accent-token="--card-kind-accent"
              aria-label={selectedRelationSummaryOwnsMeta ? undefined : kindDescription}
              aria-hidden={selectedRelationSummaryOwnsMeta ? 'true' : undefined}
              title={kindDescription}
              className="relative inline-flex h-[1.42em] max-w-[5.8em] shrink-0 items-center justify-center truncate rounded-[0.38em] border border-[color:var(--card-kind-border)] bg-[color:var(--topology-card-kind-surface)] px-[0.36em] text-[0.62em] font-semibold leading-none text-[color:var(--card-kind-accent)]"
              style={{
                '--card-kind-accent': fill,
                '--card-kind-border': withAlpha(fill, 0.34),
              } as React.CSSProperties}
            >
              {kindBadgeLabel}
            </span>
            <span
              data-card-title
              data-path-endpoint-title={pathEndpoint ? pathRole : undefined}
              data-path-endpoint-title-contract={
                pathEndpoint ? 'endpoint-title-gets-readable-width' : undefined
              }
              data-card-title-lane-contract={
                selectedRelationSummaryOwnsMeta
                  ? 'selected-title-keeps-current-focus-readable'
                  : healthRepairAuditTarget
                    ? 'health-repair-target-keeps-project-title-readable'
                  : coreHierarchyCountHidden
                    ? 'core-title-keeps-map-readable'
                  : 'title-shrinks-before-meta-chips'
              }
              data-full-title={card.title}
              aria-hidden={selectedRelationSummaryOwnsMeta ? 'true' : undefined}
              className="relative min-w-0 truncate"
            >
              {card.title}
            </span>
            {card.count !== undefined && !selectedRelationSummaryOwnsMeta ? (
              <span
                data-skeleton-card-count
                data-count-chip-contract="tokenized-node-scale-signal"
                data-surface-token="--topology-card-count-surface"
                data-border-token="--topology-card-count-border"
                data-text-token="--topology-card-count-text"
                data-count-chip-visibility={
                  coreHierarchyCountHidden
                    ? 'sr-only-core-hierarchy-title'
                    : 'visible'
                }
                className={
                  coreHierarchyCountHidden
                    ? 'sr-only'
                    : 'relative ml-0.5 inline-flex h-[1.42em] min-w-[1.65em] shrink-0 items-center justify-center rounded-full border border-[color:var(--topology-card-count-border)] bg-[color:var(--topology-card-count-surface)] px-[0.42em] font-mono text-[0.68em] leading-none text-[color:var(--topology-card-count-text)]'
                }
              >
                {card.count}
              </span>
            ) : null}
            {healthRepairAuditTarget ? (
              <span
                data-testid="sigma-health-repair-audit-badge"
                data-health-repair-audit-badge-contract="inline-card-state-label"
                className="relative ml-0.5 inline-flex h-[1.45em] shrink-0 items-center rounded-full border border-[color:var(--topology-health-repair-card-border)] bg-[color:var(--topology-health-repair-card-wash)] px-[0.48em] font-mono text-[0.66em] leading-none text-[color:var(--color-indigo-accent)]"
              >
                {tEdgeTooltip('healthRepairAuditBadge')}
              </span>
            ) : null}
            {selected && selectedRelationSummary ? (
              <span
                data-testid="sigma-selected-card-relation-summary"
                data-relation-summary-contract="selected-card-direct-facts"
                data-relation-summary-visible-contract="primary-count-visible-action-accessible"
                data-relation-summary-map-label-fallback="selected-card-keeps-action-when-map-labels-collapse"
                data-relation-summary-readable-text={selectedRelationSummaryText ?? undefined}
                data-relation-summary-visible-text={
                  selectedRelationSummaryCompactText ?? undefined
                }
                data-relation-summary-surface-token="--topology-relation-summary-surface"
                data-relation-summary-border-token="--topology-relation-summary-border"
                data-relation-summary-text-token="--topology-relation-summary-text"
                data-relation-count={selectedRelationSummary.relationCount}
                data-relation-type-count={selectedRelationSummary.typeCount}
                aria-label={
                  selectedRelationSummaryOwnsMeta
                    ? undefined
                    : selectedRelationSummaryText ?? undefined
                }
                aria-hidden={selectedRelationSummaryOwnsMeta ? 'true' : undefined}
                title={selectedRelationSummaryText ?? undefined}
                className="relative ml-0.5 inline-flex h-[1.55em] shrink-0 items-center rounded-full border border-[color:var(--topology-relation-summary-border)] bg-[color:var(--topology-relation-summary-surface)] px-[0.52em] font-mono text-[0.72em] leading-none text-[color:var(--topology-relation-summary-text)]"
              >
                {selectedRelationSummaryCompactText}
              </span>
            ) : null}
            {pathEndpoint ? (
              <span
                aria-hidden="true"
                data-path-card-badge={pathRole}
                data-path-card-badge-label={pathBadgeLabel}
                data-path-card-badge-contract="endpoint-role-token"
                data-surface-token="--topology-path-endpoint-surface"
                data-border-token="--topology-path-endpoint-border"
                data-text-token="--topology-path-endpoint-text"
                className="relative ml-0.5 inline-flex h-[1.35em] min-w-[1.35em] shrink-0 items-center justify-center rounded-full border border-[color:var(--topology-path-endpoint-border)] bg-[color:var(--topology-path-endpoint-surface)] px-[0.28em] font-mono text-[0.66em] leading-none text-[color:var(--topology-path-endpoint-text)]"
              >
                {pathBadgeLabel}
              </span>
            ) : null}
          </button>
        );
      })}
      {/* hover 간단 팝업 — 계층 라벨 + 한 줄 설명 (details-on-demand 의
          첫 단계, 클릭 전 확인용). */}
      {hovered ? (
        <div
          ref={hoverPopupRef}
          data-testid="skeleton-card-hover"
          data-hover-for={hovered.nodeId}
          className="pointer-events-none absolute z-30 max-w-[22rem] rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3.5 py-2.5 shadow-[0_8px_20px_var(--topology-card-shadow)]"
          style={{ left: -9999, top: 0 }}
        >
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-[5px] w-[5px] shrink-0 rounded-full"
              style={{
                backgroundColor: ontologyFillTone(
                  hovered.card.kind === 'project' ? 'project' : hovered.card.kind,
                ),
              }}
            />
            {/* 가독성 1순위 — 작아서 안 읽힌다는 사용자 피드백으로 한 단계 확대. */}
            <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)]">
              {describeKind?.(hovered.card.kind) ?? hovered.card.kind}
            </span>
          </div>
          {hovered.card.summary ? (
            <p className="mt-1.5 line-clamp-3 break-keep text-[13px] leading-5 text-[color:var(--color-text-secondary)]">
              {hovered.card.summary}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
