"use client";

import { X } from "lucide-react";

import { EmptyState } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { controlClass } from "@/shared/ui/control-class";
import type { UnmatchedBoard, UnmatchedRow } from "../../lib/unmatched-board";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";

export interface UnmatchedTabLabels {
  /** The list's own heading. Never the reference product's word for it. */
  title: string;
  /** One sentence saying what a row is. */
  caption: string;
  /** `×N` beside a name — how many references asked for it. */
  occurrences: (count: number) => string;
  /** Which concepts reached for this name. */
  askedBy: (names: string) => string;
  writtenUnder: (keys: string) => string;
  dismiss: (name: string) => string;
  restoreAll: (count: number) => string;
  hiddenNote: (count: number) => string;
  /** What this list cannot carry, and why. Sits under the list, not above it. */
  footnote: string;
  emptyTitle: string;
  emptyDescription: string;
}

export interface UnmatchedTabProps {
  board: UnmatchedBoard;
  onDismiss: (id: string) => void;
  onRestoreAll: () => void;
  labels: UnmatchedTabLabels;
}

/**
 * **Names this folder was asked for and does not hold** — one flat list.
 *
 * `unmatched-board.ts` owns which fact qualifies, why the two the first draft also
 * carried belong to Do-next instead, and why the relation type an agent invented cannot
 * be listed at all: that refusal never reaches disk. This file only draws the list.
 *
 * ## Why no panel, and why the number is the heaviest mark (council, 2026-09-05)
 *
 * The first draft wrapped each group in a bordered panel and put the count at the
 * smallest step in the app. Both were backwards. There is one question here, so a panel
 * around it is a box drawn around the whole screen — the rows are the content, and they
 * read as rows (`FixRow`'s `border-b … py-2.5`, the idiom this board already uses).
 *
 * And the count is the reason to look: a name three separate concepts reached for is a
 * concept this ontology is missing, while one reached for once is probably a typo. Only
 * the number separates those, so it is the heaviest thing in the row — emphasis weight at
 * body-large beside the name — and `×1` is not drawn at all, because a multiplier that
 * never varies is decoration.
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--card-gap)]">
      <p className="max-w-3xl text-body text-[color:var(--color-text-tertiary)]">
        {labels.caption}
      </p>

      <section data-testid="unmatched-list">
        <div className="flex items-baseline gap-2 border-b border-[color:var(--color-divider)] pb-2">
          <InsightsSectionTitle
            level={2}
            className="text-label uppercase tracking-[var(--tracking-label)] text-[color:var(--color-text-quaternary)]"
          >
            {labels.title}
          </InsightsSectionTitle>
          <span
            data-testid="unmatched-group-count"
            className="font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]"
          >
            {board.totalCount}
          </span>
        </div>

        <ul className="flex flex-col">
          {board.rows.map((row) => (
            <UnmatchedRowItem key={row.id} row={row} onDismiss={onDismiss} labels={labels} />
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-1.5 text-label text-[color:var(--color-text-quaternary)]">
        {board.dismissedCount > 0 ? (
          <p data-testid="unmatched-hidden-note" className="flex flex-wrap items-center gap-2">
            {labels.hiddenNote(board.dismissedCount)}
            <button
              type="button"
              data-testid="unmatched-restore-all"
              onClick={onRestoreAll}
              className={controlClass({
                shape: "link",
                size: "sm",
                tone: "muted",
                hoverInk: "secondary",
              })}
            >
              {labels.restoreAll(board.dismissedCount)}
            </button>
          </p>
        ) : null}
        {/*
          The limit belongs under the list, not in front of it. Read first, it explains a
          screen nobody has seen yet; read after, it answers the question the list raises.
        */}
        <p data-testid="unmatched-footnote" className="max-w-3xl leading-prose">
          {labels.footnote}
        </p>
      </div>
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
      className="flex min-w-0 items-start gap-2 border-b border-[color:var(--color-divider)] py-2.5 last:border-b-0"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate font-mono text-body-lg text-[color:var(--color-text-primary)]">
            {row.name}
          </span>
          {row.count > 1 ? (
            <span
              data-testid="unmatched-row-count"
              className="flex-none font-mono text-body-lg font-[var(--font-weight-emphasis)] tabular-nums text-[color:var(--color-text-primary)]"
            >
              {labels.occurrences(row.count)}
            </span>
          ) : null}
        </div>
        {row.sources.length > 0 ? (
          <span className="truncate text-label text-[color:var(--color-text-quaternary)]">
            {labels.askedBy(row.sources.join(", "))}
          </span>
        ) : null}
        {row.relations.length > 0 ? (
          <span className="truncate text-label text-[color:var(--color-text-quaternary)]">
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
