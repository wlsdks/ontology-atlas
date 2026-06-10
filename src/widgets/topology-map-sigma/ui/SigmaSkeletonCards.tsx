'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type Graph from 'graphology';
import { ONTOLOGY_KIND_TONE } from '@/entities/ontology-class';
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
  /**
   * 앵커 정렬 — 'left' 는 노드 좌표가 카드의 *왼쪽* 모서리(카드가 오른쪽으로
   * 자람), 'right' 는 오른쪽 모서리. 펼친 자식 열은 부모를 향한 모서리를
   * 플러시 정렬해야 폭이 제각각인 카드들이 지그재그로 보이지 않는다
   * (MindNode 문법). 기본 'center' = 골격 anchor 용.
   */
  anchor?: 'center' | 'left' | 'right';
}

const ANCHOR_TRANSLATE: Record<NonNullable<SkeletonCardModel['anchor']>, string> = {
  center: 'translate(-50%, -50%)',
  left: 'translate(0%, -50%)',
  right: 'translate(-100%, -50%)',
};

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
// 카드 가독성이 1순위 (사용자 피드백: "박스가 너무 좁아서 가독성 별로") —
// 타이포/패딩을 넉넉하게. 위계는 크기 한 단계씩 + 웨이트로.
const TIER_CARD_CLASS: Record<SkeletonCardModel['tier'], string> = {
  0: 'gap-2 rounded-lg px-3.5 py-2 text-[14px] font-semibold text-[color:var(--color-text-primary)]',
  1: 'gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[color:var(--color-text-primary)]',
  2: 'gap-1.5 rounded-md px-2.5 py-1 text-[12px] text-[color:var(--color-text-primary)]',
  // 요소도 primary 잉크 — 클릭으로 "방금 요청한" 콘텐츠가 가장 잘 읽혀야 한다.
  3: 'gap-1.5 rounded-md px-2 py-1 text-[11px] text-[color:var(--color-text-secondary)]',
};

/** 선택 활성 시 ego(선택+1-hop) 밖 카드의 잉크 — 컨텍스트는 남기되 후퇴. */
const DIMMED_OPACITY = '0.25';

const TIER_DOT_PX: Record<SkeletonCardModel['tier'], number> = {
  0: 8,
  1: 7,
  2: 6,
  3: 5,
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
      const anchor =
        ANCHOR_TRANSLATE[(el.dataset.anchor as SkeletonCardModel['anchor']) ?? 'center'] ??
        ANCHOR_TRANSLATE.center;
      el.style.transform = `${anchor} translate3d(${vp.x}px, ${vp.y}px, 0)`;
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

  // 전환 모션 — 레이아웃(펼침/접힘)이 바뀐 직후 짧은 창 동안만 transform
  // 전환을 켠다: 기존 카드가 새 자리로 *미끄러지듯* 이동(좌표는 결정론,
  // 생동감은 전환으로). 창이 닫히면 camera pan/zoom 추적은 즉시(지연 0).
  // 새로 마운트된 카드는 첫 transform 이 초기 스타일이라 fly-in 없음.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.dataset.layoutAnimate = 'true';
    const timer = window.setTimeout(() => {
      delete container.dataset.layoutAnimate;
    }, 380);
    return () => {
      window.clearTimeout(timer);
      delete container.dataset.layoutAnimate;
    };
  }, [cards]);

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
        // 카드 표면 = kind 틴트 (chipBg 12% · chipBorder ~45%) — 좌측 점
        // 하나로는 kind 구분이 약하다는 사용자 피드백. 텍스트는 무채 유지,
        // 선택 신호만 인디고 보더.
        const tone = ONTOLOGY_KIND_TONE[card.kind];
        return (
          <button
            key={card.id}
            type="button"
            data-skeleton-card
            data-slug={nodeId}
            data-anchor={card.anchor ?? 'center'}
            data-selected={selected ? 'true' : 'false'}
            data-dimmed={dimmed ? 'true' : 'false'}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(nodeId);
            }}
            title={card.title}
            style={{
              borderColor: selected ? 'rgba(139, 151, 255, 0.8)' : tone.chipBorder,
            }}
            className={`pointer-events-auto absolute left-0 top-0 inline-flex max-w-[18rem] items-center whitespace-nowrap border bg-[color:var(--color-panel)] opacity-0 shadow-[0_4px_14px_rgba(0,0,0,0.35)] transition-[opacity,border-color] duration-200 ease-out hover:brightness-125 [[data-layout-animate]_&]:transition-[opacity,border-color,transform] [[data-layout-animate]_&]:duration-300 motion-reduce:transition-none ${
              TIER_CARD_CLASS[card.tier]
            }`}
          >
            {/* 틴트 레이어 — 불투명 panel 베이스 위에 kind wash. 반투명 bg
                단독이면 카드 뒤 엣지가 비쳐 보인다. */}
            <span
              aria-hidden="true"
              data-kind-tint
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{ backgroundColor: tone.chipBg }}
            />
            <span
              aria-hidden="true"
              className="relative shrink-0 rounded-full"
              style={{
                width: TIER_DOT_PX[card.tier],
                height: TIER_DOT_PX[card.tier],
                backgroundColor: ontologyFillTone(
                  card.kind === 'project' ? 'project' : card.kind,
                ),
              }}
            />
            <span className="relative truncate">{card.title}</span>
            {card.count !== undefined ? (
              <span className="relative shrink-0 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                {card.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
