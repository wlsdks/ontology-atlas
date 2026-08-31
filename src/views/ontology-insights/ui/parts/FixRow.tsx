"use client";

import type { ReactNode } from "react";
import type { QueueRowActionLabels } from "./QueueRowActions";

/**
 * The three action labels every row in the one list shares, whatever produced the row.
 *
 * Naming one action differently per row kind is what made the old tab read as three screens. The
 * primary label (`askAgent`) already lives on `QueueRowActionLabels` because the kebab used it
 * first; the other two are added here.
 */
export interface FixRowLabels extends QueueRowActionLabels {
  /** Secondary: do it yourself, inline where the row supports it, otherwise in the meaning editor. */
  fixHere: string;
  /** Tertiary: go look at it on the map. */
  viewOnMap: string;
}

/**
 * **One row shape for every kind of thing to fix.**
 *
 * The "to do" tab used to draw the same items three ways (a meter, a counter band, a grouped
 * queue) and each family of row had its own anatomy. The owner's decision on 2026-08-31 was one
 * list, so there is one row: an icon, the concept's name, one plain sentence naming the observed
 * fact, and the actions. A kind is carried by `data-fix-kind` for tests and by the sentence for a
 * reader; it is not carried by a different layout, because a list whose rows are shaped
 * differently reads as several lists.
 */
export function FixRow({
  kind,
  glyph,
  title,
  sentence,
  badge,
  actions,
  active = false,
  rowRef,
}: {
  /** Which source produced this row. Rendered as an attribute only, never as a visible label. */
  kind: string;
  glyph: ReactNode;
  /** The concept or document name. On a cycle it is the closed path; on a duplicate pair, both names. */
  title: ReactNode;
  /** One plain sentence naming the observed fact. */
  sentence: string;
  badge?: ReactNode;
  actions: ReactNode;
  /** The review loop marks the row a person opened, so returning from the map lands on it again. */
  active?: boolean;
  rowRef?: (element: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={rowRef}
      data-testid="do-next-item"
      data-fix-kind={kind}
      tabIndex={-1}
      aria-current={active ? "step" : undefined}
      // On mobile the actions do not fit beside the name, so they wrap below it (the 390px
      // overflow sweep: no horizontal page scroll).
      className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[color:var(--color-divider)] py-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-a42)] last:border-b-0 ${
        active
          ? "bg-[color:var(--color-indigo-a06)] ring-1 ring-inset ring-[color:var(--color-indigo-a22)]"
          : ""
      }`}
    >
      {glyph}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Name and badge are one group: only the name shrinks, so the badge never drops to the
            next line and disturbs the row height (dimensional regularity). */}
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
            {title}
          </span>
          {badge}
        </span>
        {/* `break-keep` because Korean breaks mid-word under `word-break: normal` (measured
            2026-08-12 on this same tab). */}
        <span
          data-testid="do-next-item-why"
          className="min-w-0 break-keep text-body leading-body text-[color:var(--color-text-quaternary)]"
        >
          {sentence}
        </span>
      </div>
      <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
        {actions}
      </span>
    </div>
  );
}

/**
 * The **ink** for the indigo chips in this list — the layer the value layer (`controlClass`)
 * deliberately does not emit. `tone` emits the text colour only; border and background tints and
 * their hover belong to the consumer. Binding them to constants stops three hand-written copies
 * drifting apart, and not one value is new (the existing `--color-indigo-line-*`).
 */
export const ACCENT_CHIP_IDLE =
  "border-[color:var(--color-indigo-line-a22)] hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a13)]";
export const ACCENT_CHIP_OPEN =
  "border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-line-a13)]";

/**
 * The **ink** for the three row actions, as class fragments rather than finished classes.
 *
 * They are fragments on purpose. `controlClass(...)` is called **at each anchor**, because the
 * control-adoption ratchet reads the opening tag and a finished class imported from another file
 * looks exactly like a hand-written spec to it. What must not drift between rows is the ink the
 * value layer does not emit, and that is what these constants hold.
 *
 * Primary = hand it to the agent (the only accented control in a row, so the eye lands in the same
 * place every time) · secondary = do it yourself · tertiary = go look, promising no change.
 */
export const FIX_ROW_SECONDARY_INK =
  "hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]";
export const FIX_ROW_TERTIARY_INK =
  "border-[color:var(--color-border-soft)] hover:text-[color:var(--color-text-primary)]";
