"use client";

import { History } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

export interface SummaryFreshnessRowProps {
  /** Resolved by the caller via i18n. */
  prefixLabel: string;
  /** Resolved by the caller from `daysBehind` plus i18n (tabular-nums). */
  lagLabel: string;
  /** Resolved by the caller via i18n. */
  actionLabel: string;
  className?: string;
}

/**
 * Says a domain or project description has fallen behind its membership. Plain fact, no colour,
 * motion or fix affordance, because the body is an accepted human judgement. Renders nothing
 * without Git history.
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
