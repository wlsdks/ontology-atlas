'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from 'usehooks-ts';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import Sigma from 'sigma';
import { INDIGO_HIGHLIGHT } from '@/shared/config/indigo-tokens';
import type { VaultDoc, VaultMode } from '@/entities/docs-vault';

interface Props {
  docs: VaultDoc[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /** 필터 — 'all' 이면 전체, 'planner'/'engineer' 이면 해당 모드 또는 'both'. */
  mode: VaultMode | 'all';
  /** 'all' = 전체 vault, 'local' = selectedSlug + N-hop 이웃만. */
  focusMode?: 'all' | 'local';
  /** 'local' 모드 hop 거리. 기본 2. */
  focusHops?: number;
  /** 최근 외부 이벤트가 닿은 문서 slug. */
  activitySlugs?: Set<string>;
}

// 디자인 시스템 준수 — 무채색 + 인디고 + 앰버.
const COLOR_ENGINEER = INDIGO_HIGHLIGHT;
const COLOR_PLANNER = '#d4b478'; // amber (container 톤)
const COLOR_BOTH = 'rgba(180, 190, 210, 0.92)';
const COLOR_DIM = 'rgba(100, 108, 125, 0.22)';
const EDGE_COLOR = 'rgba(139, 151, 255, 0.18)';
const EDGE_DIM = 'rgba(100, 108, 125, 0.06)';
const EDGE_HIGHLIGHT = 'rgba(139, 151, 255, 0.8)';
const GRAPH_INITIAL_ZOOM = 1.12;
const GRAPH_SELECTED_ZOOM = 0.66;

function modeColor(mode: VaultMode): string {
  if (mode === 'planner') return COLOR_PLANNER;
  if (mode === 'engineer') return COLOR_ENGINEER;
  return COLOR_BOTH;
}

/**
 * Vault 전체의 문서 간 링크 그래프를 Sigma WebGL 로 시각화. 옵시디언의
 * "Graph view" 오마주. 노드 클릭 = 해당 문서로 이동.
 *
 * 내부 상태: hoveredNode. nodeReducer 로 focus + 1-hop 이웃을 살려두고
 * 나머지는 dim. 초기 레이아웃은 forceAtlas2 로 한 번만 계산.
 */
export function DocsVaultGraph({
  docs,
  selectedSlug,
  onSelect,
  mode,
  focusMode = 'all',
  focusHops = 2,
  activitySlugs,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const pulsePhaseRef = useRef(0);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // 필터링된 문서 집합 — mode 로 pre-filter. 'all' 은 전체.
  const modeFilteredSlugs = useMemo(() => {
    if (mode === 'all') return new Set(docs.map((d) => d.slug));
    const out = new Set<string>();
    for (const d of docs) {
      if (d.mode === mode || d.mode === 'both') out.add(d.slug);
    }
    return out;
  }, [docs, mode]);

  // focus 모드에서 selectedSlug 로부터 focusHops 이내 reachable 한 slug 집합.
  // directed graph 지만 하이라이트 용도라 undirected BFS — in/out 양쪽 모두.
  const focusReachable = useMemo(() => {
    if (focusMode !== 'local' || !selectedSlug) return null;
    const adj = new Map<string, Set<string>>();
    for (const d of docs) {
      if (!adj.has(d.slug)) adj.set(d.slug, new Set());
      for (const t of d.linksOut) {
        adj.get(d.slug)!.add(t);
        if (!adj.has(t)) adj.set(t, new Set());
        adj.get(t)!.add(d.slug);
      }
    }
    const visited = new Set<string>([selectedSlug]);
    let frontier = [selectedSlug];
    for (let i = 0; i < focusHops; i += 1) {
      const next: string[] = [];
      for (const s of frontier) {
        const neighbors = adj.get(s);
        if (!neighbors) continue;
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            next.push(n);
          }
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return visited;
  }, [docs, focusMode, focusHops, selectedSlug]);

  // 최종 visible 집합 — mode 필터 ∩ focus 필터.
  const filteredSlugs = useMemo(() => {
    if (!focusReachable) return modeFilteredSlugs;
    const out = new Set<string>();
    for (const s of focusReachable) {
      if (modeFilteredSlugs.has(s)) out.add(s);
    }
    return out;
  }, [modeFilteredSlugs, focusReachable]);

  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [neighbors, setNeighbors] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    slug: string;
  } | null>(null);

  // SSR/정적 export 호환 — initializeWithValue:false 로 hydration mismatch 회피.
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
    { initializeWithValue: false },
  );
  useEffect(() => {
    if (!activitySlugs || activitySlugs.size === 0) return;
    if (prefersReducedMotion) return;
    const timer = window.setInterval(() => {
      pulsePhaseRef.current =
        (pulsePhaseRef.current + Math.PI / 10) % (Math.PI * 2);
      sigmaRef.current?.refresh();
    }, 140);
    return () => window.clearInterval(timer);
  }, [activitySlugs, prefersReducedMotion]);

  // slug → doc 빠른 조회 — 툴팁에서 title/mode 꺼낼 때 사용.
  const docsBySlug = useMemo(() => {
    const map = new Map<string, VaultDoc>();
    for (const d of docs) map.set(d.slug, d);
    return map;
  }, [docs]);

  // slug → in/out degree (linksOut 기반 직접 계산, Sigma 가 준비되기 전에도
  // 툴팁에 쓸 수 있게 미리 뽑아둔다)
  const degreeBySlug = useMemo(() => {
    const inDeg = new Map<string, number>();
    const outDeg = new Map<string, number>();
    for (const d of docs) {
      outDeg.set(d.slug, d.linksOut.length);
      for (const t of d.linksOut) {
        inDeg.set(t, (inDeg.get(t) ?? 0) + 1);
      }
    }
    return { inDeg, outDeg };
  }, [docs]);

  // 그래프 인스턴스 빌드 + sigma mount — 초기 1회.
  useEffect(() => {
    if (!containerRef.current) return;
    const graph = new Graph({ multi: false, type: 'directed' });
    graphRef.current = graph;
    // 노드: 모든 docs 를 원형으로 흩뿌린 뒤 forceAtlas2 로 정돈.
    const radius = 120;
    docs.forEach((d, idx) => {
      const angle = (idx / Math.max(1, docs.length)) * Math.PI * 2;
      graph.addNode(d.slug, {
        x: Math.cos(angle) * radius + (Math.random() - 0.5) * 20,
        y: Math.sin(angle) * radius + (Math.random() - 0.5) * 20,
        size: 3,
        label: d.title,
        color: modeColor(d.mode),
        originalColor: modeColor(d.mode),
        mode: d.mode,
      });
    });
    // 엣지
    for (const d of docs) {
      for (const target of d.linksOut) {
        if (!graph.hasNode(target)) continue;
        if (graph.hasEdge(d.slug, target)) continue;
        graph.addEdge(d.slug, target, { color: EDGE_COLOR, size: 1 });
      }
    }
    // 노드 size 는 in-degree 기반으로 조정 — 자주 인용되는 문서가 더 크게.
    graph.forEachNode((node) => {
      const inDeg = graph.inDegree(node);
      const nextSize = 3 + Math.min(6, Math.sqrt(inDeg) * 2);
      graph.setNodeAttribute(node, 'size', nextSize);
      graph.setNodeAttribute(node, 'originalSize', nextSize);
    });
    // 레이아웃 — 100회 iter 로 수렴. 작은 그래프라 저렴.
    forceAtlas2.assign(graph, {
      iterations: 200,
      settings: {
        gravity: 1,
        scalingRatio: 12,
        slowDown: 5,
        barnesHutOptimize: true,
        adjustSizes: true,
      },
    });

    const renderer = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      renderEdgeLabels: false,
      labelFont: 'Inter, system-ui, sans-serif',
      labelSize: 11,
      labelColor: { color: 'rgba(220, 226, 240, 0.9)' },
      labelRenderedSizeThreshold: 6,
      defaultNodeColor: COLOR_BOTH,
      defaultEdgeColor: EDGE_COLOR,
      defaultEdgeType: 'arrow',
      minEdgeThickness: 0.6,
      zIndex: true,
    });
    sigmaRef.current = renderer;
    renderer.getCamera().setState({
      x: 0.5,
      y: 0.5,
      ratio: GRAPH_INITIAL_ZOOM,
      angle: 0,
    });

    renderer.on('enterNode', ({ node, event }) => {
      setHoveredSlug(node);
      const ns = new Set<string>();
      graph.forEachNeighbor(node, (n) => ns.add(n));
      setNeighbors(ns);
      setTooltip({ slug: node, x: event.x, y: event.y });
    });
    renderer.on('leaveNode', () => {
      setHoveredSlug(null);
      setNeighbors(new Set());
      setTooltip(null);
    });
    renderer.on('moveBody', () => {
      setTooltip(null);
    });

    // 드래그 수동 재배치 — mousedown on node 시작, drag 중 카메라 pan 차단,
    // mouseup 에 릴리즈. 단순 드래그(이동 없음)는 clickNode 로 처리되므로
    // dragMoved 플래그로 클릭과 분기.
    let draggedNode: string | null = null;
    let dragMoved = false;
    const captor = renderer.getMouseCaptor();
    renderer.on('downNode', ({ node, event }) => {
      draggedNode = node;
      dragMoved = false;
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grabbing';
      }
      // 카메라 pan 을 막아 드래그 중 화면이 흔들리지 않게.
      event.preventSigmaDefault();
    });
    captor.on('mousemovebody', (event) => {
      if (!draggedNode) return;
      const pos = renderer.viewportToGraph(event);
      graph.setNodeAttribute(draggedNode, 'x', pos.x);
      graph.setNodeAttribute(draggedNode, 'y', pos.y);
      dragMoved = true;
      event.preventSigmaDefault();
      event.original.preventDefault();
      event.original.stopPropagation();
    });
    const endDrag = () => {
      if (!draggedNode) return;
      if (containerRef.current) {
        containerRef.current.style.cursor = '';
      }
      draggedNode = null;
      // drag 종료 뒤 다음 tick 에 dragMoved 플래그 초기화 — 같은 시퀀스의
      // mouseup → clickNode 가 먼저 들어오므로.
      queueMicrotask(() => {
        dragMoved = false;
      });
    };
    captor.on('mouseup', endDrag);

    renderer.on('clickNode', ({ node }) => {
      if (dragMoved) return; // 드래그였으면 클릭 무시
      onSelectRef.current?.(node);
    });

    return () => {
      renderer.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
    // docs 가 바뀌면 전체 재빌드 — mode 는 reducer 로 처리.
  }, [docs]);

  // 필터링·포커스 반영 — nodeReducer/edgeReducer 로 runtime dim.
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph) return;
    renderer.setSetting('nodeReducer', (node, attrs) => {
      if (!filteredSlugs.has(node)) {
        return { ...attrs, color: COLOR_DIM, size: 1.5, label: '' };
      }
      const isHovered = node === hoveredSlug;
      const isNeighbor = neighbors.has(node);
      const isSelected = node === selectedSlug;
      const isActivity = activitySlugs?.has(node) ?? false;
      const pulse =
        isActivity && !hoveredSlug
          ? 1.18 + 0.08 * Math.sin(pulsePhaseRef.current)
          : 1;
      if (hoveredSlug && !isHovered && !isNeighbor) {
        return { ...attrs, color: COLOR_DIM, label: '' };
      }
      if (isHovered) {
        return {
          ...attrs,
          color: attrs.originalColor ?? attrs.color,
          size: (attrs.originalSize ?? attrs.size) * 1.3,
          zIndex: 3,
          forceLabel: true,
        };
      }
      if (isNeighbor) {
        return {
          ...attrs,
          color: attrs.originalColor ?? attrs.color,
          zIndex: 2,
          forceLabel: true,
        };
      }
      if (isSelected) {
        return {
          ...attrs,
          color: COLOR_ENGINEER,
          size: (attrs.originalSize ?? attrs.size) * 1.25 * pulse,
          zIndex: 2,
          forceLabel: true,
        };
      }
      if (isActivity) {
        return {
          ...attrs,
          color: COLOR_ENGINEER,
          size: (attrs.originalSize ?? attrs.size) * pulse,
          zIndex: 2,
          forceLabel: true,
        };
      }
      return { ...attrs };
    });
    renderer.setSetting('edgeReducer', (edge, attrs) => {
      const [src, tgt] = graph.extremities(edge);
      if (!filteredSlugs.has(src) || !filteredSlugs.has(tgt)) {
        return { ...attrs, color: EDGE_DIM };
      }
      if (hoveredSlug) {
        if (src === hoveredSlug || tgt === hoveredSlug) {
          return { ...attrs, color: EDGE_HIGHLIGHT, size: 1.8 };
        }
        return { ...attrs, color: EDGE_DIM };
      }
      // hover 없지만 선택 있을 때 — 선택 노드 연결 엣지 보조 하이라이트
      if (selectedSlug) {
        if (src === selectedSlug || tgt === selectedSlug) {
          return { ...attrs, color: EDGE_HIGHLIGHT, size: 1.4 };
        }
      }
      return { ...attrs };
    });
    renderer.refresh();
  }, [activitySlugs, filteredSlugs, hoveredSlug, neighbors, selectedSlug]);

  // 선택 slug 변경 시 카메라 focus — graph 뷰에서 외부 선택(트리/검색) 을
  // 따라가 해당 노드가 화면 중앙으로 부드럽게 이동. 미선택이거나 노드가
  // 그래프에 없으면 no-op.
  useEffect(() => {
    if (!selectedSlug) return;
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph || !graph.hasNode(selectedSlug)) return;
    const nodePos = renderer.getNodeDisplayData(selectedSlug);
    if (!nodePos) return;
    const camera = renderer.getCamera();
    camera.animate(
      { x: nodePos.x, y: nodePos.y, ratio: GRAPH_SELECTED_ZOOM },
      { duration: 420, easing: 'quadraticOut' },
    );
  }, [selectedSlug]);

  const tooltipDoc = tooltip ? docsBySlug.get(tooltip.slug) : null;
  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        vault graph · {filteredSlugs.size}/{docs.length}
      </div>
      {activitySlugs && activitySlugs.size > 0 ? (
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(94,106,210,0.08)] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(200,210,255,0.9)]">
          activity · {activitySlugs.size}
        </div>
      ) : null}
      {tooltip && tooltipDoc ? (
        <GraphNodeTooltip
          x={tooltip.x}
          y={tooltip.y}
          doc={tooltipDoc}
          inDegree={degreeBySlug.inDeg.get(tooltip.slug) ?? 0}
          outDegree={degreeBySlug.outDeg.get(tooltip.slug) ?? 0}
        />
      ) : null}
    </div>
  );
}

// 노드 hover 시 뜨는 작은 floating 툴팁. SigmaNodeTooltip 과 비슷하게
// viewport 경계 auto-flip 처리. 400x160 기준 우·하단 잘림 회피.
function GraphNodeTooltip({
  x,
  y,
  doc,
  inDegree,
  outDegree,
}: {
  x: number;
  y: number;
  doc: VaultDoc;
  inDegree: number;
  outDegree: number;
}) {
  const W = 260;
  const H = 140;
  const vpW = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vpH = typeof window !== 'undefined' ? window.innerHeight : 900;
  const flipX = x + 14 + W > vpW;
  const flipY = y + 14 + H > vpH;
  const style: React.CSSProperties = {
    left: flipX ? x - W - 14 : x + 14,
    top: flipY ? y - H - 6 : y + 14,
  };
  const modeLabel =
    doc.mode === 'planner'
      ? '기획자'
      : doc.mode === 'engineer'
        ? '개발자'
        : '공용';
  const modeColor =
    doc.mode === 'planner'
      ? 'rgba(224,196,140,0.92)'
      : doc.mode === 'engineer'
        ? 'rgba(139,151,255,0.92)'
        : 'rgba(180,190,210,0.9)';
  return (
    <div
      className="pointer-events-none absolute z-10 w-[260px] overflow-hidden rounded-md border border-[color:rgba(139,151,255,0.25)] bg-[color:rgba(12,14,20,0.98)] px-3 py-2.5 shadow-[0_10px_26px_rgba(0,0,0,0.45)]"
      style={style}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-1.5 w-1.5 flex-none rounded-full"
          style={{ backgroundColor: modeColor }}
          aria-hidden
        />
        <span className="truncate text-[13px] font-medium text-[color:var(--color-text-primary)]">
          {doc.title}
        </span>
      </div>
      <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {doc.slug}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10.5px] text-[color:var(--color-text-tertiary)]">
        <span
          className="rounded-sm border border-[color:var(--color-border-soft)] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em]"
          style={{ color: modeColor }}
        >
          {modeLabel}
        </span>
        <span className="font-mono">in {inDegree}</span>
        <span className="font-mono">out {outDegree}</span>
      </div>
      {doc.description ? (
        <p className="mt-2 line-clamp-2 text-[11px] leading-[1.5] text-[color:var(--color-text-secondary)]">
          {doc.description}
        </p>
      ) : doc.excerpt ? (
        <p className="mt-2 line-clamp-2 text-[11px] leading-[1.5] text-[color:var(--color-text-tertiary)]">
          {doc.excerpt}
        </p>
      ) : null}
    </div>
  );
}
