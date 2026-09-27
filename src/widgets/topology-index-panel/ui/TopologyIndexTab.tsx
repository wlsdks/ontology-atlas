"use client";

import { ChevronRight } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";

interface TopologyIndexTabLabels {
  /** The same message key as the expanded header, so both states use one name. */
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
 * Collapsed INDEX: a slim left edge tab (`--topology-index-tab-width`); a click gives the slot back
 * to INDEX.
 */
export function TopologyIndexTab({ onExpand, labels, className }: TopologyIndexTabProps) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={labels.expandAria}
      data-testid="topology-index-tab"
      // Chrome on the map's left edge; map fits keep clear of it
      // (`widgets/ontology-map/interaction/free-area.ts#measureEdgeFitObstacle`).
      data-map-fit-obstacle="left"
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
