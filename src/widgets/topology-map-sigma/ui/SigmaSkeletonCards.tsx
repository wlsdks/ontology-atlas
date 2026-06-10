'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type Graph from 'graphology';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from '../lib/graph-build';
import { ontologyFillTone } from '../lib/ontology-tone';

/**
 * 골격 진입의 노드 "상(form)" — Sigma 점 대신 디자인된 DOM 카드.
 *
 * 골격+클릭 확장은 화면 노드를 항상 ~20-60 으로 바운드하므로 DOM 이 감당
 * 가능하다. Sigma 는 엣지 hairline 과 dust 만 캔버스에 그리고, 카드가
 * 타이포·kind data-mark·count·선택 ring 을 토큰 기반으로 책임진다.
 *
 * 좌표 동기화는 afterRender 마다 ref 로 transform 만 직접 갱신 — React
 * 리렌더 없이 60fps pan/zoom 을 따라간다 (SigmaFocusLabel 의 tick-state
 * 패턴은 카드 N개에선 프레임당 리렌더 비용이 커 ref 방식으로 대체).
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
}

/** afterRender 좌표 동기화에 필요한 만큼만 — 테스트에서 stub 가능. */
interface SkeletonCardsCamera {
  graphToViewport(pos: { x: number; y: number }): { x: number; y: number };
  on(type: 'afterRender', handler: () => void): unknown;
  off(type: 'afterRender', handler: () => void): unknown;
}

interface SigmaSkeletonCardsProps {
  sigma: SkeletonCardsCamera | null;
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>;
  cards: readonly SkeletonCardModel[];
  selectedSlug?: string | null;
  onSelect?: (slug: string) => void;
}

/** tier 별 카드 chrome — 위계는 크기·웨이트로, 색은 kind dot 하나로. */
const TIER_CARD_CLASS: Record<SkeletonCardModel['tier'], string> = {
  0: 'gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-[color:var(--color-text-primary)]',
  1: 'gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium text-[color:var(--color-text-primary)]',
  2: 'gap-1.5 rounded-md px-2 py-0.5 text-[11px] text-[color:var(--color-text-secondary)]',
  // 요소도 secondary 잉크 — 클릭으로 "방금 요청한" 콘텐츠가 dim 배경보다
  // 약하게 읽히면 details-on-demand 가 역전된다 (카드 검증 패널 major).
  3: 'gap-1 rounded px-1.5 py-0.5 text-[10px] text-[color:var(--color-text-secondary)]',
};

/** 선택 활성 시 ego(선택+1-hop) 밖 카드의 잉크 — 컨텍스트는 남기되 후퇴. */
const DIMMED_OPACITY = '0.25';

const TIER_DOT_PX: Record<SkeletonCardModel['tier'], number> = {
  0: 7,
  1: 6,
  2: 5,
  3: 4,
};

export function SigmaSkeletonCards({
  sigma,
  graph,
  cards,
  selectedSlug = null,
  onSelect,
}: SigmaSkeletonCardsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  const reposition = useCallback(() => {
    const container = containerRef.current;
    if (!container || !sigma) return;
    const els = container.querySelectorAll<HTMLElement>('[data-skeleton-card]');
    for (const el of els) {
      const slug = el.dataset.slug;
      if (!slug || !graph.hasNode(slug)) continue;
      const attrs = graph.getNodeAttributes(slug);
      const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
      el.style.transform = `translate(-50%, -50%) translate3d(${vp.x}px, ${vp.y}px, 0)`;
      // 첫 배치 후에만 보이게 — 잘못된 (0,0) 플래시 방지 + fade-in 모션.
      // ego 밖 카드는 dim 잉크 (선택 = ego 포커스, 모션은 opacity 만).
      el.style.opacity = el.dataset.dimmed === 'true' ? DIMMED_OPACITY : '1';
    }
  }, [graph, sigma]);

  // ego = 선택 노드 + 1-hop 이웃 — 선택이 있으면 그 밖 카드는 dim.
  const egoSlugs = useMemo(() => {
    if (!selectedSlug || !graph.hasNode(selectedSlug)) return null;
    const set = new Set<string>([selectedSlug]);
    for (const neighbor of graph.neighbors(selectedSlug)) set.add(neighbor);
    return set;
  }, [graph, selectedSlug]);

  // 카드 목록이 바뀌는 렌더마다 paint 전에 배치 (확장으로 새 카드 등장 시).
  useLayoutEffect(() => {
    reposition();
  });

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
      {cards.map((card) => {
        const nodeId = resolveNodeId(card.id);
        if (!nodeId) return null;
        const selected = selectedSlug === nodeId || selectedSlug === card.id;
        const dimmed = egoSlugs !== null && !egoSlugs.has(nodeId);
        return (
          <button
            key={card.id}
            type="button"
            data-skeleton-card
            data-slug={nodeId}
            data-selected={selected ? 'true' : 'false'}
            data-dimmed={dimmed ? 'true' : 'false'}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(nodeId);
            }}
            title={card.title}
            className={`pointer-events-auto absolute left-0 top-0 inline-flex max-w-[15rem] items-center whitespace-nowrap border opacity-0 shadow-[0_4px_14px_rgba(0,0,0,0.35)] transition-[opacity,border-color] duration-200 ${
              TIER_CARD_CLASS[card.tier]
            } ${
              selected
                ? 'border-[color:rgba(139,151,255,0.75)] bg-[color:var(--color-elevated)]'
                : 'border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] hover:border-[color:var(--color-border-strong)]'
            }`}
          >
            <span
              aria-hidden="true"
              className="shrink-0 rounded-full"
              style={{
                width: TIER_DOT_PX[card.tier],
                height: TIER_DOT_PX[card.tier],
                backgroundColor: ontologyFillTone(
                  card.kind === 'project' ? 'project' : card.kind,
                ),
              }}
            />
            <span className="truncate">{card.title}</span>
            {card.count !== undefined ? (
              <span className="shrink-0 font-mono text-[9px] text-[color:var(--color-text-quaternary)]">
                {card.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
