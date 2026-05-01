"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui";

type DisplayKind = "document" | "domain" | "capability" | "element" | "concept" | "other";

interface Props {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  documentNewHref?: string;
  canManageProject?: boolean;
  heading?: string;
  description?: string;
}

interface SceneProps {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  projectName?: string;
  summaryText?: string;
  onOpenDetail?: () => void;
  className?: string;
}

interface DisplayNode {
  id: string;
  title: string;
  kind: DisplayKind;
  rawKind: string;
  summary?: string;
  degree: number;
  radius: number;
}

interface PositionedNode extends DisplayNode {
  x: number;
  y: number;
  driftAmplitudeX: number;
  driftAmplitudeY: number;
  driftPhaseX: number;
  driftPhaseY: number;
  driftSpeedX: number;
  driftSpeedY: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const KIND_LABEL: Record<DisplayKind, string> = {
  document: "문서",
  domain: "도메인",
  capability: "기능",
  element: "요소",
  concept: "개념",
  other: "기타",
};

// 디자인 헌장 §11: "채색은 인디고 하나 + 무채색". kind 별 차별화는 색이
// 아닌 위치 (anchor) + spacing + 채도 단계. document 는 핵심 anchor 라
// 인디고 brand, 그 외 kind 는 인디고 alpha 단계 또는 무채색.
const KIND_STYLE: Record<
  DisplayKind,
  { fill: string; stroke: string; labelClassName: string; anchor: [number, number]; spacing: number }
> = {
  document: {
    fill: "rgba(94,106,210,0.95)",
    stroke: "rgba(129,140,248,0.95)",
    labelClassName: "text-[color:var(--color-indigo-accent)]",
    anchor: [0.5, 0.34],
    spacing: 28,
  },
  domain: {
    fill: "rgba(94,106,210,0.7)",
    stroke: "rgba(129,140,248,0.78)",
    labelClassName: "text-[color:var(--color-indigo-accent)]",
    anchor: [0.25, 0.32],
    spacing: 22,
  },
  capability: {
    fill: "rgba(94,106,210,0.55)",
    stroke: "rgba(129,140,248,0.66)",
    labelClassName: "text-[color:var(--color-indigo-accent)]",
    anchor: [0.74, 0.34],
    spacing: 19,
  },
  element: {
    fill: "rgba(155,166,184,0.7)",
    stroke: "rgba(110,120,140,0.85)",
    labelClassName: "text-[color:var(--color-text-secondary)]",
    anchor: [0.72, 0.72],
    spacing: 17,
  },
  concept: {
    fill: "rgba(94,106,210,0.4)",
    stroke: "rgba(129,140,248,0.55)",
    labelClassName: "text-[color:var(--color-indigo-accent)]",
    anchor: [0.28, 0.72],
    spacing: 18,
  },
  other: {
    fill: "rgba(155,166,184,0.55)",
    stroke: "rgba(110,120,140,0.7)",
    labelClassName: "text-[color:var(--color-text-tertiary)]",
    anchor: [0.5, 0.56],
    spacing: 16,
  },
};

function resolveDisplayKind(kind: string): DisplayKind {
  switch (kind) {
    case "document":
    case "domain":
    case "capability":
    case "element":
    case "concept":
      return kind;
    default:
      return "other";
  }
}

function countByKind(nodes: DisplayNode[]) {
  return nodes.reduce<Record<DisplayKind, number>>(
    (accumulator, node) => {
      accumulator[node.kind] += 1;
      return accumulator;
    },
    {
      document: 0,
      domain: 0,
      capability: 0,
      element: 0,
      concept: 0,
      other: 0,
    },
  );
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildDisplayGraph(nodes: KnowledgeGraphNode[], edges: KnowledgeGraphEdge[]) {
  const filteredNodes = nodes.filter((node) => node.kind !== "project");
  const nodeIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = edges.filter(
    (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to),
  );
  const degreeMap = new Map<string, number>();
  filteredEdges.forEach((edge) => {
    degreeMap.set(edge.from, (degreeMap.get(edge.from) ?? 0) + 1);
    degreeMap.set(edge.to, (degreeMap.get(edge.to) ?? 0) + 1);
  });

  const displayNodes = filteredNodes.map<DisplayNode>((node) => {
    const kind = resolveDisplayKind(node.kind);
    const degree = degreeMap.get(node.id) ?? 0;
    const radiusBase =
      kind === "document"
        ? 6
        : kind === "domain"
          ? 5.4
          : kind === "capability"
            ? 4.8
            : kind === "element"
              ? 4.2
              : 3.8;

    return {
      id: node.id,
      title: node.title,
      kind,
      rawKind: node.kind,
      summary: node.summary,
      degree,
      radius: radiusBase + Math.min(3.5, degree * 0.16),
    };
  });

  return {
    nodes: displayNodes,
    edges: filteredEdges,
    counts: countByKind(displayNodes),
  };
}

function layoutNodes(nodes: DisplayNode[], width: number, height: number) {
  const buckets = new Map<DisplayKind, DisplayNode[]>();
  nodes.forEach((node) => {
    const existing = buckets.get(node.kind) ?? [];
    existing.push(node);
    buckets.set(node.kind, existing);
  });

  const laidOut: PositionedNode[] = [];
  const clampPadding = 22;

  Object.entries(KIND_STYLE).forEach(([kind, config]) => {
    const kindNodes = [...(buckets.get(kind as DisplayKind) ?? [])].sort((left, right) => {
      if (right.degree !== left.degree) return right.degree - left.degree;
      return left.title.localeCompare(right.title, "ko");
    });

    const anchorX = width * config.anchor[0];
    const anchorY = height * config.anchor[1];

    kindNodes.forEach((node, index) => {
      const spiralRadius =
        index === 0 ? 0 : Math.sqrt(index) * config.spacing + (index % 6) * 1.4;
      const angle = GOLDEN_ANGLE * index;
      const x = Math.min(
        width - clampPadding,
        Math.max(clampPadding, anchorX + Math.cos(angle) * spiralRadius),
      );
      const y = Math.min(
        height - clampPadding,
        Math.max(clampPadding, anchorY + Math.sin(angle) * spiralRadius * 0.82),
      );
      const seed = hashString(node.id);
      const driftSeed = (seed % 1000) / 1000;
      const driftAmplitudeBase =
        node.kind === "document"
          ? 1.4
          : node.kind === "domain"
            ? 1.8
            : node.kind === "capability"
              ? 2.1
              : node.kind === "element"
                ? 2.5
                : node.kind === "concept"
                  ? 2.8
                  : 2.2;

      laidOut.push({
        ...node,
        x,
        y,
        driftAmplitudeX: driftAmplitudeBase + driftSeed * 1.2,
        driftAmplitudeY: driftAmplitudeBase * 0.72 + driftSeed * 1,
        driftPhaseX: (seed % 360) * (Math.PI / 180),
        driftPhaseY: ((seed >> 3) % 360) * (Math.PI / 180),
        driftSpeedX: 0.00042 + driftSeed * 0.00022,
        driftSpeedY: 0.00034 + driftSeed * 0.00018,
      });
    });
  });

  return laidOut;
}

function resolveFeaturedLabels(nodes: PositionedNode[]) {
  if (nodes.length <= 64) {
    return nodes;
  }

  const takeByKind = (kind: DisplayKind, limit: number) =>
    nodes
      .filter((node) => node.kind === kind)
      .sort((left, right) => right.degree - left.degree)
      .slice(0, limit);

  const featured = [
    ...takeByKind("document", 6),
    ...takeByKind("domain", 8),
    ...takeByKind("capability", 10),
    ...takeByKind("element", 6),
    ...takeByKind("concept", 8),
  ];

  return featured.filter(
    (node, index, collection) => collection.findIndex((item) => item.id === node.id) === index,
  );
}

function resolveAnimatedPosition(node: PositionedNode, timeMs: number) {
  return {
    x: node.x + Math.sin(node.driftPhaseX + timeMs * node.driftSpeedX) * node.driftAmplitudeX,
    y: node.y + Math.cos(node.driftPhaseY + timeMs * node.driftSpeedY) * node.driftAmplitudeY,
  };
}

function getEdgeStrokeOpacity(left: PositionedNode, right: PositionedNode, hoveredNodeId: string | null) {
  if (hoveredNodeId && left.id !== hoveredNodeId && right.id !== hoveredNodeId) {
    return 0.04;
  }

  if (left.kind === "document" || right.kind === "document") {
    return hoveredNodeId ? 0.46 : 0.18;
  }

  if (left.kind === "domain" || right.kind === "domain") {
    return hoveredNodeId ? 0.34 : 0.12;
  }

  return hoveredNodeId ? 0.24 : 0.08;
}

function drawGraph(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  nodes: PositionedNode[],
  edges: KnowledgeGraphEdge[],
  hoveredNodeId: string | null,
  timeMs = 0,
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  context.fillStyle = "var(--color-overlay-1)";
  context.fillRect(0, 0, width, height);

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const animatedPositions = new Map(
    nodes.map((node) => [node.id, resolveAnimatedPosition(node, timeMs)]),
  );

  edges.forEach((edge) => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) return;
    const fromPosition = animatedPositions.get(edge.from);
    const toPosition = animatedPositions.get(edge.to);
    if (!fromPosition || !toPosition) return;

    context.beginPath();
    context.moveTo(fromPosition.x, fromPosition.y);
    context.lineTo(toPosition.x, toPosition.y);
    const opacity = getEdgeStrokeOpacity(from, to, hoveredNodeId);
    context.strokeStyle = `rgba(94,106,210,${opacity})`;
    // Evidence-weighted 굵기 — 여러 문서에서 증명된 연결일수록 시각적으로
    // 더 "확실한" 연결로 읽히게. log 기반이라 1건 1.3, 3건 1.7, 10건 2.4
    // 대략. hover 시엔 1.5 배 강화.
    const evidenceCount = (edge as { evidenceCount?: number }).evidenceCount ?? 0;
    const weightedBase = 1 + Math.min(1.4, Math.log2(1 + evidenceCount) * 0.5);
    const isHovered =
      hoveredNodeId && (from.id === hoveredNodeId || to.id === hoveredNodeId);
    context.lineWidth = isHovered ? weightedBase * 1.5 : weightedBase;
    context.stroke();
  });

  nodes.forEach((node) => {
    const style = KIND_STYLE[node.kind];
    const isHovered = node.id === hoveredNodeId;
    const position = animatedPositions.get(node.id);
    if (!position) return;

    context.beginPath();
    context.fillStyle = style.fill;
    context.arc(
      position.x,
      position.y,
      isHovered ? node.radius + 2.2 : node.radius,
      0,
      Math.PI * 2,
    );
    context.fill();

    context.beginPath();
    context.strokeStyle = style.stroke;
    context.lineWidth = isHovered ? 2.4 : 1.1;
    context.arc(
      position.x,
      position.y,
      isHovered ? node.radius + 3.4 : node.radius + 0.6,
      0,
      Math.PI * 2,
    );
    context.stroke();
  });
}

export function ProjectKnowledgeTopology({
  nodes,
  edges,
  documentNewHref,
  canManageProject = false,
  heading = "프로젝트 토폴로지",
  description = "등록한 md 문서가 공개 반영되면 문서와 항목이 분해되어 이곳에서 하나의 프로젝트 토폴로지로 이어집니다.",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const { nodes: displayNodes, edges: displayEdges, counts } = useMemo(
    () => buildDisplayGraph(nodes, edges),
    [nodes, edges],
  );
  const positionedNodes = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return [] as PositionedNode[];
    return layoutNodes(displayNodes, size.width, size.height);
  }, [displayNodes, size.height, size.width]);
  const featuredLabels = useMemo(() => resolveFeaturedLabels(positionedNodes), [positionedNodes]);
  const hoveredNode = useMemo(
    () => positionedNodes.find((node) => node.id === hoveredNodeId) ?? null,
    [hoveredNodeId, positionedNodes],
  );
  const visibleLabels = useMemo(() => {
    if (!hoveredNode) return featuredLabels;
    if (featuredLabels.some((node) => node.id === hoveredNode.id)) return featuredLabels;
    return [...featuredLabels, hoveredNode];
  }, [featuredLabels, hoveredNode]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const nextWidth = Math.max(320, Math.floor(element.clientWidth));
      const nextHeight = nextWidth >= 920 ? 560 : nextWidth >= 640 ? 480 : 420;
      setSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    };

    updateSize();
    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;
    let frameId = 0;

    const render = (timeMs: number) => {
      drawGraph(
        canvas,
        size.width,
        size.height,
        positionedNodes,
        displayEdges,
        hoveredNodeId,
        timeMs,
      );
      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [displayEdges, hoveredNodeId, positionedNodes, size.height, size.width]);

  const itemCount =
    counts.domain + counts.capability + counts.element + counts.concept + counts.other;

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;

    let nextHoveredNodeId: string | null = null;
    let nextDistance = Number.POSITIVE_INFINITY;

    positionedNodes.forEach((node) => {
      const animatedPosition = resolveAnimatedPosition(node, performance.now());
      const dx = pointerX - animatedPosition.x;
      const dy = pointerY - animatedPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= node.radius + 8 && distance < nextDistance) {
        nextHoveredNodeId = node.id;
        nextDistance = distance;
      }
    });

    setHoveredNodeId(nextHoveredNodeId);
  };

  const handlePointerLeave = () => {
    setHoveredNodeId(null);
  };

  return (
    <article
      data-testid="project-knowledge-topology"
      // min-w-0 + overflow-hidden으로 grid 부모가 내부 min-content를 강제해
      // 뷰포트 너비를 넘기는 현상(모바일 /project/[slug]/ 상세에서 노출)을 차단.
      className="min-w-0 overflow-hidden rounded-[28px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-6 py-6 md:px-8"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {heading}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex rounded-full border border-[color:var(--color-divider)] px-3 py-1.5 text-xs text-[color:var(--color-text-secondary)]">
            문서 {counts.document}개
          </span>
          <span className="inline-flex rounded-full border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.08)] px-3 py-1.5 text-xs text-[color:var(--color-text-primary)]">
            항목 {itemCount}개
          </span>
          <span className="inline-flex rounded-full border border-[color:var(--color-divider)] px-3 py-1.5 text-xs text-[color:var(--color-text-secondary)]">
            표시 연결 {displayEdges.length}개
          </span>
        </div>
      </div>

      {displayNodes.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[color:var(--color-divider)] px-4 py-5">
          {canManageProject && documentNewHref ? (
            <>
              <p className="text-sm leading-6 text-[color:var(--color-text-primary)]">
                아직 이 프로젝트에 반영된 지식 그래프가 없습니다.
              </p>
              <p className="mt-1 text-sm leading-6 text-[color:var(--color-text-tertiary)]">
                md 문서를 등록하면 자동으로 추출 작업이 큐에 올라가고, 승인·공개
                반영을 마치면 여기에 항목과 연결이 바로 나타납니다.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href={documentNewHref} className="inline-flex">
                  <Button type="button" size="sm">
                    md 문서 등록하러 가기 ↗
                  </Button>
                </Link>
                <p className="text-xs text-[color:var(--color-text-quaternary)]">
                  등록 → 추출 → 승인 → 공개 반영 4단계.
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-[color:var(--color-text-tertiary)]">
                아직 이 프로젝트에 반영된 지식 그래프가 없습니다.
              </p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--color-text-quaternary)]">
                공간 주인이 이 프로젝트에 md 문서를 등록해 공개 반영하면 이곳에
                항목과 연결이 바로 나타납니다.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-hidden rounded-[24px] border border-[color:var(--color-divider)] bg-[radial-gradient(circle_at_top,rgba(94,106,210,0.08),transparent_34%),var(--color-overlay-1)]">
            <div
              ref={containerRef}
              className="relative min-h-[420px] w-full"
            >
              <canvas
                ref={canvasRef}
                data-testid="project-knowledge-topology-viewport"
                className="absolute inset-0 h-full w-full"
                onPointerMove={handlePointerMove}
                onPointerLeave={handlePointerLeave}
              />

              <div className="pointer-events-none absolute inset-0">
                {visibleLabels.map((node) => {
                  const style = KIND_STYLE[node.kind];
                  return (
                    <div
                      key={node.id}
                      className="absolute -translate-x-1/2"
                      style={{
                        left: node.x,
                        top: node.y + node.radius + 8,
                      }}
                    >
                      <span
                        className={cn(
                          "text-[11px] leading-none",
                          style.labelClassName,
                          hoveredNodeId === node.id && "font-[var(--font-weight-signature)]",
                        )}
                      >
                        {node.title}
                      </span>
                    </div>
                  );
                })}

                {hoveredNode ? (
                  <div
                    className="absolute max-w-[260px] -translate-x-1/2 rounded-2xl border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] px-3 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.28)]"
                    style={{
                      left: hoveredNode.x,
                      top: Math.max(12, hoveredNode.y - 76),
                    }}
                  >
                    <p className="text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                      {hoveredNode.title}
                    </p>
                    <p className="mt-1 text-[11px] text-[color:var(--color-text-quaternary)]">
                      {KIND_LABEL[hoveredNode.kind]} · 연결 {hoveredNode.degree}개
                    </p>
                    {hoveredNode.summary ? (
                      <p className="mt-2 text-xs leading-5 text-[color:var(--color-text-secondary)]">
                        {hoveredNode.summary}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {(Object.keys(KIND_LABEL) as DisplayKind[]).map((kind) => {
              const count = counts[kind];
              if (count === 0) return null;
              return (
                <div
                  key={kind}
                  className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3"
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    {KIND_LABEL[kind]}
                  </p>
                  <p className="mt-2 text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {count.toLocaleString("ko-KR")}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </article>
  );
}

export function ProjectKnowledgeTopologyScene({
  nodes,
  edges,
  projectName,
  summaryText,
  onOpenDetail,
  className,
}: SceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const { nodes: displayNodes, edges: displayEdges, counts } = useMemo(
    () => buildDisplayGraph(nodes, edges),
    [nodes, edges],
  );
  const positionedNodes = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return [] as PositionedNode[];
    return layoutNodes(displayNodes, size.width, size.height);
  }, [displayNodes, size.height, size.width]);
  const featuredLabels = useMemo(() => resolveFeaturedLabels(positionedNodes), [positionedNodes]);
  const hoveredNode = useMemo(
    () => positionedNodes.find((node) => node.id === hoveredNodeId) ?? null,
    [hoveredNodeId, positionedNodes],
  );
  const visibleLabels = useMemo(() => {
    if (!hoveredNode) return featuredLabels;
    if (featuredLabels.some((node) => node.id === hoveredNode.id)) return featuredLabels;
    return [...featuredLabels, hoveredNode];
  }, [featuredLabels, hoveredNode]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const nextWidth = Math.max(320, Math.floor(element.clientWidth));
      const nextHeight = Math.max(480, Math.floor(element.clientHeight));
      setSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    };

    updateSize();
    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;
    let frameId = 0;

    const render = (timeMs: number) => {
      drawGraph(
        canvas,
        size.width,
        size.height,
        positionedNodes,
        displayEdges,
        hoveredNodeId,
        timeMs,
      );
      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [displayEdges, hoveredNodeId, positionedNodes, size.height, size.width]);

  const itemCount =
    counts.domain + counts.capability + counts.element + counts.concept + counts.other;

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;

    let nextHoveredNodeId: string | null = null;
    let nextDistance = Number.POSITIVE_INFINITY;

    positionedNodes.forEach((node) => {
      const animatedPosition = resolveAnimatedPosition(node, performance.now());
      const dx = pointerX - animatedPosition.x;
      const dy = pointerY - animatedPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= node.radius + 8 && distance < nextDistance) {
        nextHoveredNodeId = node.id;
        nextDistance = distance;
      }
    });

    setHoveredNodeId(nextHoveredNodeId);
  };

  const handlePointerLeave = () => {
    setHoveredNodeId(null);
  };

  const handleCanvasClick = () => {
    if (hoveredNode?.kind !== "document") return;
    onOpenDetail?.();
  };

  return (
    <section
      data-testid="project-knowledge-topology-scene"
      data-interactive-overlay="true"
      className={cn("absolute inset-0", className)}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <div
        ref={containerRef}
        className="relative h-full w-full"
      >
        <canvas
          ref={canvasRef}
          data-testid="project-knowledge-topology-scene-canvas"
          className="absolute inset-0 h-full w-full"
          style={{
            cursor: hoveredNode?.kind === "document" && onOpenDetail ? "pointer" : "default",
          }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onClick={handleCanvasClick}
        />

        <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[min(560px,calc(100vw-32px))] rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-panel)] px-4 py-3 shadow-[0_14px_34px_rgba(0,0,0,0.3)] md:left-8 md:top-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
            문서 근거 지도
          </p>
          {projectName ? (
            <h2 className="mt-1 line-clamp-1 text-[15px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {projectName}
            </h2>
          ) : null}
          {summaryText ? (
            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
              {summaryText}
            </p>
          ) : null}
        </div>

        {/* CLAUDE.md §11 glassmorphism (backdrop-blur) 금지 룰 준수 —
            solid panel bg 로 교체. α 0.82 → 0.96 으로 본문 위 가독성 유지. */}
        <div className="pointer-events-none absolute left-4 top-[136px] z-10 flex flex-wrap gap-2 md:left-8 md:top-[156px]">
          <span className="inline-flex rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-1.5 text-xs text-[color:var(--color-text-secondary)]">
            문서 {counts.document}개
          </span>
          <span className="inline-flex rounded-full border border-[color:rgba(94,106,210,0.28)] bg-[color:var(--color-panel)] px-3 py-1.5 text-xs text-[color:var(--color-text-primary)]">
            항목 {itemCount}개
          </span>
          <span className="inline-flex rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-1.5 text-xs text-[color:var(--color-text-secondary)]">
            표시 연결 {displayEdges.length}개
          </span>
        </div>

        <div className="pointer-events-none absolute inset-0">
          {visibleLabels.map((node) => {
            const style = KIND_STYLE[node.kind];
            return (
              <div
                key={node.id}
                className="absolute -translate-x-1/2"
                style={{
                  left: node.x,
                  top: node.y + node.radius + 8,
                }}
              >
                <span
                  className={cn(
                    "text-[11px] leading-none",
                    style.labelClassName,
                    hoveredNodeId === node.id && "font-[var(--font-weight-signature)]",
                  )}
                >
                  {node.title}
                </span>
              </div>
            );
          })}

          {hoveredNode ? (
            <div
              className="absolute max-w-[260px] -translate-x-1/2 rounded-2xl border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] px-3 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.28)]"
              style={{
                left: hoveredNode.x,
                top: Math.max(24, hoveredNode.y - 76),
              }}
            >
              <p className="text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {hoveredNode.title}
              </p>
              <p className="mt-1 text-[11px] text-[color:var(--color-text-quaternary)]">
                {KIND_LABEL[hoveredNode.kind]} · 연결 {hoveredNode.degree}개
              </p>
              {hoveredNode.kind === "document" && onOpenDetail ? (
                <p className="mt-1 text-[11px] text-[color:var(--color-indigo-accent)]">
                  클릭하면 상세 문서 근거로 이동합니다.
                </p>
              ) : null}
              {hoveredNode.summary ? (
                <p className="mt-2 text-xs leading-5 text-[color:var(--color-text-secondary)]">
                  {hoveredNode.summary}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
