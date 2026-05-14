"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionLineType,
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
import { EphemeralEdge as EphemeralEdgeComponent } from "./EphemeralEdge";
import { AlignToolbar } from "./AlignToolbar";
import {
  computeAlignedPositions,
  type AlignAction,
  type AlignableNode,
} from "../lib/align-nodes";
import { resolveDomainTint } from "@/shared/lib/domain-color";

const EDGE_TYPES = { ephemeral: EphemeralEdgeComponent };

const staticVaultManifest = staticVaultManifestRaw as VaultManifest;

/**
 * autoLayoutToken / layoutMode 변할 때 viewport fitView 를 부드럽게
 * (duration: 400ms) 애니메이션. ReactFlow 의 자식이라 useReactFlow 가
 * store 에 접근 가능. 자동정렬 후 또는 layout 알고리즘 토글 후 viewport 가
 * 새 layout 에 맞춰 부드럽게 fit — Sigma 류 부드러움.
 */
function FitViewOnAutoLayout({
  token,
  layoutMode,
}: {
  token: number;
  layoutMode: "dagre" | "force";
}) {
  const reactFlow = useReactFlow();
  const prevTokenRef = useRef(token);
  const prevLayoutModeRef = useRef(layoutMode);
  useEffect(() => {
    const tokenChanged = prevTokenRef.current !== token;
    const modeChanged = prevLayoutModeRef.current !== layoutMode;
    prevTokenRef.current = token;
    prevLayoutModeRef.current = layoutMode;
    // token 변화는 0 trigger 무시 (mount 직후), modeChanged 는 항상 trigger.
    if (!modeChanged && (!tokenChanged || token <= 0)) return;
    // 자동 layout 결과가 baseNodes → localNodes 로 propagate 된 후 fit.
    // setTimeout 180ms — useEffect → setLocalNodes → ReactFlow re-render →
    // 새 position propagate 가 완료된 후 fitView 가 정확한 bounding box 계산.
    // minZoom 0.4 — force layout 은 spread 큰 좌표 사용 → 더 작은 zoom 필요.
    // maxZoom 1.2 — 적은 노드일 때 과도 확대 약간 허용.
    const t = setTimeout(() => {
      reactFlow.fitView({ duration: 400, padding: 0.2, minZoom: 0.4, maxZoom: 1.2 });
    }, 180);
    return () => clearTimeout(t);
  }, [token, layoutMode, reactFlow]);
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
  onPersistEphemeralEdge,
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
  /** ephemeral edge "Save" 칩 클릭 시 — endpoint ephemeral 노드 (있으면)
   *  먼저 vault 에 createDoc 으로 저장한 뒤 source frontmatter array 에
   *  target slug 추가. 부모가 orchestrator 보유 (vault writes 책임). */
  onPersistEphemeralEdge?: (edgeId: string) => void;
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
      const data = n.data as { label?: string; kind?: string; description?: string };
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
          description: data.description ?? "",
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
  // 자동정렬 / layoutMode 변경 시 일시적으로 transition 활성 → 노드들이
  // 부드럽게 슬라이드. 드래그 중엔 false 라 즉각 반응 (transition 없음).
  const [isLayoutAnimating, setIsLayoutAnimating] = useState(false);
  // 외부 데이터 (vault/ephemeral) 가 변하면 *구조* (추가/삭제/data 변경)
  // 만 갱신하고, 기존 노드의 위치는 보존 — 사용자가 드래그한 결과가
  // 부모 re-render 로 reset 되는 회귀 방지.
  // 단, autoLayoutToken 이나 layoutMode 가 변했을 땐 사용자 의도 = '재정렬'
  // 이므로 위치 preserve 안 하고 baseNodes 그대로 (auto-layout 결과) 적용.
  const prevAutoLayoutTokenRef = useRef(autoLayoutToken);
  const prevLayoutModeRef = useRef(layoutMode);
  useEffect(() => {
    const isAutoLayoutTrigger = prevAutoLayoutTokenRef.current !== autoLayoutToken;
    const isLayoutModeChange = prevLayoutModeRef.current !== layoutMode;
    prevAutoLayoutTokenRef.current = autoLayoutToken;
    prevLayoutModeRef.current = layoutMode;
    setLocalNodes((current) => {
      if (isAutoLayoutTrigger || isLayoutModeChange) {
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
    // 자동정렬 / layoutMode 변경 시 transition 활성화 — 노드들이 새 위치로
    // 부드럽게 슬라이드. fitView duration (400ms) + transition duration (550ms)
    // 후에도 안정화 시간 여유 둬 750ms 까지 클래스 유지.
    if (isAutoLayoutTrigger || isLayoutModeChange) {
      setIsLayoutAnimating(true);
      const timer = setTimeout(() => setIsLayoutAnimating(false), 750);
      return () => clearTimeout(timer);
    }
  }, [baseNodes, autoLayoutToken, layoutMode]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setLocalNodes((current) => applyNodeChanges(changes, current));
  }, []);
  const allNodes = localNodes;

  const allEdges: Edge[] = useMemo(() => {
    // ephemeral edge — amber alpha (warning amber, hub amber 와 구분되는
    // 신호 톤) 로 노드와 동일하게 '저장 안 됨' 시각 신호. vault edge 는
    // 인디고 유지 → vault vs ephemeral 한눈 차별. 가운데 "Save" 칩이
    // EphemeralEdge 컴포넌트 안에서 onPersist 콜백 호출 — 부모 orchestrator
    // 가 endpoint ephemeral 노드 + edge 를 vault 로 영구화.
    const ephemeralFlow: Edge[] = ephemeralEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "ephemeral",
      data: { onPersist: onPersistEphemeralEdge },
      animated: false,
      // ephemeral edge 는 Del/Backspace 로 삭제 가능 (vault 와 차별).
      deletable: true,
    }));
    return [...vaultEdges, ...ephemeralFlow];
  }, [vaultEdges, ephemeralEdges, onPersistEphemeralEdge]);

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

  // 다중 선택 정렬 — selected 노드 (vault + ephemeral 모두 후보) 의 새 좌표를
  // pure 함수로 계산 후 in-memory state 갱신. vault 노드에 한해 frontmatter
  // canvasPosition 도 patch (drag-stop 과 동일 정신).
  const selectedAlignable: AlignableNode[] = useMemo(() => {
    return allNodes
      .filter((n) => n.selected)
      .map((n) => ({
        id: n.id,
        position: { x: n.position.x, y: n.position.y },
        // n.width / n.height 가 undefined 일 수도 있어 default fallback. vault
        // 노드는 220/60 으로 명시. ephemeral 도 220/64 라 비슷.
        width: typeof n.width === "number" ? n.width : 220,
        height: typeof n.height === "number" ? n.height : 60,
      }));
  }, [allNodes]);

  const handleAlign = useCallback(
    (action: AlignAction) => {
      const updates = computeAlignedPositions(selectedAlignable, action);
      if (updates.size === 0) return;
      // in-memory: setLocalNodes 가 ReactFlow 캔버스에 즉시 반영.
      setLocalNodes((current) =>
        current.map((n) => {
          const next = updates.get(n.id);
          return next ? { ...n, position: next } : n;
        }),
      );
      // vault 노드는 frontmatter.canvasPosition 도 patch — 다음 mount 부터
      // 정렬 결과 유지. dogfood 매니페스트일 땐 skip (disk 권한 없음).
      if (!hasLiveVault) return;
      for (const [id, pos] of updates) {
        const node = allNodes.find((n) => n.id === id);
        const data = node?.data as { vault?: boolean } | undefined;
        if (data?.vault) {
          onVaultNodeDragStop?.(id, {
            x: Math.round(pos.x),
            y: Math.round(pos.y),
          });
        }
      }
    },
    [selectedAlignable, allNodes, onVaultNodeDragStop, hasLiveVault],
  );

  return (
    <div
      className={`relative h-full w-full ${isLayoutAnimating ? "rf-layout-animating" : ""}`}
      style={
        {
          // canvas / node 색을 토큰 기반으로 — light/dark 자동 적응 (이전엔
          // hardcoded dark rgba 라 light theme 에서 dark 섬으로 시각 충돌).
          "--xy-node-background-color-default": "var(--color-panel)",
          "--xy-node-color-default": "var(--color-text-primary)",
          "--xy-node-border-default": "1px solid var(--color-overlay-3)",
          "--xy-edge-stroke-default": "rgba(94, 106, 210, 0.46)",
          "--xy-handle-background-color-default": "var(--color-indigo-brand)",
          "--xy-handle-border-color-default": "var(--color-overlay-3)",
          "--xy-background-color-default": "var(--color-canvas)",
          "--xy-background-pattern-color-default": "var(--color-overlay-2)",
        } as React.CSSProperties
      }
    >
      <AlignToolbar selected={selectedAlignable} onApply={handleAlign} />
      <ReactFlow
        nodes={allNodes}
        edges={allEdges}
        nodeTypes={ATLAS_NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        defaultEdgeOptions={{ animated: false }}
        proOptions={{ hideAttribution: true }}
        nodesConnectable
        nodesDraggable
        // 16px 그리드 snap — drag 시 항상 정수 그리드 정렬. 사용자가
        // 손으로도 깔끔하게 배치할 수 있도록.
        snapToGrid
        snapGrid={[16, 16]}
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
        fitViewOptions={{ padding: 0.2, minZoom: 0.4, maxZoom: 1.2 }}
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
        {/* R+ canvas spacing: gap 24 → 36 (dot 간격 50% ↑). 24 는 NODE_WIDTH
            (220) 안에 9 줄 의 dot 가 깔려 시각 노이즈 강함. 36 은 ~6 줄로
            여유 — 노드와 dot 의 시각 위계가 더 자연 (캔버스 = 빈 종이,
            dot = 약한 그리드 hint). */}
        {/* gap 36 + size 1.2 + 인디고 hint 색 — 너무 강하면 캔버스가 종이 →
            방안지 느낌으로 변해 노드를 가린다. 약하게 깔린 'snap-able' 시각
            힌트가 목표. snapGrid (16px) 의 배수 (gap 32) 와 정확히 일치시키면
            점 밀도 1.5× → 시각 노이즈. 36 이 그래픽적으로 더 자연. */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={36}
          size={1.2}
          color="rgba(139, 151, 255, 0.22)"
        />
        {/* xyflow Controls (zoom +/- / fitView) 는 우하단 MiniMap 과 겹침 +
            기본 스타일이 light theme 이라 dark canvas 와 어색 (Fit View
            아이콘 흰색 등). 사용자 navigation 은 MiniMap (점프) + 자동정렬
            (fit) + 마우스 휠 (zoom) 으로 충분 → 별도 Controls 미노출. */}
        <FitViewOnAutoLayout token={autoLayoutToken} layoutMode={layoutMode} />
        <FocusNodeOnDemand token={focusToken} nodeId={focusNodeId} />
        {/* MiniMap — 노드 많아질 때 빠른 navigation. 헌장 §11 호환:
            인디고 alpha + 무채색 alpha mask. ephemeral 은 amber 로 vault
            와 차별. 좌하단 — Controls (우하단) 와 분리. */}
        <MiniMap
          position="bottom-right"
          ariaLabel={t("minimapAriaLabel")}
          pannable
          zoomable
          maskColor="var(--color-overlay-3)"
          style={{
            background: "var(--color-panel)",
            border: "1px solid var(--color-border-soft)",
            width: 160,
            height: 96,
            marginBottom: 56,
          }}
          nodeColor={(node) => {
            const data = node.data as
              | { ephemeral?: boolean; domainSlug?: string | null }
              | undefined;
            if (data?.ephemeral) return "rgba(255, 179, 71, 0.78)";
            // 도메인 tint 가 미니맵 노드에도 반영되어, 같은 hue 끼리 모여
            // 있는 게 미니맵 한눈 navigation 의 단서가 됨.
            if (typeof data?.domainSlug === "string" && data.domainSlug) {
              return resolveDomainTint(data.domainSlug).accent;
            }
            return "rgba(139, 151, 255, 0.78)";
          }}
          nodeStrokeColor="rgba(14, 16, 22, 0.85)"
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
          animation: rfNodeAppear 220ms ease-out;
        }
        .react-flow__node-atlas:hover {
          filter: brightness(1.06);
        }
        /* Handle (connection point) — n8n 스타일 항상 visible port. 기본 10x10
           + 옅은 인디고 ring 으로 '여기서 끌어서 연결' 항상 인지 가능. 노드/
           핸들 hover 시 단계적 enlarge + 짙은 ring. crosshair 커서가 'drag' 신호. */
        .react-flow__handle {
          width: 10px;
          height: 10px;
          cursor: crosshair;
          box-shadow: 0 0 0 2px rgba(94, 106, 210, 0.14);
          transition: width 160ms ease-out, height 160ms ease-out,
                      box-shadow 160ms ease-out, opacity 160ms ease-out;
        }
        .react-flow__node-atlas:hover .react-flow__handle {
          width: 12px;
          height: 12px;
          box-shadow: 0 0 0 3px rgba(94, 106, 210, 0.24);
        }
        .react-flow__handle.connectingto,
        .react-flow__handle:hover {
          width: 14px;
          height: 14px;
          box-shadow: 0 0 0 4px rgba(94, 106, 210, 0.36);
        }
        .react-flow__edge-path {
          transition: stroke-width 180ms ease-out, filter 180ms ease-out;
        }
        .react-flow__edge {
          animation: rfEdgeAppear 240ms ease-out;
        }
        /* n8n 스타일 hover — 굵기 + soft indigo halo. drop-shadow 가 SVG
           stroke 둘레로 부드러운 후광. relation overlay 도 hover 시엔 강조. */
        .react-flow__edge:hover .react-flow__edge-path {
          stroke-width: 2.6px;
          filter: drop-shadow(0 0 4px rgba(139, 151, 255, 0.55));
        }
        /* 화살표 marker 도 hover 시 같이 또렷하게. */
        .react-flow__edge:hover .react-flow__arrowhead {
          filter: drop-shadow(0 0 3px rgba(139, 151, 255, 0.55));
        }
        /* 새 노드 / edge mount 시 부드러운 fade-in — 역동성 + 사용자가
           '추가됐다' 인지 빠름. id 새로 생긴 노드만 적용 (layout
           transition 과 별도). */
        @keyframes rfNodeAppear {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes rfEdgeAppear {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        /* layout 변경 시 일시적 슬라이드 애니메이션 — 550ms 부드러운
           ease-out-quint 으로 노드가 새 좌표로 흘러감. 드래그 중엔 클래스
           비활성이라 즉각 반응. edge 의 SVG path 도 같이 슬라이드 — opacity
           만이 아니라 d 도 부드럽게 보간되도록 transition 추가. */
        .rf-layout-animating .react-flow__node {
          transition: transform 550ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .rf-layout-animating .react-flow__edge {
          transition: opacity 550ms ease-out;
        }
        .rf-layout-animating .react-flow__edge-path,
        .rf-layout-animating .react-flow__connection-path {
          transition: d 550ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .react-flow__node-atlas,
          .react-flow__edge {
            animation: none;
          }
          .rf-layout-animating .react-flow__node,
          .rf-layout-animating .react-flow__edge {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
