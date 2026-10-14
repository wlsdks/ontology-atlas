"use client";
import { transientSurface } from "@/shared/ui/surfaces/transient-surface";
import { currentFloatingRightBound } from "@/shared/lib/overlays/right-dock-reserve";

export interface OntologyMapClusterHoverCardProps {
  /** The finished plain sentence (i18n) — "63 elements of 'Onboarding & UX' are collapsed...". */
  sentence: string;
  /** Cursor viewport coordinates — the card offsets to the bottom right and clamps to the viewport. */
  x: number;
  y: number;
}

const OFFSET = 14;
const CARD_MAX_WIDTH = 260;
const EDGE_MARGIN = 8;

export function OntologyMapClusterHoverCard({ sentence, x, y }: OntologyMapClusterHoverCardProps) {
  /*
   * The right wall is the map's edge, not the screen's: with a conversation panel to the right,
   * `window.innerWidth` points past it and the card would cover that panel.
   */
  const left = Math.min(x + OFFSET, currentFloatingRightBound() - CARD_MAX_WIDTH - EDGE_MARGIN);
  const top = Math.min(y + OFFSET, (typeof window !== "undefined" ? window.innerHeight : 1080) - 72 - EDGE_MARGIN);
  return (
    <div
      {...transientSurface("hint")}
      data-testid="map-cluster-hover-card"
      role="status"
      className="pointer-events-none fixed z-40 max-w-[260px] rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] px-3 py-2 shadow-[var(--map-panel-shadow)]"
      style={{ left, top }}
    >
      <p className="text-body font-[var(--font-weight-signature)] leading-label text-[color:var(--map-panel-text-primary)]">
        {sentence}
      </p>
    </div>
  );
}
