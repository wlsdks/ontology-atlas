'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type Sigma from 'sigma';
import type Graph from 'graphology';
import { INDIGO_HUB, indigoRgba } from '@/shared/config/indigo-tokens';
import { coalesceRaf } from '@/shared/lib/coalesce-raf';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from '../lib/graph-build';

interface SigmaMinimapProps {
  sigma: Sigma<SigmaNodeAttrs, SigmaEdgeAttrs> | null;
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>;
}

const MINI_W = 220;
const MINI_H = 154;
const NAVIGATION_FEEDBACK_MS = 700;
export const MIN_READABLE_VIEWPORT_W = 36;
export const MIN_READABLE_VIEWPORT_H = 24;

interface MinimapViewportFrameInput {
  rawLeft: number;
  rawRight: number;
  rawTop: number;
  rawBottom: number;
  width: number;
  height: number;
  minReadableWidth: number;
  minReadableHeight: number;
}

export function resolveMinimapViewportFrame({
  rawLeft,
  rawRight,
  rawTop,
  rawBottom,
  width,
  height,
  minReadableWidth,
  minReadableHeight,
}: MinimapViewportFrameInput): {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  state: 'hidden' | 'thin' | 'readable';
} {
  const finite =
    Number.isFinite(rawLeft) &&
    Number.isFinite(rawRight) &&
    Number.isFinite(rawTop) &&
    Number.isFinite(rawBottom) &&
    Number.isFinite(width) &&
    Number.isFinite(height);
  if (!finite || width <= 0 || height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0, visible: false, state: 'hidden' };
  }

  const x1 = Math.max(0, Math.min(width, rawLeft));
  const x2 = Math.max(0, Math.min(width, rawRight));
  const y1 = Math.max(0, Math.min(height, rawTop));
  const y2 = Math.max(0, Math.min(height, rawBottom));
  const clippedWidth = x2 - x1;
  const clippedHeight = y2 - y1;
  if (clippedWidth <= 2 || clippedHeight <= 2) {
    return { x: x1, y: y1, width: clippedWidth, height: clippedHeight, visible: false, state: 'hidden' };
  }

  const readableWidth = Math.min(width, Math.max(clippedWidth, minReadableWidth));
  const readableHeight = Math.min(height, Math.max(clippedHeight, minReadableHeight));
  const centerX = (x1 + x2) / 2;
  const centerY = (y1 + y2) / 2;
  const x = Math.max(0, Math.min(width - readableWidth, centerX - readableWidth / 2));
  const y = Math.max(0, Math.min(height - readableHeight, centerY - readableHeight / 2));
  const state =
    readableWidth >= minReadableWidth && readableHeight >= minReadableHeight ? 'readable' : 'thin';

  return {
    x,
    y,
    width: readableWidth,
    height: readableHeight,
    visible: true,
    state,
  };
}

/**
 * 우하단 미니맵. 본 Sigma의 카메라 상태·그래프를 구독해 축소 렌더 + 현재
 * 뷰포트 사각형을 표시한다. 클릭·드래그 모두 해당 미니맵 좌표가 카메라
 * 중심이 되도록 매핑 (옵시디언과 동일한 업계 표준 동작).
 */
export function SigmaMinimap({ sigma, graph }: SigmaMinimapProps) {
  const t = useTranslations('topologyWidgets.sigma');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tick, setTick] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const draggingRef = useRef(false);
  const navigationFeedbackTimerRef = useRef<number | null>(null);
  const model = useMemo(() => buildMinimapModel(graph), [graph]);

  const pulseNavigationFeedback = useCallback(() => {
    setNavigating(true);
    if (navigationFeedbackTimerRef.current !== null) {
      window.clearTimeout(navigationFeedbackTimerRef.current);
    }
    navigationFeedbackTimerRef.current = window.setTimeout(() => {
      setNavigating(false);
      navigationFeedbackTimerRef.current = null;
    }, NAVIGATION_FEEDBACK_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (navigationFeedbackTimerRef.current !== null) {
        window.clearTimeout(navigationFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!sigma) return;
    const camera = sigma.getCamera();
    // 'updated' 는 pan/zoom/animate 중 프레임당 여러 번 발화한다. 매 발화마다
    // setTick → 미니맵 전체 리렌더는 낭비라, rAF 로 합쳐 프레임당 1회만 리렌더.
    const coalesced = coalesceRaf(() => setTick((t) => (t + 1) % 1_000_000));
    camera.on('updated', coalesced.trigger);
    return () => {
      camera.off('updated', coalesced.trigger);
      coalesced.cancel();
    };
  }, [sigma]);

  const panTo = useCallback(
    (clientX: number, clientY: number) => {
      if (!sigma || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = ((clientX - rect.left) / rect.width) * MINI_W;
      const svgY = ((clientY - rect.top) / rect.height) * MINI_H;
      if (!model) return;
      const { offsetX, offsetY, scale } = model.bbox;
      const graphX = svgX / scale - offsetX;
      const graphY = svgY / scale - offsetY;
      // 임의 그래프 좌표 → Sigma 카메라 정규화 좌표로 정확히 환산하는 공용
      // API가 없다. 대신 클릭 위치에 가장 가까운 노드를 찾아 그 노드의 display
      // 좌표(이미 정규화됨)로 카메라를 이동. 노드 밀도가 충분해 시각적으론
      // "내가 찍은 곳"과 거의 일치한다.
      let nearestId: string | null = null;
      let nearestDist = Infinity;
      graph.forEachNode((id, attrs) => {
        const dx = attrs.x - graphX;
        const dy = attrs.y - graphY;
        const d = dx * dx + dy * dy;
        if (d < nearestDist) {
          nearestDist = d;
          nearestId = id;
        }
      });
      if (!nearestId) return;
      const disp = sigma.getNodeDisplayData(nearestId);
      if (!disp) return;
      pulseNavigationFeedback();
      const camera = sigma.getCamera();
      if (draggingRef.current) {
        // 드래그 중엔 즉각 반영. ratio는 유지.
        camera.setState({
          ...camera.getState(),
          x: disp.x,
          y: disp.y,
        });
      } else {
        camera.animate(
          { x: disp.x, y: disp.y, ratio: camera.getState().ratio },
          { duration: 240, easing: 'cubicInOut' },
        );
      }
    },
    [sigma, graph, model, pulseNavigationFeedback],
  );

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = true;
    svgRef.current?.setPointerCapture(event.pointerId);
    panTo(event.clientX, event.clientY);
  };
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    panTo(event.clientX, event.clientY);
  };
  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    try {
      svgRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can already be gone when the app window loses focus.
    }
  };

  if (!sigma) return null;

  if (!model) return null;
  const { offsetX, offsetY, scale } = model.bbox;

  const dim = sigma.getDimensions();
  const topLeftGraph = sigma.viewportToGraph({ x: 0, y: 0 });
  const bottomRightGraph = sigma.viewportToGraph({ x: dim.width, y: dim.height });
  // 뷰포트 사각형 양 코너를 minimap 경계로 2D 클리핑. 카메라가 그래프 bbox
  // 밖을 보면 rect 가 minimap 을 벗어나는데, 이전엔 한 축만 clamp 해서 반대
  // 축이 fallback min(8px)으로 떨어져 "얇은 가로/세로 줄" 이 나오는 버그
  // 있었음. 이제는 완전히 minimap 밖이면 아예 숨김.
  const rawX1 = (topLeftGraph.x + offsetX) * scale;
  const rawY1 = (topLeftGraph.y + offsetY) * scale;
  const rawX2 = (bottomRightGraph.x + offsetX) * scale;
  const rawY2 = (bottomRightGraph.y + offsetY) * scale;
  const viewportCoordsAreFinite =
    Number.isFinite(rawX1) &&
    Number.isFinite(rawY1) &&
    Number.isFinite(rawX2) &&
    Number.isFinite(rawY2);
  const rawLeft = viewportCoordsAreFinite ? Math.min(rawX1, rawX2) : 0;
  const rawRight = viewportCoordsAreFinite ? Math.max(rawX1, rawX2) : 0;
  const rawTop = viewportCoordsAreFinite ? Math.min(rawY1, rawY2) : 0;
  const rawBottom = viewportCoordsAreFinite ? Math.max(rawY1, rawY2) : 0;
  const viewportFrame = resolveMinimapViewportFrame({
    rawLeft,
    rawRight,
    rawTop,
    rawBottom,
    width: MINI_W,
    height: MINI_H,
    minReadableWidth: MIN_READABLE_VIEWPORT_W,
    minReadableHeight: MIN_READABLE_VIEWPORT_H,
  });
  const rectX = viewportFrame.x;
  const rectY = viewportFrame.y;
  const rectW = viewportFrame.width;
  const rectH = viewportFrame.height;
  const showViewportRect = viewportCoordsAreFinite && viewportFrame.visible;
  const viewportFrameState = viewportCoordsAreFinite ? viewportFrame.state : 'hidden';

  return (
    <div
      data-testid="topology-minimap"
      data-navigating={navigating ? 'true' : 'false'}
      data-camera-tick={tick}
      data-viewport-frame-state={viewportFrameState}
      data-viewport-frame-width={Math.round(rectW)}
      data-viewport-frame-height={Math.round(rectH)}
      className="topology-ui-scale pointer-events-auto absolute bottom-6 right-4 z-10 hidden overflow-hidden rounded-lg border border-[color:var(--color-divider)] bg-[rgba(10,12,15,0.94)] shadow-[0_18px_42px_rgba(0,0,0,0.56)] backdrop-blur-xl transition-[border-color,box-shadow] duration-200 data-[navigating=true]:border-[rgba(139,151,255,0.5)] data-[navigating=true]:shadow-[0_0_0_1px_rgba(139,151,255,0.24),0_18px_42px_rgba(0,0,0,0.56)] motion-reduce:transition-none md:right-6 md:block xl:right-8"
    >
      <span className="sr-only" aria-live="polite">
        {navigating ? t('minimapNavigating') : ''}
      </span>
      <div className="flex items-center justify-between border-b border-[color:var(--color-border-soft)] px-2.5 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          {t('minimapTitle')}
        </span>
        <span className="font-mono text-[9px] tracking-[0.08em] text-[color:var(--color-text-tertiary)]">
          {model.primaryCount > 0
            ? t('minimapHubSummary', {
                cards: model.totalNodes,
                hubs: model.primaryCount,
              })
            : t('minimapCardSummary', { cards: model.totalNodes })}
        </span>
      </div>
      <svg
        ref={svgRef}
        aria-label={t('minimapAriaLabel')}
        role="img"
        width={MINI_W}
        height={MINI_H}
        viewBox={`0 0 ${MINI_W} ${MINI_H}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="cursor-crosshair touch-none bg-[radial-gradient(circle_at_50%_50%,rgba(139,151,255,0.08),transparent_68%)]"
      >
        {model.hubEdges.map((e) => (
          <line
            key={e.key}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={indigoRgba('highlight', 0.18)}
            strokeWidth={0.6}
          />
        ))}
        {model.sampledNodes.map((n) => (
          <circle
            key={n.id}
            cx={n.x}
            cy={n.y}
            r={n.size}
            // R+ 별자리 톤 (PR #243) 정합 — main graph 의 NODE_OUTER_HALO
            // 와 같은 푸른 별빛 hue (180/195/230). 이전 회색-블루 168/178/198
            // 보다 main 의 dust edge 와 자연스럽게 어울림.
            fill={n.isHub ? INDIGO_HUB : 'rgba(190,205,235,0.5)'}
          />
        ))}
        {showViewportRect ? (
          <>
            <rect
              x={rectX}
              y={rectY}
              width={rectW}
              height={rectH}
              fill="transparent"
              stroke={indigoRgba('highlight', navigating ? 0.24 : 0.16)}
              strokeWidth={navigating ? 5 : 4}
              pointerEvents="none"
              rx={3}
            />
            <rect
              data-testid="topology-minimap-viewport"
              x={rectX}
              y={rectY}
              width={rectW}
              height={rectH}
              fill={indigoRgba('highlight', navigating ? 0.13 : 0.08)}
              stroke={indigoRgba('highlight', navigating ? 0.95 : 0.85)}
              strokeWidth={navigating ? 1.6 : 1.2}
              pointerEvents="none"
              rx={2}
            />
          </>
        ) : null}
      </svg>
    </div>
  );
}

function buildMinimapModel(graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>) {
  const bbox = computeBbox(graph);
  if (!bbox) return null;
  const { offsetX, offsetY, scale } = bbox;
  const hubPositions = new Map<string, { x: number; y: number }>();
  const sampledNodes: {
    id: string;
    x: number;
    y: number;
    size: number;
    isHub: boolean;
  }[] = [];
  const totalNodes = graph.order;
  const sampleStep = Math.max(1, Math.floor(totalNodes / 40));
  let idx = 0;
  let hubCount = 0;

  graph.forEachNode((id, attrs) => {
    if (attrs.isHub) {
      hubCount += 1;
      const x = (attrs.x + offsetX) * scale;
      const y = (attrs.y + offsetY) * scale;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        hubPositions.set(id, { x, y });
      }
    }
    if (attrs.isHub || idx % sampleStep === 0) {
      const x = (attrs.x + offsetX) * scale;
      const y = (attrs.y + offsetY) * scale;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        idx += 1;
        return;
      }
      sampledNodes.push({
        id,
        x,
        y,
        size: attrs.isHub ? 3 : 1.2,
        isHub: attrs.isHub,
      });
    }
    idx += 1;
  });

  const hubEdges: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  graph.forEachEdge((edgeId, _attrs, src, tgt) => {
    const a = hubPositions.get(src);
    const b = hubPositions.get(tgt);
    if (!a || !b) return;
    hubEdges.push({ key: edgeId, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  });

  return {
    bbox,
    hubEdges,
    primaryCount: hubCount,
    sampledNodes,
    totalNodes,
  };
}

function computeBbox(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
): {
  minX: number;
  minY: number;
  bboxW: number;
  bboxH: number;
  offsetX: number;
  offsetY: number;
  scale: number;
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  graph.forEachNode((_, attrs) => {
    if (!Number.isFinite(attrs.x) || !Number.isFinite(attrs.y)) return;
    if (attrs.x < minX) minX = attrs.x;
    if (attrs.y < minY) minY = attrs.y;
    if (attrs.x > maxX) maxX = attrs.x;
    if (attrs.y > maxY) maxY = attrs.y;
  });
  const pad = 40;
  const bboxW = maxX - minX + pad * 2;
  const bboxH = maxY - minY + pad * 2;
  if (!isFinite(bboxW) || !isFinite(bboxH) || bboxW <= 0 || bboxH <= 0) return null;
  const scale = Math.min(MINI_W / bboxW, MINI_H / bboxH);
  const offsetX = -minX + pad;
  const offsetY = -minY + pad;
  return { minX, minY, bboxW, bboxH, offsetX, offsetY, scale };
}
