"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useCallback } from "react";
import { X } from "lucide-react";
import { isContainmentRelation } from "@/shared/lib/ontology-tree";
import {
  formatV2MetricLine,
  type V2ConnectionGroupsView,
  type V2ConnectionGroupView,
  type V2DatasheetConnection,
  type V2MetricValues,
} from "./topology-v2-datasheet";
import { TopologyV2KindGlyph, TopologyV2TraceMark } from "@/shared/ui/topology-v2-kind-glyph";

/**
 * topology-map-v2 "component datasheet" node panel
 * (`docs/TOPOLOGY-V2-DESIGN.md` §5). Rendered ONLY when the
 * `atlas:feature:topology-map-v2` flag is on — the flag-off path keeps the
 * shared `TopologyNodePopover` byte-identical, so the Sigma engine is
 * untouched (lead design decision). Re-presents the SAME selection facts the
 * shared popover derives, at instrument density: a kind-shape miniature +
 * power dot header, ONE engraved metric line (no triplication), connections
 * grouped by relation type with a canvas-matching trace mini-line (no badge
 * pile), and an agent-handoff copy row.
 *
 * FSD: this widget owns its own prop shape — the view (`HomePage`) maps
 * `TopologyNodeFocusModel` into these props, so the import direction stays
 * view → widget. Colors/sizes come from `--topology-v2-panel-*` tokens.
 *
 * R+ 카운트 시맨틱 통일: connection groups are DIRECTION-based (usedBy /
 * dependsOn) — the SAME axis the metric line counts — so the group header's
 * number and the metric line's number are the same number by construction.
 * Group headers reuse `labels.metricUsedBy`/`labels.metricDependsOn` (no
 * separate group-label strings) so the words match too. Relation TYPE
 * (containment vs depends) demotes to a per-row `TraceMark`, one per
 * connection row instead of one per group header.
 */

export interface TopologyV2DetailPanelLabels {
  kindLabel: string;
  poweredOn: string;
  poweredOff: string;
  metricUsedBy: string;
  metricDependsOn: string;
  metricEvidence: string;
  noConnections: string;
  handoff: string;
  close: string;
  /** "전체 상세 →" opt-in link to the A1 full-detail datasheet
   * (`full-detail-a1` widget) — the design gate's details-on-demand step
   * beyond this compact ego popover. */
  openFullDetail: string;
}

export interface TopologyV2DetailPanelProps {
  slug: string;
  title: string;
  kind: string;
  /** "전원" — powered (recently updated / fresh) vs unpowered (quiet). */
  powered: boolean;
  metric: V2MetricValues;
  /** Connections grouped by relation type, each with a capped row preview + the
   * group's true total — so a contains-hub's depends group renders its real
   * count instead of collapsing into a generic overflow. */
  groups: V2ConnectionGroupsView;
  /** Pre-built agent handoff payload; the view owns clipboard + toast. */
  handoffText: string;
  labels: TopologyV2DetailPanelLabels;
  onSelectConnection: (id: string) => void;
  onCopyHandoff: (text: string) => void;
  onClose: () => void;
  /** Opens the A1 full-detail datasheet for this node — details-on-demand
   * opt-in (`.claude/rules/design.md` "풀스크린 드로어는 opt-in"). Omitted
   * hides the link (e.g. read-only embeds). */
  onOpenFullDetail?: () => void;
  className?: string;
}

export function TopologyV2DetailPanel({
  slug,
  title,
  kind,
  powered,
  metric,
  groups,
  handoffText,
  labels,
  onSelectConnection,
  onCopyHandoff,
  onClose,
  onOpenFullDetail,
  className,
}: TopologyV2DetailPanelProps) {
  const metricLine = formatV2MetricLine(metric, {
    usedBy: labels.metricUsedBy,
    dependsOn: labels.metricDependsOn,
    evidence: labels.metricEvidence,
  });
  const hasConnections = groups.usedBy.total > 0 || groups.dependsOn.total > 0;

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  // Group headers reuse the SAME i18n stems as the metric line
  // (`labels.metricUsedBy`/`labels.metricDependsOn`) — the header count and
  // the metric count are the same number (§module doc), so the words must
  // match too, or the reconciliation reads as a coincidence instead of a
  // guarantee.
  const renderGroup = (
    group: "usedBy" | "dependsOn",
    label: string,
    view: V2ConnectionGroupView,
  ) => {
    if (view.total === 0) return null;
    const overflow = view.total - view.rows.length;
    return (
      <div className="flex flex-col gap-1" data-datasheet-group={group}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--topology-v2-panel-text-tertiary)]">
            {label}
          </span>
          <span
            data-datasheet-group-total={group}
            className="font-mono text-[10px] text-[color:var(--topology-v2-panel-text-quaternary)]"
          >
            {view.total}
          </span>
        </div>
        <ul className="flex flex-col">
          {view.rows.map((row: V2DatasheetConnection) => (
            // Neighbor `id` is unique within a direction group post-dedup
            // (`groupV2ConnectionsByDirection`) — the same neighbor can still
            // appear once per group (mutual dependency, item 5 — no
            // cross-group dedup), which is a different `group` prefix.
            <li key={`${group}:${row.id}`}>
              <button
                type="button"
                onClick={() => onSelectConnection(row.id)}
                data-datasheet-connection={row.id}
                className="flex w-full items-center gap-2 rounded-[var(--topology-v2-panel-row-radius)] px-1.5 py-1 text-left transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)]"
              >
                <TopologyV2TraceMark containment={isContainmentRelation(row.relationType)} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--topology-v2-panel-text-secondary)]">
                  {row.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {overflow > 0 ? (
          <span
            data-datasheet-group-overflow={group}
            className="pl-[28px] font-mono text-[10.5px] text-[color:var(--topology-v2-panel-text-quaternary)]"
          >
            +{overflow}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div
      role="group"
      aria-label={title}
      data-testid="topology-v2-detail-panel"
      data-datasheet-density="instrument"
      onKeyDown={handleKeyDown}
      className={[
        "flex w-[var(--topology-v2-panel-width)] flex-col gap-[var(--topology-v2-panel-gap)]",
        "rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)]",
        "bg-[color:var(--topology-v2-panel-surface)] p-[var(--topology-v2-panel-pad)]",
        "shadow-[var(--topology-v2-panel-shadow)]",
        className ?? "",
      ].join(" ")}
    >
      {/* Header — kind miniature + name + power dot + close */}
      <div className="flex items-start gap-2">
        <div className="mt-[1px]">
          <TopologyV2KindGlyph kind={kind} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span
              data-power-state={powered ? "on" : "off"}
              aria-hidden="true"
              className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
              style={{
                backgroundColor: powered
                  ? "var(--topology-v2-panel-power-on)"
                  : "var(--topology-v2-panel-power-off)",
              }}
            />
            <h2 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-[color:var(--topology-v2-panel-text-primary)]">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 pl-[13.5px]">
            <span className="text-[11px] text-[color:var(--topology-v2-panel-text-tertiary)]">
              {labels.kindLabel}
            </span>
            <span className="text-[10px] text-[color:var(--topology-v2-panel-text-quaternary)]">·</span>
            <span className="text-[11px] text-[color:var(--topology-v2-panel-text-quaternary)]">
              {powered ? labels.poweredOn : labels.poweredOff}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          data-testid="topology-v2-detail-panel-close"
          className="-mr-1 -mt-1 shrink-0 rounded-[var(--topology-v2-panel-row-radius)] p-1 text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          <X size={14} />
        </button>
      </div>

      {/* One engraved metric line — no subtitle + boxes triplication */}
      <div
        data-datasheet-metric="engraved"
        className="rounded-[var(--topology-v2-panel-row-radius)] bg-[color:var(--topology-v2-panel-metric-surface)] px-2 py-1.5"
      >
        <span className="font-mono text-[11.5px] tracking-[0.01em] text-[color:var(--topology-v2-panel-metric-text)]">
          {metricLine}
        </span>
      </div>

      {/* Connections grouped by relation type */}
      <div className="flex flex-col gap-2.5">
        {hasConnections ? (
          <>
            {renderGroup("usedBy", labels.metricUsedBy, groups.usedBy)}
            {renderGroup("dependsOn", labels.metricDependsOn, groups.dependsOn)}
          </>
        ) : (
          <span className="text-[11.5px] text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.noConnections}
          </span>
        )}
      </div>

      {/* Agent-handoff row */}
      <div className="flex items-center gap-2 border-t border-[color:var(--topology-v2-panel-divider)] pt-2">
        <button
          type="button"
          onClick={() => onCopyHandoff(handoffText)}
          data-testid="topology-v2-detail-panel-handoff"
          className="flex items-center gap-1.5 rounded-[var(--topology-v2-panel-row-radius)] border border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] px-2 py-1 text-[11px] font-medium text-[color:var(--topology-v2-panel-text-secondary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)]"
        >
          {labels.handoff}
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[color:var(--topology-v2-panel-text-quaternary)]">
          {slug}
        </span>
        {onOpenFullDetail ? (
          <button
            type="button"
            onClick={onOpenFullDetail}
            data-testid="topology-v2-detail-panel-open-full-detail"
            className="shrink-0 text-[11px] text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-secondary)]"
          >
            {labels.openFullDetail}
          </button>
        ) : null}
      </div>
    </div>
  );
}
