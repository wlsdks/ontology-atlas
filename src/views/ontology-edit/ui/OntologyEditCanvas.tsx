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
import {
  vaultManifest as staticVaultManifestRaw,
  type VaultManifest,
} from "@/entities/docs-vault";
import { useVaultGraphFlow } from "../lib/use-vault-graph-flow";
import type { EphemeralNode } from "../lib/use-ephemeral-nodes";
import type { EphemeralEdge } from "../lib/use-ephemeral-edges";
import { ATLAS_NODE_TYPES } from "./AtlasNode";

const staticVaultManifest = staticVaultManifestRaw as VaultManifest;

/**
 * ERD canvas — vault frontmatter 가 진실원.
 *
 * 디자인 헌장 §11 호환:
 * - scale hover 없음 (xyflow 기본 X)
 * - glow / 보라핑크 / glassmorphism 없음
 * - 색상은 inline CSS variable override 로 인디고 계열만
 * - edge animation 비활성
 *
 * 노드 합산:
 * - vault — live `vault.manifest` (선택됨) 또는 빌드타임 dogfood 매니페스트
 *   (선택 전). PR #33/#34 의 "vault > dogfood" 진실원 우선순위와 일치.
 * - ephemeral (palette 클릭으로 추가) — drag O, save 시 vault md 작성
 *   (cloud 모드는 dataSourceMode 분기로 별도 처리)
 */
export function OntologyEditCanvas({
  vaultManifest,
  ephemeralNodes,
  ephemeralEdges,
  onSelectionChange,
  onConnect,
  onVaultNodeDragStop,
  autoLayoutToken = 0,
  layoutMode = "dagre",
}: {
  vaultManifest: VaultManifest | null;
  ephemeralNodes: EphemeralNode[];
  ephemeralEdges: EphemeralEdge[];
  onSelectionChange?: (selectedId: string | null) => void;
  onConnect?: (connection: Connection) => void;
  /** vault 노드 drag-stop 시 호출 — 좌표를 frontmatter.canvasPosition 으로 patch. */
  onVaultNodeDragStop?: (slug: string, position: { x: number; y: number }) => void;
  /**
   * 헤더의 "자동 정렬" 버튼이 눌릴 때마다 increment 되는 token.
   * 0 보다 크면 \`frontmatter.canvasPosition\` 무시하고 자동 layout 결과로 reset.
   * frontmatter 자체는 안 건드리는 in-memory only 동작.
   */
  autoLayoutToken?: number;
  /**
   * 자동 레이아웃 알고리즘 — \`dagre\` (default, kind 계층 LR) 또는
   * \`force\` (FA2 organic 분포). 헤더 토글로 사용자가 선택.
   */
  layoutMode?: "dagre" | "force";
}) {
  // 진실원: live vault.manifest 우선, 없으면 빌드타임 dogfood 매니페스트.
  // 빌더에 진입한 사용자는 vault 폴더 안 골랐어도 oh-my-ontology 자체 ontology
  // 23 노드를 즉시 본다 — "0 마찰 진입" 약속의 캔버스 측 구현.
  const effectiveManifest = vaultManifest ?? staticVaultManifest;
  const vaultFlow = useVaultGraphFlow(effectiveManifest, {
    ignorePersistedPosition: autoLayoutToken > 0,
    layoutMode,
  });
  const approvedNodes = vaultFlow.nodes;
  const approvedEdges = vaultFlow.edges;

  const handleSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      const next = params.nodes[0]?.id ?? null;
      onSelectionChange?.(next);
    },
    [onSelectionChange],
  );

  const allNodes: Node[] = useMemo(() => {
    // approved 노드도 atlas custom type 으로 변환 (kind 별 시각 톤)
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
      // ephemeral 노드는 핸들 drag 로 edge 생성 가능
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

  const hasLiveVault = vaultManifest !== null;
  const handleNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      // vault 노드만 patch — ephemeral 은 in-memory 가 진실원이라 무관.
      // 빌드타임 dogfood 매니페스트로 보고 있을 땐 사용자가 disk 권한 없으니 skip.
      const data = node.data as { vault?: boolean } | undefined;
      if (!data?.vault || !hasLiveVault) return;
      onVaultNodeDragStop?.(node.id, {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      });
    },
    [onVaultNodeDragStop, hasLiveVault],
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
      {allNodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-[color:var(--color-text-tertiary)]">
            왼쪽 palette 에서 종류를 골라 클릭하면 첫 노드가 생겨요.
          </p>
        </div>
      ) : null}
    </div>
  );
}
