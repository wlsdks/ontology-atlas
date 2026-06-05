'use client';

import { useEffect, useState } from 'react';
import type Sigma from 'sigma';
import type Graph from 'graphology';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from '../lib/graph-build';

interface SigmaFocusLabelProps {
  sigma: Sigma<SigmaNodeAttrs, SigmaEdgeAttrs> | null;
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>;
  /** 표시 대상 slug. null/없음이면 렌더 생략. */
  slug?: string | null;
  /**
   * focus 로 표시 중인 경우 reducer 가 노드를 1.25/1.6 배 확대하므로 라벨
   * 오프셋도 그만큼 맞춰야 한다. hover 표시 (확대 없음) 에는 false.
   */
  focused?: boolean;
}

interface FocusLabelPlacementInput {
  x: number;
  y: number;
  nodeSize: number;
  viewportWidth: number;
  viewportHeight: number;
  labelWidth?: number;
  labelHeight?: number;
  padding?: number;
}

export function resolveFocusLabelPlacement({
  x,
  y,
  nodeSize,
  viewportWidth,
  viewportHeight,
  labelWidth = 176,
  labelHeight = 28,
  padding = 16,
}: FocusLabelPlacementInput) {
  const gap = 12;
  const right = x + nodeSize + gap;
  const left = x - nodeSize - gap - labelWidth;
  const placeLeft = right + labelWidth + padding > viewportWidth;
  const rawLeft = placeLeft ? left : right;
  const rawTop = y - labelHeight / 2;

  return {
    left: Math.min(
      Math.max(rawLeft, padding),
      Math.max(padding, viewportWidth - labelWidth - padding),
    ),
    top: Math.min(
      Math.max(rawTop, padding),
      Math.max(padding, viewportHeight - labelHeight - padding),
    ),
    side: placeLeft ? 'left' : 'right',
  } as const;
}

/**
 * 포커스 노드 옆에 떠 있는 작은 라벨 카드 (DOM overlay).
 *
 * 배경:
 * - Sigma 의 native 라벨은 전역 색/두께 설정 (labelWeight 600 · near-white)
 *   을 쓰므로 포커스 상태에서 선명한 "흰 박스" 처럼 보이는 역효과가 있었다.
 *   per-node 스타일 override 가 불가능하므로, focus 라벨만 DOM 으로 분리.
 * - camera pan/zoom, drag, physics tick 이 발생할 때마다 Sigma 는 afterRender
 *   이벤트를 emit 하므로 그 때 한 번만 tick 업데이트. React batching 덕에
 *   setState 비용은 낮다.
 */
export function SigmaFocusLabel({
  sigma,
  graph,
  slug,
  focused = true,
}: SigmaFocusLabelProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!sigma) return;
    const handler = () => setTick((t) => (t + 1) % 1_000_000);
    sigma.on('afterRender', handler);
    window.addEventListener('resize', handler);
    return () => {
      sigma.off('afterRender', handler);
      window.removeEventListener('resize', handler);
    };
  }, [sigma]);

  void tick;

  if (!sigma || !slug || !graph.hasNode(slug)) return null;
  const attrs = graph.getNodeAttributes(slug);
  const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
  const display = sigma.getNodeDisplayData(slug);
  const scale = focused ? (attrs.isHub ? 1.25 : 1.6) : 1;
  const size = attrs.size * scale;
  const placement = resolveFocusLabelPlacement({
    x: vp.x,
    y: vp.y,
    nodeSize: size,
    viewportWidth:
      typeof window === 'undefined' ? 1024 : window.innerWidth,
    viewportHeight:
      typeof window === 'undefined' ? 768 : window.innerHeight,
  });

  return (
    <div
      data-testid="sigma-focus-label"
      data-slug={slug}
      data-focused={focused ? 'true' : 'false'}
      data-side={placement.side}
      data-node-x={String(Math.round(vp.x))}
      data-node-y={String(Math.round(vp.y))}
      data-display-x={display ? String(Math.round(display.x)) : undefined}
      data-display-y={display ? String(Math.round(display.y)) : undefined}
      className="pointer-events-none absolute z-30"
      style={{
        left: placement.left,
        top: placement.top,
      }}
    >
      <span className="inline-flex max-w-[11rem] items-center truncate rounded-md border border-[color:rgba(139,151,255,0.38)] bg-[color:rgba(8,10,16,0.96)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:rgba(232,236,255,0.96)] shadow-[0_8px_18px_rgba(0,0,0,0.46)]">
        {attrs.label}
      </span>
    </div>
  );
}
