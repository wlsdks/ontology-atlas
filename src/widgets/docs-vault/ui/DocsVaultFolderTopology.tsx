'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from 'usehooks-ts';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import Sigma from 'sigma';
import { INDIGO_HIGHLIGHT } from '@/shared/config/indigo-tokens';
import type {
  FolderTopologyBuild,
  FolderTopologyCategory,
} from '@/entities/docs-vault';
import type { Project } from '@/entities/project';

interface Props {
  build: FolderTopologyBuild;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /** 노드 드래그 종료 시 호출. 호출 측은 projects/{slug}.md 의 frontmatter
   *  positionX / positionY 를 저장해 다음 빌드에 복원한다. undefined 면
   *  드래그 자체가 비활성화. */
  onPositionChange?: (slug: string, position: { x: number; y: number }) => void;
  activitySlugs?: Set<string>;
}

const TONE_COLOR: Record<string, string> = {
  indigo: INDIGO_HIGHLIGHT,
  amber: '#d4b478',
  neutral: 'rgba(180, 190, 210, 0.88)',
};
const EDGE_COLOR = 'rgba(139, 151, 255, 0.22)';
const EDGE_DIM = 'rgba(100, 108, 125, 0.08)';
const EDGE_HIGHLIGHT = 'rgba(139, 151, 255, 0.85)';
const DIM_NODE = 'rgba(100, 108, 125, 0.22)';

function toneForCategory(
  cat: string,
  categories: FolderTopologyCategory[],
): string {
  const found = categories.find((c) => c.slug === cat);
  const tone = found?.tone ?? 'neutral';
  return TONE_COLOR[tone] ?? TONE_COLOR.neutral;
}

/**
 * 로컬 볼트의 projects/*.md 를 Sigma WebGL 로 토폴로지 시각화.
 * SigmaTopology 의 모든 워크스페이스 행동을 빼고 최소한의 인터랙션만:
 * hover 1-hop dim + 클릭 = onSelect.
 */
export function DocsVaultFolderTopology({
  build,
  selectedSlug,
  onSelect,
  onPositionChange,
  activitySlugs,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const pulsePhaseRef = useRef(0);
  const onSelectRef = useRef(onSelect);
  const onPositionChangeRef = useRef(onPositionChange);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);

  const [hovered, setHovered] = useState<string | null>(null);
  const [neighbors, setNeighbors] = useState<Set<string>>(new Set());

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

  // 노드/엣지 컬렉션 — build 바뀔 때마다 재구성. categories 색 매핑 prebuild.
  const bySlug = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of build.projects) m.set(p.slug, p);
    return m;
  }, [build.projects]);

  useEffect(() => {
    if (!containerRef.current) return;
    const graph = new Graph({ multi: false, type: 'directed' });
    graphRef.current = graph;
    const radius = 140;
    build.projects.forEach((p, idx) => {
      const angle = (idx / Math.max(1, build.projects.length)) * Math.PI * 2;
      const hasPosition = p.position.x !== 0 || p.position.y !== 0;
      graph.addNode(p.slug, {
        x: hasPosition
          ? p.position.x
          : Math.cos(angle) * radius + (Math.random() - 0.5) * 20,
        y: hasPosition
          ? p.position.y
          : Math.sin(angle) * radius + (Math.random() - 0.5) * 20,
        size: p.isHub ? 8 : 4.5,
        label: p.name,
        color: toneForCategory(p.category, build.categories),
        originalColor: toneForCategory(p.category, build.categories),
        isHub: p.isHub,
      });
    });
    for (const p of build.projects) {
      for (const dep of p.dependencies) {
        if (!graph.hasNode(dep)) continue;
        if (graph.hasEdge(p.slug, dep)) continue;
        graph.addEdge(p.slug, dep, { color: EDGE_COLOR, size: 1 });
      }
    }
    // in-degree 기반 크기 조정
    graph.forEachNode((node) => {
      const inDeg = graph.inDegree(node);
      const base = graph.getNodeAttribute(node, 'isHub') ? 8 : 4.5;
      const next = base + Math.min(5, Math.sqrt(inDeg) * 1.6);
      graph.setNodeAttribute(node, 'size', next);
      graph.setNodeAttribute(node, 'originalSize', next);
    });
    // 위치가 전부 (0,0) 이거나 일부만 있으면 FA2 한번 돌려서 정돈
    const unsetCount = build.projects.filter(
      (p) => p.position.x === 0 && p.position.y === 0,
    ).length;
    if (unsetCount / Math.max(1, build.projects.length) > 0.5) {
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
    }

    const renderer = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      renderEdgeLabels: false,
      labelFont: 'Inter, system-ui, sans-serif',
      labelSize: 12,
      labelColor: { color: 'rgba(220, 226, 240, 0.92)' },
      labelRenderedSizeThreshold: 5,
      defaultEdgeType: 'arrow',
      minEdgeThickness: 0.6,
      zIndex: true,
    });
    sigmaRef.current = renderer;

    renderer.on('enterNode', ({ node }) => {
      setHovered(node);
      const ns = new Set<string>();
      graph.forEachNeighbor(node, (n) => ns.add(n));
      setNeighbors(ns);
    });
    renderer.on('leaveNode', () => {
      setHovered(null);
      setNeighbors(new Set());
    });

    // 드래그 리포지션 — 노드 mousedown → captor move 로 graph x/y 업데이트
    // → mouseup 에서 onPositionChange 로 frontmatter 저장 트리거. clickNode
    // 와 충돌 방지 위해 dragMoved 플래그로 분기.
    let draggedNode: string | null = null;
    let dragMoved = false;
    const captor = renderer.getMouseCaptor();
    renderer.on('downNode', ({ node, event }) => {
      draggedNode = node;
      dragMoved = false;
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grabbing';
      }
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
      if (dragMoved) {
        const x = graph.getNodeAttribute(draggedNode, 'x');
        const y = graph.getNodeAttribute(draggedNode, 'y');
        if (typeof x === 'number' && typeof y === 'number') {
          // snapshot of node slug at release — draggedNode might be cleared.
          const slug = draggedNode;
          onPositionChangeRef.current?.(slug, { x, y });
        }
      }
      draggedNode = null;
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
  }, [build.projects, build.categories]);

  // hover / selection 반영
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph) return;
    renderer.setSetting('nodeReducer', (node, attrs) => {
      const isHovered = node === hovered;
      const isNeighbor = neighbors.has(node);
      const isSelected = node === selectedSlug;
      const isActivity = activitySlugs?.has(node) ?? false;
      const pulse =
        isActivity && !hovered
          ? 1.18 + 0.08 * Math.sin(pulsePhaseRef.current)
          : 1;
      if (hovered && !isHovered && !isNeighbor) {
        return { ...attrs, color: DIM_NODE, label: '' };
      }
      if (isHovered) {
        return {
          ...attrs,
          color: attrs.originalColor ?? attrs.color,
          size: (attrs.originalSize ?? attrs.size) * 1.5,
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
          size: (attrs.originalSize ?? attrs.size) * 1.25 * pulse,
          zIndex: 2,
          forceLabel: true,
        };
      }
      if (isActivity) {
        return {
          ...attrs,
          size: (attrs.originalSize ?? attrs.size) * pulse,
          zIndex: 2,
          forceLabel: true,
        };
      }
      return { ...attrs };
    });
    renderer.setSetting('edgeReducer', (edge, attrs) => {
      const [src, tgt] = graph.extremities(edge);
      if (hovered) {
        if (src === hovered || tgt === hovered) {
          return { ...attrs, color: EDGE_HIGHLIGHT, size: 1.8 };
        }
        return { ...attrs, color: EDGE_DIM };
      }
      if (selectedSlug && (src === selectedSlug || tgt === selectedSlug)) {
        return { ...attrs, color: EDGE_HIGHLIGHT, size: 1.4 };
      }
      return { ...attrs };
    });
    renderer.refresh();
  }, [activitySlugs, hovered, neighbors, selectedSlug]);

  const hoveredProject = hovered ? bySlug.get(hovered) : null;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        folder topology · {build.projects.length} projects
      </div>
      {activitySlugs && activitySlugs.size > 0 ? (
        <div className="pointer-events-none absolute left-3 top-12 rounded-md border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(94,106,210,0.08)] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(200,210,255,0.9)]">
          activity · {activitySlugs.size}
        </div>
      ) : null}
      {build.danglingRefs.length > 0 ? (
        <div className="pointer-events-none absolute right-3 top-3 max-w-[280px] rounded-md border border-[color:rgba(239,180,120,0.35)] bg-[color:rgba(239,180,120,0.06)] px-3 py-2 text-[11px] text-[color:rgba(239,200,150,0.95)]">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em]">
            깨진 의존 · {build.danglingRefs.length}
          </div>
          <ul className="mt-1 space-y-0.5 font-mono text-[10.5px]">
            {build.danglingRefs.slice(0, 3).map((r) => (
              <li key={`${r.from}->${r.to}`}>
                {r.from} → <span className="opacity-75">{r.to}</span>
              </li>
            ))}
            {build.danglingRefs.length > 3 ? (
              <li className="opacity-60">… 외 {build.danglingRefs.length - 3}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {hoveredProject ? (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[320px] rounded-md border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(12,14,20,0.98)] px-3 py-2 shadow-[0_10px_26px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--color-text-primary)]">
            {hoveredProject.name}
          </div>
          <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {hoveredProject.slug} · {hoveredProject.category}
          </div>
          {hoveredProject.description ? (
            <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-[1.5] text-[color:var(--color-text-secondary)]">
              {hoveredProject.description}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
