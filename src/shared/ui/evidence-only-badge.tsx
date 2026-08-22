import { cn } from "@/shared/lib/cn";

export interface EvidenceOnlyBadgeProps {
  /** Short label. Keep it identical across surfaces. */
  label: string;
  /** One line on hover: why this ranks lower, and how it gets promoted. */
  hint?: string;
  className?: string;
}

/**
 * Marks a concept that exists only as evidence — it has no `.md` file of its own.
 *
 * **Deliberately neutral in colour.** Dozens can appear on one screen (193 of the
 * dogfood vault's 289 concepts are derived), so a signal tone would flood the
 * screen with amber and break the charter's "three ambers on screen is a defect"
 * rule. Rank is carried by position and by this quiet label, not by colour.
 *
 * **It must not change row height.** `text-label` (11px) with `leading-label`
 * (16px) stays below the body text beside it (`text-body` 12.5px, ~19px line
 * height); if only badged rows grew taller, the grid rhythm of a repeated set
 * would break without anyone choosing that.
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
