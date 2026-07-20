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
  Position,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import {
  vaultManifest as staticVaultManifestRaw,
  type VaultManifest,
} from "@/entities/docs-vault";
import { useRelationVocabulary } from "@/entities/knowledge-graph";
import { buildFocusedBuilderManifest } from "../lib/build-focused-builder-manifest";
import { resolveBuilderEdgeEndpointHandles } from "../lib/builder-edge-handles";
import { useVaultGraphFlow } from "../lib/use-vault-graph-flow";
import type { EphemeralNode } from "../lib/use-ephemeral-nodes";
import type { EphemeralEdge } from "../lib/use-ephemeral-edges";
import { ATLAS_NODE_TYPES } from "./AtlasNode";
import { EphemeralEdge as EphemeralEdgeComponent } from "./EphemeralEdge";
import { VaultEdge } from "./VaultEdge";
import { AlignToolbar } from "./AlignToolbar";
import {
  computeAlignedPositions,
  type AlignAction,
  type AlignableNode,
} from "../lib/align-nodes";
import { resolveDomainTint } from "@/shared/lib/domain-color";

const EDGE_TYPES = { ephemeral: EphemeralEdgeComponent, vault: VaultEdge };

/**
 * 캔버스 우하단 trace 범례의 한 획 — `use-vault-graph-flow.ts` 의
 * `edgeStrokeStyleByKey` 와 같은 두 톤(contains=중립, 그 외=인디고 잉크)을
 * dash 값만 바꿔 재사용. `dash=""` 면 실선(contains).
 */
function TraceLegendMark({ dash }: { dash: string }) {
  return (
    <svg width={16} height={6} viewBox="0 0 16 6" aria-hidden="true" className="shrink-0">
      <line
        x1={1}
        y1={3}
        x2={15}
        y2={3}
        stroke={dash ? "var(--topology-v2-indigo-bright)" : "var(--topology-v2-edge-contains-mark)"}
        strokeWidth={1.4}
        strokeDasharray={dash || undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

const staticVaultManifest = staticVaultManifestRaw as VaultManifest;
const BUILDER_OVERVIEW_MIN_ZOOM = 0.05;
const BUILDER_OVERVIEW_MAX_ZOOM = 1.2;

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
    // minZoom 0.05 — persisted canvasPosition + 50개 이상 vault nodes 는
    // bounding box 가 커질 수 있다. 0.4 로 clamp 하면 중앙 빈 영역만 보이는
    // desktop blank-canvas 회귀가 난다.
    // maxZoom 1.2 — 적은 노드일 때 과도 확대 약간 허용.
    const t = setTimeout(() => {
      reactFlow.fitView({
        duration: 400,
        padding: 0.2,
        minZoom: BUILDER_OVERVIEW_MIN_ZOOM,
        maxZoom: BUILDER_OVERVIEW_MAX_ZOOM,
      });
    }, 180);
    return () => clearTimeout(t);
  }, [token, layoutMode, reactFlow]);
  return null;
}

/**
 * Local vault restore can populate the builder graph after ReactFlow has
 * already mounted. The built-in `fitView` prop only covers the initial mount,
 * so the desktop app could show an apparently blank canvas until the user hit
 * the toolbar fit action. Fit once per graph source signature so static demo →
 * local vault transitions also get a fresh viewport.
 */
function FitViewOnGraphReady({
  graphKey,
  nodeCount,
  anchorNodeId,
}: {
  graphKey: string;
  nodeCount: number;
  anchorNodeId: string | null;
}) {
  const reactFlow = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const fittedGraphKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      nodeCount === 0 ||
      !nodesInitialized ||
      fittedGraphKeyRef.current === graphKey
    ) {
      return;
    }
    fittedGraphKeyRef.current = graphKey;
    const timers = [80, 420, 900, 1600].map((delay) =>
      setTimeout(() => {
        const measuredNodes = reactFlow.getNodes();
        const nodes =
          nodeCount <= 20 && measuredNodes.length > 0
            ? measuredNodes.map((node) => ({ id: node.id }))
            : undefined;
        reactFlow.fitView({
          nodes,
          duration: 320,
          padding: 0.22,
          minZoom: BUILDER_OVERVIEW_MIN_ZOOM,
          maxZoom: BUILDER_OVERVIEW_MAX_ZOOM,
        });
      }, delay),
    );
    if (nodeCount > 20 && anchorNodeId) {
      for (const delay of [720, 1400, 2400]) {
        timers.push(setTimeout(() => {
          // A full-vault overview can make 50+ node cards unreadably small.
          // After establishing the full graph bounds, fit the viewport to a
          // concrete card by id. `fitView({ nodes })` is more reliable than
          // setCenter while xyflow is still measuring node dimensions in the
          // Tauri WebView, and prevents the builder from opening as a tiny
          // unreadable whole-graph thumbnail.
          reactFlow.fitView({
            nodes: [{ id: anchorNodeId }],
            padding: 1.1,
            minZoom: 0.72,
            maxZoom: 0.92,
            duration: 420,
          });
          const anchorNode = reactFlow.getNode(anchorNodeId);
          if (anchorNode) {
            const width = anchorNode.width ?? 220;
            const height = anchorNode.height ?? 64;
            reactFlow.setCenter(
              anchorNode.position.x + width / 2,
              anchorNode.position.y + height / 2,
              {
                zoom: 0.82,
                duration: 420,
              },
            );
          }
        }, delay));
      }
    }
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [anchorNodeId, graphKey, nodeCount, nodesInitialized, reactFlow]);

  return null;
}

/**
 * 캔버스 줌 % 인디케이터 — 좌하단, 헤더의 census 숫자와 같은 각인 모노
 * 스타일(`--engraved-numeral-*`) 재사용. `useViewport` 는 ReactFlow 내부
 * store 구독이라 pan/zoom 마다 재계산되지만 텍스트 노드 하나뿐이라 가볍다.
 * MiniMap · trace 범례(우하단) 와 안 겹치도록 반대편(좌하단)에 둔다.
 */
function ZoomLevelIndicator() {
  const { zoom } = useViewport();
  const percent = Math.round(zoom * 100);
  return (
    <div
      data-token="engraved-numeral"
      className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2 py-1 font-mono text-[10.5px] tabular-nums tracking-[0.04em] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
    >
      {percent}%
    </div>
  );
}

function buildGraphKey(args: {
  hasLiveVault: boolean;
  nodeCount: number;
  edgeCount: number;
  firstNodeId: string | null;
}) {
  return [
    args.hasLiveVault ? "live" : "static",
    args.nodeCount,
    args.edgeCount,
    args.firstNodeId ?? "empty",
  ].join(":");
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
 * ERD canvas — vault frontmatter 가 진실원. builder-core (feat/builder-core)
 * 재작성: 캔버스 안은 지형도 v2 언어(kind 글리프 · trace 엣지 · 블루프린트
 * 그리드), 캔버스 밖(팔레트/인스펙터/헤더)은 크롬 시스템 — 계약은
 * `docs/prototypes/builder-v2-02-draft.html` / `builder-v2-03-selected.html`.
 *
 * `.claude/rules/design.md` 호환:
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
  onNodeOpen,
  onConnect,
  onVaultConnect,
  onConnectToEmpty,
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
  onNodeOpen?: (selectedId: string) => void;
  onConnect?: (connection: Connection) => void;
  /** vault↔vault edge 생성 시 호출 — source frontmatter array patch. */
  onVaultConnect?: (
    sourceSlug: string,
    targetSlug: string,
    sourceKind: string,
    targetKind: string,
  ) => void;
  /**
   * "drop to add" — 한 노드의 포트에서 선을 끌어 빈 캔버스에 놓았을 때 호출.
   * 드롭 지점(flow 좌표)에 새 개념 초안을 만들고 source 와 잇도록 부모에 위임.
   * fromKind 로 자식 kind 를 추론(project→domain…)한다.
   */
  onConnectToEmpty?: (
    fromNodeId: string,
    fromKind: string,
    position: { x: number; y: number },
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
  const relationVocabulary = useRelationVocabulary();
  // 진실원: live vault.manifest 우선, 없으면 빌드타임 dogfood 매니페스트.
  // 빌더 진입자는 vault 폴더 미선택이어도 ontology-atlas 자체 ontology
  // (18 노드 dogfood) 을 즉시 본다 — "0 마찰 진입" 약속의 캔버스 측 구현.
  const effectiveManifest = vaultManifest ?? staticVaultManifest;
  const focusedBuilderManifest = useMemo(
    () =>
      buildFocusedBuilderManifest(
        effectiveManifest,
        focusNodeId ?? selectedId,
      ),
    [effectiveManifest, focusNodeId, selectedId],
  );
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
        return tEdges(key as 'domains' | 'capabilities' | 'elements' | 'dependencies' | 'relates' | 'contains' | 'describes');
      } catch {
        return key;
      }
    },
    [tEdges],
  );
  const vaultFlow = useVaultGraphFlow(focusedBuilderManifest.manifest, {
    ignorePersistedPosition: autoLayoutToken > 0 || focusedBuilderManifest.isFocused,
    layoutMode,
    kindLabelOf,
    edgeLabelOf,
  });
  const vaultNodes = vaultFlow.nodes;
  const vaultEdges = vaultFlow.edges;
  const hasLiveVault = vaultManifest !== null;
  const graphKey = buildGraphKey({
    hasLiveVault,
    nodeCount: vaultNodes.length,
    edgeCount: vaultEdges.length,
    firstNodeId: vaultNodes[0]?.id ?? null,
  });

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
        // AtlasNode 가 kind 를 글리프 + mono 줄로 직접 그리므로 label 은
        // 제목만 — n.kindLabel 은 더 이상 문자열 조립에 안 쓴다.
        label: n.title,
        kind: n.kind,
        ephemeral: true,
      },
      width: 196,
      height: 56,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
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
  // static dogfood → local vault 전환처럼 graph source 자체가 바뀐 경우도
  // 기존 좌표를 붙잡지 않고 새 graph layout / persisted canvasPosition 으로 reset.
  const prevAutoLayoutTokenRef = useRef(autoLayoutToken);
  const prevLayoutModeRef = useRef(layoutMode);
  const prevGraphKeyRef = useRef(graphKey);
  useEffect(() => {
    const isAutoLayoutTrigger = prevAutoLayoutTokenRef.current !== autoLayoutToken;
    const isLayoutModeChange = prevLayoutModeRef.current !== layoutMode;
    const isGraphKeyChange = prevGraphKeyRef.current !== graphKey;
    prevAutoLayoutTokenRef.current = autoLayoutToken;
    prevLayoutModeRef.current = layoutMode;
    prevGraphKeyRef.current = graphKey;
    setLocalNodes((current) => {
      if (isAutoLayoutTrigger || isLayoutModeChange || isGraphKeyChange) {
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
    if (isAutoLayoutTrigger || isLayoutModeChange || isGraphKeyChange) {
      setIsLayoutAnimating(true);
      const timer = setTimeout(() => setIsLayoutAnimating(false), 750);
      return () => clearTimeout(timer);
    }
  }, [baseNodes, autoLayoutToken, layoutMode, graphKey]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setLocalNodes((current) => applyNodeChanges(changes, current));
  }, []);
  const allNodes = localNodes;
  const graphAnchorNodeId = useMemo(() => {
    const project = allNodes.find((node) => {
      const data = node.data as { kind?: string } | undefined;
      return data?.kind === "project";
    });
    return project?.id ?? allNodes[0]?.id ?? null;
  }, [allNodes]);
  const [miniMapReady, setMiniMapReady] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);

  useEffect(() => {
    if (allNodes.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      setMiniMapReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [allNodes.length]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const sync = () => setShowMiniMap(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const allEdges: Edge[] = useMemo(() => {
    const nodeById = new Map(allNodes.map((node) => [node.id, node]));
    // ephemeral edge — amber alpha (warning amber, hub amber 와 구분되는
    // 신호 톤) 로 노드와 동일하게 '저장 안 됨' 시각 신호. vault edge 는
    // 인디고 유지 → vault vs ephemeral 한눈 차별. 가운데 "Save" 칩이
    // EphemeralEdge 컴포넌트 안에서 onPersist 콜백 호출 — 부모 orchestrator
    // 가 endpoint ephemeral 노드 + edge 를 vault 로 영구화.
    const ephemeralFlow: Edge[] = ephemeralEdges.map((e) => {
      const sourceNode = nodeById.get(e.source);
      const targetNode = nodeById.get(e.target);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "ephemeral",
        ...(sourceNode && targetNode
          ? resolveBuilderEdgeEndpointHandles(sourceNode, targetNode)
          : {}),
        data: { onPersist: onPersistEphemeralEdge },
        animated: false,
        // ephemeral edge 는 Del/Backspace 로 삭제 가능 (vault 와 차별).
        deletable: true,
      };
    });
    return [...vaultEdges, ...ephemeralFlow];
  }, [allNodes, vaultEdges, ephemeralEdges, onPersistEphemeralEdge]);

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

  // 자기 자신으로의 연결(self-loop)만 즉시 거부 — 포트 위에서 red 신호로
  // 표시된다(styled-jsx 의 `.connectingto:not(.valid)`). 그 외 노드쌍은 유효로
  // 두어 자석 스냅(`.connectingto.valid` 인디고 점등)이 걸리게 한다.
  const isValidConnection = useCallback(
    (edgeOrConnection: Edge | Connection) => {
      return edgeOrConnection.source !== edgeOrConnection.target;
    },
    [],
  );

  // "drop to add" — 포트에서 끌어 빈 캔버스(핸들 밖)에 놓으면 그 자리에 새
  // 개념 초안을 만든다. 노드에 정상 연결되면 toNode 가 채워져 있고 onConnect
  // 가 이미 처리하므로 여기선 무시. connectionState.to 는 flow 좌표라 별도
  // 변환 없이 그대로 드롭 지점으로 쓴다.
  const handleConnectEnd = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      connectionState: FinalConnectionState,
    ) => {
      if (!onConnectToEmpty) return;
      if (connectionState.toNode) return; // 노드에 연결됨 → handleConnect 담당
      const fromNode = connectionState.fromNode;
      const to = connectionState.to;
      if (!fromNode || !to) return;
      const fromKind =
        (fromNode.data as { kind?: string } | undefined)?.kind ?? "capability";
      onConnectToEmpty(fromNode.id, fromKind, { x: to.x, y: to.y });
    },
    [onConnectToEmpty],
  );

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
          "--xy-edge-stroke-default": "var(--color-indigo-a46)",
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
          stroke: "var(--topology-v2-indigo-bright)",
          strokeWidth: 1.5,
          strokeDasharray: "6 4",
        }}
        onNodesChange={onNodesChange}
        onConnect={handleConnect}
        onConnectEnd={handleConnectEnd}
        isValidConnection={isValidConnection}
        // 자석 스냅 반경 — 기본(20)보다 넉넉히 키워 포트를 정확히 못 맞춰도
        // 근처에서 흡착. n8n 급 "끌어다 대면 붙는" 감각. 너무 크면 옆 노드로
        // 튀므로 카드 폭(220)의 1/6 남짓으로 절제.
        connectionRadius={38}
        onSelectionChange={handleSelectionChange}
        onPaneClick={() => onSelectionChange?.(null)}
        onNodeClick={(_, node) => onNodeOpen?.(node.id)}
        // 단일 클릭과 동일한 의도 — ReactFlow 는 더블클릭을 별도로 처리하지
        // 않으므로 명시적으로 같은 핸들러를 연결해 "더블클릭도 상세를 연다"는
        // 계약을 코드로 보장한다 (persona QA: 더블클릭 무반응 신고 방어).
        onNodeDoubleClick={(_, node) => onNodeOpen?.(node.id)}
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
        fitViewOptions={{
          padding: 0.2,
          minZoom: BUILDER_OVERVIEW_MIN_ZOOM,
          maxZoom: BUILDER_OVERVIEW_MAX_ZOOM,
        }}
        // Tauri WebView + large fitView 에서 visible-element 계산이 어긋나면
        // accessibility tree 에는 노드가 잡히는데 화면은 빈 canvas 처럼 보일 수
        // 있다. 이 빌더의 dogfood vault 는 50여 노드 규모라 전체 렌더링이 더
        // 신뢰성 높다.
        // 더블클릭 줌 disable — 사용자가 노드 inline rename 등 다른
        // 더블클릭 인터랙션 추가했을 때 viewport 줌과 충돌 회피.
        zoomOnDoubleClick={false}
        // panel 토글 / 자동정렬 등 stateful 변화를 부드럽게 — viewport
        // transition 200ms 이내라 사용자 의도와 충돌 없음.
        minZoom={BUILDER_OVERVIEW_MIN_ZOOM}
        maxZoom={2}
      >
        {/* builder-core (docs/prototypes/builder-v2-0{2,3}.html §4): 캔버스 안 =
            지형도 v2 언어 — 도트 그리드 대신 24px 블루프린트 라인 그리드,
            토폴로지 맵의 --topology-v2-grid-* 토큰 재사용(새 색 발명 없음).
            snapGrid (16px) 과 다른 배수라 점 대신 선이라도 리듬이 겹치지 않는다. */}
        <Background
          variant={BackgroundVariant.Lines}
          gap={24}
          lineWidth={1}
          color="var(--topology-v2-grid-minor)"
        />
        {/* xyflow Controls (zoom +/- / fitView) 는 우하단 MiniMap 과 겹침 +
            기본 스타일이 light theme 이라 dark canvas 와 어색 (Fit View
            아이콘 흰색 등). 사용자 navigation 은 MiniMap (점프) + 자동정렬
            (fit) + 마우스 휠 (zoom) 으로 충분 → 별도 Controls 미노출. */}
        <FitViewOnAutoLayout token={autoLayoutToken} layoutMode={layoutMode} />
        <FitViewOnGraphReady
          graphKey={graphKey}
          nodeCount={allNodes.length}
          anchorNodeId={graphAnchorNodeId}
        />
        <FocusNodeOnDemand token={focusToken} nodeId={focusNodeId} />
        <ZoomLevelIndicator />
        {/* MiniMap — 노드 많아질 때 빠른 navigation. 헌장 §11 호환:
            인디고 alpha + 무채색 alpha mask. ephemeral 은 vault 와 같은
            인디고 계열이되 더 밝은 톤으로 차별(builder-core, amber 폐지).
            우하단 — 아래 trace 범례와 같은 코너, marginBottom 으로 겹침 회피. */}
        {showMiniMap && allNodes.length > 0 && miniMapReady ? (
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
              // builder-core: ephemeral 신호가 amber → indigo 로 통일됐다
              // (AtlasNode/EphemeralEdge 와 같은 톤).
              if (data?.ephemeral) return "var(--topology-v2-indigo-bright)";
              // 도메인 tint 가 미니맵 노드에도 반영되어, 같은 hue 끼리 모여
              // 있는 게 미니맵 한눈 navigation 의 단서가 됨.
              if (typeof data?.domainSlug === "string" && data.domainSlug) {
                return resolveDomainTint(data.domainSlug).accent;
              }
              return "var(--color-indigo-brand)";
            }}
            nodeStrokeColor="var(--color-surface-deep-a85)"
            nodeStrokeWidth={2}
          />
        ) : null}
      </ReactFlow>
      {allNodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-[color:var(--color-text-tertiary)]">
            {t("emptyHint")}
          </p>
        </div>
      ) : null}
      {/* trace 범례 (builder-core §3, docs/prototypes/builder-v2-02-draft.html) —
          선 스타일 = 실선 contains · 파선 depends · 점선 evidence.
          P1a-1 (persona 실측 N5 — 표면마다 4벌 관계 어휘): 이전에는 raw
          미번역 영단어("contains ─ · depends ╌ · evidence ┄")를 그대로
          노출해 지도/인사이트가 쓰는 한국어 formal 어휘("포함"/"의존"/
          "설명")와 다른 단어족으로 읽혔다. 같은 `useRelationVocabulary`
          formal 레지스터로 교체 — 지도 범례·인사이트와 동일한 단어. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-3 font-mono text-[10.5px] tracking-[0.03em] text-[color:var(--color-text-quaternary)]"
      >
        <TraceLegendMark dash="" /> {relationVocabulary("contains", "formal")}
        <TraceLegendMark dash="6 4" /> {relationVocabulary("depends_on", "formal")}
        <TraceLegendMark dash="1.4 3.2" /> {relationVocabulary("describes", "formal")}
      </div>
      {/* hover affordance — 노드 위에 마우스 올렸을 때 subtle 인디고 outline.
          xyflow 기본은 selected 만 표시하고 hover 는 시각 신호 0 → '클릭
          가능' affordance 약함. outline 1px + offset 으로 inner border 와
          중복 안 돼 두께 늘어 보이지 않음. design.md: scale hover / glow 금지. */}
      <style jsx global>{`
        .react-flow__node-atlas {
          transition: filter 180ms ease-out;
          animation: rfNodeAppear 220ms ease-out;
        }
        .react-flow__node-atlas:hover {
          filter: brightness(1.06);
        }
        /* Handle (연결 포트) — builder-core 시안 §2: primary port 원 10px, 중립
           보더 → selected 인디고(AtlasNode inline portStyle). 여기 CSS 가 히트존·
           표출·스냅 하이라이트를 소유한다. enlarge 는 width/height 속성 변화
           (transform scale 아님 → design.md scale-hover 금지와 무관), 링은
           glow 아닌 plain outline. */
        .react-flow__handle.atlas-port {
          width: 10px;
          height: 10px;
          cursor: crosshair;
          transition: width 160ms ease-out, height 160ms ease-out,
                      opacity 160ms ease-out, outline-color 160ms ease-out,
                      border-color 160ms ease-out;
        }
        /* 히트존 ≥16px — 보이는 dot 은 10px 로 두고 투명 ::before 로 클릭 영역만
           24px 로 넓혀 조준 부담을 없앤다(n8n 큰 히트존 원칙). */
        .react-flow__handle.atlas-port::before {
          content: "";
          position: absolute;
          inset: -7px;
          border-radius: 50%;
        }
        .atlas-port-primary {
          opacity: 1;
        }
        /* secondary — 평소 숨김·비활성. node hover 때만 아주 옅게 표출해
           "여기에도 포트가 있다"는 절제된 affordance 만 준다(헌장의 침착함). */
        .atlas-port-secondary {
          opacity: 0;
          pointer-events: none;
        }
        .react-flow__node-atlas:hover .atlas-port-secondary {
          opacity: 0.3;
        }
        .react-flow__node-atlas:hover .atlas-port-primary {
          width: 12px;
          height: 12px;
        }
        /* 유효 종료 포트(자석 스냅 대상) hover / 연결 중 — 인디고 점등 + 확대. */
        .react-flow__handle.atlas-port:hover,
        .react-flow__handle.atlas-port.connectingto.valid {
          width: 15px;
          height: 15px;
          opacity: 1;
          border-color: var(--color-indigo-brand) !important;
          outline: 2px solid var(--color-indigo-brand);
          outline-offset: 2px;
        }
        /* 무효 종료 포트(자기 자신 등) — 즉시 시각 거부(red 신호 톤). */
        .react-flow__handle.atlas-port.connectingto:not(.valid) {
          border-color: var(--color-status-danger) !important;
          outline: 2px solid var(--color-danger-a50);
          outline-offset: 2px;
        }
        /* 관계선은 노드 카드 뒤 레이어에 고정한다. React Flow 기본 z-index 는
           선택/hover 상태에 따라 edge 가 위로 올라올 수 있어, 카드 내부를
           가로지르는 선처럼 보인다. Atlas 에서는 노드가 의미 단위이고 edge 는
           사이 공간에서만 읽혀야 하므로 pane ordering 을 명시한다. */
        .react-flow__edges {
          z-index: 0 !important;
        }
        .react-flow__connectionline {
          z-index: 1 !important;
        }
        .react-flow__nodes {
          z-index: 2 !important;
        }
        .react-flow__node-atlas {
          z-index: 3 !important;
        }
        .react-flow__edge-path {
          transition: stroke-width 180ms ease-out, opacity 180ms ease-out,
                      filter 180ms ease-out;
        }
        .react-flow__edge {
          animation: rfEdgeAppear 240ms ease-out;
        }
        /* hover 강조 — 굵기 증가 + 관계선 opacity 승격. 관계선은 평소 opacity
           0.55/0.5 로 물러나 있고(use-vault-graph-flow 의 edgeStrokeStyleByKey),
           hover 시 전면으로 복귀해 지형도의 dim→focus 문법과 일치한다. BaseEdge
           가 stroke-width·opacity 를 path 인라인 style 로 넣으므로 !important
           로 승격해야 인라인을 이긴다. glow/halo 는 design.md 금지라 굵기·투명도
           만으로 '이 선이 강조됐다' 를 전달한다. */
        .react-flow__edge:hover .react-flow__edge-path {
          stroke-width: 2.6px !important;
          opacity: 1 !important;
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
