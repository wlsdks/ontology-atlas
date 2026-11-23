"use client";

import { ActionFeedbackGlyph, type ActionFeedbackState } from '@/shared/motion/status-glyphs/ActionFeedbackGlyph';
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale, type useTranslations } from "next-intl";

import { CloudDownload, FilePlus2, LayoutDashboard, Search, X } from "lucide-react";

import type { LibrarySourceRow } from "@/entities/docs-vault";
import type { LibraryUiModel, LintFinding } from "@/features/library";
import { cn } from "@/shared/lib/cn";
import { Chip, RowButton, Tooltip } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import {
  readLibraryIndexQuery,
  writeLibraryIndexQuery,
  writeLibraryIndexSegment,
  type LibraryIndexSegment,
} from "@/shared/lib/preferences/library-preferences";
import { useVaultIndexHits } from "@/shared/lib/vault-folder/vault-index/use-vault-index-hits";
import { useRovingRows } from "@/shared/lib/list-rows/use-roving-rows";
import { useWindowedRows } from "@/shared/lib/list-rows/use-windowed-rows";

import { useSourceSearch } from "../../lib/sources/use-source-search";
import { narrowSources, pagesMatching, sourcesMatching } from "../../model/index-column/index-search";
import { wikiDayText } from "../../model/index-column/wiki-day-text";
import { wikiViewValues } from "../../model/index-column/wiki-view-values";
import { INDEX_HOME_ROW_TEST_ID, type IndexHomeRow } from "../../model/index-column/index-home-row";
import { IndexGlyph } from "./IndexGlyph";
import { IndexSearchField } from "./IndexSearchField";
import { INDEX_CHIP_TIP, INDEX_LIST_INSET, INDEX_QUIET_INSET, INDEX_ROW_INSET } from "./index-column-layout";
import { ListNote, OtherSegmentLink } from "./index-list-notes";
import { NewPageControl } from "./NewPageControl";
import { SourceRow } from "./SourceRow";
import { WikiIndex } from "./WikiIndex";
import { WikiViewRows } from "./WikiViewRows";

/** A source row before it is measured: one line of `text-body` in `RowButton` with its inset. */
const SOURCE_ROW_ESTIMATE_PX = 36;
/** Every page the wiki list can show for one query; the app's search command caps at the same. */
const LIBRARY_INDEX_HITS = 5000;
const NO_SOURCES: ReadonlySet<string> = new Set();
const NO_FINDINGS: readonly LintFinding[] = [];
const VIEW_CLOCK_TICK_MS = 60_000;
/** Under this a state is a flicker rather than a message; pinned by `LibrarySection.search.test.tsx`. */
const READING_TEXT_DELAY_MS = 200;

export interface SourceGroupFilter {
  label: string;
  includes: (row: LibrarySourceRow) => boolean;
  onClear: () => void;
}

export interface LibrarySectionProps {
  model: LibraryUiModel;
  /** Where the search field stands when the column's head offers a place for it; this component still owns its state. */
  searchHost?: HTMLElement | null;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /** `anchor` arrives only from a search hit's caption: open this file at this unit, as a pressed citation does. */
  onOpenSource: (row: LibrarySourceRow, anchor?: string) => void;
  /** The source the reader is showing, so the selected row differs from a resting one. */
  selectedSourcePath: string | null;
  /** The anchor the reader stands on, so a caption lights only for a passage opened, not for a file opened plainly. */
  selectedSourceAnchor?: string | null;
  /** The folder walk's own handles, so a search can read the words inside a source. */
  sourceHandles: Map<string, FileSystemFileHandle>;
  /** The open folder's session identity: two browser folders can share a name, so the scope keys the units a search keeps. */
  vaultScope: string;
  /** The installed app's folder path; with it, the wiki list searches inside pages through the index. */
  vaultRootPath?: string | null;
  onAddFiles: () => void;
  addFilesFeedback?: ActionFeedbackState;
  /** Proposes candidates from the open folder and any bound project root. */
  onFindDocuments: () => void;
  /** The third door, because it is the one that reaches outside. */
  onImportFromService: () => void;
  /** Starts a page a person writes by hand, from a title. Null where the folder cannot be written. */
  onNewPage?: ((title: string) => void | Promise<boolean>) | null;
  /** The latest Check wiki's findings, which put pages under "Needs a look"; stable between checks. */
  findings?: readonly LintFinding[];
  /** Wiki pages read so far while the folder is still being read; null once it is read. */
  readingCount?: number | null;
  /** The Check results view: what it holds, whether it is open, and the press that opens it. */
  report?: {
    count: number;
    open: boolean;
    onOpen: () => void;
    /** A check is in flight right now. */
    running?: boolean;
    /** A check finished and this person has not opened the report since. */
    unseen?: boolean;
  } | null;
  /** The first row of either list: the tab's home, and the way out of an open page. */
  home?: IndexHomeRow | null;
  /** The switch above is exclusive: the inactive list renders nothing, so its rows leave the tab order. */
  segment: LibraryIndexSegment;
  busy: boolean;
  /** Sources the Continue request in flight named; their rows show it running, then their check draws. */
  runningSources?: ReadonlySet<string>;
  /** The state the band's press narrows the list to, or null for every source. */
  stateFilter?: LibrarySourceRow["state"] | null;
  /** The folder or file type picked on the Sources home, which narrows the list with a chip. */
  groupFilter?: SourceGroupFilter | null;
  t: ReturnType<typeof useTranslations<"library">>;
}

export function LibrarySection({
  model,
  searchHost = null,
  selectedSlug,
  onSelect,
  onOpenSource,
  selectedSourcePath,
  selectedSourceAnchor = null,
  sourceHandles,
  vaultScope,
  vaultRootPath = null,
  onAddFiles,
  addFilesFeedback = 'idle',
  onFindDocuments,
  onImportFromService,
  onNewPage = null,
  findings = NO_FINDINGS,
  readingCount = null,
  report = null,
  home = null,
  segment,
  busy,
  runningSources = NO_SOURCES,
  stateFilter = null,
  groupFilter = null,
  t,
}: LibrarySectionProps) {
  const [query, setQuery] = useState(() => readLibraryIndexQuery(vaultScope));
  const changeQuery = (next: string) => {
    setQuery(next);
    writeLibraryIndexQuery(vaultScope, next);
  };
  const needle = query.trim().toLowerCase();
  const search = useSourceSearch({
    sources: model.sources,
    sourceHandles,
    vaultScope,
    needle,
    enabled: true,
  });
  const { hits: indexHits } = useVaultIndexHits({ rootPath: vaultRootPath, query: needle, limit: LIBRARY_INDEX_HITS });
  const indexedPaths = useMemo(() => (indexHits ? new Set(indexHits.map((hit) => hit.path)) : null), [indexHits]);
  // The reading sentence waits for `READING_TEXT_DELAY_MS`: a small folder is read in a few frames, which would flash a sentence nobody can read.
  const [readingHeld, setReadingHeld] = useState<string | null>(null);
  useEffect(() => {
    if (search.phase !== "reading") return;
    const timer = window.setTimeout(() => setReadingHeld(needle), READING_TEXT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [needle, search.phase]);
  // Names which query waited long enough, so a phase or query change makes it false without a second `setState` in an effect.
  const readingShown = search.phase === "reading" && readingHeld === needle;
  // Memoised on what the list is made of: a new array identity every render would re-fire the scroll-to-open-file effect below.
  const visibleSources = useMemo(
    () => sourcesMatching(model.sources, needle, { phase: search.phase, hits: search.hits, read: search.read }, indexedPaths),
    [indexedPaths, model.sources, needle, search.hits, search.phase, search.read],
  );
  const listedSources = useMemo(
    () => narrowSources(visibleSources, stateFilter, groupFilter),
    [groupFilter, stateFilter, visibleSources],
  );
  const [sourceWindow, sourceListRef, scrollToSource] = useWindowedRows({ count: listedSources.length, estimate: SOURCE_ROW_ESTIMATE_PX });
  const sourceRoving = useRovingRows({ count: listedSources.length, listRef: sourceListRef, scrollToRow: scrollToSource, rendered: sourceWindow });
  const { onRowFocus: sourceRowFocus } = sourceRoving;
  useEffect(() => {
    if (!selectedSourcePath) return;
    const index = listedSources.findIndex((row) => row.path === selectedSourcePath);
    if (index < 0) return;
    scrollToSource(index);
    sourceRowFocus(index);
  }, [listedSources, scrollToSource, selectedSourcePath, sourceRowFocus]);
  const visiblePages = useMemo(
    () => pagesMatching(model.wikiPages, needle, indexedPaths),
    [indexedPaths, model.wikiPages, needle],
  );
  const hasSources = model.sources.length > 0;
  const locale = useLocale();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), VIEW_CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const searchFieldWith = (trailing: ReactNode) =>
    model.sources.length + model.wikiPages.length > 0 || trailing ? (
      <IndexSearchField
        query={query}
        onQueryChange={changeQuery}
        needle={needle}
        search={search}
        readingShown={readingShown}
        sourceMatchCount={visibleSources.length}
        pageMatchCount={visiblePages.length}
        hosted={searchHost !== null}
        trailing={trailing}
        t={t}
      />
    ) : null;

  if (segment === "sources") {
    const searchField = searchFieldWith(null);
    return (
      // No `min-h-0` and no overflow: the column above owns the one scroller, and a section that could shrink can cut a row in half.
      <section data-testid="library-sources" className={cn("flex flex-col pb-1", searchHost ? "pt-1.5" : "pt-3")}>
        {searchHost && searchField ? createPortal(searchField, searchHost) : searchField}
        {home ? (
          // The Sources list's own row, so the home stands on the same text line as the doors and files under it.
          <div className={`flex flex-col pb-1 ${INDEX_LIST_INSET}`}>
            <RowButton
              data-testid={INDEX_HOME_ROW_TEST_ID}
              active={home.active}
              aria-current={home.active ? "page" : undefined}
              onClick={home.onPress}
              hoverSurface="lift"
              hoverInk="strong"
              className={cn("w-full justify-start", INDEX_ROW_INSET, home.active && "bg-[color:var(--color-indigo-a16)]")}
            >
              <IndexGlyph><LayoutDashboard size={ICON_SIZE.sm} className="opacity-60" aria-hidden /></IndexGlyph>
              <span className="min-w-0 truncate">{home.label}</span>
            </RowButton>
          </div>
        ) : null}
        {/* Three plain rows on the same text line, Add files first; only the current row above wears a container. */}
        <div data-testid="library-source-actions" className="flex flex-col gap-0.5 px-3 pb-2">
          <Tooltip content={t("sources.addTooltip")} {...INDEX_CHIP_TIP}>
            <RowButton
              data-testid="library-add-files"
              aria-busy={addFilesFeedback === 'working' || undefined}
              onClick={onAddFiles}
              disabled={busy}
              size="sm"
              tone="default"
              hoverSurface="lift"
              hoverInk="strong"
              className={cn("w-full justify-start", INDEX_QUIET_INSET)}
            >
              <IndexGlyph><ActionFeedbackGlyph state={addFilesFeedback} icon={<FilePlus2 size={ICON_SIZE.sm} aria-hidden />} size={ICON_SIZE.sm} /></IndexGlyph>
              <span className="min-w-0 truncate">{t("sources.add")}</span>
            </RowButton>
          </Tooltip>
          <Tooltip content={t("sources.findTooltip")} {...INDEX_CHIP_TIP}>
            <RowButton
              data-testid="library-find-documents"
              onClick={(event) => {
                event.currentTarget.focus({ preventScroll: true });
                onFindDocuments();
              }}
              disabled={busy}
              size="sm"
              tone="default"
              hoverSurface="lift"
              hoverInk="strong"
              className={cn("w-full justify-start", INDEX_QUIET_INSET)}
            >
              <IndexGlyph><Search size={ICON_SIZE.sm} aria-hidden /></IndexGlyph>
              <span className="min-w-0 truncate">{t("sources.find")}</span>
            </RowButton>
          </Tooltip>
          <Tooltip content={t("sources.importTooltip")} {...INDEX_CHIP_TIP}>
            <RowButton
              data-testid="library-import-open"
              onClick={(event) => {
                event.currentTarget.focus({ preventScroll: true });
                onImportFromService();
              }}
              disabled={busy}
              size="sm"
              tone="default"
              hoverSurface="lift"
              hoverInk="strong"
              className={cn("w-full justify-start", INDEX_QUIET_INSET)}
            >
              <IndexGlyph><CloudDownload size={ICON_SIZE.sm} aria-hidden /></IndexGlyph>
              <span className="min-w-0 truncate">{t("sources.import")}</span>
            </RowButton>
          </Tooltip>
        </div>

        {hasSources ? (
          <>
            {groupFilter ? (
              <div data-testid="library-source-list-head" className={`flex h-7 items-center gap-2 ${INDEX_LIST_INSET}`}>
                <Chip
                  data-testid="library-source-group-chip"
                  onClick={groupFilter.onClear}
                  title={t("sourcesHome.panel.clear")}
                  aria-label={`${groupFilter.label} · ${t("sourcesHome.panel.clear")}`}
                  tone="muted"
                  className="min-w-0 max-w-full gap-1 hover:text-[color:var(--color-text-primary)]"
                >
                  <span className="min-w-0 truncate">{groupFilter.label}</span>
                  <X size={ICON_SIZE.sm} aria-hidden className="flex-none" />
                </Chip>
              </div>
            ) : null}
            <ul
              ref={sourceListRef}
              onKeyDown={sourceRoving.onKeyDown}
              data-testid="library-source-list"
              data-state-filter={stateFilter ?? undefined}
              // The phase that drew the list, so a proof can assert a finished answer and an unfinished read never share a frame.
              data-phase={search.phase}
              data-window={`${sourceWindow.start}-${sourceWindow.end}`}
              aria-label={t("sources.listAria")}
              className={`flex flex-col gap-0.5 ${INDEX_LIST_INSET}`}
              // Only the rows in view are in the DOM (`useWindowedRows`); the pads stand in for the rest so the scroller's height is the whole list's.
              style={sourceWindow.before || sourceWindow.after ? { paddingTop: sourceWindow.before, paddingBottom: sourceWindow.after } : undefined}
            >
              {listedSources.slice(sourceWindow.start, sourceWindow.end).map((row, offset) => {
                const rowIndex = sourceWindow.start + offset;
                const active = row.path === selectedSourcePath;
                const hit = needle ? search.hits.get(row.path) : undefined;
                return (
                  <SourceRow
                    key={row.path}
                    row={row}
                    rowIndex={rowIndex}
                    active={active}
                    hit={hit}
                    hitOpen={Boolean(hit && active && selectedSourceAnchor === hit.anchor)}
                    running={runningSources.has(row.path)}
                    needle={needle}
                    tabIndex={sourceRoving.tabIndexOf(rowIndex)}
                    onFocusRow={() => sourceRoving.onRowFocus(rowIndex)}
                    onOpen={() => onOpenSource(row)}
                    onOpenHit={(anchor) => onOpenSource(row, anchor)}
                    t={t}
                  />
                );
              })}
            </ul>
            {/* Not while reading is unfinished: this note is a finished answer and must not print under a line saying `0/6`. */}
            {needle && search.phase !== "reading" && visibleSources.length === 0 && visiblePages.length > 0 ? (
              <ListNote testId="library-search-other-half-note">
                <OtherSegmentLink count={visiblePages.length} segment="wiki" t={t} />
              </ListNote>
            ) : null}
            {groupFilter && stateFilter && listedSources.length === 0 && visibleSources.length > 0 ? (
              <div data-testid="library-source-list-none" className={`flex flex-col items-start gap-1.5 ${INDEX_LIST_INSET}`}>
                <ListNote testId="library-source-list-none-note">{t("sourcesHome.listNone")}</ListNote>
                <Chip data-testid="library-source-list-none-clear" onClick={groupFilter.onClear} tone="muted" className="ml-3">
                  {t("sourcesHome.panel.clear")}
                </Chip>
              </div>
            ) : null}
            {needle && search.phase !== "reading" && visibleSources.length === 0 && visiblePages.length === 0 ? (
              <ListNote testId="library-search-nothing-note">{t("search.nothing", { needle })}</ListNote>
            ) : null}
          </>
        ) : (
          <p
            data-testid="library-sources-empty"
            className="px-3 pb-1 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
          >
            {needle && visiblePages.length > 0 ? (
              <OtherSegmentLink count={visiblePages.length} segment="wiki" t={t} />
            ) : (
              t("sources.empty")
            )}
          </p>
        )}
      </section>
    );
  }

  const searchField = searchFieldWith(onNewPage ? <NewPageControl onNewPage={onNewPage} busy={busy} t={t} /> : null);
  const { checkValue, logValue } = wikiViewValues({
    lastCompileAt: model.log.lastCompile?.at,
    lastCheckAt: model.log.lastLint?.at,
    reportCount: report?.count ?? 0,
    formatDay: (ms) => wikiDayText(ms, nowMs, locale, t),
    formatCount: (count) => count.toLocaleString(locale),
    checkNever: t("wikiIndex.views.checkNever"),
    logNone: t("wikiIndex.views.logNone"),
  });

  return (
    // `min-h-0 flex-1`: the index below owns its scroller, so the column above never scrolls this half.
    <section data-testid="library-wiki" className={cn("flex min-h-0 flex-1 flex-col", searchHost ? "pt-1.5" : "pt-3")}>
      {searchHost && searchField ? createPortal(searchField, searchHost) : searchField}
      <WikiViewRows
        home={home}
        logLabel={t("wikiIndex.views.log")}
        logValue={logValue}
        checkLabel={t("report.title")}
        checkValue={checkValue}
        checkOpen={report?.open ?? false}
        onOpenCheck={report?.onOpen ?? (() => {})}
        checkRunning={report?.running ?? false}
        checkUnseen={report?.unseen ?? false}
        runningText={t("report.running")}
        unseenText={t("report.unseen")}
      />
      <div aria-hidden className="mx-4 h-px flex-none bg-[color:var(--color-divider)]" />
      <WikiIndex
        model={model}
        findings={findings}
        vaultScope={vaultScope}
        selectedSlug={selectedSlug}
        onOpenPage={onSelect}
        onOpenCheckResults={report?.onOpen ?? (() => {})}
        onEmptyPress={hasSources ? () => writeLibraryIndexSegment("sources") : onAddFiles}
        readingCount={readingCount}
        matches={needle ? visiblePages : null}
      />
      {needle && search.phase !== "reading" && visiblePages.length === 0 && visibleSources.length > 0 ? (
        <ListNote testId="library-search-other-half-note">
          <OtherSegmentLink count={visibleSources.length} segment="sources" t={t} />
        </ListNote>
      ) : null}
      {needle && search.phase !== "reading" && visiblePages.length === 0 && visibleSources.length === 0 && model.wikiPages.length > 0 ? (
        <ListNote testId="library-search-nothing-note">{t("search.nothing", { needle })}</ListNote>
      ) : null}
    </section>
  );
}
