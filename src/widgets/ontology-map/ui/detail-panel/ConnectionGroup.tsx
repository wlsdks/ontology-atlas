import type { Dispatch, SetStateAction } from "react";
import {
  V2_CONTAINS_SUMMARY_THRESHOLD,
  type V2ConnectionGroupView,
  type V2DatasheetConnection,
} from "./map-datasheet";
import { controlClass, RowButton } from "@/shared/ui";
import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";
import { GROUP_GLYPH_SLOT, GROUP_ROW_LIST, RelationGroupShell } from "./RelationGroupShell";
import type { OntologyMapDetailPanelLabels, OntologyMapDetailPanelProps } from "./types";

// Group headers reuse the SAME i18n stems as the metric line
// (`labels.metricUsedBy`/`labels.metricDependsOn`) — the header count and
// the metric count are the same number (see `OntologyMapDetailPanel.tsx`), so the words must
// match too, or the reconciliation reads as a coincidence instead of a
// guarantee.
export function ConnectionGroup({
  group,
  dir,
  label,
  help,
  view,
  labels,
  onSelectConnection,
  onHoverConnection,
  showAllContains,
  setShowAllContains,
  expandedGroups,
  setExpandedGroups,
}: {
  group: "contains" | "usedBy" | "dependsOn" | "belongsTo";
  dir: "contains" | "usedBy" | "dependsOn" | "belongsTo";
  label: string;
  help: string | undefined;
  view: V2ConnectionGroupView;
  labels: OntologyMapDetailPanelLabels;
  onSelectConnection: OntologyMapDetailPanelProps["onSelectConnection"];
  onHoverConnection: OntologyMapDetailPanelProps["onHoverConnection"];
  showAllContains: boolean;
  setShowAllContains: Dispatch<SetStateAction<boolean>>;
  expandedGroups: ReadonlySet<string>;
  setExpandedGroups: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  if (view.total === 0) return null;
  const expanded = expandedGroups.has(group);
  const shownRows = expanded ? (view.allRows ?? view.rows) : view.rows;
  const overflow = view.total - view.rows.length;
  // S2 part 3 — a long "contains" defaults to the path-prefix summary, with
  // "View all" for the list. B4 (H1) — when the summary collapses into one
  // "Other" lump (`usable=false`), the summary is skipped and the individual list
  // renders instead (avoiding zero information).
  const useSummary =
    group === "contains" &&
    view.summary !== undefined &&
    view.summary.usable &&
    view.total > V2_CONTAINS_SUMMARY_THRESHOLD &&
    !showAllContains;
  const summaryToggle =
    group === "contains" &&
    view.summary !== undefined &&
    view.summary.usable &&
    view.total > V2_CONTAINS_SUMMARY_THRESHOLD ? (
      <button
        type="button"
        onClick={() => setShowAllContains((v) => !v)}
        data-testid="map-contains-summary-toggle"
        className={controlClass({
          shape: "link",
          size: "md",
          className:
            "ml-auto shrink-0 text-[color:var(--map-panel-text-tertiary)] hover:text-[color:var(--map-panel-text-secondary)] active:text-[color:var(--map-panel-text-primary)]",
        })}
      >
        {showAllContains ? labels.containsShowSummary : labels.containsShowAll}
      </button>
    ) : undefined;
  return (
    <RelationGroupShell
      groupKey={group}
      dir={dir}
      label={label}
      help={help}
      count={view.total}
      headerExtra={summaryToggle}
    >
      {useSummary && view.summary ? (
        <ul className={`${GROUP_ROW_LIST} gap-0.5`} data-testid="map-contains-summary">
          {view.summary.groups.map((g) => (
            <li
              key={`contains-summary:${g.key}`}
              className="flex items-center gap-2 px-2.5 py-1"
            >
              <span aria-hidden className={GROUP_GLYPH_SLOT} />
              <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--map-panel-text-secondary)]">
                {g.key}
              </span>
              <span className="shrink-0 font-mono text-label text-[color:var(--map-panel-text-quaternary)]">
                {g.count}
              </span>
            </li>
          ))}
          {view.summary.otherCount > 0 ? (
            <li className="flex items-center gap-2 px-2.5 py-1">
              <span aria-hidden className={GROUP_GLYPH_SLOT} />
              <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--map-panel-text-tertiary)]">
                {labels.containsOtherGroup}
              </span>
              <span className="shrink-0 font-mono text-label text-[color:var(--map-panel-text-quaternary)]">
                {view.summary.otherCount}
              </span>
            </li>
          ) : null}
        </ul>
      ) : (
        <ul className={GROUP_ROW_LIST}>
          {shownRows.map((row: V2DatasheetConnection) => (
            <li key={`${group}:${row.id}`}>
              <RowButton
                size="md"
                onClick={() => onSelectConnection(row.id)}
                onPointerEnter={() => onHoverConnection?.(row.id)}
                onPointerLeave={() => onHoverConnection?.(null)}
                data-datasheet-connection={row.id}
                className="rounded-chip hover:bg-[color:var(--map-panel-row-hover)] active:bg-[color:var(--map-panel-row-active)]"
              >
                <span className={GROUP_GLYPH_SLOT}>
                  <OntologyMapKindGlyph kind={row.kind} />
                </span>
                <span className="min-w-0 flex-1 truncate text-body text-[color:var(--map-panel-text-secondary)]">
                  {row.title}
                </span>
              </RowButton>
            </li>
          ))}
          {overflow > 0 ? (
            <li>
              <RowButton
                size="md"
                aria-expanded={expanded}
                data-datasheet-group-overflow={group}
                data-testid={`map-group-more-${group}`}
                onClick={() =>
                  setExpandedGroups((current) => {
                    const next = new Set(current);
                    if (next.has(group)) next.delete(group);
                    else next.add(group);
                    return next;
                  })
                }
                className="rounded-chip hover:bg-[color:var(--map-panel-row-hover)] active:bg-[color:var(--map-panel-row-active)]"
              >
                <span aria-hidden className={GROUP_GLYPH_SLOT} />
                <span className="min-w-0 flex-1 truncate text-label text-[color:var(--map-panel-text-tertiary)]">
                  {expanded ? (
                    labels.groupShowFewer
                  ) : (
                    <>
                      <span className="tabular-nums">+{overflow}</span> {labels.groupShowMore}
                    </>
                  )}
                </span>
              </RowButton>
            </li>
          ) : null}
        </ul>
      )}
    </RelationGroupShell>
  );
}
