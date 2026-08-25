"use client";

import { History } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";

export interface SummaryFreshnessRowProps {
  /** "Description is behind its membership" — the caller resolves it via i18n. */
  prefixLabel: string;
  /** How far behind, e.g. "21 days" — the caller resolves it via `daysBehind` plus i18n (tabular-nums). */
  lagLabel: string;
  /** What is owed, e.g. "re-judge" — the caller resolves it via i18n. */
  actionLabel: string;
  className?: string;
}

/**
 * Says that a domain or project's description has fallen behind the membership it
 * describes, so someone owes it a re-judgement.
 *
 * **Not a warning, and painted so.** The underlying signal is `severity: info`,
 * `phase: review` — nothing is broken and nothing is blocked. It therefore uses the same
 * tertiary text colour and label size as `LastEditSubjectRow` and introduces no colour
 * channel of its own. A stale description that reads as an alarm teaches people to
 * ignore the mark; a plain fact does not.
 *
 * **Static, and no proposal.** No motion, and no "fix it" affordance: the body of a
 * summary node is a human judgement someone accepted, so the row asks for a judgement
 * and stops. Nothing here rewrites anything.
 *
 * The caller mounts this only when it has a real verdict from `summaryStalenessOf`. In
 * the browser there is no Git history to derive one, so nothing renders at all — which
 * is honest degradation rather than a false all-clear.
 *
 * Direction B of the 2026-08-25 `/design-directions` pass: the map's job here is
 * confirming on arrival, not discovery. Discovery belongs to `maintenance_plan` and the
 * insights Do-Next tab, which already carry it.
 */
export function SummaryFreshnessRow({
  prefixLabel,
  lagLabel,
  actionLabel,
  className,
}: SummaryFreshnessRowProps) {
  return (
    <p
      data-testid="summary-freshness-row"
      className={[
        "flex items-center gap-1.5 text-label text-[color:var(--color-text-tertiary)]",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <History size={ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 truncate">
        {prefixLabel}
        <span aria-hidden="true"> · </span>
        <span className="tabular-nums">{lagLabel}</span>
        <span aria-hidden="true"> · </span>
        {actionLabel}
      </span>
    </p>
  );
}
