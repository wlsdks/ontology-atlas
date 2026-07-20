"use client";

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
  selectedSlug: string | null;
  depthLimit: number | null;
  searchQuery: string;
  activeCategory: string | null;
  hubsOnly: boolean;
}

export interface TopologyV2Overlays {
  recentPulse: boolean;
  ownerTint: boolean;
  backrefHighlight: boolean;
}

export interface TopologyV2Forces {
  repel: number;
  linkDistance: number;
  collideMultiplier: number;
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
  overlays: TopologyV2Overlays;
  changedSlugs?: ReadonlySet<string>;
  livePhysics: boolean;
  forces?: TopologyV2Forces;
  /** Increment to re-run fit-to-bounds (HomePage "지도 맞추기"). */
  fitViewToken: number;
  /** Increment to force a full relayout. */
  relayoutToken: number;
  /** P3d(E1) — 첫 지도 연출 트리거 (부트스트랩 완료 시 증가). */
  revealToken?: number;
  /** P3b — 엣지 클릭 (노드 미히트 지점). */
  onSelectEdge?: (edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null }) => void;
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
  /** Embed mode (project detail neighbor map) — reduced physics/chrome. */
  minimal?: boolean;
  /**
   * W6 agent visibility — the graph node id matching the agent heartbeat's
   * current focus (already resolved to `kind:slug` form by `HomePage`), or
   * `null`/omitted when there's no fresh heartbeat focus. Draws a static
   * amber ring + label activity mark on that one node; never fabricated.
   */
  agentFocusNodeId?: string | null;
}

export function TopologyMapV2(props: TopologyMapV2Props) {
  const { nodes, edges, focus, minimal, emphasizedNeighborSlug, fitViewToken, relayoutToken, revealToken, onSelectEdge, onSelect, onPaneClick, onVisibleCountChange, onGraphStatsChange, onZoomTierChange, onContextMenuNode, agentFocusNodeId } = props;

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
      onSelect,
      onPaneClick,
      onVisibleCountChange,
      onGraphStatsChange,
      onZoomTierChange,
      onContextMenuNode,
      agentFocusNodeId,
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
        style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
}
