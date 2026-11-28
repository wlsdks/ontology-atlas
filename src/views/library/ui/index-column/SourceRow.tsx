import type { useTranslations } from "use-intl";
import { FileText } from "lucide-react";

import { formatSourceBytes, sourceFolderOf, type LibrarySourceRow } from "@/entities/docs-vault";
import { passageLabelText } from "@/features/library";
import { cn } from "@/shared/lib/cn";
import { RowButton } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { WorkGlyph } from "@/shared/motion/status-glyphs/WorkGlyph";
import { SOURCE_STATE_INK } from "@/widgets/library-sources-overview";

import { captionWindow } from "../../lib/sources/caption-window";
import type { SourceSearchState } from "../../lib/sources/use-source-search";
import { nameCarriesFormat } from "../../model/sources/source-name-format";
import { IndexGlyph } from "./IndexGlyph";
import { INDEX_ROW_INSET } from "./index-column-layout";

type SourceSearchHit = NonNullable<ReturnType<SourceSearchState["hits"]["get"]>>;

/** One source in the Sources list, with the passage the search found under it when one matched. */
export function SourceRow({
  row,
  rowIndex,
  active,
  hit,
  hitOpen,
  running,
  needle,
  tabIndex,
  onFocusRow,
  onOpen,
  onOpenHit,
  t,
}: {
  row: LibrarySourceRow;
  rowIndex: number;
  /** The reader is showing this source. */
  active: boolean;
  /** The first passage the search found in this file, when a search is typed. */
  hit: SourceSearchHit | undefined;
  /** The reader stands on exactly this hit's passage, not merely on the file. */
  hitOpen: boolean;
  /** The request in flight names this source: it shows running, then its check draws. */
  running: boolean;
  needle: string;
  tabIndex: number;
  onFocusRow: () => void;
  onOpen: () => void;
  onOpenHit: (anchor: string) => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const stateLabel = t(`sources.state.${row.state}.label`);
  const folder = sourceFolderOf(row.path);
  return (
    <li>
      <RowButton
        active={active}
        aria-current={active ? "true" : undefined}
        data-testid={`library-source-${row.path}`}
        data-row-index={rowIndex}
        tabIndex={tabIndex}
        onFocus={onFocusRow}
        onClick={onOpen}
        // The full name first: a 280px column truncates, and the row's hover text is the only place the rest of the name exists.
        title={`${row.name} · ${formatSourceBytes(row.bytes)}\n${t(`sources.state.${row.state}.hint`, {
          pages: row.citedBy.join(", ") || t("sources.state.nobody"),
        })}`}
        hoverSurface="lift"
        hoverInk="strong"
        className={cn("group relative", INDEX_ROW_INSET, active && "bg-[color:var(--color-indigo-a16)]")}
      >
        <IndexGlyph><FileText size={ICON_SIZE.sm} className="opacity-60" aria-hidden /></IndexGlyph>
        <span className="min-w-0 flex-1 truncate">{row.name}</span>
        {/* Copies keep their folders, so two rows may share a name; the folder tells them apart. */}
        {folder ? (
          <span data-testid="library-source-folder" className="max-w-[45%] truncate text-label text-[color:var(--color-text-tertiary)]">
            {folder}
          </span>
        ) : null}
        {nameCarriesFormat(row.name, row.format) ? null : (
          <span
            data-testid="library-source-format"
            className="flex-none font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]"
          >
            {row.format ? row.format.toUpperCase() : t("sources.noFormat")}
          </span>
        )}
        {running ? (
          <span data-testid={`library-source-running-${row.state === "compiled" ? "done" : "running"}`} className="flex flex-none items-center">
            <WorkGlyph phase={row.state === "compiled" ? "done" : "running"} size={ICON_SIZE.sm} />
            <span className="sr-only">{stateLabel}</span>
          </span>
        ) : row.state === "compiled" ? (
          // Done needs no mark: the eye is left to find the rows that wait.
          <span data-testid="library-source-state-compiled" className="sr-only">
            {stateLabel}
          </span>
        ) : (
          // One dot in the ink of the state's segment in the bars above; the word rides in `title`.
          <span
            data-testid={`library-source-state-${row.state}`}
            title={stateLabel}
            className="flex size-4 flex-none items-center justify-center"
          >
            <span aria-hidden className="size-2 rounded-full" style={{ background: SOURCE_STATE_INK[row.state] }} />
            <span className="sr-only">{stateLabel}</span>
          </span>
        )}
      </RowButton>
      {hit ? (
        // `text-label`, not `text-caption`: these are the document's own words (`.claude/rules/design.md`).
        <button
          type="button"
          data-testid={`library-source-hit-${row.path}`}
          // The address this press opens, readable without pressing it.
          data-anchor={hit.anchor}
          onClick={() => onOpenHit(hit.anchor)}
          title={hit.text}
          // `location`, not `page`: the pane is already the page; this says where inside it the reader stands.
          aria-current={hitOpen ? "location" : undefined}
          className={controlClass({
            shape: "row",
            size: "xs",
            tone: "secondary",
            hoverInk: "strong",
            hoverSurface: "lift",
            active: hitOpen,
            // This control rests at 28px while the rows above it are 36.
            className: `atlas-touch-floor w-full ${INDEX_ROW_INSET} pl-8`,
          })}
        >
          {/* Only the address wears the accent link ink; tinting the quoted line would dress the file's own words as a control. */}
          <span className="flex-none font-mono text-caption tabular-nums text-[color:var(--color-indigo-accent)]">
            {passageLabelText(hit.label, hit.anchor, t)}
          </span>
          <span className="min-w-0 flex-1 truncate text-left">
            {captionWindow(hit.text, needle)}
          </span>
        </button>
      ) : null}
    </li>
  );
}
