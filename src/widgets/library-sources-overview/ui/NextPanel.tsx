"use client";

import type { CSSProperties, ReactNode } from "react";
import type { useTranslations } from "next-intl";

import type { LibrarySourceRow } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";
import { controlClass } from "@/shared/ui/control-class";
import { Sheet } from "@/shared/ui/marks/sheet";

import { SOURCE_STATE_INK, type SourceState } from "../model/source-states";

/** The panel lists at most this many files: the write button's batch, or a picked row's first ones. */
export const PANEL_LIST_ROWS = 10;
const PANEL_ROW_PX = 48;

type LibraryT = ReturnType<typeof useTranslations<"library">>;

/** A state as a word on its own ink; no wiki page wears a hairline, since text never wears its grey. */
export function SourceStateWord({ state, t }: { state: SourceState; t: LibraryT }) {
  const none = state === "not-compiled";
  const ink = SOURCE_STATE_INK[state];
  return (
    <span
      data-testid="sources-state-word"
      data-state={state}
      className={badgeClass({ shape: "tag", className: "h-5 whitespace-nowrap border" })}
      style={
        none
          ? { color: "var(--color-text-tertiary)", borderColor: "var(--color-border-strong)" }
          : {
              color: ink,
              backgroundColor: `color-mix(in srgb, ${ink} 12%, transparent)`,
              borderColor: `color-mix(in srgb, ${ink} 34%, transparent)`,
            }
      }
    >
      {t(`sources.state.${state}.label`)}
    </span>
  );
}

/**
 * The right column. With nothing picked it is Next to write: what the band's button does, in the
 * button's own words, then the files it sends next in its order, then how many wait after them. With
 * a row picked it is that row's counts, bar and first waiting files.
 */
export function NextPanel({
  title,
  lead,
  heading,
  files,
  running,
  reserveRows,
  foot,
  clear,
  onOpenSource,
  t,
}: {
  title: string;
  lead: ReactNode;
  /** The picked row's name and bar, above the list. */
  heading: ReactNode | null;
  files: readonly LibrarySourceRow[];
  running: ReadonlySet<string>;
  /** List rows to hold height for while the facts are still arriving. */
  reserveRows: number;
  foot: ReactNode | null;
  clear: { label: string; onClear: () => void } | null;
  onOpenSource: (path: string) => void;
  t: LibraryT;
}) {
  return (
    <aside
      aria-label={title}
      data-testid="sources-panel"
      className="flex w-[clamp(22.5rem,25vw,27.5rem)] flex-none flex-col self-start overflow-hidden @max-[60rem]/overview:order-first @max-[60rem]/overview:w-auto @max-[60rem]/overview:self-stretch rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-5.5 pt-5 pb-4.5"
    >
      <div className="flex h-8 items-center justify-between gap-3">
        <span className="text-label leading-label tracking-[var(--tracking-label)] text-[color:var(--color-text-tertiary)]">{title}</span>
        {clear ? (
          <button
            type="button"
            data-testid="sources-panel-clear"
            onClick={clear.onClear}
            className={controlClass({ shape: "chip", size: "md", tone: "secondary", hoverInk: "strong", hoverSurface: "lift" })}
          >
            {clear.label}
          </button>
        ) : null}
      </div>
      {heading}
      <p className="mt-2.5 text-title leading-title tracking-[var(--tracking-title)] text-pretty font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
        {lead}
      </p>
      {/* In a narrow pane the panel stands above the table, so its list shows three names and scrolls. */}
      <ol
        data-testid="sources-panel-list"
        className="-mx-2 mt-4 flex min-h-[var(--panel-reserve)] flex-col @max-[60rem]/overview:max-h-[calc(var(--panel-row)*3)] @max-[60rem]/overview:min-h-0 @max-[60rem]/overview:overflow-y-auto"
        style={{ "--panel-reserve": `${Math.min(PANEL_LIST_ROWS, reserveRows) * PANEL_ROW_PX}px`, "--panel-row": `${PANEL_ROW_PX}px` } as CSSProperties}
      >
        {files.map((row, i) => {
          const writing = running.has(row.path);
          return (
            <li key={row.path}>
              <button
                type="button"
                data-testid="sources-panel-file"
                data-writing={writing || undefined}
                onClick={() => onOpenSource(row.path)}
                title={row.path}
                className={cn(
                  "flex h-12 w-full min-w-0 items-center gap-3 rounded-card px-2 text-left text-body-lg transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--color-indigo-focus-ring)]",
                  writing ? "bg-[color:var(--color-indigo-accent-a12)] text-[color:var(--color-indigo-text-soft)]" : "text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-overlay-1)]",
                )}
              >
                <span
                  className={cn(
                    "w-4.5 flex-none text-right text-body tabular-nums",
                    writing ? "text-[color:var(--color-text-tertiary)]" : "text-[color:var(--color-text-quaternary)]",
                  )}
                >
                  {i + 1}
                </span>
                <Sheet variant="source" name={row.name} format={row.format} reading={writing} />
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                {writing ? <span className="sr-only">{t("sourcesHome.writing")}</span> : null}
                <SourceStateWord state={row.state} t={t} />
              </button>
            </li>
          );
        })}
      </ol>
      {foot ? <div className="mt-3 flex min-h-5 items-center text-body leading-body text-[color:var(--color-text-tertiary)]">{foot}</div> : null}
    </aside>
  );
}
