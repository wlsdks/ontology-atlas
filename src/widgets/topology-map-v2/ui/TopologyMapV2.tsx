"use client";

import { useRef } from "react";
import { Orbit } from "lucide-react";
import { useTopologyLoop } from "./use-topology-loop";

/**
 * `TopologyMapV2` — the single canvas-2D render engine that replaces
 * `TopologyMapCanvas` (DOM/CSS) + `SigmaTopology` (WebGL) behind the
 * `topology-map-v2` feature flag (`docs/TOPOLOGY-V2-DESIGN.md` §1.2 "하나의
 * 렌더 엔진으로 통합"). Phase 0's adapter contract (§4.2) is this component's
 * props — HomePage/ProjectDetailPage swap their existing
 * `TopologyMapCanvas`/`SigmaTopology` call sites for this one, unchanged
 * upstream state management (selected slug, path query, etc).
 *
 * The component itself stays a thin JSX shell — mount/resize/rAF-loop/
 * pointer/camera/draw wiring all live in `use-topology-loop.ts` (+ its
 * `topology-world.ts`/`topology-camera-math.ts`/`topology-frame-draw.ts`
 * helpers), per this file's own 300-line budget (`.claude/rules/*`).
 */

export interface TopologyV2Node {
  id: string;
  label: string;
  kind: "project" | "domain" | "capability" | "element";
  size: number;
  x: number;
  y: number;
  isHub: boolean;
  ownerKey: string | null;
  recentlyUpdated: boolean;
  /** 살아있는 지도 드리프트 — vault mtime 파생 dusty 판정(`views/home/lib/topology-dusty.ts`).
   *  true 면 기존 stale 채널(dash + 불투명 stale 토큰)로 렌더. 생략 = fresh. */
  stale?: boolean;
  fullDegree: number;
  /** Transitive contained-descendant count — the engraved numeral shown on project/domain chips in circuit range (prototype `n.count`). */
  descendantCount: number;
}

export interface TopologyV2Edge {
  source: string;
  target: string;
  relationType: string;
  relationQuality: "strong" | "weak" | null;
  evidenceCount: number;
  kind: "contains" | "depends";
  /** P3b — 이 관계를 선언한 vault 문서 slug (frontmatter 가 곧 그래프이므로 출처 표시 비용 0). */
  declaredBySlug: string | null;
}

export interface TopologyV2Focus {
  /**
   * v2 캔버스 loop 가 실제로 소비하는 유일한 focus 필드. 구
   * depthLimit/searchQuery/activeCategory/hubsOnly 는 렌더러가 읽지 않는
   * 죽은 필드였고 조절 패널 철거와 함께 제거됐다 (loop 는 ego 포커스만 계산).
   */
  selectedSlug: string | null;
}

/**
 * Adapter contract (`docs/TOPOLOGY-V2-PHASE0.md` §4.2, confirmed unchanged
 * by `docs/TOPOLOGY-V2-DESIGN.md` §5.3 — v2 only replaces rendering, not
 * the upstream state/callback contract).
 */
export interface TopologyMapV2Props {
  nodes: readonly TopologyV2Node[];
  edges: readonly TopologyV2Edge[];
  focus: TopologyV2Focus;
  changedSlugs?: ReadonlySet<string>;
  livePhysics: boolean;
  /** Increment to re-run fit-to-bounds (HomePage "지도 맞추기"). */
  fitViewToken: number;
  /** Increment to force a full relayout. */
  relayoutToken: number;
  /** P3d(E1) — 첫 지도 연출 트리거 (부트스트랩 완료 시 증가). */
  revealToken?: number;
  /** P3b — 엣지 클릭 (노드 미히트 지점). */
  onSelectEdge?: (edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null }) => void;
  /** 엣지 선택 = 페어 포커스 — 양끝만 밝히고 나머지 dim, 선택 엣지는 pale 인디고. */
  selectedEdge?: { sourceId: string; targetId: string } | null;
  /** P3c — 엣지 호버 마이크로카드 (식별 변경 시 발화, null=해제). */
  onHoverEdge?: (
    edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null,
    position: { x: number; y: number } | null,
  ) => void;
  /**
   * The connected-node slug the user is hovering in the detail panel's
   * "연결된 노드" list. Under focus, that node + its connecting edge light up on
   * the canvas so panel and map read as one (lead spec §4). Optional — the
   * panel-hover wiring is a follow-up; omitting it keeps the map behavior
   * identical.
   */
  emphasizedNeighborSlug?: string | null;
  onSelect?: (slug: string) => void;
  onOpen?: (slug: string) => void;
  onPaneClick?: () => void;
  onVisibleCountChange?: (visible: number) => void;
  onGraphStatsChange?: (stats: { nodes: number; relations: number }) => void;
  /**
   * M-5 — semantic-zoom tier (spine → circuit → element) changed. Fires only
   * on transitions; HomePage feeds it to the corner readout so the "zoom in to
   * see elements" hint drops once elements are actually on screen.
   */
  onZoomTierChange?: (tier: "spine" | "circuit" | "element") => void;
  /**
   * W2-B node right-click context menu — called with the hit node's id and
   * viewport-space cursor position. Omitted keeps right-click behavior
   * unchanged (browser default menu everywhere, same as before this slice).
   */
  onContextMenuNode?: (slug: string, position: { x: number; y: number }) => void;
  /**
   * 밀도 게이트 (fable 설계) — 사용자가 펼친 부모 slug Set(URL `?open=`).
   * 임계(12) 초과 자식을 가진 부모는 기본 접힘(클러스터 칩)이고 여기 담긴
   * 부모만 자식을 노출한다. 생략/빈 Set = 전부 접힘.
   */
  expandedParents?: ReadonlySet<string>;
  /** 밀도 게이트 — 클러스터 칩 클릭 시 해당 부모 확장 토글(HomePage 가 URL 왕복). */
  onToggleCluster?: (parentId: string) => void;
  /** S2 파트 5C — 클러스터 칩 호버 툴팁 (식별 변경 시 발화, null=해제). */
  onHoverCluster?: (
    info: {
      parentId: string;
      /** 이 티어에서 접힌 직속 게이트 자식 수(칩 `+N`). */
      count: number;
      /** 패널3-S6 — 부모의 하위 전체 자손 수(노드 뱃지 = descendantCount). */
      descendantTotal: number;
      expanded: boolean;
      position: { x: number; y: number };
    } | null,
  ) => void;
  /**
   * 밀도 게이트 — 클러스터 칩 어포던스의 접근성 힌트(i18n, HomePage 가 주입).
   * 칩은 canvas 글리프라 개별 aria 를 못 달아, 컨테이너 안 sr-only 설명으로
   * "무엇이 접혔고 어떻게 펼치는가"를 스크린리더에 전달한다.
   */
  clusterHint?: string;
  /** Embed mode (project detail neighbor map) — reduced physics/chrome. */
  minimal?: boolean;
  /**
   * W6 agent visibility — the graph node id matching the agent heartbeat's
   * current focus (already resolved to `kind:slug` form by `HomePage`), or
   * `null`/omitted when there's no fresh heartbeat focus. Draws a static
   * amber ring + label activity mark on that one node; never fabricated.
   */
  agentFocusNodeId?: string | null;
  /**
   * S4 "영역 전개" — 지도가 이 노드의 세계로 전환된 상태 (`?realm=slug`), 없으면
   * 전체 지도. HomePage 가 URL 에서 내린다.
   */
  realmRootId?: string | null;
  /** S4 — 궤도 "전개" 버튼 클릭 → 이 slug 로 영역 진입 (HomePage 가 URL 왕복). */
  onEnterRealm?: (slug: string) => void;
  /** S4 — 궤도 버튼 접근성 라벨 (i18n, HomePage 주입). */
  realmEnterLabel?: string;
  /** S4 — 궤도 버튼 호버 마이크로 툴팁 문구 ("이 노드의 영역만 펼쳐요"). */
  realmEnterTooltip?: string;
  /**
   * H3 P2 — 캔버스 접근성 라벨(i18n, HomePage 주입). canvas 는 회화 픽셀이라
   * 스크린리더에 빈 그래픽으로 읽힌다 → `role="img"` + 이 라벨로 "무엇인지 +
   * 키보드 대안(INDEX 패널)"을 한 문장으로 알린다. 생략하면 role/label 을 안
   * 단다(회귀 0).
   */
  canvasLabel?: string;
  /**
   * 발자국 트레일 (fable 설계) — 세션 동안 방문(ego 포커스)한 노드 id 목록
   * (오래된 → 최근). 각 방문 노드에 최근성 감쇠 pale 인디고 헤어라인 링을
   * 얹는다(정적 표기). HomePage 세션 state 가 내려보낸다. 생략/빈 배열 =
   * 발자국 없음.
   */
  visitedTrail?: readonly string[];
}

export function TopologyMapV2(props: TopologyMapV2Props) {
  const { nodes, edges, focus, minimal, emphasizedNeighborSlug, fitViewToken, relayoutToken, revealToken, onSelectEdge, onSelect, onPaneClick, onVisibleCountChange, onGraphStatsChange, onZoomTierChange, onContextMenuNode, agentFocusNodeId, livePhysics, onHoverEdge, selectedEdge = null, expandedParents, onToggleCluster, onHoverCluster, clusterHint, realmRootId = null, onEnterRealm, realmEnterLabel, realmEnterTooltip, canvasLabel, visitedTrail } = props;

  const realmEnterButtonRef = useRef<HTMLButtonElement | null>(null);

  // `handleWheel` is wired natively (non-passive) inside `useTopologyLoop` —
  // see its own FIX comment — not bound here as a JSX prop.
  const { canvasRef, containerRef, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleContextMenu } =
    useTopologyLoop({
      nodes,
      edges,
      focusedSlug: focus.selectedSlug,
      emphasizedNeighborSlug,
      fitViewToken,
      relayoutToken,
      revealToken,
      onSelectEdge,
      onHoverEdge,
      selectedEdge,
      onSelect,
      onPaneClick,
      onVisibleCountChange,
      onGraphStatsChange,
      onZoomTierChange,
      onContextMenuNode,
      agentFocusNodeId,
      livePhysics,
      expandedParents,
      onToggleCluster,
      onHoverCluster,
      realmRootId,
      onEnterRealm,
      realmEnterButtonRef,
      visitedTrail,
    });

  return (
    <div
      ref={containerRef}
      data-testid="topology-map-v2"
      data-map-engine="v2"
      data-minimal={minimal ? "true" : "false"}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <canvas
        ref={canvasRef}
        data-testid="topology-map-v2-canvas"
        role={canvasLabel ? "img" : undefined}
        aria-label={canvasLabel}
        style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={handleContextMenu}
      />
      {/* S4 궤도 "전개" 버튼 — 캔버스 좌표 앵커(loop 가 매 프레임 transform 갱신).
          기본 숨김; 포커스 노드에 자식이 있고 영역 밖일 때만 노출. 방사형 메뉴
          금지 — 버튼 하나. 호버 시 마이크로 툴팁(평문 한 줄). */}
      {onEnterRealm ? (
        <button
          ref={realmEnterButtonRef}
          type="button"
          data-testid="topology-realm-enter-button"
          aria-label={realmEnterLabel}
          className="group absolute left-0 top-0 z-40 hidden h-7 w-7 items-center justify-center rounded-full border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] text-[color:var(--topology-v2-indigo-bright)] shadow-[var(--topology-v2-panel-shadow)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)]"
          style={{ display: "none" }}
        >
          <Orbit size={15} aria-hidden />
          {realmEnterTooltip ? (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-2 py-1 text-[11.5px] font-medium text-[color:var(--topology-v2-panel-text-primary)] shadow-[var(--topology-v2-panel-shadow)] group-hover:block"
            >
              {realmEnterTooltip}
            </span>
          ) : null}
        </button>
      ) : null}
      {clusterHint ? (
        <span
          data-testid="topology-cluster-hint"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {clusterHint}
        </span>
      ) : null}
    </div>
  );
}
