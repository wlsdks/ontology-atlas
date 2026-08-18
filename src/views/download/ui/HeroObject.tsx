'use client';

import { useEffect, useRef, useState } from 'react';
import { mountHeroObject, type HeroGraphData } from '../lib/hero-object-engine';
import type { StageGraph } from '../lib/stage-graph';
import { cn } from '@/shared/lib/cn';

/**
 * 히어로 오브젝트 — 활자의 맞은편 기둥.
 *
 * 그리는 것은 목업이 아니라 **아래 증거 절 지도·캡션과 같은 그래프**다
 * (`useStageGraph` 한 훅). 첫 3초 규칙: 활자가 150ms 에 먼저 오고, 이 무대는
 * 450ms 부터 층이 조립된다(`.gateway-hero-stage` 의 CSS 지연 + 엔진의
 * 계층별 조립 지연).
 *
 * `aria-hidden` — 장식이 아니라 **중복**이라서다: 여기 그려지는 사실(개념 수 ·
 * 관계 수 · 구조)은 증거 절의 캡션과 계기 스트립이 텍스트로 이미 나른다.
 * 스크린리더에 같은 그래프를 두 번 읽힐 이유가 없다.
 */
export function HeroObject({ graph }: { graph: StageGraph }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || graph.nodes.length === 0) return;

    const data: HeroGraphData = {
      nodes: graph.nodes.map((node) => ({ s: node.id, k: node.kind })),
      edges: graph.edges
        .filter((edge) => edge.kind === 'contains' || edge.kind === 'depends')
        .map((edge) => ({ a: edge.source, b: edge.target, y: edge.kind })),
    };

    // `fitPx: 455` — 기본 620 은 정방형 무대의 값이다. 낮춘 무대(1/0.62)에서
    // 기본값을 쓰면 잉크가 min(W,H)/620 로 줄어 오브젝트가 기둥의 66%만 쓰는
    // 장식이 된다(실측 1728: 잉크 347×311 / 상자 528×433). 455 는 «원하는
    // 크기»까지다 — 잘리지 않음은 엔진의 잉크 봉투 클램프가 보장한다
    // (2026-08-18 소유자 지적: 돔 하단이 계기 괘선에 잘렸다. 엔진이 요 한
    // 바퀴의 투영 bbox 를 재서 세로 중심을 봉투 중심에 놓고, 넘치는 배율은
    // 여백 4% 를 남기고 줄인다 — `hero-object-engine.ts` 봉투 독블록).
    const handle = mountHeroObject(canvas, data, { inkScale: 0.97, fitPx: 455 });
    // rAF 콜백이라 effect 본문의 동기 setState 가 아니다 — 무대는 엔진이 실제로
    // 붙은 다음 프레임에 밝아진다(canvas 컨텍스트가 없는 환경에서는 계속 0).
    let raf = 0;
    if (handle) raf = requestAnimationFrame(() => setMounted(true));
    return () => {
      cancelAnimationFrame(raf);
      handle?.dispose();
    };
  }, [graph]);

  return (
    <div
      data-testid="gateway-hero-object"
      aria-hidden="true"
      className={cn('gateway-hero-stage aspect-[1/0.62] w-full max-h-[24rem]', mounted && 'is-in')}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-pan-y" />
    </div>
  );
}
