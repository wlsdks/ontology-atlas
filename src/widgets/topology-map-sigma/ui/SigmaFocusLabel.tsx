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

  return (
    <div
      data-testid="sigma-focus-label"
      data-slug={slug}
      data-focused={focused ? 'true' : 'false'}
      data-node-x={String(Math.round(vp.x))}
      data-node-y={String(Math.round(vp.y))}
      data-display-x={display ? String(Math.round(display.x)) : undefined}
      data-display-y={display ? String(Math.round(display.y)) : undefined}
      className="pointer-events-none absolute z-20"
      style={{
        left: vp.x + size + 10,
        top: vp.y - 11,
      }}
    >
      <span className="inline-flex items-center rounded-sm border border-[color:rgba(139,151,255,0.32)] bg-[color:var(--color-panel)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.95)]">
        {attrs.label}
      </span>
    </div>
  );
}
