"use client";

import { ChevronRight } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";

interface TopologyIndexTabLabels {
  /**
   * The panel's own name, from the same message as the expanded header. It was the literal
   * `Index` here, so the Korean screen read 「INDEX」 open and 「Index」 folded. One key now
   * names the panel in both states (a brand word in both locales).
   */
  label?: string;
  expandAria: string;
  agentSyncTitle: string;
}

export interface TopologyIndexTabProps {
  onExpand: () => void;
  labels: TopologyIndexTabLabels;
  className?: string;
}

/**
 * Collapsed INDEX — a slim vertical edge tab (`--topology-index-tab-width`,
 * 26px) at the left edge. Reappears whenever the analysis rail reclaims the
 * left slot too (`slot-ownership.ts`) — clicking it always means "give the
 * slot back to INDEX" (see HomePage wiring comment at the mount site).
 */
export function TopologyIndexTab({ onExpand, labels, className }: TopologyIndexTabProps) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={labels.expandAria}
      data-testid="topology-index-tab"
      className={`flex flex-col items-center gap-2.5 rounded-r-chip border border-l-0 border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] py-2.5 shadow-[var(--map-panel-shadow)] ${className ?? ""}`}
      style={{ width: "var(--topology-index-tab-width)" }}
    >
      <span
        title={labels.agentSyncTitle}
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--map-panel-power-on)]"
      />
      <span
        className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--map-panel-text-tertiary)]"
        style={{ writingMode: "vertical-rl" }}
      >
        {labels.label ?? "Index"}
      </span>
      {/* ChevronRight 13 rather than 9px `›` text — the symmetric pair of the expanded `‹`. */}
      <span aria-hidden="true" className="inline-flex text-[color:var(--map-panel-text-quaternary)]">
        <ChevronRight size={ICON_SIZE.sm} aria-hidden="true" />
      </span>
    </button>
  );
}
