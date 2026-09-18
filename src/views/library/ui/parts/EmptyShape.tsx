"use client";

import type { ReactNode } from "react";

/**
 * The shape an empty list will take: one ghost row with the names of its columns, in the
 * quietest ink, inside a dashed edge. It says what will stand here — a name, a cadence, a
 * next time — without pretending anything is loading, which is what three grey bars said.
 * A row with a dashed divider, not a box: the list it stands for is rows, and a box would
 * be one more hand-written card for the static-surface census to count.
 * The words are column names, never sample data, so nothing on it can be mistaken for a
 * round or a collection that exists.
 */
export function EmptyShape({ icon, columns }: { icon: ReactNode; columns: readonly string[] }) {
  return (
    <div className="flex items-center gap-3 border-b border-dashed border-[color:var(--color-divider)] pb-2 text-caption leading-caption text-[color:var(--color-text-quaternary)]">
      <span className="inline-flex flex-none items-center">{icon}</span>
      {columns.map((column, index) => (
        <span key={column} className={index === 0 ? "min-w-0 flex-1 truncate" : "flex-none tabular-nums"}>
          {column}
        </span>
      ))}
    </div>
  );
}
