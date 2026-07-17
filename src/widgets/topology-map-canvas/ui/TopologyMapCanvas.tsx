'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';
import { getOntologyKindTone } from '@/entities/ontology-class/model';
import { useOntologyKindLabel } from '@/entities/ontology-class';
import type { SkeletonCardModel } from '@/widgets/topology-map-sigma';
import {
  fitBounds,
  panBy,
  zoomAt,
  type CardOverhang,
  type MapCamera,
  type MapInsets,
} from '../lib/camera';

/**
 * 지도(Relief) 뷰의 재구성 엔진 — 단일 컨테이너 변환 아키텍처.
 * docs/TOPOLOGY-MAP-REBUILD.md 가 계약의 단일 진실원이다.
 *
 * - 카드/커넥터 좌표는 배치 시 1회만 기록 (absolute px).
 * - 팬/줌 = 컨테이너 하나의 CSS transform (GPU 합성, per-frame DOM 쓰기 0).
 * - 펼침/접기 = FLIP (CSS `translate` 속성 — 앵커 transform 과 독립 합성).
 * - 인터랙션 계약: 클릭=선택만 · 배지=펼치기 · 배경=닫기 (2026-07-03 확정).
 */

interface EdgeLike {
  from: string;
  to: string;
  type: string;
}

export interface TopologyMapCanvasProps {
  cards: readonly SkeletonCardModel[];
  /** slug → sigma 좌표 (y-up). CSS 로는 y 부호 반전해 사용. */
  layout: ReadonlyMap<string, { x: number; y: number; size: number }>;
  edges: readonly EdgeLike[];
  selectedSlug?: string | null;
  healthRepairTargetSlug?: string | null;
  pathWorkflowActive?: boolean;
  pathSelection?: { sourceSlug: string | null; targetSlug: string | null } | null;
  onPathSelectionChange?: (selection: {
    sourceSlug: string | null;
    targetSlug: string | null;
  }) => void;
  onSelect?: (slug: string) => void;
  onExpandRequest?: (slug: string) => void;
  onPaneClick?: () => void;
  /** 증가 시 fit-to-bounds 재실행 (HomePage "지도 맞추기"). */
  fitViewToken?: number;
  /** fixed chrome 이 차지하는 안전 영역 — fit 계산에 반영. */
  fitInsets?: MapInsets;
}

// 좌측 분석 패널 + 상단 HUD 를 피하는 안전 영역 — `--topology-map-safe-inset-*`
// 토큰이 단일 진실원(app/globals.css). 패널 실측(344px 우측 엣지, 디자인
// 가디언 verdict a4)과 어긋났던 하드코딩 480px 을 제거한다: 토큰 해석 실패
// (SSR/구 브라우저) 시에만 이 리터럴이 안전망으로 쓰인다.
const SAFE_INSET_FALLBACK: MapInsets = { top: 120, right: 120, bottom: 110, left: 344 };

function readSafeInsetTokens(): MapInsets {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return SAFE_INSET_FALLBACK;
  }
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: number) => {
    const parsed = parseFloat(style.getPropertyValue(name));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    top: read('--topology-map-safe-inset-top', SAFE_INSET_FALLBACK.top),
    right: read('--topology-map-safe-inset-right', SAFE_INSET_FALLBACK.right),
    bottom: read('--topology-map-safe-inset-bottom', SAFE_INSET_FALLBACK.bottom),
    left: read('--topology-map-safe-inset-left', SAFE_INSET_FALLBACK.left),
  };
}

// 모듈 로드 시 1회만 해석 — 토큰 값은 런타임에 바뀌지 않는 레이아웃 상수라
// per-render 재계산이 낭비다.
const DEFAULT_INSETS: MapInsets = readSafeInsetTokens();
const DOCK_COL_GAP = 56;
const DOCK_ROW_PITCH = 44;
const CARD_HALF_WIDTH_FALLBACK = 150;
const CARD_HALF_HEIGHT_FALLBACK = 24;
// 트랙패드 지터가 클릭을 팬으로 오인·취소하지 않는 하한 — 구 엔진과 동일
// 계약 (verify: topologyStagePanClickCancelPx >= 12).
const PAN_CLICK_CANCEL_PX = 12;
const CONNECTOR_CAP = 28;

interface CardPosition {
  x: number;
  y: number;
  anchor: NonNullable<SkeletonCardModel['anchor']>;
}

const ANCHOR_TRANSLATE: Record<NonNullable<SkeletonCardModel['anchor']>, string> = {
  center: 'translate(-50%, -50%) scale(var(--map-inv-k, 1))',
  left: 'translate(0%, -50%) scale(var(--map-inv-k, 1))',
  right: 'translate(-100%, -50%) scale(var(--map-inv-k, 1))',
};
const ANCHOR_ORIGIN: Record<NonNullable<SkeletonCardModel['anchor']>, string> = {
  center: '50% 50%',
  left: '0% 50%',
  right: '100% 50%',
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function TopologyMapCanvas({
  cards,
  layout,
  edges,
  selectedSlug = null,
  healthRepairTargetSlug = null,
  pathWorkflowActive = false,
  pathSelection = null,
  onPathSelectionChange,
  onSelect,
  onExpandRequest,
  onPaneClick,
  fitViewToken = 0,
  fitInsets = DEFAULT_INSETS,
}: TopologyMapCanvasProps) {
  const tEdgeTooltip = useTranslations('topologyWidgets.edgeTooltip');
  const kindLabel = useOntologyKindLabel();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<MapCamera>({ tx: 0, ty: 0, k: 1 });
  const cardElsRef = useRef(new Map<string, HTMLElement>());
  const prevPosRef = useRef(new Map<string, { x: number; y: number }>());
  // 도킹 자식 배치는 부모 카드 폭이 필요 — offsetWidth 는 transform 무관이라
  // 1회 측정으로 충분. 측정 후 한 번 재렌더 (FLIP 이 보정 이동을 애니메이션).
  const [widthBySlug, setWidthBySlug] = useState<ReadonlyMap<string, number>>(
    new Map(),
  );

  const cardById = useMemo(() => {
    const map = new Map<string, SkeletonCardModel>();
    for (const card of cards) map.set(card.id, card);
    return map;
  }, [cards]);

  /** 카드 절대 좌표 (컨테이너 로컬 px). 도킹 자식은 부모 기준 px 오프셋. */
  const positions = useMemo(() => {
    const result = new Map<string, CardPosition>();
    // SSR/클라 float 문자열화 차이가 hydration mismatch 를 만들므로
    // 0.01px 로 라운딩해 좌표를 결정론화한다.
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const baseOf = (id: string): { x: number; y: number } | null => {
      const p = layout.get(id);
      return p ? { x: round2(p.x), y: round2(-p.y) } : null;
    };
    for (const card of cards) {
      if (card.dock) continue;
      const base = baseOf(card.id);
      if (!base) continue;
      result.set(card.id, { ...base, anchor: card.anchor ?? 'center' });
    }
    for (const card of cards) {
      if (!card.dock) continue;
      const parent = result.get(card.dock.parentId) ?? null;
      const parentBase = parent ?? baseOf(card.dock.parentId);
      if (!parentBase) continue;
      const parentHalf =
        (widthBySlug.get(card.dock.parentId) ?? CARD_HALF_WIDTH_FALLBACK * 2) / 2;
      const dir = card.dock.side === 'right' ? 1 : -1;
      const x = round2(parentBase.x + dir * (parentHalf + DOCK_COL_GAP));
      const y = round2(
        parentBase.y + (card.dock.index - (card.dock.total - 1) / 2) * DOCK_ROW_PITCH,
      );
      result.set(card.id, {
        x,
        y,
        anchor: card.dock.side === 'right' ? 'left' : 'right',
      });
    }
    return result;
  }, [cards, layout, widthBySlug]);

  /** contains 백본 — 보이는 카드 사이, 상위 tier → 하위 tier, 상한 CONNECTOR_CAP. */
  const connectors = useMemo(() => {
    const tierOf = (id: string) => cardById.get(id)?.tier ?? 3;
    const seen = new Set<string>();
    const pairs: { from: string; to: string }[] = [];
    for (const edge of edges) {
      if (edge.type !== 'contains' && edge.type !== 'belongs_to') continue;
      if (!positions.has(edge.from) || !positions.has(edge.to)) continue;
      const [from, to] =
        tierOf(edge.from) <= tierOf(edge.to)
          ? [edge.from, edge.to]
          : [edge.to, edge.from];
      const key = `${from}→${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ from, to });
    }
    return pairs
      .sort(
        (a, b) =>
          Math.max(tierOf(a.from), tierOf(a.to)) -
          Math.max(tierOf(b.from), tierOf(b.to)),
      )
      .slice(0, CONNECTOR_CAP);
  }, [cardById, edges, positions]);

  const applyCamera = useCallback((camera: MapCamera) => {
    cameraRef.current = camera;
    const el = containerRef.current;
    if (el) {
      el.style.transform = `translate(${camera.tx}px, ${camera.ty}px) scale(${camera.k})`;
      // 카드 시각 크기는 줌과 무관하게 px 고정 (구 엔진과 같은 읽기 감각) —
      // 각 카드가 scale(1/k) 역보정을 CSS 변수 하나로 받는다. DOM 쓰기는
      // 여전히 컨테이너 1건.
      el.style.setProperty('--map-inv-k', String(1 / camera.k));
    }
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.dataset.mapCameraScale = camera.k.toFixed(3);
    }
  }, []);

  const runFit = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || positions.size === 0) return;
    // world bounds 는 카드 "중심" 좌표만 — 카드 자체의 화면-px 크기는
    // overhang 으로 별도 예산 처리한다(px-고정 카드에 world-px 여백을 더하면
    // 차원이 안 맞는다는 게 verdict a2 의 핵심 진단).
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let minXId: string | null = null;
    let maxXId: string | null = null;
    let minYId: string | null = null;
    let maxYId: string | null = null;
    for (const [id, pos] of positions) {
      if (pos.x < minX) {
        minX = pos.x;
        minXId = id;
      }
      if (pos.x > maxX) {
        maxX = pos.x;
        maxXId = id;
      }
      if (pos.y < minY) {
        minY = pos.y;
        minYId = id;
      }
      if (pos.y > maxY) {
        maxY = pos.y;
        maxYId = id;
      }
    }
    const halfExtentOf = (id: string | null) => {
      const el = id ? cardElsRef.current.get(id) : null;
      if (!el || el.offsetWidth === 0) {
        return { halfWidth: CARD_HALF_WIDTH_FALLBACK, halfHeight: CARD_HALF_HEIGHT_FALLBACK };
      }
      return { halfWidth: el.offsetWidth / 2, halfHeight: el.offsetHeight / 2 };
    };
    const overhang: CardOverhang = {
      left: halfExtentOf(minXId).halfWidth,
      right: halfExtentOf(maxXId).halfWidth,
      top: halfExtentOf(minYId).halfHeight,
      bottom: halfExtentOf(maxYId).halfHeight,
    };
    const rect = viewport.getBoundingClientRect();
    applyCamera(
      fitBounds(
        { minX, minY, maxX, maxY },
        { width: rect.width, height: rect.height },
        fitInsets,
        { overhang },
      ),
    );
  }, [applyCamera, fitInsets, positions]);

  // 초기/명시적 fit — 카드 집합이 바뀌는 모드 전환에서는 FLIP 이 연속성을
  // 담당하므로 자동 재-fit 하지 않는다 (카메라 점프 = 구 엔진의 혼란 원천).
  const fittedOnceRef = useRef(false);
  useLayoutEffect(() => {
    if (fittedOnceRef.current) return;
    if (positions.size === 0) return;
    fittedOnceRef.current = true;
    runFit();
  }, [positions, runFit]);
  useEffect(() => {
    if (fitViewToken > 0) runFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitViewToken]);

  // 휠 줌 — React 합성 이벤트는 passive 라 preventDefault 불가; 직접 부착.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const camera = cameraRef.current;
      applyCamera(zoomAt(camera, cursor, camera.k * Math.exp(-event.deltaY * 0.0022)));
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [applyCamera]);

  // 배경 팬 + 클릭(닫기) 판별.
  const gestureRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    moved: number;
  } | null>(null);
  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('[data-skeleton-card]')) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: 0,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }, []);
  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.lastX;
      const dy = event.clientY - gesture.lastY;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      gesture.moved += Math.abs(dx) + Math.abs(dy);
      applyCamera(panBy(cameraRef.current, dx, dy));
    },
    [applyCamera],
  );
  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (gesture && gesture.moved < PAN_CLICK_CANCEL_PX) onPaneClick?.();
    },
    [onPaneClick],
  );

  // FLIP — 위치가 바뀐 카드는 이전 위치에서 미끄러져 온다. `translate` 속성은
  // 앵커용 `transform` 과 독립적으로 합성되므로 충돌이 없다.
  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();
    const prev = prevPosRef.current;
    const next = new Map<string, { x: number; y: number }>();
    for (const [slug, pos] of positions) next.set(slug, { x: pos.x, y: pos.y });
    if (!reduced) {
      for (const [slug, pos] of next) {
        const el = cardElsRef.current.get(slug);
        if (!el) continue;
        const before = prev.get(slug);
        if (before) {
          const dx = before.x - pos.x;
          const dy = before.y - pos.y;
          if (Math.abs(dx) + Math.abs(dy) > 0.5) {
            el.animate(
              [{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }],
              { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
            );
          }
        } else {
          // 새로 등장(펼침) — 부모 방향에서 떠오른다.
          el.animate(
            [
              { opacity: 0, translate: '0px 6px' },
              { opacity: 1, translate: '0px 0px' },
            ],
            { duration: 160, easing: 'ease-out' },
          );
        }
      }
    }
    prevPosRef.current = next;
  }, [positions]);

  // 도킹 부모 폭 측정 (1회 + 카드셋 변경 시).
  useLayoutEffect(() => {
    const parents = new Set<string>();
    for (const card of cards) if (card.dock) parents.add(card.dock.parentId);
    if (parents.size === 0) return;
    const measured = new Map<string, number>();
    let changed = false;
    for (const slug of parents) {
      const el = cardElsRef.current.get(slug);
      if (!el) continue;
      const width = el.offsetWidth;
      measured.set(slug, width);
      if (widthBySlug.get(slug) !== width) changed = true;
    }
    if (changed) setWidthBySlug(measured);
  }, [cards, widthBySlug]);

  const registerCard = useCallback((slug: string) => {
    return (el: HTMLElement | null) => {
      if (el) cardElsRef.current.set(slug, el);
      else cardElsRef.current.delete(slug);
    };
  }, []);

  const handleCardClick = useCallback(
    (slug: string) => {
      if (pathWorkflowActive && onPathSelectionChange) {
        const source = pathSelection?.sourceSlug ?? null;
        const target = pathSelection?.targetSlug ?? null;
        if (!source || target || source === slug) {
          onPathSelectionChange({ sourceSlug: slug, targetSlug: null });
        } else {
          onPathSelectionChange({ sourceSlug: source, targetSlug: slug });
        }
        return;
      }
      onSelect?.(slug);
    },
    [onPathSelectionChange, onSelect, pathSelection, pathWorkflowActive],
  );

  const pathOf = useCallback(
    (from: string, to: string) => {
      const a = positions.get(from);
      const b = positions.get(to);
      if (!a || !b) return '';
      const midX = Math.round(((a.x + b.x) / 2) * 100) / 100;
      return `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
    },
    [positions],
  );

  return (
    <div
      ref={viewportRef}
      data-testid="topology-map-canvas"
      data-map-engine="canvas"
      data-stage-pan-click-cancel-px={PAN_CLICK_CANCEL_PX}
      className="absolute inset-0 touch-none overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        ref={containerRef}
        data-map-transform-container
        className="absolute left-0 top-0 h-0 w-0 will-change-transform"
        style={{ transformOrigin: '0 0' }}
      >
        <svg
          data-map-connector-layer
          className="pointer-events-none absolute overflow-visible"
          width={1}
          height={1}
          aria-hidden
        >
          {connectors.map(({ from, to }) => {
            const touchesSelected = from === selectedSlug || to === selectedSlug;
            const fromTier = cardById.get(from)?.tier ?? 3;
            const spine = fromTier === 0;
            return (
              <path
                key={`${from}→${to}`}
                data-map-connector="contains"
                data-map-connector-emphasis={
                  touchesSelected ? 'selected' : spine ? 'spine' : 'branch'
                }
                d={pathOf(from, to)}
                fill="none"
                stroke={
                  touchesSelected
                    ? 'var(--topology-card-border-selected)'
                    : spine
                      ? 'var(--topology-relation-stroke-strong)'
                      : 'var(--topology-relation-stroke-supported)'
                }
                strokeWidth={touchesSelected ? 2.6 : spine ? 2.4 : 1.7}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={touchesSelected ? 0.95 : spine ? 0.8 : 0.6}
                // 신뢰(branch) 선은 spine 과 같은 인디고 잉크 — 색이 아니라
                // dash 로 구분한다(verdict a5: 카테고리 구분은 색이 아닌
                // 보더/선 스타일이라는 헌장).
                strokeDasharray={
                  !touchesSelected && !spine
                    ? 'var(--topology-relation-stroke-supported-dasharray)'
                    : undefined
                }
              />
            );
          })}
        </svg>
        {cards.map((card) => {
          const pos = positions.get(card.id);
          if (!pos) return null;
          const tone = getOntologyKindTone(card.kind);
          const selected = card.id === selectedSlug;
          const pathRole =
            pathWorkflowActive && pathSelection
              ? card.id === pathSelection.sourceSlug
                ? 'source'
                : card.id === pathSelection.targetSlug
                  ? 'target'
                  : 'none'
              : 'none';
          const repairTarget = card.id === healthRepairTargetSlug;
          return (
            <button
              key={card.id}
              ref={registerCard(card.id)}
              type="button"
              data-skeleton-card
              data-slug={card.id}
              data-selected={selected ? 'true' : 'false'}
              data-map-card-tier={card.tier}
              data-path-role={pathRole}
              data-health-repair-audit-target={repairTarget ? 'true' : undefined}
              onClick={(event) => {
                event.stopPropagation();
                handleCardClick(card.id);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                onExpandRequest?.(card.id);
              }}
              className={`group absolute flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 transition-colors ${
                card.tier === 0
                  ? 'h-11 text-[15px] font-semibold'
                  : card.tier === 1
                    ? 'h-9 text-[13.5px] font-medium'
                    : 'h-8 text-[12px]'
              } ${
                selected || pathRole !== 'none' || repairTarget
                  ? 'border-[color:var(--topology-card-border-selected)] bg-[color:var(--topology-card-selected-wash)]'
                  : 'border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] hover:border-[color:var(--color-border-strong)]'
              } text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-analysis-mode-focus-ring)]`}
              style={{
                left: pos.x,
                top: pos.y,
                transform: ANCHOR_TRANSLATE[pos.anchor],
                transformOrigin: ANCHOR_ORIGIN[pos.anchor],
              }}
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 flex-none rounded-full"
                style={{ backgroundColor: tone.fill }}
              />
              <span
                className="rounded-sm border px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em]"
                style={{
                  backgroundColor: tone.chipBg,
                  borderColor: tone.chipBorder,
                  color: tone.chipText,
                }}
              >
                {kindLabel(card.kind)}
              </span>
              <span className="max-w-[240px] truncate">{card.title}</span>
              {card.count !== undefined && onExpandRequest ? (
                <span
                  role="button"
                  tabIndex={0}
                  data-skeleton-card-expand
                  aria-label={tEdgeTooltip('expandBadgeTitle', { count: card.count })}
                  title={tEdgeTooltip('expandBadgeTitle', { count: card.count })}
                  onClick={(event) => {
                    event.stopPropagation();
                    onExpandRequest(card.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      onExpandRequest(card.id);
                    }
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="ml-0.5 inline-flex h-[1.42em] min-w-[1.65em] cursor-pointer items-center justify-center rounded-full border border-[color:var(--topology-card-count-border)] bg-[color:var(--topology-card-count-surface)] px-[0.42em] font-mono text-[0.68em] leading-none text-[color:var(--topology-card-count-text)] transition-colors hover:border-[color:var(--topology-card-border-selected)] hover:text-[color:var(--color-text-primary)]"
                >
                  {card.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
