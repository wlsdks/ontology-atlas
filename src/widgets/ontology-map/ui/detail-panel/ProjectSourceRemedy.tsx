import { Link } from "@/i18n/navigation";
import { truncateMiddlePath } from "@/shared/lib/concept-display/truncate-middle-path";
import { controlClass } from "@/shared/ui";
import type { OntologyMapDetailPanelProps } from "./types";

/**
 * **The prescription, right under the diagnosis.** One sentence of "why this is
 * needed" plus one thing to press right there.
 *
 * The box around this position is not decoration but **binding** — the three
 * status lines above are facts, and inside this box is "so what do I do now".
 * The condition for the box appearing *is* "there is something to fix" (the call
 * site's `showSourceRemedy`), so the box itself carries one typed fact
 * (`topGap !== null`).
 *
 * Every value is an existing token — the background and border are the
 * `--map-panel-action-*` the action strip directly below uses, and the
 * button is the same skin as the previous footer action, **not one character
 * changed**. Zero new tokens.
 */
export function ProjectSourceRemedy({
  why,
  actionLabel,
  busyLabel,
  busy,
  onAction,
  degraded,
  proposal,
  onConfirmProposal,
}: {
  why?: string;
  actionLabel?: string;
  busyLabel?: string;
  busy: boolean;
  onAction?: () => void | Promise<void>;
  degraded?: OntologyMapDetailPanelProps["projectSourceDegraded"];
  proposal?: OntologyMapDetailPanelProps["projectSourceProposal"];
  onConfirmProposal?: () => void | Promise<void>;
}) {
  /**
   * With a proposal, **the attention winner changes** — from the generic action
   * "Connect" to the specific question "Is This the Folder? <Path>". So the
   * original single button demotes here into "Choose Another Folder" as **the escape hatch**, and only the confirm button carries indigo
   * (one primary action per box).
   */
  const showProposal = Boolean(onAction && proposal && onConfirmProposal);
  return (
    <div
      data-testid="map-project-source-remedy"
      data-remedy-mode={
        onAction ? (showProposal ? "proposed" : "actionable") : "degraded"
      }
      // `keep-all` — Korean breaks at any character. The three sentences in this
      // box are guaranteed to wrap at the panel's narrow width, and with default
      // line breaking a word splits down the middle, as in "Here / Found it".
      // (The action strip already uses the same grammar for the same reason —
      // zero values added.)
      //
      // No top margin: inside a `RowDisclosure` a child's margin collapses out of the
      // measured body, so the pinned height came up 2px short and clipped this box's
      // bottom border (interaction audit, 2026-09-25).
      className="flex flex-col gap-2 rounded-chip border border-[color:var(--map-panel-action-border)] bg-[color:var(--map-panel-action-surface)] px-2.5 py-2 [word-break:keep-all]"
    >
      {why ? (
        <p
          data-testid="map-project-source-why"
          className="[overflow-wrap:anywhere] text-label text-[color:var(--map-panel-text-tertiary)]"
        >
          {why}
        </p>
      ) : null}
      {showProposal && proposal ? (
        <div
          data-testid="map-project-source-proposal"
          data-proposal-confidence={proposal.confidence}
          className="flex flex-col gap-1"
        >
          <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--map-panel-text-secondary)]">
            {proposal.question}
          </p>
          {/* The path is **an answer, not a long string** — both the leading folder
              context and the final folder name have to survive for the eye to
              confirm "yes, that is my repository". So the middle is folded rather
              than the tail truncated (the same function as the code-location row). */}
          <p
            data-testid="map-project-source-proposal-path"
            title={proposal.rootPath}
            className="font-mono text-label text-[color:var(--map-panel-text-primary)]"
          >
            {truncateMiddlePath(proposal.rootPath)}
          </p>
          <p
            data-testid="map-project-source-proposal-reason"
            className="text-label text-[color:var(--map-panel-text-tertiary)]"
          >
            {proposal.reason}
          </p>
        </div>
      ) : null}
      {onAction ? (
        <div className="flex flex-wrap items-center gap-2">
          {showProposal && proposal && onConfirmProposal ? (
            <button
              type="button"
              onClick={() => { void onConfirmProposal(); }}
              disabled={busy}
              aria-busy={busy}
              data-testid="map-project-source-confirm"
              className={controlClass({
                shape: "chip",
                size: "lg",
                className:
                  "shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--map-panel-primary-border)] bg-[color:var(--map-panel-primary-surface)] text-[color:var(--map-panel-primary-text)] hover:border-[color:var(--map-panel-primary-border-hover)] hover:bg-[color:var(--map-panel-primary-surface-hover)] disabled:cursor-wait",
              })}
            >
              {busy ? busyLabel ?? proposal.confirmLabel : proposal.confirmLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => { void onAction(); }}
            disabled={busy}
            aria-busy={busy}
            data-testid="map-project-source-action"
            className={controlClass({
              shape: "chip",
              size: "lg",
              className: showProposal
                ? "shrink-0 border-[color:var(--map-panel-action-border)] bg-[color:var(--map-panel-action-surface)] text-[color:var(--map-panel-text-tertiary)] hover:border-[color:var(--map-panel-domain-border-hover)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-secondary)] disabled:cursor-wait"
                : "shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--map-panel-primary-border)] bg-[color:var(--map-panel-primary-surface)] text-[color:var(--map-panel-primary-text)] hover:border-[color:var(--map-panel-primary-border-hover)] hover:bg-[color:var(--map-panel-primary-surface-hover)] disabled:cursor-wait",
            })}
          >
            {showProposal && proposal
              ? proposal.pickOtherLabel
              : busy ? busyLabel ?? actionLabel : actionLabel}
          </button>
        </div>
      ) : degraded ? (
        <>
          {/* ① Why it does not work on this screen — a reason, not an apology. */}
          <p
            data-testid="map-project-source-degraded-why"
            className="text-label text-[color:var(--map-panel-text-tertiary)]"
          >
            {degraded.why}
          </p>
          {/* ② Where to go instead — a destination that actually opens, not a sentence. */}
          <Link
            href={degraded.href}
            data-testid="map-project-source-degraded-cta"
            className={controlClass({
              shape: "chip",
              size: "lg",
              className:
                "w-fit shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--map-panel-primary-border)] bg-[color:var(--map-panel-primary-surface)] text-[color:var(--map-panel-primary-text)] hover:border-[color:var(--map-panel-primary-border-hover)] hover:bg-[color:var(--map-panel-primary-surface-hover)]",
            })}
          >
            {degraded.ctaLabel}
          </Link>
          {/* ③ What does still work here — never say that even what works does not.
              It sits on a tinted background, so the ink starts at tertiary rather
              than quaternary (the `quaternary-ink-surface` contract). */}
          <p
            data-testid="map-project-source-degraded-still-works"
            className="text-label text-[color:var(--map-panel-text-tertiary)]"
          >
            {degraded.stillWorks}
          </p>
        </>
      ) : null}
    </div>
  );
}
