"use client";

export interface MtimeConflictBadgeProps {
  message: string;
  className?: string;
}

/**
 * Warns that the file changed since it was read (`expected_mtime`); the caller renders it only
 * after `hasUnaccountedMtimeChange`. Amber, not red: a check-before-overwrite, not a failure.
 * Enters with the existing `atlasStatusIn` keyframe; the base layer handles reduced motion.
 */
export function MtimeConflictBadge({ message, className }: MtimeConflictBadgeProps) {
  return (
    <p
      data-testid="mtime-conflict-badge"
      role="status"
      className={[
        "rounded-micro border border-[color:var(--color-amber-signal-a30)] bg-[color:var(--color-amber-signal-a07)] px-2 py-1.5 text-label leading-label text-[color:var(--color-text-primary)]",
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
