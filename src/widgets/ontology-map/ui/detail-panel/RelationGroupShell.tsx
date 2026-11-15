import type { ReactNode } from "react";

export const GROUP_GLYPH_SLOT = "flex size-4 shrink-0 items-center justify-center";
export const GROUP_ROW_LIST = "-mx-2 flex flex-col";

/** A reach group's line on the map; what needs the focus is the only warm line. */
export type ReachLineShape = "needs" | "neededBy";

/** A drawn sample of one map line, in the ink and shape the canvas uses for it (the map's key draws the same). */
function ReachLineSample({ shape }: { shape: ReachLineShape }) {
  const ink = shape === "neededBy" ? "var(--map-graph-reach)" : "var(--map-graph-arc)";
  return (
    <svg aria-hidden width="20" height="10" viewBox="0 0 20 10" className="shrink-0 overflow-visible" data-reach-sample={shape}>
      <path d="M1 3.3 L19 4.8 L19 5.2 L1 6.7 Z" fill={ink} />
    </svg>
  );
}

/**
 * One reach group: a heading that carries the map's line sample, the words and the number on one
 * line, then its rows. The number is part of the heading, so it reads as the map's count line does.
 */
export function RelationGroupShell({
  groupKey,
  sample,
  label,
  count,
  children,
}: {
  groupKey: string;
  /** Null where the map draws no line of this group for the selection (an element, a document). */
  sample: ReachLineShape | null;
  label: string;
  count: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col" data-datasheet-group={groupKey}>
      <div className="flex min-h-7 items-center gap-2">
        {sample ? <ReachLineSample shape={sample} /> : null}
        <span className="min-w-0 truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--map-panel-text-secondary)]">
          {label}
        </span>
        <span
          data-datasheet-group-total={groupKey}
          className="shrink-0 text-body font-[var(--font-weight-emphasis)] tabular-nums text-[color:var(--map-panel-text-primary)]"
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}
