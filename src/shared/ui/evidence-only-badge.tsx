import { cn } from "@/shared/lib/cn";

export interface EvidenceOnlyBadgeProps {
  /** Keep it identical across surfaces. */
  label: string;
  /** Why this ranks lower, and how it gets promoted. */
  hint?: string;
  className?: string;
}

/**
 * Marks a concept that exists only as evidence, with no `.md` of its own. Neutral colour,
 * because dozens can share a screen and amber would flood it. `text-label` with `leading-label`
 * keeps a badged row the same height as its neighbours.
 */
export function EvidenceOnlyBadge({ label, hint, className }: EvidenceOnlyBadgeProps) {
  return (
    <span
      data-testid="evidence-only-badge"
      title={hint}
      className={cn(
        "inline-flex flex-none items-center rounded-micro border border-[color:var(--color-border-soft)] px-1 text-label leading-label text-[color:var(--color-text-quaternary)]",
        className,
      )}
    >
      {label}
    </span>
  );
}
