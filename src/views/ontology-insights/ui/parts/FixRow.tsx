"use client";

import type { ReactNode } from "react";
import type { QueueRowActionLabels } from "./QueueRowActions";

/** The three action labels every row shares; `askAgent` comes from `QueueRowActionLabels`, where the kebab used it first. */
export interface FixRowLabels extends QueueRowActionLabels {
  /** Secondary: do it yourself, inline where the row supports it, otherwise in the meaning editor. */
  fixHere: string;
  /** Tertiary: go look at it on the map. */
  viewOnMap: string;
}

/**
 * One row shape for every kind of thing to fix: an icon, the name, one sentence naming the observed fact, and the
 * actions. The kind is carried by `data-fix-kind` and the sentence, never by layout, or the list reads as several.
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
  /** Which source produced this row; rendered as an attribute only. */
  kind: string;
  glyph: ReactNode;
  /** The concept or document name; on a cycle the closed path, on a duplicate pair both names. */
  title: ReactNode;
  /** One plain sentence naming the observed fact. */
  sentence: string;
  badge?: ReactNode;
  actions: ReactNode;
  /** The row a person opened, so returning from the map lands on it again. */
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
      // On mobile the actions wrap below the name, so the page never scrolls horizontally at 390.
      className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[color:var(--color-divider)] py-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-a42)] last:border-b-0 ${
        active
          ? "bg-[color:var(--color-indigo-a06)] ring-1 ring-inset ring-[color:var(--color-indigo-a22)]"
          : ""
      }`}
    >
      {glyph}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Name and badge are one group and only the name shrinks, so the badge never wraps and changes the row height. */}
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
            {title}
          </span>
          {badge}
        </span>
        {/* The class `break-keep` stops Korean breaking mid-word under `word-break: normal`. */}
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
 * Border and background tints for this list's indigo chips, which `controlClass` does not emit, bound once so
 * copies cannot drift; the values are the existing `--color-indigo-line-*`.
 */
export const ACCENT_CHIP_IDLE =
  "border-[color:var(--color-indigo-line-a22)] hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a13)]";
export const ACCENT_CHIP_OPEN =
  "border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-line-a13)]";

/**
 * Ink fragments for the row actions, not finished classes: `controlClass(...)` must be called at each anchor
 * because the control-adoption ratchet reads the opening tag. Primary hands to the agent (the one accented
 * control), secondary is do it yourself, tertiary is go look.
 */
export const FIX_ROW_SECONDARY_INK =
  "hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]";
export const FIX_ROW_TERTIARY_INK =
  "border-[color:var(--color-border-soft)] hover:text-[color:var(--color-text-primary)]";
