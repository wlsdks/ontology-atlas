"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { EyeOff, Link2 } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { controlClass } from "@/shared/ui/control-class";
import type { UnmatchedBoard, UnmatchedRow } from "../../lib/unmatched-board";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";

export interface UnmatchedTabLabels {
  /** The list's own heading, never the reference product's word for it. */
  title: string;
  /** One sentence saying what a row is. */
  caption: string;
  /** `×N` beside a name — how many references asked for it. */
  occurrences: (count: number) => string;
  /** A prefix rather than a sentence with a slot, because each name after it links to its own document. */
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
  /** The empty state's way on: the map every resolved name belongs to. */
  emptyAction: string;
}

export interface UnmatchedTabProps {
  board: UnmatchedBoard;
  /** The folder has not been read yet, so the list has no answer, which differs from having nothing to say. */
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
 * Names this folder was asked for and does not hold, as one flat list; `unmatched-board.ts` owns which facts qualify.
 * No panel: rows are the content. The count is the heaviest mark, since a name several concepts reached for is a
 * missing concept while one reached for once is likely a typo; `×1` is not drawn. The hidden marker sits beside the
 * count it qualifies. Dismissing moves focus to the next row, then the previous, then the heading, never to `<body>`.
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

  // Runs after the rebuilt list is in the DOM; the row that had focus is gone.
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

  // While the manifest is null the list has no answer, so the reading state shows instead of "nothing is missing".
  if (pending) {
    // A line, not a bordered box: the page frame draws the boundary, and a hand-written card would grow
    // the `static-card-adoption-ratchet` ledger.
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
    // The shared empty-state shape: a glyph, one sentence and the way on (the map every resolved name belongs to),
    // on a fixed floor so the tab reads as answered.
    return (
      <EmptyState
        tone="solid"
        align="center"
        icon={<Link2 aria-hidden />}
        title={labels.emptyTitle}
        description={labels.emptyDescription}
        action={
          <Link
            href="/topology/"
            data-testid="unmatched-empty-action"
            className={controlClass({ shape: "link", tone: "accent", hoverInk: "strong", className: "rounded-chip hover:underline" })}
          >
            {labels.emptyAction}
          </Link>
        }
        className="flex min-h-80 flex-col items-center justify-center"
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
        {/* One polite announcement: the row simply stops existing, and focus went elsewhere. */}
        <p data-testid="unmatched-hidden-note" role="status" aria-live="polite" className="sr-only">
          {board.dismissedCount > 0 ? labels.hiddenNote(board.dismissedCount) : ""}
        </p>
        {/* The limit sits under the list, answering the question the list raises. */}
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
          {/* Below `sm` the slug wraps rather than truncating, since it is the row's whole identity; above `sm` truncation
             keeps the count and hide control on one line. */}
          <span className="min-w-0 font-mono text-body-lg text-[color:var(--color-text-primary)] [overflow-wrap:anywhere] sm:truncate sm:[overflow-wrap:normal]">
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
        {/* Each asking concept is a document here, so its name links to it via `buildDocsVaultHref`, as the Do-next rows do;
           the map href takes a graph id, not a slug. */}
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
        {/* An eye, not an X: hiding is not deleting. */}
        <EyeOff size={ICON_SIZE.sm} aria-hidden />
      </button>
    </li>
  );
}
