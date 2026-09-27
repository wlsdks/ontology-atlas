"use client";

import { Bot, User } from "lucide-react";

type LastEditSubjectKind = "agent" | "human";

export interface LastEditSubjectRowProps {
  kind: LastEditSubjectKind;
  /** Resolved by the caller via i18n. */
  prefixLabel: string;
  /** Agent or person, resolved by the caller via i18n. */
  subjectLabel: string;
  /** Resolved by the caller from `computeEditAge` plus i18n (tabular-nums). */
  ageLabel: string;
  className?: string;
}

/**
 * Last-edit provenance row. Person and agent differ only by glyph and label, never hue: both
 * are equal neutral facts. Every string comes from real data resolved by the caller, which
 * renders nothing without evidence.
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
