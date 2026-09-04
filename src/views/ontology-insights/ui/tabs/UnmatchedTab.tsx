"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { EyeOff } from "lucide-react";

import { Link } from "@/i18n/navigation";
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
  /**
   * Introduces the concepts that reached for this name. A prefix rather than a sentence
   * with a slot, because each name after it is its own link to that document.
   */
  askedByPrefix: string;
  writtenUnder: (keys: string) => string;
  dismiss: (name: string) => string;
  /** The inline control beside the count: how many are hidden, and the way back. */
  hiddenMarker: (count: number) => string;
  /** The same fact as a sentence, for the live region only. */
  hiddenNote: (count: number) => string;
  /** Shown while the folder has not been read yet. */
  pending: string;
  /** What this list cannot carry, and why. Sits under the list, not above it. */
  footnote: string;
  emptyTitle: string;
  emptyDescription: string;
}

export interface UnmatchedTabProps {
  board: UnmatchedBoard;
  /**
   * The folder has not been read yet, so the list has **no answer** — which is a
   * different fact from having nothing to say. See the render branch below.
   */
  pending?: boolean;
  onDismiss: (id: string) => void;
  onRestoreAll: () => void;
  /** Where a concept that asked for a missing name is read. */
  sourceHref: (slug: string) => string;
  labels: UnmatchedTabLabels;
}

/** Where focus should land once the board has been rebuilt. */
type PendingFocus = { kind: "row"; id: string } | { kind: "heading" } | { kind: "first" };

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
 *
 * ## Hiding does not move the count, and never strands the keyboard
 *
 * The hidden marker sits **beside the count it qualifies** rather than in a footer,
 * because "2, one of which you are not looking at" is one fact and reading it in two
 * places is reading it twice. Dismissing moves focus to the next row, then the previous,
 * then the heading — a control that deletes itself and leaves focus on `<body>` drops a
 * keyboard user back at the top of the document, which on this page is six tabs away.
 */
export function UnmatchedTab({
  board,
  pending = false,
  onDismiss,
  onRestoreAll,
  sourceHref,
  labels,
}: UnmatchedTabProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const buttonsRef = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const visibleIds = board.rows.map((row) => row.id);

  const registerButton = useCallback((id: string, node: HTMLButtonElement | null) => {
    if (node) buttonsRef.current.set(id, node);
    else buttonsRef.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      const at = visibleIds.indexOf(id);
      const next = visibleIds[at + 1] ?? visibleIds[at - 1] ?? null;
      pendingFocusRef.current = next ? { kind: "row", id: next } : { kind: "heading" };
      onDismiss(id);
    },
    [onDismiss, visibleIds],
  );

  const restore = useCallback(() => {
    pendingFocusRef.current = { kind: "first" };
    onRestoreAll();
  }, [onRestoreAll]);

  // Runs after the rebuilt list is in the DOM; the row that had focus is gone by now.
  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    if (target.kind === "heading") {
      headingRef.current?.focus();
      return;
    }
    const id = target.kind === "first" ? board.rows[0]?.id : target.id;
    const button = id ? buttonsRef.current.get(id) : null;
    (button ?? headingRef.current)?.focus();
  }, [board.rows]);

  /*
   * ⚠️ **"Nothing is missing" and "nothing has been read" are opposite facts.** While the
   * folder's manifest is still null this list has no answer, and the empty state asserts
   * one — the most reassuring sentence on the tab, shown at the one moment it cannot be
   * true. So the page's own reading-state block is drawn instead.
   */
  if (pending) {
    /*
     * A line, not a bordered box. The page frame already draws this tab's boundary, and a
     * hand-written card here would be the first entry in a debt ledger written to stay at
     * zero for new files (`static-card-adoption-ratchet`).
     */
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-body-lg text-[color:var(--color-text-tertiary)]"
      >
        {labels.pending}
      </p>
    );
  }

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
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-[color:var(--color-divider)] pb-2">
          <InsightsSectionTitle
            level={2}
            ref={headingRef}
            tabIndex={-1}
            className="text-label uppercase tracking-[var(--tracking-label)] text-[color:var(--color-text-quaternary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-indigo-a42)]"
          >
            {labels.title}
          </InsightsSectionTitle>
          <span
            data-testid="unmatched-group-count"
            className="font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]"
          >
            {board.totalCount}
          </span>
          {board.dismissedCount > 0 ? (
            <button
              type="button"
              data-testid="unmatched-restore-all"
              onClick={restore}
              className={controlClass({
                shape: "link",
                size: "sm",
                tone: "muted",
                hoverInk: "secondary",
              })}
            >
              {labels.hiddenMarker(board.dismissedCount)}
            </button>
          ) : null}
        </div>

        {board.rows.length > 0 ? (
          <ul className="flex flex-col">
            {board.rows.map((row) => (
              <UnmatchedRowItem
                key={row.id}
                row={row}
                onDismiss={dismiss}
                registerButton={registerButton}
                sourceHref={sourceHref}
                labels={labels}
              />
            ))}
          </ul>
        ) : null}
      </section>

      <div className="flex flex-col gap-1.5 text-label text-[color:var(--color-text-quaternary)]">
        {/*
          One polite announcement for a change that is otherwise silent: the row simply
          stops existing, and the marker beside the count is not where focus went.
        */}
        <p data-testid="unmatched-hidden-note" role="status" aria-live="polite" className="sr-only">
          {board.dismissedCount > 0 ? labels.hiddenNote(board.dismissedCount) : ""}
        </p>
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
  registerButton,
  sourceHref,
  labels,
}: {
  row: UnmatchedRow;
  onDismiss: (id: string) => void;
  registerButton: (id: string, node: HTMLButtonElement | null) => void;
  sourceHref: (slug: string) => string;
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
        {/*
          Every asking concept is a document in this folder, so each name is the way to go
          read why it asked. `buildDocsVaultHref` is the same destination the Do-next rows
          use; the map href is not, because these are slugs and that one takes a graph id.
        */}
        {row.sources.length > 0 ? (
          <span className="min-w-0 text-label text-[color:var(--color-text-quaternary)]">
            {labels.askedByPrefix}{" "}
            {row.sources.map((slug, index) => (
              <span key={slug}>
                {index > 0 ? ", " : null}
                <Link
                  href={sourceHref(slug)}
                  className={controlClass({
                    shape: "link",
                    size: "sm",
                    tone: "muted",
                    hoverInk: "secondary",
                  })}
                >
                  {slug}
                </Link>
              </span>
            ))}
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
        ref={(node) => registerButton(row.id, node)}
        data-testid="unmatched-dismiss"
        aria-label={labels.dismiss(row.name)}
        title={labels.dismiss(row.name)}
        onClick={() => onDismiss(row.id)}
        className={controlClass({
          shape: "icon",
          size: "sm",
          tone: "muted",
          hoverInk: "secondary",
          hoverSurface: "lift",
          className: "flex-none",
        })}
      >
        {/* Hiding is not deleting, and an X says deleting. */}
        <EyeOff size={ICON_SIZE.sm} aria-hidden />
      </button>
    </li>
  );
}
