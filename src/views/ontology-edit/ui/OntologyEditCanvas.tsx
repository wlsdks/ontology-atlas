"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import type { VaultManifest } from "@/entities/docs-vault";
import { useApprovedGraphFlow } from "../lib/use-approved-graph-flow";
import { useVaultGraphFlow } from "../lib/use-vault-graph-flow";
import type { EphemeralNode } from "../lib/use-ephemeral-nodes";
import type { EphemeralEdge } from "../lib/use-ephemeral-edges";
import { ATLAS_NODE_TYPES } from "./AtlasNode";

/**
 * ERD canvas — v1 C-1~C-3 누적, C-5 vault 통합.
 *
 * 디자인 헌장 §11 호환:
 * - scale hover 없음 (xyflow 기본 X)
 * - glow / 보라핑크 / glassmorphism 없음
 * - 색상은 inline CSS variable override 로 인디고 계열만
 * - edge animation 비활성
 *
 * 노드 합산:
 * - vault (local 모드) — manifest 기반 read-only display + 인스펙터에서 rename
 * - approved (cloud 모드 — legacy) — Firestore read-only, drag X
 * - ephemeral (palette 클릭으로 추가) — drag O, save 시 vault 또는 cloud 로
 */
export function OntologyEditCanvas({
  accountId,
  vaultManifest,
  ephemeralNodes,
  ephemeralEdges,
  onSelectionChange,
  onConnect,
  onVaultNodeDragStop,
}: {
  accountId: string | null;
  vaultManifest: VaultManifest | null;
  ephemeralNodes: EphemeralNode[];
  ephemeralEdges: EphemeralEdge[];
  onSelectionChange?: (selectedId: string | null) => void;
  onConnect?: (connection: Connection) => void;
  /** vault 노드 drag-stop 시 호출 — 좌표를 frontmatter.canvasPosition 으로 patch. */
  onVaultNodeDragStop?: (slug: string, position: { x: number; y: number }) => void;
}) {
  // mode 분기: vault.manifest 가 있으면 vault flow 우선 (local 모드 진실원).
  // 둘 다 동시에 띄우지 않는다 — 두 진실원 혼합은 사용자 mental model 깨뜨림.
  const vaultFlow = useVaultGraphFlow(vaultManifest);
  const approvedFlow = useApprovedGraphFlow(vaultManifest ? null : accountId);
  const useVaultMode = vaultManifest !== null;
  const approvedNodes = useVaultMode ? vaultFlow.nodes : approvedFlow.nodes;
  const approvedEdges = useVaultMode ? vaultFlow.edges : approvedFlow.edges;
  const error = useVaultMode ? null : approvedFlow.error;
  const loaded = useVaultMode ? true : approvedFlow.loaded;

  const handleSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      const next = params.nodes[0]?.id ?? null;
      onSelectionChange?.(next);
    },
    [onSelectionChange],
  );

  const allNodes: Node[] = useMemo(() => {
    // C-8 — approved 노드도 atlas custom type 으로 변환 (kind 별 시각 톤)
    const approvedAtlas: Node[] = approvedNodes.map((n) => {
      // n.data.label 형식: "{kindLabel} · {title}". kind 추출 위해 변환.
      const data = n.data as { label?: string };
      const labelParts = data.label?.split(" · ") ?? [];
      const kindLabel = labelParts[0] ?? "";
      const kind = inferKindFromLabel(kindLabel);
      return {
        ...n,
        type: "atlas",
        data: {
          label: data.label ?? "",
          kind,
          ephemeral: false,
        },
      };
    });
    const ephemeralFlow: Node[] = ephemeralNodes.map((n) => ({
      id: n.id,
      type: "atlas",
      position: { x: n.x, y: n.y },
      data: {
        label: `${n.kindLabel} · ${n.title}`,
        kind: n.kind,
        ephemeral: true,
      },
      width: 220,
      height: 64,
      draggable: true,
      // C-6 — ephemeral 노드는 핸들 drag 로 edge 생성 가능
      connectable: true,
      selectable: true,
    }));
    return [...approvedAtlas, ...ephemeralFlow];
  }, [approvedNodes, ephemeralNodes]);

  const allEdges: Edge[] = useMemo(() => {
    const ephemeralFlow: Edge[] = ephemeralEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "default",
      label: "관련 (임시)",
      labelStyle: {
        fontSize: 10,
        fill: "rgba(139, 151, 255, 0.98)",
        fontWeight: 600,
      },
      labelBgStyle: {
        fill: "rgba(14, 16, 22, 0.92)",
        stroke: "rgba(94, 106, 210, 0.66)",
        strokeWidth: 1,
      },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
      style: {
        stroke: "rgba(94, 106, 210, 0.78)",
        strokeWidth: 1.5,
        strokeDasharray: "5 4",
      },
      animated: false,
    }));
    return [...approvedEdges, ...ephemeralFlow];
  }, [approvedEdges, ephemeralEdges]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      onConnect?.(connection);
    },
    [onConnect],
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      // vault 노드만 patch — ephemeral 은 in-memory 가 진실원이라 무관.
      const data = node.data as { vault?: boolean } | undefined;
      if (!data?.vault || !useVaultMode) return;
      onVaultNodeDragStop?.(node.id, {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      });
    },
    [onVaultNodeDragStop, useVaultMode],
  );

  // kind 추출 — '{kindLabel} · {title}' 형식에서 kindLabel → kind enum 매핑.
  function inferKindFromLabel(
    label: string,
  ): "project" | "domain" | "capability" | "element" {
    if (label.startsWith("프로젝트")) return "project";
    if (label.startsWith("도메인")) return "domain";
    if (label.startsWith("역량")) return "capability";
    return "element";
  }

  return (
    <div
      className="relative h-full w-full"
      style={
        {
          "--xy-node-background-color-default": "rgba(14, 16, 22, 0.96)",
          "--xy-node-color-default": "var(--color-text-primary)",
          "--xy-node-border-default": "1px solid var(--color-overlay-3)",
          "--xy-edge-stroke-default": "rgba(94, 106, 210, 0.46)",
          "--xy-handle-background-color-default": "var(--color-indigo-brand)",
          "--xy-handle-border-color-default": "var(--color-overlay-3)",
          "--xy-controls-button-background-color-default":
            "rgba(20, 22, 28, 0.94)",
          "--xy-controls-button-color-default":
            "var(--color-text-secondary)",
          "--xy-background-color-default": "rgba(8, 10, 14, 0.94)",
          "--xy-background-pattern-color-default":
            "var(--color-overlay-2)",
        } as React.CSSProperties
      }
    >
      <ReactFlow
        nodes={allNodes}
        edges={allEdges}
        nodeTypes={ATLAS_NODE_TYPES}
        defaultEdgeOptions={{ animated: false }}
        proOptions={{ hideAttribution: true }}
        nodesConnectable
        onConnect={handleConnect}
        onSelectionChange={handleSelectionChange}
        onNodeDragStop={handleNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>
      {loaded && allNodes.length === 0 && !error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-[color:var(--color-text-tertiary)]">
            왼쪽 palette 에서 종류를 골라 클릭하면 첫 노드가 생겨요.
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-md border border-[color:rgba(229,72,77,0.46)] bg-[color:rgba(229,72,77,0.12)] px-3 py-1.5 text-xs text-[color:var(--color-text-primary)]">
          그래프 로딩 실패: {error.message}
        </div>
      ) : null}
    </div>
  );
}
