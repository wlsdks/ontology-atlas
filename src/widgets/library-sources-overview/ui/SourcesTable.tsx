"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FileText, Folder } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import type { SourceSort, SourceSortColumn, SourceTableRow } from "../model/table-rows";

/** Row, header and `more` line heights in px; the windowing and the fit read them, so they stay fixed. */
export const ROW_PX = 48;
export const HEADER_PX = 36;
export const MORE_PX = 40;
const UNMEASURED_ROWS = 12;
/** Rows kept above and below the viewport. */
const OVERSCAN_ROWS = 6;

/** The columns, and the container width under which the latest-page column steps aside. */
export const TABLE_GRID =
  "grid grid-cols-[minmax(9.5rem,1.3fr)_4.5rem_minmax(10.5rem,2fr)_5.25rem] @min-[52rem]:grid-cols-[minmax(10.5rem,1.35fr)_5.25rem_minmax(13.75rem,2.1fr)_6rem_7.5rem]";

export interface SourcesTableColumn {
  column: SourceSortColumn;
  label: string;
  align: "start" | "end";
  /** Hidden when the table is narrow. */
  wideOnly?: boolean;
}

export interface SourcesTableRowView {
  row: SourceTableRow;
  name: string;
  /** The full name for `title`, when the shown one may be cut. */
  fullName: string;
  sub: string | null;
  icon: "folder" | "file";
  writing: boolean;
  writingTitle: string;
  aria: string;
  latest: string;
  bar: ReactNode;
}

/**
 * The breakdown table: a fixed header of sort buttons over a scrolling body of 48px rows, of which
 * only those in view (plus `OVERSCAN_ROWS`) exist. The body is as tall as its rows, or as many whole
 * rows as `availablePx` holds with a `more` line under them, so no row is ever cut in half.
 */
export function SourcesTable({
  views,
  columns,
  sort,
  onSort,
  sortTitle,
  pickedKey,
  onPress,
  availablePx,
  moreText,
  glide,
  holdFit,
  label,
}: {
  views: readonly SourcesTableRowView[];
  columns: readonly SourcesTableColumn[];
  sort: SourceSort;
  onSort: (column: SourceSortColumn) => void;
  sortTitle: (label: string) => string;
  pickedKey: string | null;
  onPress: (row: SourceTableRow) => void;
  availablePx: number | null;
  moreText: (count: number) => string;
  /** Row keys and their places before the last re-sort, while the rows glide from them. */
  glide: ReadonlyMap<string, number> | null;
  /** Hold the full height while rows are still arriving, so what sits below does not move. */
  holdFit: boolean;
  label: string;
}) {
  const count = views.length;
  // Before the column is measured, a first paint draws no more rows than a pane holds.
  const space = availablePx ?? HEADER_PX + MORE_PX + UNMEASURED_ROWS * ROW_PX;
  const overflows = holdFit || HEADER_PX + count * ROW_PX > space;
  const shownRows = overflows ? Math.max(1, Math.floor((space - HEADER_PX - MORE_PX) / ROW_PX)) : count;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller && scroller.scrollTop > Math.max(0, count * ROW_PX - shownRows * ROW_PX)) setScrollTop(scroller.scrollTop);
  }, [count, shownRows]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN_ROWS);
  const last = Math.min(count, Math.ceil((scrollTop + shownRows * ROW_PX) / ROW_PX) + OVERSCAN_ROWS);
  const below = Math.max(0, count - Math.floor((scrollTop + shownRows * ROW_PX + 1) / ROW_PX));

  return (
    <div role="table" aria-label={label} aria-rowcount={count + 1} data-testid="sources-table" className="flex min-h-0 flex-none flex-col border-t border-[color:var(--color-divider)]">
      <div role="rowgroup">
        <div role="row" aria-rowindex={1} className={cn(TABLE_GRID, "h-9 border-b border-[color:var(--color-divider)]")}>
          {columns.map(({ column, label: columnLabel, align, wideOnly }) => {
            const sorted = sort.column === column;
            return (
              <div
                key={column}
                role="columnheader"
                aria-sort={sorted ? sort.direction : "none"}
                className={cn("flex min-w-0 items-center px-2", align === "end" ? "justify-end" : "justify-start", wideOnly && "@max-[52rem]:hidden")}
              >
                <button
                  type="button"
                  data-testid={`sources-sort-${column}`}
                  title={sortTitle(columnLabel)}
                  onClick={() => onSort(column)}
                  className={controlClass({
                    shape: "segment",
                    size: "md",
                    tone: sorted ? "default" : "muted",
                    hoverInk: "strong",
                    hoverSurface: "lift",
                    // A right-aligned label may run left over the empty header beside it; it never wraps.
                    className: cn("gap-1 whitespace-nowrap tracking-[var(--tracking-label)]", align === "end" ? "flex-none" : "min-w-0"),
                  })}
                >
                  <span className={align === "end" ? undefined : "truncate"}>{columnLabel}</span>
                  {/* The order it is sorted in; an arrow here carries the direction. */}
                  {sorted ? (
                    <span aria-hidden className="w-2.5 flex-none text-center text-[color:var(--color-text-secondary)]">
                      {sort.direction === "ascending" ? "↑" : "↓"}
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div
        ref={scrollerRef}
        role="rowgroup"
        data-testid="sources-table-body"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        className="relative overflow-y-auto overscroll-contain [scrollbar-width:thin]"
        style={{ height: shownRows * ROW_PX }}
      >
        <div className="relative" style={{ height: count * ROW_PX }}>
          {inDomOrder(views, first, last, glide).map(({ view, index }) => {
            const from = glide?.get(view.row.key);
            return (
              <TableRow
                key={view.row.key}
                view={view}
                index={index}
                picked={pickedKey === view.row.key}
                onPress={onPress}
                gliding={glide !== null}
                risesOver={from !== undefined && from > index}
              />
            );
          })}
        </div>
      </div>
      {overflows ? (
        <p data-testid="sources-table-more" aria-live="off" className="flex h-10 flex-none items-center border-b border-[color:var(--color-border-soft)] px-4 text-body leading-body text-[color:var(--color-text-tertiary)]">
          {below > 0 ? moreText(below) : null}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The rows in view with their places. While rows glide they keep the order they had before the
 * re-sort: React re-inserts a keyed node whose order changed, and a re-inserted node cannot transition.
 */
function inDomOrder(views: readonly SourcesTableRowView[], first: number, last: number, glide: ReadonlyMap<string, number> | null) {
  const slice = views.slice(first, last).map((view, offset) => ({ view, index: first + offset }));
  if (glide === null) return slice;
  const before = (entry: { view: SourcesTableRowView; index: number }) => glide.get(entry.view.row.key) ?? Number.MAX_SAFE_INTEGER;
  return slice.sort((a, b) => before(a) - before(b) || a.index - b.index);
}

function TableRow({
  view,
  index,
  picked,
  onPress,
  gliding,
  risesOver,
}: {
  view: SourcesTableRowView;
  index: number;
  picked: boolean;
  onPress: (row: SourceTableRow) => void;
  gliding: boolean;
  risesOver: boolean;
}) {
  const waiting = view.row.group.waiting;
  const Icon = view.icon === "folder" ? Folder : FileText;
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      data-testid="sources-row"
      data-key={view.row.key}
      data-picked={picked ? "" : undefined}
      className={cn(
        TABLE_GRID,
        "group absolute inset-x-0 top-0 h-12 cursor-pointer border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] text-body-lg tabular-nums text-[color:var(--color-text-secondary)]",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-[color:var(--color-indigo-focus-ring)]",
        gliding && "motion-row-glide",
        risesOver && "z-[2]",
      )}
      style={{ translate: `0 ${index * ROW_PX}px` }}
      // The whole row takes the pointer; the name's button carries focus, the key press and the name.
      onClick={() => onPress(view.row)}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 transition-colors",
          picked ? "bg-[color:var(--color-overlay-2)]" : "group-hover:bg-[color:var(--color-overlay-1)]",
        )}
      />
      <div role="cell" className="relative flex min-w-0 items-center px-4">
        <button
          type="button"
          aria-label={view.aria}
          aria-pressed={picked}
          title={view.fullName}
          className="flex min-w-0 items-center gap-2.5 font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] outline-none"
        >
          <Icon size={ICON_SIZE.lg} aria-hidden className="flex-none text-[color:var(--color-text-quaternary)]" />
          {/* The range beside a shared row gives way before the name does, and leaves a narrow table. */}
          <span className="min-w-0 truncate">{view.name}</span>
          {view.sub ? <span className="min-w-0 shrink-[100] truncate text-body @max-[52rem]:hidden font-normal text-[color:var(--color-text-tertiary)]">{view.sub}</span> : null}
          {view.writing ? <span className="motion-writing-dot" title={view.writingTitle} data-testid="sources-row-writing" /> : null}
        </button>
      </div>
      <div role="cell" className="relative flex items-center justify-end px-4">
        {view.row.group.total.toLocaleString()}
      </div>
      <div role="cell" className="relative flex min-w-0 items-center px-4">
        {view.bar}
      </div>
      <div role="cell" className={cn("relative flex items-center justify-end px-4", waiting === 0 && "text-[color:var(--color-text-quaternary)]")}>
        {waiting.toLocaleString()}
      </div>
      <div role="cell" className="relative flex items-center justify-end px-4 text-[color:var(--color-text-tertiary)] @max-[52rem]:hidden">
        {view.latest}
      </div>
    </div>
  );
}
