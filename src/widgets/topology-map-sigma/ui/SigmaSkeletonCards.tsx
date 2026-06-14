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
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from '../lib/graph-build';
import { resolveTopologyUiScale } from '../lib/camera-fit';
import { ontologyFillTone } from '../lib/ontology-tone';
import {
  relationAgentGateKind,
  relationPrimaryCopyAction,
  type RelationAgentGateKind,
  type RelationCopyActionKind,
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
  onSelect?: (slug: string) => void;
  onRelationSelect?: (data: SigmaEdgeTooltipData) => void;
  /** hover 팝업의 계층 라벨 — 예: "도메인 · 2계층" (i18n 은 호출자 책임). */
  describeKind?: (kind: SkeletonCardModel['kind']) => string;
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
  0: 'gap-[0.6em] rounded-xl px-[1em] py-[0.62em] font-semibold text-[color:var(--color-text-primary)] shadow-[0_1px_3px_var(--topology-card-shadow)]',
  1: 'gap-[0.55em] rounded-lg px-[0.9em] py-[0.55em] font-medium text-[color:var(--color-text-primary)]',
  2: 'gap-[0.5em] rounded-md px-[0.85em] py-[0.45em] text-[color:var(--color-text-primary)]',
  3: 'gap-[0.45em] rounded-md px-[0.8em] py-[0.4em] text-[color:var(--color-text-secondary)]',
};

const TIER_DOT_EM: Record<SkeletonCardModel['tier'], string> = {
  0: '0.62em',
  1: '0.58em',
  2: '0.55em',
  3: '0.42em',
};

/**
 * dim 잉크 2단계 (디자이너 패널 합의): 방향 감각용 상위 anchor(project/
 * domain)는 0.25, 하위 칩은 dot+실루엣 수준 0.12. 펼친 열과 *겹치는* dim
 * 카드는 0 — "포커스 콘텐츠와 고스트 콘텐츠의 텍스트 충돌"은 디자이너
 * 제품에서 절대 허용되지 않는 픽셀이다.
 */
const DIM_ANCHOR_OPACITY = '0.25';
const DIM_CHIP_OPACITY = '0.12';
/** 펼친 열 카드 주변 충돌 판정 패딩(px). */
const COLLISION_PAD = 24;
const ANALYSIS_PANEL_TRAILING_PAD = 12;
const ANALYSIS_PANEL_BLOCK_END_PAD = 0;
const OVERVIEW_COLLISION_PAD = 2;
const SAFE_VIEWPORT_MARGIN = 8;
const FIXED_SURFACE_GAP = 8;
/** 멀티 컬럼 도킹의 열 간 가로 step(px) — 카드 max-w(224) + 넉넉한 거터. */
const COLUMN_STEP_PX = 320;
/** 카드 밖으로 삐져나온 Sigma edge 를 지우는 clearance halo(px). */
const EDGE_CLEARANCE_MASK_PX = 10;
/** 드래그 묶음 hull 여백(px) — 카드 clearance 보다 조금 넓게 branch 를 감싼다. */
const DRAG_CLUSTER_HULL_PAD_PX = 14;

// 반응형 카드 스케일 — resolveTopologyUiScale 이 단일 기준 (chrome zoom ·
// safe inset 과 동일 단계). 폰트가 배수를 타고(인라인 calc) 패딩/dot 은 em.
// CSS 미디어쿼리 대신 JS 주입 — 빌드 파이프라인이 utility 미참조 무단위
// 커스텀 프로퍼티를 떨구는 동작이 있다.
/** hover 팝업 폭 추정(px) — flip 판정용 (max-w-[17rem]). */
const HOVER_POP_W = 272;
const BASE_ANCHOR_CARD_MAX_WIDTH_PX = 224;
const ANCHOR_CARD_MAX_WIDTH_SCALE_STEP_PX = 128;

/** kind 위계 — 커넥터/ego 판정에 사용 (낮을수록 상위). */
const KIND_RANK: Record<SkeletonCardModel['kind'], number> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
  unknown: 4,
};

const TIER_Z_INDEX: Record<SkeletonCardModel['tier'], number> = {
  0: 4,
  1: 3,
  2: 2,
  3: 1,
};

const RELATION_BADGE_HEIGHT_PX = 36;
const RELATION_BADGE_MIN_WIDTH_PX = 34;
const RELATION_BADGE_CHAR_WIDTH_PX = 6.4;
const RELATION_BADGE_PAD_X_PX = 14;
const RELATION_BADGE_QUALITY_DOT_WIDTH_PX = 12;
const RELATION_BADGE_QUALITY_CHIP_WIDTH_PX = 64;
const RELATION_BADGE_FACT_ROUTE_WIDTH_PX = 138;
const RELATION_LABEL_HIT_TARGET_HEIGHT_PX = 36;
const RELATION_LABEL_HIT_TARGET_PAD_X_PX = 8;
const DRAG_SETTLE_FEEDBACK_MS = 720;
const DRAG_GROUP_RELEASE_FEEDBACK_MS = 260;
const CONNECTOR_PORT_MIN_CLEARANCE_PX = 6;
const CONNECTOR_PORT_TARGET_CLEARANCE_PX = EDGE_CLEARANCE_MASK_PX + 2;
const DRAG_COLLISION_SETTLE_PASSES = 4;

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

/** rgba 문자열의 alpha 만 교체 — kind 틴트의 정량 토큰(8%/18%) 파생용. */
function withAlpha(rgba: string, alpha: number): string {
  return rgba.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`);
}

function relationConnectorTone(
  connector: Pick<RelationConnector, 'authored' | 'evidenceCount' | 'relationQuality'>,
  selected: boolean,
): { dasharray?: string; opacity: number; stroke: string; strokeWidth: number } {
  if (selected) {
    return {
      opacity: 0.95,
      stroke: 'rgba(139,151,255,0.92)',
      strokeWidth: 2.2,
    };
  }
  const quality = connector.relationQuality ?? 'supported';
  const hasEvidence = (connector.evidenceCount ?? 0) > 0 || connector.authored === true;
  const evidenceBoost = hasEvidence ? 0.08 : 0;
  if (quality === 'strong') {
    return {
      opacity: 0.72 + evidenceBoost,
      stroke: 'rgba(139,151,255,0.50)',
      strokeWidth: 1.34,
    };
  }
  if (quality === 'weak') {
    return {
      opacity: 0.48 + evidenceBoost,
      stroke: 'rgba(217,161,65,0.34)',
      strokeWidth: 0.92,
    };
  }
  if (quality === 'review') {
    return {
      dasharray: '4 6',
      opacity: 0.52,
      stroke: 'rgba(226,105,105,0.38)',
      strokeWidth: 1,
    };
  }
  return {
    opacity: 0.56 + evidenceBoost,
    stroke: 'rgba(72,184,203,0.34)',
    strokeWidth: 1,
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
    strong: 'bg-indigo-300 shadow-[0_0_8px_rgba(129,140,248,0.5)]',
    supported: 'bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.36)]',
    weak: 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.32)]',
    review: 'bg-rose-300 shadow-[0_0_8px_rgba(253,164,175,0.38)]',
  } satisfies Record<NonNullable<SigmaEdgeAttrs['relationQuality']>, string>;
  return tone[quality] ?? tone.supported;
}

function relationAgentGateChipText(gateKind: RelationAgentGateKind): string {
  if (gateKind === 'handoff-ready') return 'MCP';
  if (gateKind === 'preflight-first') return 'check';
  return 'review';
}

function relationAgentGateChipTone(gateKind: RelationAgentGateKind): string {
  if (gateKind === 'handoff-ready') {
    return 'border-[color:rgba(139,151,255,0.36)] bg-[color:rgba(139,151,255,0.14)] text-[color:rgba(222,225,255,0.94)]';
  }
  if (gateKind === 'preflight-first') {
    return 'border-[color:rgba(217,161,65,0.36)] bg-[color:rgba(217,161,65,0.13)] text-[color:rgba(247,212,150,0.92)]';
  }
  return 'border-[color:rgba(226,105,105,0.38)] bg-[color:rgba(226,105,105,0.13)] text-[color:rgba(255,190,190,0.92)]';
}

function relationCopyActionText(action: RelationCopyActionKind): string {
  return action === 'explain_relation' ? 'explain relation' : 'relation check';
}

function relationFactRouteText(action: RelationCopyActionKind): string {
  return action === 'explain_relation' ? 'explain' : 'check';
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

function relationEvidenceGlyph({
  evidenceCount,
  state,
}: {
  evidenceCount?: number;
  state: RelationEvidenceState;
}): string {
  if (state === 'source-backed') {
    const count = Math.max(1, evidenceCount ?? 1);
    return count > 9 ? '9+' : String(count);
  }
  if (state === 'authored') return 'A';
  return '!';
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

function relationLabelText(relationType: string, count = 1): string {
  return count > 1 ? `${relationType} ×${count}` : relationType;
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

function collectFixedSurfaceRects(containerRect: DOMRect): Array<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}> {
  if (typeof document === 'undefined') return [];
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-testid="topology-analysis-panel"], [data-testid="topology-kind-legend"], [data-testid="topology-minimap"], [data-testid="topology-node-popover"], [data-testid="sigma-selected-edge-card"]',
    ),
  )
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || '1') > 0.01 &&
        rect.width > 0 &&
        rect.height > 0
      );
    })
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const isAnalysisPanel = el.dataset.testid === 'topology-analysis-panel';
      return {
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
      };
    });
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

function showSkeletonCard(el: HTMLElement, opacity = '1') {
  delete el.dataset.surfaceHidden;
  el.style.opacity = opacity;
  el.style.visibility = 'visible';
  el.style.pointerEvents = '';
}

function hideSkeletonCard(el: HTMLElement) {
  el.dataset.surfaceHidden = 'true';
  el.style.opacity = '0';
  el.style.visibility = 'hidden';
  el.style.pointerEvents = 'none';
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
): { dx: number; dy: number } {
  if (!container) return { dx, dy };
  const containerRect = container.getBoundingClientRect();
  const movingRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  for (const el of container.querySelectorAll<HTMLElement>('[data-skeleton-card]')) {
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
): Set<string> {
  const attrs = graph.getNodeAttributes(nodeId);
  const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
  const next = sigma.viewportToGraph({ x: vp.x + dx, y: vp.y + dy });
  const graphDx = next.x - attrs.x;
  const graphDy = next.y - attrs.y;

  const group = collectDraggedCluster(graph, nodeId, movableNodeIds, tierByNodeId);

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
): Map<string, DockDragSnapshot> {
  const snapshots = new Map<string, DockDragSnapshot>();
  if (!container) return snapshots;
  const containerRect = container.getBoundingClientRect();
  const parentAnchorBySlug = new Map<string, { x: number; y: number }>();
  for (const parent of container.querySelectorAll<HTMLElement>('[data-skeleton-card]')) {
    const slug = parent.dataset.slug;
    if (!slug || !movingGroup.has(slug)) continue;
    const rect = parent.getBoundingClientRect();
    const x = (rect.left + rect.right) / 2 - containerRect.left;
    const layoutY = Number(parent.dataset.layoutY);
    if (Number.isFinite(layoutY)) {
      parentAnchorBySlug.set(slug, { x, y: layoutY });
      continue;
    }
    parentAnchorBySlug.set(slug, {
      x,
      y: (rect.top + rect.bottom) / 2 - containerRect.top,
    });
  }
  for (const child of container.querySelectorAll<HTMLElement>('[data-skeleton-card][data-dock-parent]')) {
    const slug = child.dataset.slug;
    const parentSlug = child.dataset.dockParent;
    if (!slug || !parentSlug || !movingGroup.has(parentSlug)) continue;
    const parentStart = parentAnchorBySlug.get(parentSlug);
    if (!parentStart) continue;
    const childRect = child.getBoundingClientRect();
    const childStartX =
      child.dataset.dockSide === 'left'
        ? childRect.right - containerRect.left
        : childRect.left - containerRect.left;
    const layoutY = Number(child.dataset.layoutY);
    if (Number.isFinite(layoutY)) {
      snapshots.set(slug, {
        childStartX,
        parentSlug,
        parentStartX: parentStart.x,
        parentStartY: parentStart.y,
        childStartY: layoutY,
      });
      continue;
    }
    snapshots.set(slug, {
      childStartX,
      parentSlug,
      parentStartX: parentStart.x,
      parentStartY: parentStart.y,
      childStartY: (childRect.top + childRect.bottom) / 2 - containerRect.top,
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
): Set<string> {
  const pushedSlugs = new Set<string>();
  if (!container) return pushedSlugs;
  const containerRect = container.getBoundingClientRect();
  const records = Array.from(container.querySelectorAll<HTMLElement>('[data-skeleton-card]'))
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
  onSelect,
  onRelationSelect,
  describeKind,
}: SigmaSkeletonCardsProps) {
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
  const [activeDragRootTitle, setActiveDragRootTitle] = useState("");
  const [dragSettledSlugs, setDragSettledSlugs] = useState<Set<string>>(() => new Set());
  const dragReleaseTimerRef = useRef<number | null>(null);
  const activeDragMotionRef = useRef(false);
  // 카드 드래그 — 골격 anchor 카드를 손으로 옮길 수 있게(과거 토폴로지의
  // 촉각 유지). 좌표는 graph attr 로 흘러 엣지/fit 도 따라온다. 드래그로
  // 움직였으면 release 후 click 이 선택을 발화하지 않게 억제.
  const dragRef = useRef<{
    sourceSlug: string;
    rootSlug: string;
    rootTitle: string;
    lastX: number;
    lastY: number;
    travel: number;
    dockDragSnapshots: Map<string, DockDragSnapshot>;
  } | null>(null);
  const activeDockDragSnapshotsRef = useRef<Map<string, DockDragSnapshot>>(new Map());
  const suppressClickRef = useRef(false);
  const dragSettledTimerRef = useRef<number | null>(null);
  // 전환 창 동안 충돌 판정 동결용 (slug → 직전 collides).
  const collisionFreezeRef = useRef(new Map<string, boolean>());
  const hoverPopupRef = useRef<HTMLDivElement | null>(null);
  const dragClusterHullRef = useRef<HTMLDivElement | null>(null);

  const clearActiveDragCluster = useCallback(() => {
    if (dragReleaseTimerRef.current !== null) {
      window.clearTimeout(dragReleaseTimerRef.current);
      dragReleaseTimerRef.current = null;
    }
    setActiveDragCluster(null);
    setActiveDragMotion(false);
    activeDragMotionRef.current = false;
    setActiveDragRootSlug("");
    setActiveDragRootTitle("");
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
      setActiveDragRootTitle("");
      activeDockDragSnapshotsRef.current = new Map();
      return;
    }
    dragReleaseTimerRef.current = window.setTimeout(() => {
      dragReleaseTimerRef.current = null;
      setActiveDragCluster(null);
      setActiveDragRootSlug("");
      setActiveDragRootTitle("");
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
      const moved = Boolean(drag && drag.sourceSlug === sourceSlug && drag.travel > 4);
      if (moved) {
        suppressClickRef.current = true;
        activeDockDragSnapshotsRef.current = new Map(drag?.dockDragSnapshots ?? []);
      }
      dragRef.current = null;
      settleActiveDragCluster(moved);
    },
    [settleActiveDragCluster],
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

  const activeDragConnectors = useMemo(() => {
    if (!activeDragCluster || activeDragCluster.size < 2) return [];
    const pairs: RelationConnector[] = [];
    const seen = new Set<string>();
    for (const from of activeDragCluster) {
      if (!graph.hasNode(from)) continue;
      for (const to of graph.neighbors(from)) {
        if (!activeDragCluster.has(to)) continue;
        const key = [from, to].sort().join('→');
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push(relationConnector(graph, from, to));
      }
    }
    return pairs;
  }, [activeDragCluster, graph]);

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

  const reposition = useCallback(() => {
    const container = containerRef.current;
    if (!container || !sigma) return;
    const els = container.querySelectorAll<HTMLElement>('[data-skeleton-card]');
    // pass 1 — 카드 배치 + ego(풀 잉크) 카드 rect 수집. DOM 순서 = 도킹 깊이
    // 순(builder 가 정렬)이라 부모 카드의 transform 이 자식보다 먼저 잡힌다.
    const containerRect = container.getBoundingClientRect();
    // 반응형 스케일 — 카드 폰트(inline calc)와 도킹 간격/열 step 이 같은
    // 배수를 탄다. 컨테이너에 변수 주입(JS 가 진실원).
    const scale = resolveTopologyUiScale(
      typeof window === 'undefined' ? 0 : window.innerWidth,
    );
    container.dataset.topologyUiScale = String(scale);
    container.style.setProperty('--topology-card-scale', String(scale));
    container.style.setProperty(
      '--topology-anchor-card-max-width',
      `${
        BASE_ANCHOR_CARD_MAX_WIDTH_PX +
        (scale - 1) * ANCHOR_CARD_MAX_WIDTH_SCALE_STEP_PX
      }px`,
    );
    const dockGap = 56 * scale;
    const columnStep = COLUMN_STEP_PX * scale;
    const egoRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const fixedSurfaceRects = collectFixedSurfaceRects(containerRect);
    const acceptedSurfaceRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const dimEls: HTMLElement[] = [];
    const overviewEls: HTMLElement[] = [];
    const elBySlug = new Map<string, HTMLElement>();
    const isDragClusterCard = (slug: string, dockParent?: string | null) =>
      Boolean(
        activeDragCluster?.has(slug) ||
          (dockParent && activeDragCluster?.has(dockParent)),
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
    for (const el of orderedEls) {
      const slug = el.dataset.slug;
      if (!slug || !graph.hasNode(slug)) continue;
      delete el.dataset.surfaceHidden;
      el.style.visibility = 'visible';
      const dockParent = el.dataset.dockParent;
      const lockedForDrag = isDragClusterCard(slug, dockParent);
      el.dataset.dragVisibilityLock = lockedForDrag ? 'true' : 'false';
      const parentEl = dockParent ? elBySlug.get(dockParent) : undefined;
      if (dockParent && parentEl) {
        // px 도킹 — 부모 카드 rect 기준 고정 밀도 (줌 배율 무관). 열 간격
        // 56px, 행 pitch = 카드 높이 + 10px. 열의 중심은 부모를 따르되,
        // 전체 열이 상/하단 chrome 밖으로 잘리면 safe band 안으로 이동한다.
        // 자식이 safe 높이를 넘으면 멀티 컬럼으로 랩핑(상/하단 chrome 관통 방지).
        const p = parentEl.getBoundingClientRect();
        const side = el.dataset.dockSide === 'left' ? -1 : 1;
        const index = Number(el.dataset.dockIndex ?? '0');
        const total = Math.max(1, Number(el.dataset.dockTotal ?? '1'));
        const cardHeight = el.offsetHeight;
        const pitch = cardHeight + 10;
        const safeH = Math.max(pitch, containerRect.height - 96 - 56);
        const perColumn = Math.max(1, Math.floor(safeH / pitch));
        const col = Math.floor(index / perColumn);
        const row = index % perColumn;
        const rowsInCol = Math.min(perColumn, total - col * perColumn);
        el.dataset.dockCol = String(col);
        const parentCenterX = (p.left + p.right) / 2 - containerRect.left;
        const safeTop = 96;
        const safeBottom = Math.max(safeTop + cardHeight, containerRect.height - 56);
        const halfColumn = ((rowsInCol - 1) * pitch + cardHeight) / 2;
        const parentCenterY = (p.top + p.bottom) / 2 - containerRect.top;
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
            ? p.right - containerRect.left + dockGap + col * columnStep
            : p.left - containerRect.left - dockGap - col * columnStep;
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
        const anchor = side === 1 ? ANCHOR_TRANSLATE.left : ANCHOR_TRANSLATE.right;
        const flippedSide = side === 1 ? -1 : 1;
        const flippedX =
          flippedSide === 1
            ? p.right - containerRect.left + dockGap + col * columnStep
            : p.left - containerRect.left - dockGap - col * columnStep;
        const flippedAnchor =
          flippedSide === 1 ? ANCHOR_TRANSLATE.left : ANCHOR_TRANSLATE.right;
        el.dataset.dockFlipTransform = `${flippedAnchor} translate3d(${flippedX}px, ${y}px, 0)`;
        el.style.transform = `${anchor} translate3d(${x}px, ${y}px, 0)`;
      } else {
        delete el.dataset.dockDragFollow;
        delete el.dataset.dockParentDeltaY;
        delete el.dataset.dockFlipTransform;
        const attrs = graph.getNodeAttributes(slug);
        const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
        const anchorKey = el.dataset.anchor as SkeletonCardModel['anchor'];
        const safeAnchorKey = anchorKey && ANCHOR_TRANSLATE[anchorKey] ? anchorKey : 'center';
        const followsActiveGraphDrag = activeDragCluster?.has(slug) === true;
        const clamped =
          !followsActiveGraphDrag && ego?.slugs.has(slug)
            ? clampVisibleAnchorCard({
                x: vp.x,
                y: vp.y,
                width: el.offsetWidth,
                height: el.offsetHeight,
                anchor: safeAnchorKey,
                containerWidth: containerRect.width,
                containerHeight: containerRect.height,
                fixedSurfaceRects,
              })
            : vp;
        const anchor = ANCHOR_TRANSLATE[safeAnchorKey];
        el.dataset.layoutY = String(clamped.y);
        el.style.transform = `${anchor} translate3d(${clamped.x}px, ${clamped.y}px, 0)`;
      }
      if (el.dataset.dimmed === 'true') {
        dimEls.push(el);
      } else {
        const r = el.getBoundingClientRect();
        let visibleRect = {
          left: r.left - containerRect.left,
          top: r.top - containerRect.top,
          right: r.right - containerRect.left,
          bottom: r.bottom - containerRect.top,
        };
        let rect = {
          left: r.left - containerRect.left - COLLISION_PAD,
          top: r.top - containerRect.top - COLLISION_PAD,
          right: r.right - containerRect.left + COLLISION_PAD,
          bottom: r.bottom - containerRect.top + COLLISION_PAD,
        };
        const surfaceBlockers =
          ego !== null && dockParent
            ? [...fixedSurfaceRects, ...acceptedSurfaceRects]
            : fixedSurfaceRects;
        const followsActiveDockDrag = el.dataset.dockDragFollow === 'true';
        const selected = el.dataset.selected === 'true';
        let clipped =
          visibleRect.left < 0 ||
          visibleRect.top < 0 ||
          visibleRect.right > containerRect.width ||
          visibleRect.bottom > containerRect.height;
        let blockedBySurface =
          !lockedForDrag &&
          !followsActiveDockDrag &&
          surfaceBlockers.some((surface) => rectsOverlap(rect, surface));
        if (
          dockParent &&
          !lockedForDrag &&
          !followsActiveDockDrag &&
          (clipped || blockedBySurface)
        ) {
          const flipTransform = el.dataset.dockFlipTransform;
          if (flipTransform) {
            const originalTransform = el.style.transform;
            el.style.transform = flipTransform;
            const flipped = el.getBoundingClientRect();
            const flippedVisibleRect = {
              left: flipped.left - containerRect.left,
              top: flipped.top - containerRect.top,
              right: flipped.right - containerRect.left,
              bottom: flipped.bottom - containerRect.top,
            };
            const flippedRect = {
              left: flipped.left - containerRect.left - COLLISION_PAD,
              top: flipped.top - containerRect.top - COLLISION_PAD,
              right: flipped.right - containerRect.left + COLLISION_PAD,
              bottom: flipped.bottom - containerRect.top + COLLISION_PAD,
            };
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
              el.style.transform = originalTransform;
              hideSkeletonCard(el);
              continue;
            }
          } else {
            delete el.dataset.dockFlipped;
            hideSkeletonCard(el);
            continue;
          }
        } else {
          delete el.dataset.dockFlipped;
        }
        const protectSelectedCard = selected && selectedRelationEdgeId === null;
        if (!lockedForDrag && !protectSelectedCard && (clipped || blockedBySurface)) {
          hideSkeletonCard(el);
          continue;
        }
        showSkeletonCard(el);
        overviewEls.push(el);
        egoRects.push(rect);
        acceptedSurfaceRects.push(rect);
      }
    }
    // Overview 에서는 모든 카드가 풀 잉크라 가까운 landmark 끼리 텍스트가
    // 부딪힐 수 있다. 상위 anchor(project/domain)를 우선 보존하고, 충돌하는
    // 하위 capability/element 칩은 숨겨 지형의 읽기 순서를 지킨다.
    if (!ego) {
      const accepted: Array<{ left: number; top: number; right: number; bottom: number }> =
        [];
      const ordered = overviewEls.slice().sort((a, b) => {
        const tierA = Number(a.dataset.tier ?? '3');
        const tierB = Number(b.dataset.tier ?? '3');
        return tierA - tierB;
      });
      for (const el of ordered) {
        const r = el.getBoundingClientRect();
        const selected = el.dataset.selected === 'true';
        const rect = {
          left: r.left - containerRect.left,
          top: r.top - containerRect.top,
          right: r.right - containerRect.left,
          bottom: r.bottom - containerRect.top,
        };
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
          !protectSelectedCard &&
          (clipped ||
            blockedByFixedSurface ||
            accepted.some((kept) => rectsOverlap(rect, kept, OVERVIEW_COLLISION_PAD)))
        ) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }
        el.style.visibility = 'visible';
        accepted.push(rect);
      }
    }
    // pass 2 — dim 카드: 펼친 열과 겹치면 0(충돌 금지), 아니면 tier 별 dim.
    // 고정 HUD/범례와 겹치는 dim 카드도 0 — 선택 상태에서 배경 landmark 가
    // 패널 밑으로 비쳐 보이면 지형의 깊이감보다 UI 충돌이 먼저 읽힌다.
    // 레이아웃 전환 창 동안은 직전 판정을 동결 — 슬라이드 경로 위 dim 카드가
    // 0↔dim 을 페이드로 반복하는 펌핑 방지 (창 종료 후 afterRender 가 재판정).
    const animating =
      container.dataset.layoutAnimate === 'true' && activeDragCluster === null;
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
      if (lockedForDrag) {
        collides = false;
      } else {
        const r = el.getBoundingClientRect();
        const left = r.left - containerRect.left;
        const top = r.top - containerRect.top;
        const right = r.right - containerRect.left;
        const bottom = r.bottom - containerRect.top;
        rect = { left, top, right, bottom };
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
        hideSkeletonCard(el);
      } else {
        el.style.opacity = lockedForDrag
          ? '1'
          : (el.dataset.tier === '0' || el.dataset.tier === '1')
            ? DIM_ANCHOR_OPACITY
            : DIM_CHIP_OPACITY;
        el.style.visibility = 'visible';
        el.style.pointerEvents = '';
        if (rect) acceptedDimRects.push(rect);
      }
    }
    let visibleCardCount = 0;
    for (const el of orderedEls) {
      const style = getComputedStyle(el);
      if (
        el.dataset.surfaceHidden !== 'true' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || el.style.opacity || '1') > 0.01
      ) {
        visibleCardCount += 1;
      }
    }
    if (visibleCardCount === 0 && orderedEls.length > 0) {
      let restored = 0;
      for (const el of orderedEls) {
        const tier = Number(el.dataset.tier ?? '3');
        if (tier > 1) continue;
        if (!isElementInsideContainerViewport(el, containerRect)) continue;
        showSkeletonCard(el);
        restored += 1;
      }
      if (restored === 0) {
        const first = orderedEls.find((el) => isElementInsideContainerViewport(el, containerRect));
        if (first) {
          showSkeletonCard(first);
          restored = 1;
        }
      }
      container.dataset.visibilityFallback = 'true';
      container.dataset.visibilityFallbackCount = String(restored);
    } else {
      delete container.dataset.visibilityFallback;
      delete container.dataset.visibilityFallbackCount;
    }
    const selectedNodeId = selectedSlug
      ? (resolveNodeId(selectedSlug) ?? selectedSlug)
      : null;
    const selectedDockChildren = selectedNodeId
      ? orderedEls.filter((el) => el.dataset.dockParent === selectedNodeId)
      : [];
    const selectedVisibleDockChildren = selectedDockChildren.filter((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        el.dataset.surfaceHidden !== 'true' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || el.style.opacity || '1') > 0.01 &&
        rect.width > 0 &&
        rect.height > 0
      );
    });
    container.dataset.selectedDockCompanionCount = String(selectedDockChildren.length);
    container.dataset.selectedDockVisibleCompanionCount = String(
      selectedVisibleDockChildren.length,
    );
    container.dataset.selectedDockCompanionVisible =
      selectedVisibleDockChildren.length > 0 ? 'true' : 'false';
    const drawConnector = (
      path: SVGPathElement,
      sourceEl: HTMLElement | null | undefined,
      targetEl: HTMLElement | null | undefined,
    ) => {
      const sourceRect = sourceEl?.getBoundingClientRect();
      const targetRect = targetEl?.getBoundingClientRect();
      if (
        !sourceRect ||
        !targetRect ||
        sourceEl?.dataset.surfaceHidden === 'true' ||
        targetEl?.dataset.surfaceHidden === 'true'
      ) {
        path.setAttribute('d', '');
        return;
      }
      const source = {
        left: sourceRect.left - containerRect.left,
        top: sourceRect.top - containerRect.top,
        right: sourceRect.right - containerRect.left,
        bottom: sourceRect.bottom - containerRect.top,
      };
      const target = {
        left: targetRect.left - containerRect.left,
        top: targetRect.top - containerRect.top,
        right: targetRect.right - containerRect.left,
        bottom: targetRect.bottom - containerRect.top,
      };
      const ports = connectorPorts(source, target);
      path.setAttribute('d', connectorPath(ports.sx, ports.sy, ports.ex, ports.ey, ports.axis));
      path.dataset.connectorAxis = ports.axis;
      path.dataset.connectorClearance = String(ports.clearance);
    };

    // pass 3 — 커넥터: 포트를 카드 안쪽으로 넣고 edge mask 아래에서
    // 시작/종료시킨다. 밝은 선이 카드 바깥으로 삐져나와 보이는 현상을 막는다.
    const svg = container.querySelector<SVGSVGElement>('[data-skeleton-connectors]');
    if (svg) {
      const parentEl = container.querySelector<HTMLElement>(
        `[data-skeleton-card][data-slug="${CSS.escape(ego?.selected ?? '')}"]`,
      );
      for (const path of svg.querySelectorAll<SVGPathElement>('[data-connector]')) {
        const childSlug = path.dataset.connector;
        const childEl = childSlug
          ? container.querySelector<HTMLElement>(
              `[data-skeleton-card][data-slug="${CSS.escape(childSlug)}"]`,
            )
          : null;
        if (!parentEl || !childEl) {
          path.setAttribute('d', '');
          continue;
        }
        // 2열 이상의 카드로는 기본 커넥터를 긋지 않는다 — 1열을 관통한다.
        // 단, 사용자가 선택한 관계는 지도 위 피드백 자체가 의미이므로 유지한다.
        const selectedRelationPath =
          path.dataset.selectedRelation === 'true' ||
          path.dataset.selectedRelationHalo === 'true';
        if (!selectedRelationPath && isDockConnectorSuppressed(childEl)) {
          path.setAttribute('d', '');
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
      for (const label of svg.querySelectorAll<SVGTextElement>('[data-relation-label-from]')) {
        const from = label.dataset.relationLabelFrom;
        const to = label.dataset.relationLabelTo;
        const badge = label.dataset.relationLabelId
          ? svg.querySelector<SVGRectElement>(
              `[data-relation-label-bg="${CSS.escape(label.dataset.relationLabelId)}"]`,
            )
          : null;
        const labelButton = label.dataset.relationLabelId
          ? container.querySelector<HTMLElement>(
              `[data-relation-label-button="${CSS.escape(label.dataset.relationLabelId)}"]`,
            )
          : null;
        const selectedRelationLabel = labelButton?.dataset.selectedRelation === 'true';
        const fromEl = from ? elBySlug.get(from) : null;
        const toEl = to ? elBySlug.get(to) : null;
        const fromRect = fromEl?.getBoundingClientRect();
        const toRect = toEl?.getBoundingClientRect();
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
          }
          continue;
        }
        const isEgoBadge = label.dataset.connectorRelationLabel === 'true';
        const labelIndex = Number(label.dataset.relationLabelIndex ?? '0');
        const x = isEgoBadge
          ? (fromRect.left + fromRect.right) / 2 - containerRect.left
          : (fromRect.left + fromRect.right + toRect.left + toRect.right) / 4 -
            containerRect.left;
        const y = isEgoBadge
          ? Math.max(18, fromRect.top - containerRect.top - 14 - labelIndex * 14)
          : (fromRect.top + fromRect.bottom + toRect.top + toRect.bottom) / 4 -
            containerRect.top -
            8;
        const relationHitDisabled = activeDragCluster !== null;
        const badgeWidth = Math.max(
          RELATION_BADGE_MIN_WIDTH_PX,
          (label.textContent?.length ?? 0) * RELATION_BADGE_CHAR_WIDTH_PX +
            RELATION_BADGE_PAD_X_PX +
            (isEgoBadge ? RELATION_BADGE_QUALITY_DOT_WIDTH_PX : 0) +
            (labelButton?.dataset.relationLabelAgentGateVisible === 'true'
              ? RELATION_BADGE_QUALITY_CHIP_WIDTH_PX + RELATION_BADGE_FACT_ROUTE_WIDTH_PX
              : 0),
        );
        const usesHtmlBadge = isEgoBadge && labelButton !== null;
        label.setAttribute('x', String(x));
        label.setAttribute('y', String(y));
        label.setAttribute('opacity', usesHtmlBadge ? '0' : '1');
        label.setAttribute('aria-hidden', usesHtmlBadge ? 'true' : 'false');
        const labelGroup = label.closest<SVGGElement>('[data-relation-label-group="true"]');
        if (labelGroup) {
          labelGroup.style.pointerEvents = usesHtmlBadge ? 'none' : 'auto';
        }
        if (badge) {
          badge.setAttribute('x', String(x - badgeWidth / 2));
          badge.setAttribute('y', String(y - RELATION_BADGE_HEIGHT_PX / 2));
          badge.setAttribute('width', String(badgeWidth));
          badge.setAttribute('height', String(RELATION_BADGE_HEIGHT_PX));
          badge.setAttribute('opacity', usesHtmlBadge ? '0' : '1');
          badge.setAttribute(
            'pointer-events',
            usesHtmlBadge || relationHitDisabled ? 'none' : 'auto',
          );
        }
        if (labelButton) {
          const hitTargetWidth = badgeWidth + RELATION_LABEL_HIT_TARGET_PAD_X_PX * 2;
          labelButton.style.transform = `translate3d(${x - hitTargetWidth / 2}px, ${
            y - RELATION_LABEL_HIT_TARGET_HEIGHT_PX / 2
          }px, 0)`;
          labelButton.style.width = `${hitTargetWidth}px`;
          labelButton.style.height = `${RELATION_LABEL_HIT_TARGET_HEIGHT_PX}px`;
          labelButton.style.opacity = '1';
          labelButton.style.pointerEvents = relationHitDisabled ? 'none' : 'auto';
          labelButton.dataset.labelGeometrySource = 'html-hit-target';
          labelButton.dataset.visibleBadgeWidth = String(badgeWidth);
          labelButton.dataset.visibleBadgeHeight = String(RELATION_BADGE_HEIGHT_PX);
          if (selectedRelationLabel) {
            const overlay = label.dataset.relationLabelId
              ? container.querySelector<HTMLElement>(
                  `[data-selected-relation-overlay="${CSS.escape(label.dataset.relationLabelId)}"]`,
                )
              : null;
            if (overlay) {
              overlay.style.transform = labelButton.style.transform;
              overlay.style.width = labelButton.style.width;
              overlay.style.height = labelButton.style.height;
              overlay.style.setProperty('opacity', '1', 'important');
              overlay.style.visibility = 'visible';
            }
          }
        }
      }
      for (const overlay of container.querySelectorAll<HTMLElement>(
        '[data-selected-relation-overlay][data-selected-relation-halo="true"]',
      )) {
        overlay.style.setProperty('opacity', '1', 'important');
        overlay.style.visibility = 'visible';
      }
    }
    // pass 4 — hover 팝업 위치: 카드 우측 +10, 화면/우측 패널에 닿으면 좌측
    // flip + 세로 클램프. 매 프레임 카드 rect 파생이라 팬/줌을 따라간다.
    const hull = dragClusterHullRef.current;
    if (hull) {
      const clusterRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
      if (activeDragCluster && activeDragCluster.size > 1) {
        for (const slug of activeDragCluster) {
          const cardEl = elBySlug.get(slug);
          if (!cardEl || cardEl.dataset.surfaceHidden === 'true') continue;
          const style = getComputedStyle(cardEl);
          const rect = cardEl.getBoundingClientRect();
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            Number(style.opacity || '1') <= 0.01 ||
            rect.width <= 0 ||
            rect.height <= 0
          ) {
            continue;
          }
          clusterRects.push({
            left: rect.left - containerRect.left,
            top: rect.top - containerRect.top,
            right: rect.right - containerRect.left,
            bottom: rect.bottom - containerRect.top,
          });
        }
      }
      if (clusterRects.length > 1) {
        const bounds = clusterRects.reduce(
          (acc, rect) => ({
            left: Math.min(acc.left, rect.left),
            top: Math.min(acc.top, rect.top),
            right: Math.max(acc.right, rect.right),
            bottom: Math.max(acc.bottom, rect.bottom),
          }),
          { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const left = Math.max(0, bounds.left - DRAG_CLUSTER_HULL_PAD_PX);
        const top = Math.max(0, bounds.top - DRAG_CLUSTER_HULL_PAD_PX);
        const right = Math.min(containerRect.width, bounds.right + DRAG_CLUSTER_HULL_PAD_PX);
        const bottom = Math.min(containerRect.height, bounds.bottom + DRAG_CLUSTER_HULL_PAD_PX);
        hull.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        hull.style.width = `${Math.max(1, right - left)}px`;
        hull.style.height = `${Math.max(1, bottom - top)}px`;
        hull.dataset.visible = 'true';
        hull.dataset.dragClusterSize = String(clusterRects.length);
      } else {
        hull.dataset.visible = 'false';
        delete hull.dataset.dragClusterSize;
      }
    }

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
  }, [graph, sigma, ego, activeDragCluster, selectedRelationEdgeId]);

  // 카드 목록이 바뀌는 렌더마다 paint 전에 배치 (확장으로 새 카드 등장 시).
  useLayoutEffect(() => {
    const container = containerRef.current;
    reposition();
    if (container) {
      container.dataset.skeletonCardsReady = 'true';
    }
  });

  // 전환 창 — 위치 transform 은 즉시 반영한다. 카드가 서로 지나가며 겹치는
  // frame 이 생기면 relief map 의 기본 약속(박스는 서로 겹치지 않음)이 깨진다.
  // ready 전 overlay 는 숨기고, 배치/충돌 판정이 끝난 뒤 검사 가능한 상태로 연다.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.dataset.layoutAnimate = 'true';
    if (container.dataset.skeletonCardsReady !== 'true') {
      container.dataset.skeletonCardsReady = 'false';
    }
    // 창 480ms = 카메라 reframe(420ms) + 여유 1프레임 — 창이 카메라보다
    // 먼저 닫히며 생기던 막판 스냅 제거. 창이 닫힐 때 충돌 동결 해제.
    const timer = window.setTimeout(() => {
      delete container.dataset.layoutAnimate;
      collisionFreezeRef.current.clear();
      try {
        reposition();
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
      delete container.dataset.layoutAnimate;
      if (container.dataset.skeletonCardsReady !== 'true') {
        container.dataset.skeletonCardsReady = 'false';
      }
    };
  }, [cards, reposition]);

  useEffect(() => {
    if (!sigma) return;
    sigma.on('afterRender', reposition);
    window.addEventListener('resize', reposition);
    return () => {
      sigma.off('afterRender', reposition);
      window.removeEventListener('resize', reposition);
    };
  }, [sigma, reposition]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || selectedRelationEdgeId === null) return;
    const frame = window.requestAnimationFrame(() => {
      for (const overlay of container.querySelectorAll<HTMLElement>(
        '[data-selected-relation-overlay][data-selected-relation-halo="true"]',
      )) {
        overlay.style.setProperty('opacity', '1', 'important');
        overlay.style.visibility = 'visible';
        overlay.style.display = 'inline-flex';
      }
      reposition();
    });
    const settleFrame = window.requestAnimationFrame(() => {
      reposition();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(settleFrame);
    };
  }, [reposition, selectedRelationEdgeId]);

  if (!sigma) return null;

  return (
    <div
      ref={containerRef}
      data-testid="sigma-skeleton-cards"
      data-skeleton-cards-ready="false"
      data-skeleton-card-model-count={cards.length}
      data-skeleton-card-resolved-count={resolvedCardCount}
      data-active-drag-cluster-size={activeDragCluster?.size ?? 0}
      data-dragging-active={activeDragMotion ? 'true' : 'false'}
      data-selected-dock-companion-count="0"
      data-selected-dock-visible-companion-count="0"
      data-selected-dock-companion-visible="false"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden opacity-100 transition-opacity duration-150 ease-out data-[skeleton-cards-ready=false]:opacity-0 motion-reduce:transition-none"
    >
      {/* 펼친 가지 커넥터 — 수평 접선 S-커브, 카드 경계 트림. 인디고는
          "활성 가지" 단일 의미 (overview hairline 은 Sigma 캔버스 담당). */}
      <div
        ref={dragClusterHullRef}
        data-drag-cluster-hull
        data-visible="false"
        data-drag-active={activeDragMotion ? 'true' : 'false'}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-[1] rounded-2xl border border-[color:rgba(139,151,255,0.42)] bg-[color:rgba(139,151,255,0.08)] opacity-0 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_18px_50px_rgba(0,0,0,0.22)] transition-[opacity,box-shadow,border-color,background-color] duration-100 data-[drag-active=true]:border-[color:rgba(139,151,255,0.70)] data-[drag-active=true]:bg-[color:rgba(139,151,255,0.12)] data-[drag-active=true]:shadow-[0_0_0_1px_rgba(139,151,255,0.24),0_22px_60px_rgba(0,0,0,0.28),0_0_36px_rgba(139,151,255,0.14)] data-[visible=true]:opacity-80 data-[visible=true]:data-[drag-active=true]:opacity-95 motion-reduce:transition-none"
      >
        <div className="absolute left-2 top-2 inline-flex max-w-[min(18rem,calc(100%-3.25rem))] items-center gap-1.5 rounded-full border border-[color:rgba(139,151,255,0.38)] bg-[color:var(--color-canvas)] px-2 py-1 text-[10px] leading-none text-[color:var(--color-text-secondary)] shadow-[0_6px_16px_rgba(0,0,0,0.24)]">
          <span className="font-mono uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {activeDragMotion ? 'moving linked cards' : 'linked cards move together'}
          </span>
          <span data-drag-cluster-title className="min-w-0 truncate">
            {activeDragRootTitle}
          </span>
        </div>
        <span
          data-drag-cluster-count
          className="absolute right-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[color:var(--topology-card-border-selected-strong)] bg-[color:var(--color-canvas)] px-1.5 font-mono text-[10px] leading-none text-[color:var(--color-text-secondary)] shadow-[0_6px_16px_rgba(0,0,0,0.24)]"
        >
          {activeDragCluster ? `${activeDragCluster.size} linked` : ""}
        </span>
      </div>
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
                  {selected ? (
                    <path
                      data-overview-connector-from={connector.from}
                      data-overview-connector-to={connector.to}
                      data-selected-relation-halo="true"
                      data-relation-quality={connector.relationQuality ?? 'supported'}
                      className="pointer-events-none"
                      fill="none"
                      stroke="rgba(139,151,255,0.18)"
                      strokeLinecap="round"
                      strokeWidth={Math.max(6, tone.strokeWidth + 5)}
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
                    className="pointer-events-none"
                    fill="none"
                    stroke={tone.stroke}
                    strokeDasharray={tone.dasharray}
                    strokeLinecap="round"
                    strokeWidth={tone.strokeWidth}
                    opacity={tone.opacity}
                  />
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
                  data-relation-quality={connector.relationQuality ?? 'supported'}
                  className="pointer-events-none topology-connector-path"
                  fill="none"
                  stroke="rgba(139,151,255,0.18)"
                  strokeWidth={Math.max(6, tone.strokeWidth + 5)}
                  opacity={0.9}
                />
              ) : null}
              <path
                data-connector={connector.to}
                data-selected-relation={selected ? 'true' : 'false'}
                data-relation-kind={connector.kind}
                data-relation-quality={connector.relationQuality ?? 'supported'}
                data-relation-type={connector.relationType}
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
        {egoRelationLabels.map((label, index) => (
          <g
            key={`ego-label:${label.key}`}
            data-relation-label-group="true"
            data-relation-kind={label.kind}
            data-relation-quality={label.relationQuality ?? 'supported'}
            data-relation-type={label.relationType}
            className="pointer-events-auto cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label={`${label.relationType} relation`}
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
              data-relation-count={label.count}
              dominantBaseline="middle"
              textAnchor="middle"
              fill="var(--color-text-secondary)"
              className="pointer-events-none select-none font-mono text-[10px] uppercase tracking-[0.08em]"
            >
              {relationLabelText(label.relationType, label.count)}
            </text>
          </g>
        ))}
        {activeDragConnectors.map((connector) => (
          <g key={`drag:${connector.key}`}>
            <path
              data-drag-connector-from={connector.from}
              data-drag-connector-to={connector.to}
              data-drag-cluster-connector="true"
              data-relation-kind={connector.kind}
              data-relation-quality={connector.relationQuality ?? 'supported'}
              data-relation-type={connector.relationType}
              className="topology-connector-path"
              fill="none"
              stroke={activeDragMotion ? 'rgba(139,151,255,0.78)' : 'rgba(139,151,255,0.58)'}
              strokeWidth={activeDragMotion ? 1.75 : 1.35}
              opacity={activeDragMotion ? 0.96 : 0.86}
            />
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
              dominantBaseline="middle"
              textAnchor="middle"
              fill="var(--color-text-secondary)"
              className="pointer-events-none select-none font-mono text-[10px] uppercase tracking-[0.08em]"
            >
              {connector.relationType}
            </text>
          </g>
        ))}
      </svg>
      {egoRelationLabels.map((label) => {
        const selected =
          selectedRelationEdgeId !== null && label.edgeId === selectedRelationEdgeId;
        const quality = label.relationQuality ?? 'supported';
        const evidenceState = relationEvidenceState(label);
        const evidenceText = relationEvidenceAriaText({
          evidenceCount: label.evidenceCount,
          state: evidenceState,
        });
        const labelText = relationLabelText(label.relationType, label.count);
        const agentGateKind = relationAgentGateKind(label);
        const primaryCopyAction = relationPrimaryCopyAction(agentGateKind);
        const agentGateText = relationAgentGateChipText(agentGateKind);
        const visibleBadgeWidth = Math.max(
          RELATION_BADGE_MIN_WIDTH_PX,
          labelText.length * RELATION_BADGE_CHAR_WIDTH_PX +
            RELATION_BADGE_PAD_X_PX +
            RELATION_BADGE_QUALITY_DOT_WIDTH_PX +
            (selected
              ? RELATION_BADGE_QUALITY_CHIP_WIDTH_PX + RELATION_BADGE_FACT_ROUTE_WIDTH_PX
              : 0),
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
            data-relation-type={label.relationType}
            data-selected-relation={selected ? 'true' : 'false'}
            data-agent-gate-kind={selected ? agentGateKind : undefined}
            data-primary-copy-action={selected ? primaryCopyAction : undefined}
            data-relation-fact-route={selected ? 'fact>evidence>gate>action' : undefined}
            data-relation-fact-route-quality={selected ? quality : undefined}
            data-relation-fact-route-evidence={selected ? evidenceState : undefined}
            data-relation-fact-route-gate={selected ? agentGateKind : undefined}
            data-relation-fact-route-action={selected ? primaryCopyAction : undefined}
            data-relation-label-agent-gate-visible={selected ? 'true' : 'false'}
            data-drag-hit-disabled={activeDragCluster !== null ? 'true' : 'false'}
            data-label-geometry-source="html-hit-target"
            data-visible-badge-width={visibleBadgeWidth}
            data-visible-badge-height={RELATION_BADGE_HEIGHT_PX}
            aria-label={`${labelText} relation · ${quality} · ${evidenceText}${
              selected
                ? ` · ${agentGateText} · ${relationCopyActionText(primaryCopyAction)}`
                : ''
            }`}
            className="pointer-events-none absolute left-0 top-0 z-[4] inline-flex min-h-9 items-center justify-center gap-1 rounded-full border px-2 font-mono text-[10px] uppercase tracking-[0.08em] shadow-[0_6px_16px_rgba(0,0,0,0.22)] transition-[background-color,border-color,color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.55)] motion-reduce:transition-none"
            style={{
              backgroundColor: selected
                ? 'rgba(139,151,255,0.16)'
                : 'var(--color-canvas)',
              borderColor: selected
                ? 'rgba(139,151,255,0.92)'
                : 'var(--topology-card-border-selected-strong)',
              color: 'var(--color-text-secondary)',
              opacity: selected ? 1 : 0,
              boxShadow: selected
                ? '0 0 0 3px rgba(139,151,255,0.12), 0 10px 24px rgba(0,0,0,0.34)'
                : '0 6px 16px rgba(0,0,0,0.22)',
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
          >
            <span
              aria-hidden="true"
              data-relation-quality-dot
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${relationQualityDotClassName(
                quality,
              )}`}
            />
            <span className="min-w-0 truncate">{labelText}</span>
            <span
              aria-hidden="true"
              data-relation-evidence-glyph={evidenceState}
              className="ml-0.5 inline-flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full border border-[color:rgba(255,255,255,0.10)] bg-[color:rgba(255,255,255,0.045)] px-1 text-[8px] leading-none text-[color:var(--color-text-tertiary)]"
            >
              {relationEvidenceGlyph({
                evidenceCount: label.evidenceCount,
                state: evidenceState,
              })}
            </span>
            {selected ? (
              <>
                <span
                  aria-hidden="true"
                  data-relation-quality-chip={quality}
                  className="ml-0.5 inline-flex h-4 min-w-[3.6rem] shrink-0 items-center justify-center rounded-full border border-[color:rgba(139,151,255,0.20)] bg-[color:rgba(139,151,255,0.08)] px-1 text-[8px] leading-none text-[color:var(--color-text-tertiary)]"
                >
                  {relationQualityChipText(quality)}
                </span>
                <span
                  aria-hidden="true"
                  data-relation-fact-route-rail="true"
                  className="ml-0.5 inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full border border-[color:rgba(255,255,255,0.10)] bg-[color:rgba(255,255,255,0.04)] px-1 text-[8px] leading-none text-[color:var(--color-text-tertiary)]"
                >
                  <span data-route-chip="fact">fact</span>
                  <span className="text-[color:var(--color-text-quaternary)]">→</span>
                  <span data-route-chip="evidence">
                    {evidenceState === 'source-backed'
                      ? 'src'
                      : evidenceState === 'authored'
                        ? 'auth'
                        : 'review'}
                  </span>
                  <span className="text-[color:var(--color-text-quaternary)]">→</span>
                  <span
                    data-route-chip="gate"
                    data-relation-label-agent-gate={agentGateKind}
                    data-primary-copy-action={primaryCopyAction}
                    className={`inline-flex h-3 min-w-[1.55rem] items-center justify-center rounded-full border px-0.5 ${relationAgentGateChipTone(
                      agentGateKind,
                    )}`}
                  >
                    {agentGateText}
                  </span>
                  <span className="text-[color:var(--color-text-quaternary)]">→</span>
                  <span data-route-chip="action">{relationFactRouteText(primaryCopyAction)}</span>
                </span>
              </>
            ) : null}
          </button>
        );
      })}
      {egoRelationLabels.map((label) => {
        const selected =
          selectedRelationEdgeId !== null && label.edgeId === selectedRelationEdgeId;
        if (!selected) return null;
        const quality = label.relationQuality ?? 'supported';
        const evidenceState = relationEvidenceState(label);
        const labelText = relationLabelText(label.relationType, label.count);
        const agentGateKind = relationAgentGateKind(label);
        const primaryCopyAction = relationPrimaryCopyAction(agentGateKind);
        const agentGateText = relationAgentGateChipText(agentGateKind);
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
            data-relation-type={label.relationType}
            data-agent-gate-kind={agentGateKind}
            data-primary-copy-action={primaryCopyAction}
            data-relation-fact-route="fact>evidence>gate>action"
            data-relation-fact-route-quality={quality}
            data-relation-fact-route-evidence={evidenceState}
            data-relation-fact-route-gate={agentGateKind}
            data-relation-fact-route-action={primaryCopyAction}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 z-[6] inline-flex min-h-9 items-center justify-center gap-1 rounded-full border px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]"
            style={{
              backgroundColor: 'rgba(139,151,255,0.16)',
              borderColor: 'rgba(139,151,255,0.92)',
              boxShadow:
                '0 0 0 3px rgba(139,151,255,0.12), 0 10px 24px rgba(0,0,0,0.34)',
              opacity: 1,
              visibility: 'visible',
            }}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${relationQualityDotClassName(
                quality,
              )}`}
            />
            <span className="min-w-0 truncate">{labelText}</span>
            <span
              aria-hidden="true"
              className="ml-0.5 inline-flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full border border-[color:rgba(255,255,255,0.10)] bg-[color:rgba(255,255,255,0.045)] px-1 text-[8px] leading-none text-[color:var(--color-text-tertiary)]"
            >
              {relationEvidenceGlyph({
                evidenceCount: label.evidenceCount,
                state: evidenceState,
              })}
            </span>
            <span
              aria-hidden="true"
              data-relation-quality-chip={quality}
              className="ml-0.5 inline-flex h-4 min-w-[3.6rem] shrink-0 items-center justify-center rounded-full border border-[color:rgba(139,151,255,0.20)] bg-[color:rgba(139,151,255,0.08)] px-1 text-[8px] leading-none text-[color:var(--color-text-tertiary)]"
            >
              {relationQualityChipText(quality)}
            </span>
            <span
              aria-hidden="true"
              data-relation-fact-route-rail="true"
              className="ml-0.5 inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full border border-[color:rgba(255,255,255,0.10)] bg-[color:rgba(255,255,255,0.04)] px-1 text-[8px] leading-none text-[color:var(--color-text-tertiary)]"
            >
              <span data-route-chip="fact">fact</span>
              <span className="text-[color:var(--color-text-quaternary)]">→</span>
              <span data-route-chip="evidence">
                {evidenceState === 'source-backed'
                  ? 'src'
                  : evidenceState === 'authored'
                    ? 'auth'
                    : 'review'}
              </span>
              <span className="text-[color:var(--color-text-quaternary)]">→</span>
              <span
                data-route-chip="gate"
                data-relation-label-agent-gate={agentGateKind}
                data-primary-copy-action={primaryCopyAction}
                className={`inline-flex h-3 min-w-[1.55rem] items-center justify-center rounded-full border px-0.5 ${relationAgentGateChipTone(
                  agentGateKind,
                )}`}
              >
                {agentGateText}
              </span>
              <span className="text-[color:var(--color-text-quaternary)]">→</span>
              <span data-route-chip="action">{relationFactRouteText(primaryCopyAction)}</span>
            </span>
          </div>
        );
      })}
      {cards.map((card) => {
        const nodeId = resolveNodeId(card.id);
        if (!nodeId) return null;
        const selected = selectedSlug === nodeId || selectedSlug === card.id;
        const dimmed = ego !== null && !ego.slugs.has(nodeId);
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
        // 카드 표면 = kind 틴트의 *정량 토큰* (bg 8% · border 18% · dot 100%)
        // — 틴트가 칩마다 다른 강도로 보이면 4색 칩 더미가 된다 (패널 #5).
        const fill = ontologyFillTone(card.kind === 'project' ? 'project' : card.kind);
        const tintBg = withAlpha(fill, 0.08);
        const tintBorder = withAlpha(fill, 0.18);
        const tintBorderHover = withAlpha(fill, 0.38);
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
            data-dimmed={dimmed ? 'true' : 'false'}
            data-drag-cluster={dragging ? 'true' : 'false'}
            data-drag-cluster-role={dragRole}
            data-dragging-active={dragging && activeDragMotion ? 'true' : 'false'}
            data-drag-pushed={dragSettled ? 'true' : 'false'}
            onClick={(event) => {
              event.stopPropagation();
              if (event.currentTarget.dataset.surfaceHidden === 'true') return;
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
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
              const movingGroup = collectDraggedCluster(
                graph,
                rootSlug,
                buildMovableNodeIds(),
                buildVisibleCardTierByNodeId(),
              );
              dragRef.current = {
                sourceSlug: nodeId,
                rootSlug,
                rootTitle: event.currentTarget.title || nodeId,
                lastX: event.clientX,
                lastY: event.clientY,
                travel: 0,
                dockDragSnapshots: snapshotDockDragPositions(
                  containerRef.current,
                  movingGroup,
                ),
              };
              setActiveDragRootSlug(rootSlug);
              setActiveDragRootTitle(event.currentTarget.title || nodeId);
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
              const movableNodeIds = buildMovableNodeIds();
              const tierByNodeId = buildVisibleCardTierByNodeId();
              const movingGroup = collectDraggedCluster(
                graph,
                drag.rootSlug,
                movableNodeIds,
                tierByNodeId,
              );
              const delta = clampDraggedClusterDelta(
                containerRef.current,
                movingGroup,
                dx,
                dy,
              );
              if (delta.dx === 0 && delta.dy === 0) return;
              const movedGroup = moveDraggedCluster(
                graph,
                drag.rootSlug,
                delta.dx,
                delta.dy,
                sigma,
                movableNodeIds,
                tierByNodeId,
              );
              reposition();
              const pushedSlugs = pushCardsAwayFromDraggedCluster(
                containerRef.current,
                graph,
                sigma,
                movedGroup,
                movableNodeIds,
              );
              if (pushedSlugs.size > 0) {
                reposition();
                markDragSettled(pushedSlugs);
              }
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
            title={card.title}
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
                maxWidth:
                  card.tier <= 1 ? 'var(--topology-anchor-card-max-width, 14rem)' : '12rem',
                '--card-border': selected
                  ? 'var(--topology-card-border-selected)'
                  : tintBorder,
                '--card-border-hover': selected
                  ? 'var(--topology-card-border-selected-strong)'
                  : tintBorderHover,
              } as React.CSSProperties
            }
            className={`pointer-events-auto absolute left-0 top-0 inline-flex cursor-grab items-center whitespace-nowrap border border-[color:var(--card-border)] bg-[color:var(--color-panel)] transition-[opacity,border-color,box-shadow] duration-200 ease-out data-[surface-hidden=true]:invisible data-[surface-hidden=true]:pointer-events-none data-[surface-hidden=true]:cursor-default hover:border-[color:var(--card-border-hover)] active:cursor-grabbing motion-reduce:transition-none ${
              selected
                ? 'shadow-[0_0_0_1px_var(--topology-card-outline-selected),0_14px_36px_var(--topology-card-selected-shadow)] outline outline-1 outline-offset-1 outline-[color:var(--topology-card-outline-selected)]'
                : ''
            } ${
              dragging
                ? 'border-[color:var(--topology-card-border-selected-strong)] shadow-[0_0_0_1px_var(--topology-card-outline-selected),0_10px_26px_var(--topology-card-selected-shadow),0_0_28px_rgba(139,151,255,0.18)] outline outline-1 outline-offset-1 outline-[color:var(--topology-card-outline-selected)] data-[dragging-active=true]:shadow-[0_0_0_1px_var(--topology-card-outline-selected),0_16px_38px_var(--topology-card-selected-shadow),0_0_34px_rgba(139,151,255,0.24)]'
                : ''
            } ${
              dragSettled
                ? 'border-[color:var(--topology-card-border-selected)] shadow-[0_0_0_1px_var(--topology-card-outline-selected),0_0_24px_rgba(139,151,255,0.2)] motion-safe:animate-[topology-drag-settle_720ms_ease-out_1]'
                : ''
            } ${TIER_CARD_CLASS[card.tier]}`}
          >
            {/* 틴트 레이어 — 불투명 panel 베이스 위에 kind wash. 반투명 bg
                단독이면 카드 뒤 엣지가 비쳐 보인다. */}
            <span
              aria-hidden="true"
              data-edge-mask
              className="pointer-events-none absolute rounded-[inherit] bg-[color:var(--color-canvas)]"
              style={{ inset: `-${EDGE_CLEARANCE_MASK_PX}px` }}
            />
            <span
              aria-hidden="true"
              data-kind-tint
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                background: selected
                  ? `linear-gradient(0deg, var(--topology-card-selected-wash), var(--topology-card-selected-wash)), ${tintBg}`
                  : dragging || dragSettled
                    ? `linear-gradient(0deg, rgba(139,151,255,${
                        activeDragMotion && dragging ? '0.12' : '0.08'
                      }), rgba(139,151,255,${
                        activeDragMotion && dragging ? '0.12' : '0.08'
                      })), ${tintBg}`
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
            <span className="relative min-w-0 truncate">{card.title}</span>
            {card.count !== undefined ? (
              <span className="relative shrink-0 font-mono text-[0.72em] text-[color:var(--color-text-tertiary)]">
                {card.count}
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
