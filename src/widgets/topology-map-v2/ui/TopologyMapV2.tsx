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
}

export interface TopologyV2Edge {
  source: string;
  target: string;
  relationType: string;
  relationQuality: "strong" | "weak" | null;
  evidenceCount: number;
  kind: "contains" | "depends";
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
  onSelect?: (slug: string) => void;
  onOpen?: (slug: string) => void;
  onPaneClick?: () => void;
  onVisibleCountChange?: (visible: number) => void;
  onGraphStatsChange?: (stats: { nodes: number; relations: number }) => void;
  /** Embed mode (project detail neighbor map) — reduced physics/chrome. */
  minimal?: boolean;
}

export function TopologyMapV2(props: TopologyMapV2Props) {
  const { nodes, edges, focus, minimal, fitViewToken, relayoutToken, onSelect, onPaneClick, onVisibleCountChange, onGraphStatsChange } = props;

  const { canvasRef, containerRef, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleWheel } =
    useTopologyLoop({
      nodes,
      edges,
      focusedSlug: focus.selectedSlug,
      fitViewToken,
      relayoutToken,
      onSelect,
      onPaneClick,
      onVisibleCountChange,
      onGraphStatsChange,
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
        onWheel={handleWheel}
      />
    </div>
  );
}
