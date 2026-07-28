"use client";

export interface MtimeConflictBadgeProps {
  message: string;
  className?: string;
}

/**
 * rank7 (design-council B5) — expected_mtime conflict badge, shared by
 * `DocFrontmatterBlock`, `TopologyV2DetailPanel`, and `FullDetailA1`.
 *
 * Rendered ONLY by the caller when a real mtime mismatch was detected
 * (`hasUnaccountedMtimeChange`) — this component has no vault knowledge, it
 * just paints the warning once told to. amber signal ladder (never
 * red/error — a "check before you overwrite" heads-up, not a failure).
 * Entrance reuses the existing `atlasStatusIn` keyframe (opacity 0→1 +
 * translateY 4px→0, 180ms) already used for the builder's draft-status
 * callout — no new keyframe/duration literal. `prefers-reduced-motion` is
 * handled by the global base-layer rule (animation-duration 0.01ms) like
 * every other entrance in this app.
 */
export function MtimeConflictBadge({ message, className }: MtimeConflictBadgeProps) {
  return (
    <p
      data-testid="mtime-conflict-badge"
      role="status"
      className={[
        "rounded-sm border border-[color:var(--color-amber-signal-a30)] bg-[color:var(--color-amber-signal-a07)] px-2 py-1.5 text-label leading-4 text-[color:var(--color-text-primary)]",
        "motion-safe:animate-[atlasStatusIn_var(--motion-base)_var(--motion-ease)]",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {message}
    </p>
  );
}
