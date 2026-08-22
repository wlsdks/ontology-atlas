"use client";

import { Bot, User } from "lucide-react";

export type LastEditSubjectKind = "agent" | "human";

export interface LastEditSubjectRowProps {
  kind: LastEditSubjectKind;
  /** The "last edited" label — the caller resolves it via i18n. */
  prefixLabel: string;
  /** Who edited it (agent or the user) — the caller resolves it via i18n. */
  subjectLabel: string;
  /** Relative age, e.g. "3 minutes ago" — the caller resolves it via `computeEditAge` plus i18n (tabular-nums). */
  ageLabel: string;
  className?: string;
}

/**
 * rank7 (design-council B5) — last-edit provenance row, shared by
 * `DocFrontmatterBlock`, `TopologyV2DetailPanel`, and `FullDetailA1`.
 *
 * Human vs AI is distinguished ONLY by a lucide glyph (User/Bot) + plain
 * label — never by hue. The product identity is "agent-native,
 * human-sovereign": both subjects are equal, neutral facts, so this
 * component paints them with the exact same text color and no new color
 * channel. Static, no motion — a plain fact, not a status change.
 *
 * Every string is resolved by the caller from a REAL data source
 * (`resolveDocLastEditSubject` in docs-vault, `resolveNodeLastEditSubject`
 * in home) — this component has no opinion about vault state and never
 * fabricates a subject. If the caller has no evidence, it renders nothing
 * instead of mounting this row.
 */
export function LastEditSubjectRow({
  kind,
  prefixLabel,
  subjectLabel,
  ageLabel,
  className,
}: LastEditSubjectRowProps) {
  const Glyph = kind === "agent" ? Bot : User;
  return (
    <p
      data-testid="last-edit-subject-row"
      data-edit-subject-kind={kind}
      className={[
        "flex items-center gap-1.5 text-label text-[color:var(--color-text-tertiary)]",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Glyph size={13} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 truncate">
        {prefixLabel}
        <span aria-hidden="true"> · </span>
        {subjectLabel}
        <span aria-hidden="true"> · </span>
        <span className="tabular-nums">{ageLabel}</span>
      </span>
    </p>
  );
}
