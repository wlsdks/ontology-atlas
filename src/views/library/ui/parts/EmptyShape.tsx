"use client";

import type { ReactNode } from "react";

/**
 * The shape an empty list will take: one ghost row with the names of its columns, in the
 * quietest ink, inside a dashed edge. It says what will stand here — a name, a cadence, a
 * next time — without pretending anything is loading, which is what three grey bars said.
 * The words are column names, never sample data, so nothing on it can be mistaken for a
 * round or a collection that exists.
 */
export function EmptyShape({ icon, columns }: { icon: ReactNode; columns: readonly string[] }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-dashed border-[color:var(--color-divider)] px-3 py-2 text-caption leading-caption text-[color:var(--color-text-quaternary)]">
      <span className="inline-flex flex-none items-center [&>svg]:size-3.5">{icon}</span>
      {columns.map((column, index) => (
        <span key={column} className={index === 0 ? "min-w-0 flex-1 truncate" : "flex-none tabular-nums"}>
          {column}
        </span>
      ))}
    </div>
  );
}
