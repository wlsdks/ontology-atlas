import { GitCompare } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { OntologyChangeset } from "@/entities/knowledge-graph";

/**
 * "What changed while you were away": the map pulse fades, while the baseline survives reloads.
 * Marking reviewed advances it, so the count shrinks as work is done and zero renders nothing.
 * Nodes only (added + changed + removed), the change panel chip's arithmetic.
 */
export function TopologyReviewLink({
  changeset,
  label,
  ariaLabel,
}: {
  changeset: OntologyChangeset;
  label: (count: number) => string;
  ariaLabel: (count: number) => string;
}) {
  const count =
    changeset.addedNodes.length + changeset.changedNodes.length + changeset.removedNodes.length;
  if (count === 0) return null;
  return (
    <Link
      href="/ontology/"
      data-testid="topology-review-link"
      data-utility-action-token-contract="accent-surface-family"
      data-utility-action-surface-token="--topology-utility-lane-accent-surface"
      data-utility-action-border-token="--topology-utility-lane-accent-border"
      data-utility-action-shadow-token="--topology-utility-lane-shadow"
      data-utility-action-focus-ring-token="--topology-utility-lane-focus-ring"
      aria-label={ariaLabel(count)}
      title={ariaLabel(count)}
      // Matches ChromeChip (44px / 10px), not the utility-lane clamp, to sit level with the
      // workspace chip.
      // Ink is `--color-indigo-text-soft`: `--color-indigo-accent` falls below AA on this indigo
      // tint.
      className="inline-flex h-[var(--chrome-tile-size)] items-center gap-2 rounded-[var(--chrome-radius)] border border-[color:var(--topology-utility-lane-accent-border)] bg-[color:var(--topology-utility-lane-accent-surface)] px-3.5 text-[length:var(--topology-chrome-title-size)] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-soft)] shadow-[var(--topology-utility-lane-shadow)] transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-[color:var(--topology-utility-lane-accent-hover-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-utility-lane-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] motion-reduce:transition-none"
    >
      <GitCompare className="size-[var(--topology-chrome-icon-size)]" aria-hidden />
      <span>{label(count)}</span>
    </Link>
  );
}
