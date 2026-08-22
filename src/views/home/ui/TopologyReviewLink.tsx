import { GitCompare } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { OntologyChangeset } from "@/shared/lib/ontology-tree";

/**
 * The re-entry hook: "what changed while you were away".
 *
 * The map shows a change as a pulse, but the pulse fades after ~5s, leaving
 * someone who comes back with no *lasting* cue that N changes are still
 * unreviewed. The baseline survives reloads and sessions, so changes since it are
 * exactly what happened while they were away.
 *
 * Marking a node reviewed advances the baseline, so this counts unreviewed
 * changes only — a loop that shrinks as it is worked through. At zero it renders
 * nothing. Nodes only (added + changed + removed), the same arithmetic as the
 * change panel's chip, where edges fold into their from-node signature.
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
      // Height and radius converge on ChromeChip (44px / 10px), not on
      // `--topology-utility-lane-height` (a 32–36px clamp): this sits beside the
      // workspace chip in the same top-right row, and the clamp left the two at
      // mismatched heights.
      //
      // ⚠️ The ink is `--color-indigo-text-soft` (accentOnTint), 2026-08-15. The
      // former `--color-indigo-accent` is licensed by the `accent-ink-contrast`
      // contract **only over the darkest backgrounds**, and this chip sits on an
      // indigo tint (`utility-lane-accent-surface` = rgba(94,106,210,.12)).
      // Measured: at rest 4.73 over canvas / **4.46 over panel (below AA)**,
      // dropping to 4.45 / 4.17 on hover. With soft: 8.71 / 8.21.
      //
      // That contract missed this spot because the tint is a `--topology-*` alias
      // and so never matched its source scan (`--color-(indigo|amber)…-a\d+`).
      className="inline-flex h-[var(--chrome-tile-size)] items-center gap-2 rounded-[var(--chrome-radius)] border border-[color:var(--topology-utility-lane-accent-border)] bg-[color:var(--topology-utility-lane-accent-surface)] px-3.5 text-[length:var(--topology-chrome-title-size)] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-soft)] shadow-[var(--topology-utility-lane-shadow)] transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-[color:var(--topology-utility-lane-accent-hover-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-utility-lane-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] motion-reduce:transition-none"
    >
      <GitCompare className="size-[var(--topology-chrome-icon-size)]" aria-hidden />
      <span>{label(count)}</span>
    </Link>
  );
}
