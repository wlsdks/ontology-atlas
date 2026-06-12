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
  onSelect?: (slug: string) => void;
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
const OVERVIEW_COLLISION_PAD = 2;
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

/** rgba 문자열의 alpha 만 교체 — kind 틴트의 정량 토큰(8%/18%) 파생용. */
function withAlpha(rgba: string, alpha: number): string {
  return rgba.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`);
}

/** 커넥터 형상 — 수평 접선 cubic S-커브 (MindNode 가지 문법). */
function connectorPath(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): string {
  const dx = ex - sx;
  const c1x = sx + dx * 0.4;
  const c2x = ex - dx * 0.4;
  return `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ey}, ${ex} ${ey}`;
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

function collectDraggedCluster(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  nodeId: string,
  movableNodeIds: ReadonlySet<string>,
): Set<string> {
  const group = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (group.has(current) || !movableNodeIds.has(current) || !graph.hasNode(current)) {
      continue;
    }
    group.add(current);
    for (const neighbor of graph.neighbors(current)) {
      if (movableNodeIds.has(neighbor) && !group.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }
  return group.size > 0 ? group : new Set([nodeId]);
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
      Number(style.opacity || '1') <= 0.01 ||
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
  if (bounds.left + clampedDx < 0) clampedDx = -bounds.left;
  if (bounds.right + clampedDx > containerRect.width) {
    clampedDx = containerRect.width - bounds.right;
  }
  if (bounds.top + clampedDy < 0) clampedDy = -bounds.top;
  if (bounds.bottom + clampedDy > containerRect.height) {
    clampedDy = containerRect.height - bounds.bottom;
  }
  return { dx: clampedDx, dy: clampedDy };
}

function moveDraggedCluster(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  nodeId: string,
  dx: number,
  dy: number,
  sigma: SkeletonCardsCamera,
  movableNodeIds: ReadonlySet<string>,
): Set<string> {
  const attrs = graph.getNodeAttributes(nodeId);
  const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
  const next = sigma.viewportToGraph({ x: vp.x + dx, y: vp.y + dy });
  const graphDx = next.x - attrs.x;
  const graphDy = next.y - attrs.y;

  const group = collectDraggedCluster(graph, nodeId, movableNodeIds);

  for (const member of group) {
    const memberAttrs = graph.getNodeAttributes(member);
    graph.setNodeAttribute(member, 'x', memberAttrs.x + graphDx);
    graph.setNodeAttribute(member, 'y', memberAttrs.y + graphDy);
  }
  return group;
}

export function SigmaSkeletonCards({
  sigma,
  graph,
  cards,
  selectedSlug = null,
  onSelect,
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
  // 카드 드래그 — 골격 anchor 카드를 손으로 옮길 수 있게(과거 토폴로지의
  // 촉각 유지). 좌표는 graph attr 로 흘러 엣지/fit 도 따라온다. 드래그로
  // 움직였으면 release 후 click 이 선택을 발화하지 않게 억제.
  const dragRef = useRef<{
    sourceSlug: string;
    rootSlug: string;
    lastX: number;
    lastY: number;
    travel: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  // 전환 창 동안 충돌 판정 동결용 (slug → 직전 collides).
  const collisionFreezeRef = useRef(new Map<string, boolean>());
  const hoverPopupRef = useRef<HTMLDivElement | null>(null);

  // ontology id 는 `project:x` prefixed 지만 토폴로지의 project 노드는 bare
  // slug — graph-build 의 endpoint 해석과 동일한 규칙으로 카드를 노드에 잇는다.
  const resolveNodeId = useCallback(
    (id: string): string | null => {
      if (graph.hasNode(id)) return id;
      if (id.startsWith('project:')) {
        const bare = id.slice('project:'.length);
        if (graph.hasNode(bare)) return bare;
      }
      return null;
    },
    [graph],
  );

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
    const dimEls: HTMLElement[] = [];
    const overviewEls: HTMLElement[] = [];
    const elBySlug = new Map<string, HTMLElement>();
    for (const el of els) {
      const slug = el.dataset.slug;
      if (slug) elBySlug.set(slug, el);
    }
    for (const el of els) {
      const slug = el.dataset.slug;
      if (!slug || !graph.hasNode(slug)) continue;
      const dockParent = el.dataset.dockParent;
      const parentEl = dockParent ? elBySlug.get(dockParent) : undefined;
      if (dockParent && parentEl) {
        // px 도킹 — 부모 카드 rect 기준 고정 밀도 (줌 배율 무관). 열 간격
        // 56px, 행 pitch = 카드 높이 + 10px, 열의 세로 중심 = 부모 중심.
        // 자식이 safe 높이를 넘으면 멀티 컬럼으로 랩핑(상/하단 chrome 관통 방지).
        const p = parentEl.getBoundingClientRect();
        const side = el.dataset.dockSide === 'left' ? -1 : 1;
        const index = Number(el.dataset.dockIndex ?? '0');
        const total = Math.max(1, Number(el.dataset.dockTotal ?? '1'));
        const pitch = el.offsetHeight + 10;
        const safeH = Math.max(pitch, containerRect.height - 96 - 56);
        const perColumn = Math.max(1, Math.floor(safeH / pitch));
        const col = Math.floor(index / perColumn);
        const row = index % perColumn;
        const rowsInCol = Math.min(perColumn, total - col * perColumn);
        el.dataset.dockCol = String(col);
        const x =
          side === 1
            ? p.right - containerRect.left + dockGap + col * columnStep
            : p.left - containerRect.left - dockGap - col * columnStep;
        const y =
          (p.top + p.bottom) / 2 -
          containerRect.top +
          (row - (rowsInCol - 1) / 2) * pitch;
        const anchor = side === 1 ? ANCHOR_TRANSLATE.left : ANCHOR_TRANSLATE.right;
        el.style.transform = `${anchor} translate3d(${x}px, ${y}px, 0)`;
      } else {
        const attrs = graph.getNodeAttributes(slug);
        const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
        const anchor =
          ANCHOR_TRANSLATE[(el.dataset.anchor as SkeletonCardModel['anchor']) ?? 'center'] ??
          ANCHOR_TRANSLATE.center;
        el.style.transform = `${anchor} translate3d(${vp.x}px, ${vp.y}px, 0)`;
      }
      if (el.dataset.dimmed === 'true') {
        dimEls.push(el);
      } else {
        el.style.opacity = '1';
        el.style.pointerEvents = '';
        overviewEls.push(el);
        const r = el.getBoundingClientRect();
        egoRects.push({
          left: r.left - containerRect.left - COLLISION_PAD,
          top: r.top - containerRect.top - COLLISION_PAD,
          right: r.right - containerRect.left + COLLISION_PAD,
          bottom: r.bottom - containerRect.top + COLLISION_PAD,
        });
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
        if (clipped || accepted.some((kept) => rectsOverlap(rect, kept, OVERVIEW_COLLISION_PAD))) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }
        accepted.push(rect);
      }
    }
    // pass 2 — dim 카드: 펼친 열과 겹치면 0(충돌 금지), 아니면 tier 별 dim.
    // 레이아웃 전환 창 동안은 직전 판정을 동결 — 슬라이드 경로 위 dim 카드가
    // 0↔dim 을 페이드로 반복하는 펌핑 방지 (창 종료 후 afterRender 가 재판정).
    const animating = container.dataset.layoutAnimate === 'true';
    for (const el of dimEls) {
      const slug = el.dataset.slug ?? '';
      let collides: boolean;
      if (animating && collisionFreezeRef.current.has(slug)) {
        collides = collisionFreezeRef.current.get(slug)!;
      } else {
        const r = el.getBoundingClientRect();
        const left = r.left - containerRect.left;
        const top = r.top - containerRect.top;
        const right = r.right - containerRect.left;
        const bottom = r.bottom - containerRect.top;
        collides = egoRects.some(
          (e) => left < e.right && right > e.left && top < e.bottom && bottom > e.top,
        );
        collisionFreezeRef.current.set(slug, collides);
      }
      if (collides) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      } else {
        el.style.opacity =
          (el.dataset.tier === '0' || el.dataset.tier === '1')
            ? DIM_ANCHOR_OPACITY
            : DIM_CHIP_OPACITY;
        el.style.pointerEvents = '';
      }
    }
    // pass 3 — 커넥터: 부모 카드의 자식 방향 모서리에서 자식 카드의 근접
    // 모서리로, 양 끝을 rect 경계 +6px 에서 트림(라운드 모서리 관통 0).
    const svg = container.querySelector<SVGSVGElement>('[data-skeleton-connectors]');
    if (svg) {
      const parentEl = container.querySelector<HTMLElement>(
        `[data-skeleton-card][data-slug="${CSS.escape(ego?.selected ?? '')}"]`,
      );
      const parentRect = parentEl?.getBoundingClientRect();
      for (const path of svg.querySelectorAll<SVGPathElement>('[data-connector]')) {
        const childSlug = path.dataset.connector;
        const childEl = childSlug
          ? container.querySelector<HTMLElement>(
              `[data-skeleton-card][data-slug="${CSS.escape(childSlug)}"]`,
            )
          : null;
        if (!parentRect || !childEl) {
          path.setAttribute('d', '');
          continue;
        }
        // 2열 이상의 카드로는 커넥터를 긋지 않는다 — 1열을 관통한다.
        if (childEl.dataset.dockCol && childEl.dataset.dockCol !== '0') {
          path.setAttribute('d', '');
          continue;
        }
        const c = childEl.getBoundingClientRect();
        const px = { left: parentRect.left - containerRect.left, right: parentRect.right - containerRect.left, midY: (parentRect.top + parentRect.bottom) / 2 - containerRect.top };
        const cx = { left: c.left - containerRect.left, right: c.right - containerRect.left, midY: (c.top + c.bottom) / 2 - containerRect.top };
        const childOnRight = (cx.left + cx.right) / 2 >= (px.left + px.right) / 2;
        const sx = childOnRight ? px.right + 6 : px.left - 6;
        const ex = childOnRight ? cx.left - 6 : cx.right + 6;
        path.setAttribute('d', connectorPath(sx, px.midY, ex, cx.midY));
      }
    }
    // pass 4 — hover 팝업 위치: 카드 우측 +10, 화면/우측 패널에 닿으면 좌측
    // flip + 세로 클램프. 매 프레임 카드 rect 파생이라 팬/줌을 따라간다.
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
  }, [graph, sigma, ego]);

  // 카드 목록이 바뀌는 렌더마다 paint 전에 배치 (확장으로 새 카드 등장 시).
  useLayoutEffect(() => {
    reposition();
  });

  // 전환 모션 — 레이아웃(펼침/접힘)이 바뀐 직후 짧은 창 동안만 transform
  // 전환을 켠다: 기존 카드가 새 자리로 *미끄러지듯* 이동(좌표는 결정론,
  // 생동감은 전환으로). 창이 닫히면 camera pan/zoom 추적은 즉시(지연 0).
  // 새로 마운트된 카드는 첫 transform 이 초기 스타일이라 fly-in 없음.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.dataset.layoutAnimate = 'true';
    // 창 480ms = 카메라 reframe(420ms) + 여유 1프레임 — 창이 카메라보다
    // 먼저 닫히며 생기던 막판 스냅 제거. 창이 닫힐 때 충돌 동결 해제.
    const timer = window.setTimeout(() => {
      delete container.dataset.layoutAnimate;
      collisionFreezeRef.current.clear();
      reposition();
    }, 480);
    return () => {
      window.clearTimeout(timer);
      delete container.dataset.layoutAnimate;
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

  if (!sigma) return null;

  return (
    <div
      ref={containerRef}
      data-testid="sigma-skeleton-cards"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      {/* 펼친 가지 커넥터 — 수평 접선 S-커브, 카드 경계 트림. 인디고는
          "활성 가지" 단일 의미 (overview hairline 은 Sigma 캔버스 담당). */}
      <svg
        data-skeleton-connectors
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {ego?.childIds.map((childId) => (
          <path
            key={childId}
            data-connector={childId}
            className="topology-connector-path"
            fill="none"
            stroke="var(--topology-connector)"
            strokeWidth={1.25}
          />
        ))}
      </svg>
      {cards.map((card) => {
        const nodeId = resolveNodeId(card.id);
        if (!nodeId) return null;
        const selected = selectedSlug === nodeId || selectedSlug === card.id;
        const dimmed = ego !== null && !ego.slugs.has(nodeId);
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
              card.dock ? resolveNodeId(card.dock.parentId) ?? undefined : undefined
            }
            data-dock-side={card.dock?.side}
            data-dock-index={card.dock?.index}
            data-dock-total={card.dock?.total}
            data-selected={selected ? 'true' : 'false'}
            data-dimmed={dimmed ? 'true' : 'false'}
            onClick={(event) => {
              event.stopPropagation();
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onSelect?.(nodeId);
            }}
            onMouseEnter={() => setHovered({ card, nodeId })}
            onMouseLeave={() => setHovered(null)}
            onPointerDown={(event) => {
              setHovered(null);
              if (event.button !== 0) return;
              const rootSlug = event.currentTarget.dataset.dockParent ?? nodeId;
              if (!graph.hasNode(rootSlug)) return;
              dragRef.current = {
                sourceSlug: nodeId,
                rootSlug,
                lastX: event.clientX,
                lastY: event.clientY,
                travel: 0,
              };
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                /* jsdom 등 미지원 환경 */
              }
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.sourceSlug !== nodeId || !sigma) return;
              const dx = event.clientX - drag.lastX;
              const dy = event.clientY - drag.lastY;
              drag.lastX = event.clientX;
              drag.lastY = event.clientY;
              drag.travel += Math.abs(dx) + Math.abs(dy);
              if (drag.travel <= 4) return;
              setHovered(null);
              const movableNodeIds = new Set<string>();
              for (const card of cards) {
                if (card.dock) continue;
                const resolved = resolveNodeId(card.id);
                if (resolved) movableNodeIds.add(resolved);
              }
              const movingGroup = collectDraggedCluster(graph, drag.rootSlug, movableNodeIds);
              const delta = clampDraggedClusterDelta(
                containerRef.current,
                movingGroup,
                dx,
                dy,
              );
              if (delta.dx === 0 && delta.dy === 0) return;
              moveDraggedCluster(graph, drag.rootSlug, delta.dx, delta.dy, sigma, movableNodeIds);
              reposition();
            }}
            onPointerUp={() => {
              const drag = dragRef.current;
              if (drag && drag.sourceSlug === nodeId && drag.travel > 4) {
                suppressClickRef.current = true;
              }
              dragRef.current = null;
            }}
            // 터치 제스처 중단/캡처 상실 시 드래그 상태 정리 — 버튼 미가압
            // 이동만으로 카드가 끌려가는 stale drag 방지.
            onPointerCancel={() => {
              dragRef.current = null;
            }}
            onLostPointerCapture={() => {
              dragRef.current = null;
            }}
            title={card.title}
            style={
              {
                zIndex: selected ? 8 : dimmed ? 0 : TIER_Z_INDEX[card.tier],
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
            className={`pointer-events-auto absolute left-0 top-0 inline-flex items-center whitespace-nowrap border border-[color:var(--card-border)] bg-[color:var(--color-panel)] opacity-0 transition-[opacity,border-color,box-shadow] duration-200 ease-out hover:border-[color:var(--card-border-hover)] motion-reduce:transition-none ${
              // 전환 모션: anchor 카드만 transform 슬라이드(카메라 420ms 와
              // 동일 duration/easing). 도킹 자식은 매 프레임 부모 rect 기준
              // 즉시 도킹 — 부모의 transition 이 자연스럽게 끌고 간다.
              card.dock
                ? ''
                : '[[data-layout-animate]_&]:transition-[opacity,border-color,transform] [[data-layout-animate]_&]:duration-[420ms] [[data-layout-animate]_&]:ease-[cubic-bezier(0.3,1.18,0.45,1)]'
            } ${
              selected
                ? 'shadow-[0_0_0_1px_var(--topology-card-outline-selected),0_14px_36px_var(--topology-card-selected-shadow)] outline outline-1 outline-offset-1 outline-[color:var(--topology-card-outline-selected)]'
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
