"use client";

import {
  TopologyV2KindGlyph,
  TopologyV2TraceMark,
} from "@/shared/ui/topology-v2-kind-glyph";
import type { FullDetailConnectionRow, FullDetailGroups } from "../lib/full-detail-groups";
import { controlClass } from '@/shared/ui/control-class';

/**
 * Full-detail A1 direction groups — FOUR full (uncapped) lists replacing the
 * rejected badge-soup FROM THIS/CONTAINS rows: contains (contains, 2-col grid)
 * / usedBy / dependsOn / belongsTo. Every row
 * carries a per-row trace mark (solid=containment, dashed=depends) and
 * navigates on click (`onSelectNode`) — see
 * `docs/prototypes/detail-a1-datasheet.html`.
 */

export interface FullDetailA1GroupsLabels {
  containsTitle: string;
  containsCaption: string;
  usedByTitle: string;
  usedByCaption: string;
  dependsOnTitle: string;
  dependsOnCaption: string;
  belongsToTitle: string;
  belongsToCaption: string;
  empty: string;
  freshDotTitle: string;
}

function Row({
  row,
  onSelectNode,
  freshDotTitle,
}: {
  row: FullDetailConnectionRow;
  onSelectNode: (id: string) => void;
  freshDotTitle: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectNode(row.id)}
      data-fulldetail-row={row.id}
      className={controlClass({ shape: "chip", className: "flex min-w-0 gap-2 border-transparent px-1.5 py-1 text-left text-body text-[color:var(--topology-v2-panel-text-secondary)] hover:border-[color:var(--topology-v2-panel-text-quaternary)] hover:text-[color:var(--topology-v2-panel-text-primary)]" })}
    >
      <TopologyV2TraceMark containment={row.containment} />
      <TopologyV2KindGlyph kind={row.kind} size={14} />
      <span className="min-w-0 flex-1 truncate">{row.title}</span>
      {row.fresh ? (
        <span
          aria-hidden="true"
          title={freshDotTitle}
          className="h-[5px] w-[5px] shrink-0 rounded-full"
          style={{ backgroundColor: "var(--topology-v2-panel-power-on)" }}
        />
      ) : null}
      {row.childCount > 0 ? (
        <span className="shrink-0 font-mono text-label text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
          {row.childCount}
        </span>
      ) : null}
    </button>
  );
}

function GroupCard({
  title,
  caption,
  total,
  rows,
  emptyLabel,
  freshDotTitle,
  twoColumn,
  onSelectNode,
  dataGroup,
}: {
  title: string;
  caption: string;
  total: number;
  rows: readonly FullDetailConnectionRow[];
  emptyLabel: string;
  freshDotTitle: string;
  twoColumn?: boolean;
  onSelectNode: (id: string) => void;
  dataGroup: string;
}) {
  return (
    <section
      data-fulldetail-group={dataGroup}
      className="rounded-card border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-body font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--topology-v2-panel-text-primary)]">
          {title}
        </span>
        <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--topology-v2-panel-text-quaternary)]">
          {caption}
        </span>
        <span
          data-fulldetail-group-total={dataGroup}
          className="ml-auto font-mono text-body text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
        >
          {total}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-label text-[color:var(--topology-v2-panel-text-tertiary)]">
          {emptyLabel}
        </p>
      ) : (
        <div className={twoColumn ? "grid grid-cols-2 gap-x-4" : "flex flex-col"}>
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              onSelectNode={onSelectNode}
              freshDotTitle={freshDotTitle}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function FullDetailA1GroupsPanel({
  groups,
  labels,
  onSelectNode,
  className,
}: {
  groups: FullDetailGroups;
  labels: FullDetailA1GroupsLabels;
  onSelectNode: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={[
        "grid gap-[22px] md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]",
        className ?? "",
      ].join(" ")}
    >
      <GroupCard
        dataGroup="contains"
        title={labels.containsTitle}
        caption={labels.containsCaption}
        total={groups.contains.total}
        rows={groups.contains.rows}
        emptyLabel={labels.empty}
        freshDotTitle={labels.freshDotTitle}
        twoColumn
        onSelectNode={onSelectNode}
      />
      <div className="flex flex-col gap-4">
        <GroupCard
          dataGroup="used-by"
          title={labels.usedByTitle}
          caption={labels.usedByCaption}
          total={groups.usedBy.total}
          rows={groups.usedBy.rows}
          emptyLabel={labels.empty}
          freshDotTitle={labels.freshDotTitle}
          onSelectNode={onSelectNode}
        />
        <GroupCard
          dataGroup="depends-on"
          title={labels.dependsOnTitle}
          caption={labels.dependsOnCaption}
          total={groups.dependsOn.total}
          rows={groups.dependsOn.rows}
          emptyLabel={labels.empty}
          freshDotTitle={labels.freshDotTitle}
          onSelectNode={onSelectNode}
        />
        <GroupCard
          dataGroup="belongs-to"
          title={labels.belongsToTitle}
          caption={labels.belongsToCaption}
          total={groups.belongsTo.total}
          rows={groups.belongsTo.rows}
          emptyLabel={labels.empty}
          freshDotTitle={labels.freshDotTitle}
          onSelectNode={onSelectNode}
        />
      </div>
    </div>
  );
}
