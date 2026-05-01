'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type Sigma from 'sigma';
import type Graph from 'graphology';
import { INDIGO_HUB } from '@/shared/config/indigo-tokens';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from '../lib/graph-build';

interface SigmaMinimapProps {
  sigma: Sigma<SigmaNodeAttrs, SigmaEdgeAttrs> | null;
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>;
}

const MINI_W = 180;
const MINI_H = 140;

/**
 * 우하단 미니맵. 본 Sigma의 카메라 상태·그래프를 구독해 축소 렌더 + 현재
 * 뷰포트 사각형을 표시한다. 클릭·드래그 모두 해당 미니맵 좌표가 카메라
 * 중심이 되도록 매핑 (옵시디언과 동일한 업계 표준 동작).
 */
export function SigmaMinimap({ sigma, graph }: SigmaMinimapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tick, setTick] = useState(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!sigma) return;
    const camera = sigma.getCamera();
    const handler = () => setTick((t) => (t + 1) % 1_000_000);
    camera.on('updated', handler);
    return () => {
      camera.off('updated', handler);
    };
  }, [sigma]);

  const panTo = useCallback(
    (clientX: number, clientY: number) => {
      if (!sigma || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = ((clientX - rect.left) / rect.width) * MINI_W;
      const svgY = ((clientY - rect.top) / rect.height) * MINI_H;
      const bbox = computeBbox(graph);
      if (!bbox) return;
      const { offsetX, offsetY, scale } = bbox;
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
    [sigma, graph],
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
    svgRef.current?.releasePointerCapture(event.pointerId);
  };

  if (!sigma) return null;

  const bbox = computeBbox(graph);
  if (!bbox) return null;
  const { offsetX, offsetY, scale } = bbox;

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
  const cx1 = Math.max(0, Math.min(MINI_W, rawX1));
  const cy1 = Math.max(0, Math.min(MINI_H, rawY1));
  const cx2 = Math.max(0, Math.min(MINI_W, rawX2));
  const cy2 = Math.max(0, Math.min(MINI_H, rawY2));
  const rectX = cx1;
  const rectY = cy1;
  const rectW = cx2 - cx1;
  const rectH = cy2 - cy1;
  // overlap 이 충분할 때만 렌더. 2px 이하면 degenerate (가로/세로 줄) 이므로 숨김.
  const showViewportRect = rectW > 2 && rectH > 2;

  // 허브 + 일반 노드 샘플링. 허브는 전원, 일반은 sampleStep 간격.
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
      hubPositions.set(id, {
        x: (attrs.x + offsetX) * scale,
        y: (attrs.y + offsetY) * scale,
      });
    }
    if (attrs.isHub || idx % sampleStep === 0) {
      sampledNodes.push({
        id,
        x: (attrs.x + offsetX) * scale,
        y: (attrs.y + offsetY) * scale,
        size: attrs.isHub ? 3 : 1.2,
        isHub: attrs.isHub,
      });
    }
    idx += 1;
  });
  const primaryCount = hubCount;
  const primaryLabel = 'hubs';

  // 허브-허브 엣지 — 미니맵에서 전체 구조 힌트. 엣지 수가 많지 않아 렌더
  // 부하 경미. 방향성은 무시하고 연결 여부만 표기.
  const hubEdges: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  graph.forEachEdge((edgeId, _attrs, src, tgt) => {
    const a = hubPositions.get(src);
    const b = hubPositions.get(tgt);
    if (!a || !b) return;
    hubEdges.push({ key: edgeId, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  });

  void tick;

  return (
    <div className="pointer-events-auto absolute bottom-6 right-4 z-10 hidden overflow-hidden rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[0_14px_32px_rgba(0,0,0,0.5)] md:right-6 md:block xl:right-8">
      <div className="flex items-center justify-between border-b border-[color:var(--color-border-soft)] px-2.5 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          Map
        </span>
        <span className="font-mono text-[9px] tracking-[0.08em] text-[color:var(--color-text-tertiary)]">
          {totalNodes} · {primaryCount} {primaryLabel}
        </span>
      </div>
      <svg
        ref={svgRef}
        width={MINI_W}
        height={MINI_H}
        viewBox={`0 0 ${MINI_W} ${MINI_H}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="cursor-crosshair touch-none"
      >
        {hubEdges.map((e) => (
          <line
            key={e.key}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="rgba(139,151,255,0.18)"
            strokeWidth={0.6}
          />
        ))}
        {sampledNodes.map((n) => (
          <circle
            key={n.id}
            cx={n.x}
            cy={n.y}
            r={n.size}
            fill={n.isHub ? INDIGO_HUB : 'rgba(168,178,198,0.45)'}
          />
        ))}
        {showViewportRect ? (
          <rect
            x={rectX}
            y={rectY}
            width={rectW}
            height={rectH}
            fill="rgba(139,151,255,0.08)"
            stroke="rgba(139,151,255,0.85)"
            strokeWidth={1.2}
            pointerEvents="none"
            rx={2}
          />
        ) : null}
      </svg>
    </div>
  );
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
