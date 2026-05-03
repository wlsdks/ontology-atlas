"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
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
 * autoLayoutToken 변할 때 viewport fitView 를 부드럽게 (duration: 400ms)
 * 애니메이션. ReactFlow 의 자식이라 useReactFlow 가 store 에 접근 가능.
 * 자동정렬 후 viewport 가 새 layout 에 맞춰 부드럽게 fit — Sigma 류
 * 부드러움 (이전엔 즉시 jump).
 */
function FitViewOnAutoLayout({ token }: { token: number }) {
  const reactFlow = useReactFlow();
  const prevTokenRef = useRef(token);
  useEffect(() => {
    if (prevTokenRef.current === token) return;
    prevTokenRef.current = token;
    if (token <= 0) return;
    // 자동 layout 결과가 baseNodes → localNodes 로 propagate 된 후 fit.
    // minZoom 0.6 — 큰 그래프에서도 노드 글자 가독성 보장 (이보다 작아지면
    // 일부 노드가 화면 밖이지만 사용자가 pan 으로 이동 가능).
    // maxZoom 1 — 노드 적을 때 과도 확대 방지.
    const t = setTimeout(() => {
      reactFlow.fitView({ duration: 400, padding: 0.2, minZoom: 0.6, maxZoom: 1 });
    }, 80);
    return () => clearTimeout(t);
  }, [token, reactFlow]);
  return null;
}

/**
 * focusToken 이 증가할 때마다 focusNodeId 노드로 viewport 부드럽게 pan.
 * 검색 (⇧⌘K) 결과 클릭 → 인스펙터에서 노드 보이지만 canvas 위치 모르는
 * 문제 해소. setCenter(x, y, { zoom, duration }).
 */
function FocusNodeOnDemand({
  token,
  nodeId,
}: {
  token: number;
  nodeId: string | null;
}) {
  const reactFlow = useReactFlow();
  const prevTokenRef = useRef(token);
  useEffect(() => {
    if (prevTokenRef.current === token) return;
    prevTokenRef.current = token;
    if (!nodeId) return;
    const node = reactFlow.getNode(nodeId);
    if (!node) return;
    // 노드 중심 = position + width/2, height/2. width/height 누락 시 fallback.
    const w = node.width ?? 200;
    const h = node.height ?? 56;
    reactFlow.setCenter(node.position.x + w / 2, node.position.y + h / 2, {
      zoom: 1.2,
      duration: 400,
    });
  }, [token, nodeId, reactFlow]);
  return null;
}

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
 *   (선택 전). 진실원 우선순위는 항상 vault > dogfood.
 * - ephemeral (palette 클릭으로 추가) — drag O, save 시 vault md 작성.
 */
export function OntologyEditCanvas({
  vaultManifest,
  ephemeralNodes,
  ephemeralEdges,
  onSelectionChange,
  onConnect,
  onVaultConnect,
  onRemoveEphemeralEdge,
  onVaultNodeDragStop,
  autoLayoutToken = 0,
  layoutMode = "dagre",
  focusNodeId = null,
  focusToken = 0,
  selectedId = null,
}: {
  vaultManifest: VaultManifest | null;
  ephemeralNodes: EphemeralNode[];
  ephemeralEdges: EphemeralEdge[];
  onSelectionChange?: (selectedId: string | null) => void;
  onConnect?: (connection: Connection) => void;
  /** vault↔vault edge 생성 시 호출 — source frontmatter array patch. */
  onVaultConnect?: (
    sourceSlug: string,
    targetSlug: string,
    sourceKind: string,
    targetKind: string,
  ) => void;
  /** ephemeral edge 삭제 콜백 — Del/Backspace 로 선택된 edge 제거 시. */
  onRemoveEphemeralEdge?: (edgeId: string) => void;
  /** vault 노드 drag-stop 시 호출 — 좌표를 frontmatter.canvasPosition 으로 patch. */
  onVaultNodeDragStop?: (slug: string, position: { x: number; y: number }) => void;
  /** 외부 (검색 등) 에서 viewport 를 특정 노드로 pan 시키는 트리거.
   *  토큰이 증가할 때마다 focusNodeId 노드로 부드럽게 setCenter. */
  focusNodeId?: string | null;
  focusToken?: number;
  /** 부모 (page) 의 selectedId — ReactFlow 내부 selection 과 sync.
   *  page 가 단축키로 setSelectedId 호출 시 race 회피. */
  selectedId?: string | null;
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
  const t = useTranslations("ontologyPages.edit.canvas");
  const tKinds = useTranslations("kinds");
  const tEdges = useTranslations("ontologyPages.edit.canvas.edgeLabels");
  // 진실원: live vault.manifest 우선, 없으면 빌드타임 dogfood 매니페스트.
  // 빌더 진입자는 vault 폴더 미선택이어도 oh-my-ontology 자체 ontology
  // (18 노드 dogfood) 을 즉시 본다 — "0 마찰 진입" 약속의 캔버스 측 구현.
  const effectiveManifest = vaultManifest ?? staticVaultManifest;
  // kindLabel / edgeLabel resolver 주입 — lib 는 React 가 아니라 직접
  // t() 호출 못 함. 호출자가 i18n-resolved 함수를 위임.
  const kindLabelOf = useCallback(
    (kind: string) => {
      try {
        return tKinds(kind as 'project' | 'domain' | 'capability' | 'element' | 'document' | 'unknown');
      } catch {
        return kind;
      }
    },
    [tKinds],
  );
  const edgeLabelOf = useCallback(
    (key: string) => {
      try {
        return tEdges(key as 'capabilities' | 'elements' | 'dependencies' | 'relates' | 'contains' | 'describes');
      } catch {
        return key;
      }
    },
    [tEdges],
  );
  const vaultFlow = useVaultGraphFlow(effectiveManifest, {
    ignorePersistedPosition: autoLayoutToken > 0,
    layoutMode,
    kindLabelOf,
    edgeLabelOf,
  });
  const vaultNodes = vaultFlow.nodes;
  const vaultEdges = vaultFlow.edges;

  const handleSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      const next = params.nodes[0]?.id ?? null;
      onSelectionChange?.(next);
    },
    [onSelectionChange],
  );

  // 외부 데이터 (vault + ephemeral) 로부터 빌드한 "기준 노드" — 위치는
  // positionOverrides 가 있으면 그걸 우선 적용. 외부 데이터가 변하거나
  // override 가 변할 때만 재계산. selected 는 부모 selectedId 와 sync.
  const baseNodes: Node[] = useMemo(() => {
    // vault 노드도 atlas custom type 으로 변환 (kind 별 시각 톤).
    // \`useVaultGraphFlow\` 가 \`data.kind\` 를 enum 으로 직접 채워주므로
    // 라벨 문자열을 reverse-parse 하지 않는다 (locale 무관 안전).
    const vaultAtlas: Node[] = vaultNodes.map((n) => {
      const data = n.data as { label?: string; kind?: string };
      const kind = (data.kind ?? "element") as "project" | "domain" | "capability" | "element";
      return {
        ...n,
        type: "atlas",
        data: {
          label: data.label ?? "",
          kind,
          ephemeral: false,
          // vault flag — handleNodeDragStop 가 frontmatter patch 여부 판정에 사용.
          vault: true,
        },
        // vault 노드 명시적 draggable. 이전엔 spread 만 의존했는데 일부 케이스에서
        // ReactFlow 가 nodesDraggable + 노드 자체 flag 둘 다 봐야 정상 드래그 활성.
        draggable: true,
        selected: n.id === selectedId,
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
      selected: n.id === selectedId,
    }));
    return [...vaultAtlas, ...ephemeralFlow];
  }, [vaultNodes, ephemeralNodes, selectedId]);

  // ReactFlow 가 controlled 모드에서 드래그를 반영하려면 nodes prop 이
  // 매 frame 갱신돼야 함. 이전 구현은 useMemo 결과만 전달하고 onNodesChange
  // 가 없어 드래그 시도 자체가 ReactFlow 내부에서 polyfill 못 해 노드가
  // 안 움직였다. 이제 local nodes state + applyNodeChanges 패턴으로
  // ReactFlow 의 drag 이벤트를 받아 즉시 위치 업데이트한다.
  const [localNodes, setLocalNodes] = useState<Node[]>(baseNodes);
  // 외부 데이터 (vault/ephemeral) 가 변하면 *구조* (추가/삭제/data 변경)
  // 만 갱신하고, 기존 노드의 위치는 보존 — 사용자가 드래그한 결과가
  // 부모 re-render 로 reset 되는 회귀 방지.
  // 단, autoLayoutToken 이 변했을 땐 사용자 의도 = '재정렬' 이므로 위치
  // preserve 안 하고 baseNodes 그대로 (auto-layout 결과) 적용.
  const prevAutoLayoutTokenRef = useRef(autoLayoutToken);
  useEffect(() => {
    const isAutoLayoutTrigger = prevAutoLayoutTokenRef.current !== autoLayoutToken;
    prevAutoLayoutTokenRef.current = autoLayoutToken;
    setLocalNodes((current) => {
      if (isAutoLayoutTrigger) {
        return baseNodes;
      }
      const currentById = new Map(current.map((n) => [n.id, n]));
      return baseNodes.map((b) => {
        const existing = currentById.get(b.id);
        if (existing) {
          return { ...b, position: existing.position };
        }
        return b;
      });
    });
  }, [baseNodes, autoLayoutToken]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setLocalNodes((current) => applyNodeChanges(changes, current));
  }, []);
  const allNodes = localNodes;

  const allEdges: Edge[] = useMemo(() => {
    // ephemeral edge — amber alpha (warning amber, hub amber 와 구분되는 신호 톤)
    // 로 노드와 동일하게 '저장 안 됨' 시각 신호. vault edge 는 인디고 유지 →
    // vault vs ephemeral 한눈 차별 + 저장 상태 시각 일관성.
    const ephemeralFlow: Edge[] = ephemeralEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "default",
      label: t("ephemeralEdgeLabel"),
      labelStyle: {
        fontSize: 10,
        fill: "rgba(255, 179, 71, 0.95)",
        fontWeight: 600,
      },
      labelBgStyle: {
        fill: "rgba(14, 16, 22, 0.92)",
        stroke: "rgba(255, 179, 71, 0.55)",
        strokeWidth: 1,
      },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
      style: {
        stroke: "rgba(255, 179, 71, 0.66)",
        strokeWidth: 1.5,
        strokeDasharray: "5 4",
      },
      animated: false,
      // ephemeral edge 는 Del/Backspace 로 삭제 가능 (vault 와 차별).
      deletable: true,
    }));
    return [...vaultEdges, ...ephemeralFlow];
  }, [vaultEdges, ephemeralEdges, t]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceNode = allNodes.find((n) => n.id === connection.source);
      const targetNode = allNodes.find((n) => n.id === connection.target);
      const sourceData = sourceNode?.data as
        | { vault?: boolean; kind?: string }
        | undefined;
      const targetData = targetNode?.data as
        | { vault?: boolean; kind?: string }
        | undefined;
      const sourceIsVault = sourceData?.vault === true;
      const targetIsVault = targetData?.vault === true;
      // vault ↔ vault: frontmatter array patch (영구). 인스펙터 array
      // editor 와 같은 진실원 (vault frontmatter) 갱신.
      if (sourceIsVault && targetIsVault && onVaultConnect) {
        onVaultConnect(
          connection.source,
          connection.target,
          sourceData?.kind ?? "element",
          targetData?.kind ?? "element",
        );
        return;
      }
      // 그 외 (ephemeral 포함): in-memory ephemeral edge — 노드 저장 후
      // 인스펙터 array 로 옮기거나 export 해야 보존됨.
      onConnect?.(connection);
    },
    [allNodes, onConnect, onVaultConnect],
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
        nodesDraggable
        // 사용자가 핸들에서 끌어 connection 그릴 때 미리보기 line — 인디고
        // alpha bezier 로 테마 일관 + 곡선이라 부드러움.
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={{
          stroke: "rgba(139, 151, 255, 0.78)",
          strokeWidth: 1.5,
          strokeDasharray: "6 4",
        }}
        onNodesChange={onNodesChange}
        onConnect={handleConnect}
        onSelectionChange={handleSelectionChange}
        onPaneClick={() => onSelectionChange?.(null)}
        onNodeDragStop={handleNodeDragStop}
        onEdgesDelete={(deleted) => {
          // 위 ephemeral edge 의 deletable: true / vault edge 의 deletable: false
          // 가 1차 가드 — xyflow 가 vault edge 는 애초에 delete 시도 안 함.
          // 만일을 대비해 id pattern 으로 한 번 더 필터.
          if (!onRemoveEphemeralEdge) return;
          for (const e of deleted) {
            if (e.id.startsWith("ephemeral-edge-")) {
              onRemoveEphemeralEdge(e.id);
            }
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.6, maxZoom: 1 }}
        // viewport 밖 노드는 render 스킵 — vault 가 50+ 노드로 자라도
        // pan/zoom 부드럽게 유지 (xyflow 권장 perf 옵션).
        onlyRenderVisibleElements
        // 더블클릭 줌 disable — 사용자가 노드 inline rename 등 다른
        // 더블클릭 인터랙션 추가했을 때 viewport 줌과 충돌 회피.
        zoomOnDoubleClick={false}
        // panel 토글 / 자동정렬 등 stateful 변화를 부드럽게 — viewport
        // transition 200ms 이내라 사용자 의도와 충돌 없음.
        minZoom={0.2}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls position="bottom-right" showInteractive={false} />
        <FitViewOnAutoLayout token={autoLayoutToken} />
        <FocusNodeOnDemand token={focusToken} nodeId={focusNodeId} />
        {/* MiniMap — 노드 많아질 때 빠른 navigation. 헌장 §11 호환:
            인디고 alpha + 무채색 alpha mask. ephemeral 은 amber 로 vault
            와 차별. 좌하단 — Controls (우하단) 와 분리. */}
        <MiniMap
          position="bottom-right"
          ariaLabel={t("minimapAriaLabel")}
          pannable
          zoomable
          maskColor="rgba(8, 10, 14, 0.7)"
          style={{
            background: "rgba(14, 16, 22, 0.94)",
            border: "1px solid var(--color-border-soft)",
            width: 160,
            height: 96,
            marginBottom: 56,
          }}
          nodeColor={(node) => {
            const data = node.data as { ephemeral?: boolean } | undefined;
            return data?.ephemeral
              ? "rgba(255, 179, 71, 0.78)"
              : "rgba(139, 151, 255, 0.78)";
          }}
          nodeStrokeWidth={2}
        />
      </ReactFlow>
      {allNodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-[color:var(--color-text-tertiary)]">
            {t("emptyHint")}
          </p>
        </div>
      ) : null}
      {/* hover affordance — 노드 위에 마우스 올렸을 때 subtle 인디고 outline.
          xyflow 기본은 selected 만 표시하고 hover 는 시각 신호 0 → '클릭
          가능' affordance 약함. outline 1px + offset 으로 inner border 와
          중복 안 돼 두께 늘어 보이지 않음. 헌장 §11: scale / glow 없음. */}
      <style jsx global>{`
        .react-flow__node-atlas {
          transition: filter 180ms ease-out;
        }
        .react-flow__node-atlas:hover {
          filter: brightness(1.06);
        }
        .react-flow__edge-path {
          transition: stroke-width 180ms ease-out;
        }
        .react-flow__edge:hover .react-flow__edge-path {
          stroke-width: 2.5px;
        }
      `}</style>
    </div>
  );
}
