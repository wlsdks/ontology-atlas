"use client";

import { X } from "lucide-react";

import { EmptyState } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { controlClass } from "@/shared/ui/control-class";
import type { UnmatchedBoard, UnmatchedRow, UnmatchedRowKind } from "../../lib/unmatched-board";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";

export interface UnmatchedTabLabels {
  title: string;
  /** One sentence saying where these rows come from and what the screen refuses to claim. */
  caption: string;
  kindTitle: (kind: UnmatchedRowKind) => string;
  kindCaption: (kind: UnmatchedRowKind) => string;
  /** `×3` beside a name — how many references asked for it. */
  occurrences: (count: number) => string;
  /** Which concepts reached for this name. */
  askedBy: (names: string) => string;
  /** The domain that names a concept without being named back. */
  shouldHold: (names: string) => string;
  writtenUnder: (keys: string) => string;
  dismiss: (name: string) => string;
  restoreAll: (count: number) => string;
  hiddenNote: (count: number) => string;
  emptyTitle: string;
  emptyDescription: string;
}

export interface UnmatchedTabProps {
  board: UnmatchedBoard;
  onDismiss: (id: string) => void;
  onRestoreAll: () => void;
  labels: UnmatchedTabLabels;
}

/** The order the groups are read in: a missing concept outranks a one-sided link. */
const GROUP_ORDER: readonly UnmatchedRowKind[] = [
  "unresolved-reference",
  "missing-containment",
  "unassigned-node",
];

/**
 * **What agents asked this vault for and did not get** — one standing place with counts.
 *
 * `unmatched-board.ts` owns which three facts qualify and why a fourth (the relation type
 * an agent invented) cannot be listed: that refusal never reaches disk. This file only
 * draws them.
 *
 * The count is the point of the screen. A name three separate nodes reached for is a
 * concept this ontology is missing, and one reached for once is probably a typo — the
 * two need different work, and only the number separates them. So the number sits in the
 * row, not in a tooltip.
 *
 * **Dismiss hides, and says so.** The group counts and the tab badge keep reporting what
 * the vault says; the footer states how many rows this viewer chose not to look at, with
 * one control to bring them all back. A dismissal that silently shrank the count would
 * make the board agree with whoever last clicked instead of with the folder.
 */
export function UnmatchedTab({ board, onDismiss, onRestoreAll, labels }: UnmatchedTabProps) {
  if (board.totalCount === 0) {
    return (
      <EmptyState
        tone="solid"
        align="center"
        title={labels.emptyTitle}
        description={labels.emptyDescription}
      />
    );
  }

  const groups = GROUP_ORDER.map((kind) => ({
    kind,
    total: board.counts[kind],
    rows: board.rows.filter((row) => row.kind === kind),
  })).filter((group) => group.total > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--card-gap)]">
      <p className="max-w-3xl text-body text-[color:var(--color-text-tertiary)]">
        {labels.caption}
      </p>

      {groups.map((group) => (
        <section
          key={group.kind}
          data-testid="unmatched-group"
          data-unmatched-kind={group.kind}
          className="flex min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
        >
          <div className="flex items-baseline gap-2">
            <InsightsSectionTitle
              level={2}
              className="text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
            >
              {labels.kindTitle(group.kind)}
            </InsightsSectionTitle>
            <span
              data-testid="unmatched-group-count"
              className="font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]"
            >
              {group.total}
            </span>
          </div>
          <p className="mt-1 text-label text-[color:var(--color-text-quaternary)]">
            {labels.kindCaption(group.kind)}
          </p>

          <ul className="mt-3 flex flex-col gap-1.5">
            {group.rows.map((row) => (
              <UnmatchedRowItem
                key={row.id}
                row={row}
                onDismiss={onDismiss}
                labels={labels}
              />
            ))}
          </ul>
        </section>
      ))}

      {board.dismissedCount > 0 ? (
        <p
          data-testid="unmatched-hidden-note"
          className="flex flex-wrap items-center gap-2 text-label text-[color:var(--color-text-quaternary)]"
        >
          {labels.hiddenNote(board.dismissedCount)}
          <button
            type="button"
            data-testid="unmatched-restore-all"
            onClick={onRestoreAll}
            className={controlClass({ shape: "link", size: "sm", tone: "muted", hoverInk: "secondary" })}
          >
            {labels.restoreAll(board.dismissedCount)}
          </button>
        </p>
      ) : null}
    </div>
  );
}

function UnmatchedRowItem({
  row,
  onDismiss,
  labels,
}: {
  row: UnmatchedRow;
  onDismiss: (id: string) => void;
  labels: UnmatchedTabLabels;
}) {
  return (
    <li
      data-testid="unmatched-row"
      data-unmatched-id={row.id}
      className="flex items-start gap-2 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2.5 py-2"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate font-mono text-label text-[color:var(--color-text-secondary)]">
            {row.name}
          </span>
          {row.count > 1 ? (
            <span
              data-testid="unmatched-row-count"
              /*
               * ⚠️ This was `text-caption` (9.5px) — the smallest step in the app on the
               * one value the screen exists to carry. A name three concepts reached for
               * is a concept to write; a name reached for once is probably a typo, and
               * only this number separates them. Measured 2026-09-05: it read as a
               * footnote beside the name it qualifies, so it moved up one step to match
               * the group count.
               */
              className="flex-none font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]"
            >
              {labels.occurrences(row.count)}
            </span>
          ) : null}
        </div>
        {row.sources.length > 0 ? (
          <span className="truncate text-caption text-[color:var(--color-text-quaternary)]">
            {row.kind === "missing-containment"
              ? labels.shouldHold(row.sources.join(", "))
              : labels.askedBy(row.sources.join(", "))}
          </span>
        ) : null}
        {row.relations.length > 0 ? (
          <span className="truncate text-caption text-[color:var(--color-text-quaternary)]">
            {labels.writtenUnder(row.relations.join(", "))}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        data-testid="unmatched-dismiss"
        aria-label={labels.dismiss(row.name)}
        title={labels.dismiss(row.name)}
        onClick={() => onDismiss(row.id)}
        className={controlClass({
          shape: "icon",
          size: "sm",
          tone: "muted",
          hoverInk: "secondary",
          className: "flex-none",
        })}
      >
        <X size={ICON_SIZE.sm} aria-hidden />
      </button>
    </li>
  );
}
