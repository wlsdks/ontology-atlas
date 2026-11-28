import { useEffect, useRef, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { useTranslations } from "use-intl";
import { createPortal } from "react-dom";
import { useLocalVault, useVaultSessionIdentityScope } from "@/entities/vault-session";
import {
  writeLibraryIndexSegment,
  type LibraryIndexSegment,
} from "@/shared/lib/preferences/library-preferences";
import { cn } from "@/shared/lib/cn";
import { SegmentedControl } from "@/shared/ui/fields/segmented-control";
import { Chip } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast/toast";
import { LibrarySection, type SourceGroupFilter } from "../index-column/LibrarySection";
import type { LibraryUiModel } from "@/features/library";
import type { LibrarySourceRow, VaultDoc } from "@/entities/docs-vault";
import type { LibrarySelection } from "../../model/library-selection";
import type { useLibraryReader } from "../../model/reader/use-library-reader";
import type { useLibrarySources } from "../../model/sources/use-library-sources";
import type { useLibraryHome } from "../../model/home/use-library-home";
import type { useLibraryTurns } from "../../model/turns/use-library-turns";
import type { useLibraryIndexColumn } from "../../model/index-column/use-library-index-column";
import type { IndexHomeRow } from "../../model/index-column/index-home-row";
import { LibraryHeader } from "./LibraryHeader";

/** A one-shot reflow per fold: the rows slide out of view rather than the column vanishing in a frame. */
const INDEX_FOLD_TRANSITION = {
  transitionProperty: "width",
  transitionDuration: "var(--motion-settle)",
  transitionTimingFunction: "var(--motion-ease)",
} as const;

/**
 * When the open page's file leaves the folder, the selection clears and the person is told once.
 * Only a page that was there and then went counts, so a page still being read never trips it.
 */
function usePageGone({ openWikiSlug, docs, reading, onGone, t }: {
  openWikiSlug: string | null;
  docs: readonly VaultDoc[];
  reading: boolean;
  onGone: () => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const toast = useToast();
  const seenRef = useRef<{ slug: string; title: string } | null>(null);
  useEffect(() => {
    if (!openWikiSlug) {
      seenRef.current = null;
      return;
    }
    const doc = docs.find((candidate) => candidate.slug === openWikiSlug);
    if (doc) {
      seenRef.current = { slug: openWikiSlug, title: doc.title || openWikiSlug };
      return;
    }
    const seen = seenRef.current;
    if (reading || seen?.slug !== openWikiSlug) return;
    seenRef.current = null;
    toast.show(t("wikiIndex.pageGone", { title: seen.title }), "info");
    onGone();
    // `toast`, `onGone` and `t` are new each render; only the folder's documents and the open page decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, openWikiSlug, reading]);
}

export function LibraryIndexColumn({
  segment, toolsHost, t, localVault, workVaultScope, handle, nativeVaultRootPath,
  mobileBrowseOpen, setMobileBrowseOpen, mobileBrowseBackRef, browseFocusPendingRef, searchHost,
  setSearchHost, setSourceCitation, sourceCitation, runningSources, lintRunning, reportUnseen,
  choose, busy, docs, model, openImport, narrowShowsReader, indexTitle,
  reader, sources, home, turns, indexColumn, stateFilter, groupFilter, headerDoors,
}: {
  segment: LibraryIndexSegment | undefined;
  toolsHost: HTMLElement | null;
  t: ReturnType<typeof useTranslations<"library">>;
  localVault: ReturnType<typeof useLocalVault>;
  workVaultScope: ReturnType<typeof useVaultSessionIdentityScope>;
  handle: FileSystemDirectoryHandle | null;
  nativeVaultRootPath: string | null;
  mobileBrowseOpen: boolean;
  setMobileBrowseOpen: Dispatch<SetStateAction<boolean>>;
  mobileBrowseBackRef: RefObject<HTMLButtonElement | null>;
  browseFocusPendingRef: RefObject<boolean>;
  searchHost: HTMLDivElement | null;
  setSearchHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  setSourceCitation: Dispatch<SetStateAction<{ path: string; anchor?: string } | null>>;
  sourceCitation: { path: string; anchor?: string } | null;
  /** Sources the Continue request in flight named. */
  runningSources: ReadonlySet<string>;
  lintRunning: boolean;
  reportUnseen: boolean;
  choose: (next: LibrarySelection) => void;
  busy: boolean;
  docs: VaultDoc[];
  model: LibraryUiModel;
  openImport: () => void;
  narrowShowsReader: boolean;
  indexTitle: string;
  reader: ReturnType<typeof useLibraryReader>;
  sources: ReturnType<typeof useLibrarySources>;
  home: ReturnType<typeof useLibraryHome>;
  turns: ReturnType<typeof useLibraryTurns>;
  indexColumn: ReturnType<typeof useLibraryIndexColumn>;
  /** The state the band's press narrows the Sources list to. */
  stateFilter: LibrarySourceRow["state"] | null;
  groupFilter: SourceGroupFilter | null;
  /** The Library-wide doors, drawn once at the page header's end. */
  headerDoors: ReactNode;
}) {
  const { opened } = reader;
  const { sourceImportFeedback, handleAddFiles, handleFindDocuments } = sources;
  const { homeVisible } = home;
  const { handleNewPage, reportDoorCount, findings } = turns;
  const openWikiSlug = opened?.kind === "wiki" ? opened.slug : null;
  usePageGone({ openWikiSlug, docs, reading: localVault.partialTotal > 0, onGone: () => choose(null), t });
  const { indexSegment, indexFolded, foldMoves, indexScrollRef, indexEdge, handleIndexScroll } = indexColumn;
  const homeRow: IndexHomeRow = {
    label: indexSegment === "wiki" ? t("wikiIndex.views.findEvidence") : t("sources.overview"),
    active: homeVisible,
    onPress: () => choose(null),
  };
  const indexFade = "var(--tabbar-edge-fade)";
  const indexMask =
    indexEdge.top && indexEdge.bottom
      ? `linear-gradient(to bottom, transparent 0, black ${indexFade}, black calc(100% - ${indexFade}), transparent 100%)`
      : indexEdge.bottom
        ? `linear-gradient(to bottom, black calc(100% - ${indexFade}), transparent 100%)`
        : indexEdge.top
          ? `linear-gradient(to bottom, transparent 0, black ${indexFade})`
          : undefined;
  return (
    <aside
      data-testid="library-index"
      data-index-folded={indexFolded || undefined}
      aria-label={t("title")}
      // Folded, the column is out of reach as well as out of sight: its rows leave the tab order.
      inert={indexFolded}
      style={foldMoves ? INDEX_FOLD_TRANSITION : undefined}
      className={cn(
        "flex w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--color-panel)] max-lg:min-h-[var(--library-index-min)] max-lg:border-t max-lg:border-[color:var(--color-border-soft)] lg:flex-none lg:border-[color:var(--color-border-soft)]",
        indexFolded ? "lg:w-0" : "lg:w-[var(--docs-list-width)] lg:border-r",
        narrowShowsReader && "max-lg:hidden",
        indexSegment === 'wiki' && homeVisible && !mobileBrowseOpen && 'max-lg:hidden',
      )}
    >
      {/* Held at the open column's width, so a fold slides the rows out of view instead of rewrapping them. */}
      <div className="flex min-h-0 w-full flex-1 flex-col lg:min-w-[calc(var(--docs-list-width)-1px)]">
        {indexSegment === 'wiki' && mobileBrowseOpen ? <div className="flex-none border-b border-[color:var(--color-border-soft)] px-3 py-2 lg:hidden">
          <Chip ref={mobileBrowseBackRef} tone="muted" onClick={() => { browseFocusPendingRef.current = true; setMobileBrowseOpen(false); }} data-testid="question-desk-back">{t('questionDesk.backToQuestion')}</Chip>
        </div> : null}
        <div className={segment && toolsHost ? "flex-none px-3 pt-3" : "flex-none border-b border-[color:var(--color-overlay-2)] px-3 pb-2.5 pt-4"}>
          {segment && toolsHost ? (
            createPortal(
              <LibraryHeader t={t} title={indexTitle} titleHidden doors={headerDoors} />,
              toolsHost,
            )
          ) : (
            <LibraryHeader t={t} title={indexTitle} titleHidden={Boolean(segment)} doors={headerDoors} />
          )}
          {segment ? <div ref={setSearchHost} data-testid="library-search-host" className="mt-2 min-w-0" /> : null}
          {!segment ? <SegmentedControl
            ariaLabel={t("index.aria")}
            value={indexSegment}
            onChange={(next: LibraryIndexSegment) => writeLibraryIndexSegment(next)}
            size="lg"
            fill
            testId="library-index-segment"
            className="mt-3"
            options={[
              {
                value: "sources",
                label: t("index.sources", { count: model.sources.length }),
                testId: "library-index-segment-sources",
              },
              {
                value: "wiki",
                label: t("index.wiki", { count: model.wikiPages.length }),
                testId: "library-index-segment-wiki",
              },
            ]}
          /> : null}
        </div>
        <div
          data-testid="library-index-scroll"
          ref={indexScrollRef}
          onScroll={handleIndexScroll}
          style={indexMask ? { maskImage: indexMask, WebkitMaskImage: indexMask } : undefined}
          className="atlas-scroll-quiet flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]"
        >
          <LibrarySection
            model={model}
            searchHost={segment ? searchHost : null}
            segment={indexSegment}
            selectedSlug={opened?.kind === "wiki" ? opened.slug : null}
            selectedSourcePath={opened?.kind === "source" ? opened.path : null}
            selectedSourceAnchor={
              opened?.kind === "source" && sourceCitation?.path === opened.path
                ? sourceCitation.anchor ?? null
                : null
            }
            sourceHandles={localVault.sourceHandles}
            vaultScope={workVaultScope}
            vaultRootPath={nativeVaultRootPath}
            onSelect={(slug) => choose({ kind: "wiki", slug })}
            onOpenSource={(row, anchor) => {
              choose({ kind: "source", path: row.path });
              if (anchor) setSourceCitation({ path: row.path, anchor });
            }}
            onAddFiles={handleAddFiles}
            addFilesFeedback={sourceImportFeedback}
            onFindDocuments={handleFindDocuments}
            onImportFromService={openImport}
            onNewPage={handle ? handleNewPage : null}
            findings={findings}
            readingCount={localVault.partialTotal > 0 ? model.wikiPages.length : null}
            report={{
              count: reportDoorCount ?? 0,
              open: opened?.kind === "report",
              onOpen: () => choose({ kind: "report" }),
              running: lintRunning,
              unseen: reportUnseen && opened?.kind !== "report",
            }}
            home={homeRow}
            busy={busy}
            runningSources={runningSources}
            stateFilter={stateFilter}
            groupFilter={groupFilter}
            t={t}
          />
        </div>
      </div>
    </aside>
  );
}
