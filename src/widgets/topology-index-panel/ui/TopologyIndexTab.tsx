"use client";

export interface TopologyIndexTabLabels {
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
      className={`flex flex-col items-center gap-2.5 rounded-r-[7px] border border-l-0 border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] py-2.5 shadow-[var(--topology-v2-panel-shadow)] ${className ?? ""}`}
      style={{ width: "var(--topology-index-tab-width)" }}
    >
      <span
        title={labels.agentSyncTitle}
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--topology-v2-panel-power-on)]"
      />
      <span
        className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[color:var(--topology-v2-panel-text-tertiary)]"
        style={{ writingMode: "vertical-rl" }}
      >
        Index
      </span>
      <span aria-hidden="true" className="text-[9px] text-[color:var(--topology-v2-panel-text-quaternary)]">
        ›
      </span>
    </button>
  );
}
