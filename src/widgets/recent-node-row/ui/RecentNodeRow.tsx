import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { OntologyMapKindGlyph } from "@/shared/ui";

export interface RecentNodeRowProps {
  kind: string;
  title: string;
  /** Second stacked line — kind/domain and, where the surface has it, a
   * short description. Composed by the caller so each surface keeps its own
   * exact wording; only the two-line stack shape is shared. */
  subtitle: ReactNode;
  /** Right-aligned primary metadata — usually a relative date. */
  trailing: ReactNode;
  /** Optional smaller line under `trailing` — e.g. the vault doc slug, kept
   * for the agent/developer audience without competing with the date. */
  trailingSecondary?: ReactNode;
  /** Present → renders as a map-focus link; absent → an inert row (dangling
   * doc with no resolvable graph node). */
  href?: string;
  ariaLabel?: string;
  testId?: string;
}

/**
 * One row of "a concept changed recently", shared by `/ontology/insights` and `/projects` so the
 * same fact looks the same: title over kind and domain.
 */
export function RecentNodeRow({
  kind,
  title,
  subtitle,
  trailing,
  trailingSecondary,
  href,
  ariaLabel,
  testId,
}: RecentNodeRowProps) {
  const content = (
    <>
      <OntologyMapKindGlyph kind={kind} size={14} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-[color:var(--color-text-primary)]">{title}</span>
        <span className="block truncate text-label text-[color:var(--color-text-quaternary)]">{subtitle}</span>
      </span>
      {/* max-w plus truncate keeps a long slug inside a 360px screen. */}
      <span className="flex-none max-w-[45%] text-right">
        <span className="block font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">
          {trailing}
        </span>
        {trailingSecondary ? (
          <span className="block truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
            {trailingSecondary}
          </span>
        ) : null}
      </span>
    </>
  );

  // No hover background without a click target; looking interactive while unpressable is the
  // defect.
  const className = `flex items-center gap-2.5 rounded-chip border-t border-[color:var(--color-divider)] px-1.5 py-2.5 transition-colors first:border-t-0 ${
    href ? "-mx-1.5 hover:bg-[color:var(--color-overlay-1)]" : ""
  }`;

  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} data-testid={testId} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <div data-testid={testId} className={className}>
      {content}
    </div>
  );
}
