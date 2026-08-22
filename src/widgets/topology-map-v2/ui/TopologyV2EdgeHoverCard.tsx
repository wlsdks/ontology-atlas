"use client";
import { transientSurface } from "@/shared/ui/transient-surface";
import { currentFloatingRightBound } from "@/shared/lib/right-dock-reserve";

/**
 * P3c — the edge hover microcard. A lighter predecessor of the click popover
 * (P3b, TopologyV2EdgePanel): near the cursor, one plain sentence plus the type
 * plus one evidence line when there is one. What opened the gate was an owner
 * usage signal (*"연결선에 호버하면 의미 표시"* — hovering a line should show its
 * meaning); P3c had originally been held back pending proof that 3b was used.
 *
 * Contract: non-interactive (pointer-events-none — it never steals a click),
 * clamped to the viewport, and mutually exclusive with the popover (not rendered
 * while an edge is selected — the caller's responsibility).
 */
export interface TopologyV2EdgeHoverCardProps {
  /** The plain sentence — "A 가 B 에 기대요" (from the same relation lexicon as P3b). */
  sentence: string;
  /** The formal type label — "의존" (depends). */
  typeLabel: string;
  /** P6 relation_notes — truncated to one line when present. */
  why: string | null;
  /** The click hint (i18n). */
  clickHint: string;
  /** Cursor viewport coordinates — the card offsets to the bottom right and clamps to the viewport. */
  x: number;
  y: number;
}

const OFFSET = 14;
const CARD_MAX_WIDTH = 280;
const EDGE_MARGIN = 8;

export function TopologyV2EdgeHoverCard({ sentence, typeLabel, why, clickHint, x, y }: TopologyV2EdgeHoverCardProps) {
  /*
   * The right wall is **the map's edge, not the screen's** (review, 2026-08-16).
   * With a conversation panel standing to the right of the map,
   * `window.innerWidth` points past that panel, and this card — which explains
   * the map — ends up written on top of it.
   */
  const left = Math.min(x + OFFSET, currentFloatingRightBound() - CARD_MAX_WIDTH - EDGE_MARGIN);
  const top = Math.min(y + OFFSET, (typeof window !== "undefined" ? window.innerHeight : 1080) - 120 - EDGE_MARGIN);
  return (
    <div
      {...transientSurface("hint")}
      data-testid="topology-v2-edge-hover-card"
      role="status"
      className="pointer-events-none fixed z-40 flex max-w-[280px] flex-col gap-1 rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-3 py-2 shadow-[var(--topology-v2-panel-shadow)]"
      style={{ left, top }}
    >
      <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--topology-v2-panel-text-tertiary)]">
        {typeLabel}
      </p>
      <p className="text-body font-[var(--font-weight-signature)] leading-label text-[color:var(--topology-v2-panel-text-primary)]">
        {sentence}
      </p>
      {why ? (
        <p className="truncate text-label leading-label text-[color:var(--topology-v2-panel-text-secondary)]">{why}</p>
      ) : null}
      <p className="text-label text-[color:var(--topology-v2-panel-text-quaternary)]">{clickHint}</p>
    </div>
  );
}
