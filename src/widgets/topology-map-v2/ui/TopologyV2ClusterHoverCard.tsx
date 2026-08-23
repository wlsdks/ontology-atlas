"use client";
import { transientSurface } from "@/shared/ui/transient-surface";
import { currentFloatingRightBound } from "@/shared/lib/right-dock-reserve";

/**
 * S2 part 5C — the cluster chip hover microcard. Owner report: *"hovering a chip should tell me what it means in a tooltip"* (hovering a chip should tell me what it means
 * in a tooltip). Same contract as the edge hover card
 * (`TopologyV2EdgeHoverCard`): non-interactive (pointer-events-none — it never
 * steals a click), clamped to the viewport, modestly sized. One plain sentence,
 * differing only by collapsed or expanded.
 *
 * The copy is i18n (`topology.cluster.tooltipCollapsed/Expanded`) — HomePage
 * injects the finished sentence with the parent node's title and count, and this
 * card only displays it.
 */
export interface TopologyV2ClusterHoverCardProps {
  /** The finished plain sentence (i18n) — "63 elements of 'Onboarding & UX' are collapsed...". */
  sentence: string;
  /** Cursor viewport coordinates — the card offsets to the bottom right and clamps to the viewport. */
  x: number;
  y: number;
}

const OFFSET = 14;
const CARD_MAX_WIDTH = 260;
const EDGE_MARGIN = 8;

export function TopologyV2ClusterHoverCard({ sentence, x, y }: TopologyV2ClusterHoverCardProps) {
  /*
   * The right wall is **the map's edge, not the screen's** (review, 2026-08-16).
   * With a conversation panel standing to the right of the map,
   * `window.innerWidth` points past that panel, and this card — which explains
   * the map — ends up written on top of it.
   */
  const left = Math.min(x + OFFSET, currentFloatingRightBound() - CARD_MAX_WIDTH - EDGE_MARGIN);
  const top = Math.min(y + OFFSET, (typeof window !== "undefined" ? window.innerHeight : 1080) - 72 - EDGE_MARGIN);
  return (
    <div
      {...transientSurface("hint")}
      data-testid="topology-v2-cluster-hover-card"
      role="status"
      className="pointer-events-none fixed z-40 max-w-[260px] rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-3 py-2 shadow-[var(--topology-v2-panel-shadow)]"
      style={{ left, top }}
    >
      <p className="text-body font-[var(--font-weight-signature)] leading-label text-[color:var(--topology-v2-panel-text-primary)]">
        {sentence}
      </p>
    </div>
  );
}
