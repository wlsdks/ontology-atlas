"use client";

import type { ReactNode } from "react";

/** Ghost-row widths: different on purpose, so the rows read as a list rather than one repeated bar. */
const GHOST_WIDTHS = ["58%", "42%", "50%"] as const;

/**
 * The shape an empty list will take: one ghost row with the names of its columns, in the
 * quietest ink, inside a dashed edge. It says what will stand here — a name, a cadence, a
 * next time — without pretending anything is loading, which is what three grey bars said.
 * A row with a dashed divider, not a box: the list it stands for is rows, and a box would
 * be one more hand-written card for the static-surface census to count.
 * The words are column names, never sample data, so nothing on it can be mistaken for a
 * round or a collection that exists.
 *
 * `ghostRows` (2026-09-25) draws that many empty rows under the names, at the list's own
 * row height, fading out. The column head alone over an empty pane read as a table that had
 * failed to load; with the rows it reads as a list waiting for its first entry. They carry no
 * words and no shimmer, so they still cannot pass for a round or a wait.
 */
export function EmptyShape({ icon, columns, ghostRows = 0 }: { icon: ReactNode; columns: readonly string[]; ghostRows?: number }) {
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-dashed border-[color:var(--color-divider)] pb-2 text-caption leading-caption text-[color:var(--color-text-quaternary)]">
        <span className="inline-flex flex-none items-center">{icon}</span>
        {columns.map((column, index) => (
          <span key={column} className={index === 0 ? "min-w-0 flex-1 truncate" : "flex-none tabular-nums"}>
            {column}
          </span>
        ))}
      </div>
      {Array.from({ length: ghostRows }, (_, row) => (
        <div
          key={row}
          data-ghost-row={row}
          style={{ opacity: 1 - row * 0.35 }}
          className="flex min-h-10 items-center gap-3 border-b border-dashed border-[color:var(--color-divider)] last:border-b-0"
        >
          <span className="h-3.5 w-3.5 flex-none rounded-full border border-[color:var(--color-border-soft)]" />
          <span className="h-1.5 rounded-full bg-[color:var(--color-overlay-2)]" style={{ width: GHOST_WIDTHS[row % GHOST_WIDTHS.length] }} />
        </div>
      ))}
    </div>
  );
}
