import type { ReactNode } from "react";
import type { useTranslations } from "use-intl";
import { ListFilter } from "lucide-react";

import { Input } from "@/shared/ui/fields/input";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import type { SourceSearchState } from "../../lib/sources/use-source-search";
import { IndexGlyph } from "./IndexGlyph";
import { INDEX_TEXT_LINE } from "./index-column-layout";

/**
 * One field that filters whichever list the switch shows, with the line under it saying what
 * matched. The count is provisional while files arrive and the reading line replaces it.
 */
export function IndexSearchField({
  query,
  onQueryChange,
  needle,
  search,
  readingShown,
  sourceMatchCount,
  pageMatchCount,
  hosted,
  trailing,
  t,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  needle: string;
  search: Pick<SourceSearchState, "phase" | "readCount" | "plannedCount" | "capped" | "passageCount">;
  /** The reading sentence waited long enough to be worth reading. */
  readingShown: boolean;
  sourceMatchCount: number;
  pageMatchCount: number;
  /** The column's head holds the field, so its own padding gives way. */
  hosted: boolean;
  trailing: ReactNode;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  return (
    <div className={hosted ? "flex min-w-0 flex-1 flex-col gap-1" : "flex flex-none flex-col gap-1 px-3 pb-2"}>
      <div className="flex min-w-0 items-center gap-1.5">
        {/* The box is drawn here with the chips' edge, inset and slot, and the field inside is `bare`. The slot holds a
           filter mark since the magnifier belongs to Find documents. A `div`, not a `label`. */}
        <div data-testid="library-search-box" className="atlas-touch-floor flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 transition-colors focus-within:border-[color:var(--color-indigo-focus-ring)]">
          <IndexGlyph>
            <ListFilter size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
          </IndexGlyph>
          <Input
            data-testid="library-search"
            frame="bare"
            className="min-w-0 flex-1"
            type="search"
            aria-label={t("search.placeholder")}
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        {trailing}
      </div>
      {/* Always present, even empty: appearing would push the list on the first keystroke. One line is reserved
         through `--leading-caption`; hosted in the head, the head drops its bottom padding so the reserve is the
         whole gap. */}
      <p
        data-testid="library-search-matches"
        data-phase={search.phase}
        data-reading-shown={readingShown ? "true" : "false"}
        // Polite: the count settling as files land should be heard once it has, not on every published file.
        aria-live="polite"
        className={`min-h-[var(--leading-caption)] text-caption text-[color:var(--color-text-quaternary)] ${INDEX_TEXT_LINE}`}
      >
        <IndexGlyph />
        {!needle ? null : search.phase === "reading" ? (
          // The counter changes once per file, so it rides in an `aria-hidden` span: the live region carries only the stable sentence.
          readingShown ? (
            t.rich("search.reading", {
              read: search.readCount,
              total: search.plannedCount,
              count: (chunks) => <span aria-hidden>{chunks}</span>,
            })
          ) : null
        ) : (
          t("search.matches", {
            sources: sourceMatchCount,
            passages: search.passageCount,
            pages: pageMatchCount,
          })
        )}
      </p>
      {/* On its own line so a cap that wraps on one folder and not the next never moves the list for an unchanged fact. */}
      {needle && search.capped ? (
        <p
          data-testid="library-search-capped"
          className={`text-caption text-[color:var(--color-text-quaternary)] [word-break:keep-all] ${INDEX_TEXT_LINE}`}
        >
          <IndexGlyph />
          {t("search.capped", { count: search.plannedCount })}
        </p>
      ) : null}
    </div>
  );
}
