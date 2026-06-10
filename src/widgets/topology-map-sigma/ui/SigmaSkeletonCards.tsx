'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type Graph from 'graphology';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from '../lib/graph-build';
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

// 카드 가독성이 1순위 (사용자 피드백: "박스가 너무 좁아서 가독성 별로") —
// 타이포/패딩을 넉넉하게. 위계는 크기 한 단계씩 + 웨이트로.
// 그림자는 tier 0(중앙 anchor)만 — 칩마다 깔린 블러가 "손이 덜 간" 인상의
// 원인이었다 (디자이너 패널).
const TIER_CARD_CLASS: Record<SkeletonCardModel['tier'], string> = {
  0: 'gap-2 rounded-lg px-3.5 py-2 text-[14px] font-semibold text-[color:var(--color-text-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.4)]',
  1: 'gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[color:var(--color-text-primary)]',
  2: 'gap-1.5 rounded-md px-2.5 py-1 text-[12px] text-[color:var(--color-text-primary)]',
  3: 'gap-1.5 rounded-md px-2 py-1 text-[11px] text-[color:var(--color-text-secondary)]',
};

const TIER_DOT_PX: Record<SkeletonCardModel['tier'], number> = {
  0: 8,
  1: 7,
  2: 6,
  3: 5,
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

/** kind 위계 — 커넥터/ego 판정에 사용 (낮을수록 상위). */
const KIND_RANK: Record<SkeletonCardModel['kind'], number> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
  unknown: 4,
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

  // ego = 선택 + *하위 kind* 이웃(펼친 자식 열). 상위 방향(parent) 이웃은
  // dim 규칙을 따른다 — 커넥터도 자식으로만 그린다.
  const kindByCardId = useMemo(
    () => new Map(cards.map((card) => [card.id, card.kind])),
    [cards],
  );
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
    // pass 1 — 카드 배치 + ego(풀 잉크) 카드 rect 수집.
    const containerRect = container.getBoundingClientRect();
    const egoRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const dimEls: HTMLElement[] = [];
    for (const el of els) {
      const slug = el.dataset.slug;
      if (!slug || !graph.hasNode(slug)) continue;
      const attrs = graph.getNodeAttributes(slug);
      const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
      const anchor =
        ANCHOR_TRANSLATE[(el.dataset.anchor as SkeletonCardModel['anchor']) ?? 'center'] ??
        ANCHOR_TRANSLATE.center;
      el.style.transform = `${anchor} translate3d(${vp.x}px, ${vp.y}px, 0)`;
      if (el.dataset.dimmed === 'true') {
        dimEls.push(el);
      } else {
        el.style.opacity = '1';
        el.style.pointerEvents = '';
        const r = el.getBoundingClientRect();
        egoRects.push({
          left: r.left - containerRect.left - COLLISION_PAD,
          top: r.top - containerRect.top - COLLISION_PAD,
          right: r.right - containerRect.left + COLLISION_PAD,
          bottom: r.bottom - containerRect.top + COLLISION_PAD,
        });
      }
    }
    // pass 2 — dim 카드: 펼친 열과 겹치면 0(충돌 금지), 아니면 tier 별 dim.
    for (const el of dimEls) {
      const r = el.getBoundingClientRect();
      const left = r.left - containerRect.left;
      const top = r.top - containerRect.top;
      const right = r.right - containerRect.left;
      const bottom = r.bottom - containerRect.top;
      const collides = egoRects.some(
        (e) => left < e.right && right > e.left && top < e.bottom && bottom > e.top,
      );
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
        const c = childEl.getBoundingClientRect();
        const px = { left: parentRect.left - containerRect.left, right: parentRect.right - containerRect.left, midY: (parentRect.top + parentRect.bottom) / 2 - containerRect.top };
        const cx = { left: c.left - containerRect.left, right: c.right - containerRect.left, midY: (c.top + c.bottom) / 2 - containerRect.top };
        const childOnRight = (cx.left + cx.right) / 2 >= (px.left + px.right) / 2;
        const sx = childOnRight ? px.right + 6 : px.left - 6;
        const ex = childOnRight ? cx.left - 6 : cx.right + 6;
        path.setAttribute('d', connectorPath(sx, px.midY, ex, cx.midY));
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
            fill="none"
            stroke="rgba(94, 106, 210, 0.4)"
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
            data-selected={selected ? 'true' : 'false'}
            data-dimmed={dimmed ? 'true' : 'false'}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(nodeId);
            }}
            title={card.title}
            style={
              {
                zIndex: dimmed ? 0 : 1,
                '--card-border': selected ? 'rgba(139, 151, 255, 0.8)' : tintBorder,
                '--card-border-hover': selected
                  ? 'rgba(139, 151, 255, 0.9)'
                  : tintBorderHover,
              } as React.CSSProperties
            }
            className={`pointer-events-auto absolute left-0 top-0 inline-flex max-w-[18rem] items-center whitespace-nowrap border border-[color:var(--card-border)] bg-[color:var(--color-panel)] opacity-0 transition-[opacity,border-color] duration-200 ease-out hover:border-[color:var(--card-border-hover)] [[data-layout-animate]_&]:transition-[opacity,border-color,transform] [[data-layout-animate]_&]:duration-300 motion-reduce:transition-none ${
              selected
                ? 'outline outline-1 outline-offset-1 outline-[color:rgba(94,106,210,0.35)]'
                : ''
            } ${TIER_CARD_CLASS[card.tier]}`}
          >
            {/* 틴트 레이어 — 불투명 panel 베이스 위에 kind wash. 반투명 bg
                단독이면 카드 뒤 엣지가 비쳐 보인다. */}
            <span
              aria-hidden="true"
              data-kind-tint
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{ backgroundColor: tintBg }}
            />
            <span
              aria-hidden="true"
              className="relative shrink-0 rounded-full"
              style={{
                width: TIER_DOT_PX[card.tier],
                height: TIER_DOT_PX[card.tier],
                backgroundColor: fill,
              }}
            />
            <span className="relative truncate">{card.title}</span>
            {card.count !== undefined ? (
              <span className="relative shrink-0 font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
                {card.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
