import { useEffect, useRef, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { PanelLeftOpen } from "lucide-react";
import { useLocalVault, useVaultSessionIdentityScope } from "@/entities/vault-session";
import { writeLibraryIndexSegment, type LibraryIndexSegment } from "@/shared/lib/preferences/appearance-preferences";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { SegmentedControl } from "@/shared/ui/fields/segmented-control";
import { Chip } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast/toast";
import { libraryProviderDisclosure } from "../../lib/compile/compile-availability";
import { useLibraryAgent } from "../../lib/agent/use-library-agent";
import { LibrarySection, type SourceGroupFilter } from "../parts/index-column/LibrarySection";
import type { LibraryUiModel } from "@/features/library";
import type { LibrarySourceRow, VaultDoc } from "@/entities/docs-vault";
import type { LibrarySelection } from "./library-page-state";
import type { useLibraryReader } from "./use-library-reader";
import type { useLibrarySources } from "./use-library-sources";
import type { useLibraryHome } from "./use-library-home";
import type { useLibraryTurns } from "./use-library-turns";
import type { useLibraryIndexColumn } from "./use-library-index-column";
import { LibraryHeader } from "./LibraryHeader";

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
  choose, busy, docs, model, agent, openImport, narrowShowsReader, indexTitle,
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
  agent: ReturnType<typeof useLibraryAgent>;
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
  /** The Library-wide doors, drawn once in the page header before the info glyph. */
  headerDoors: ReactNode;
}) {
  const { opened } = reader;
  const { sourceImportFeedback, handleAddFiles, handleFindDocuments } = sources;
  const { homeVisible } = home;
  const { handleNewPage, reportDoorCount, findings } = turns;
  const openWikiSlug = opened?.kind === "wiki" ? opened.slug : null;
  usePageGone({ openWikiSlug, docs, reading: localVault.partialTotal > 0, onGone: () => choose(null), t });
  const {
    indexSegment, autoFolded, setAutoFolded, autoFoldDeclinedRef, indexCollapsed, indexTabRef,
    indexCollapseRef, setIndexCollapsed, indexScrollRef, indexEdge, handleIndexScroll,
  } = indexColumn;
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
    <>
      {indexCollapsed ? (
        <div className="hidden flex-none self-start pl-3 pt-2 lg:block">
          <button
            type="button"
            ref={indexTabRef}
            onClick={() => {
              if (autoFolded) autoFoldDeclinedRef.current = true;
              setAutoFolded(false);
              setIndexCollapsed(false);
            }}
            aria-label={t("index.expand")}
            aria-expanded={false}
            data-testid="library-index-tab"
            className={controlClass({ shape: "icon", size: "sm", tone: "muted", hoverInk: "strong" })}
          >
            <PanelLeftOpen size={ICON_SIZE.lg} aria-hidden />
          </button>
        </div>
      ) : null}

      <aside
        data-testid="library-index"
        aria-label={t("title")}
        className={cn(
          "flex w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--color-panel)] max-lg:min-h-[var(--library-index-min)] max-lg:border-t max-lg:border-[color:var(--color-border-soft)] lg:w-[var(--docs-list-width)] lg:flex-none lg:border-r lg:border-[color:var(--color-border-soft)]",
          narrowShowsReader && "max-lg:hidden",
          indexSegment === 'wiki' && homeVisible && !mobileBrowseOpen && 'max-lg:hidden',
          indexCollapsed && "lg:hidden",
        )}
      >
        {indexSegment === 'wiki' && mobileBrowseOpen ? <div className="flex-none border-b border-[color:var(--color-border-soft)] px-3 py-2 lg:hidden">
          <Chip ref={mobileBrowseBackRef} tone="muted" onClick={() => { browseFocusPendingRef.current = true; setMobileBrowseOpen(false); }} data-testid="question-desk-back">{t('questionDesk.backToQuestion')}</Chip>
        </div> : null}
        <div className={segment && toolsHost ? "flex-none px-3 pt-3" : "flex-none border-b border-[color:var(--color-overlay-2)] px-3 pb-2.5 pt-4"}>
          {segment && toolsHost ? (
            createPortal(
              <LibraryHeader
                t={t}
                title={indexTitle}
                titleHidden
                doors={headerDoors}
                disclosure={libraryProviderDisclosure({ route: agent.route }, t)}
                onCollapse={() => setIndexCollapsed(true)}
                collapseRef={indexCollapseRef}
              />,
              toolsHost,
            )
          ) : (
          <LibraryHeader
            t={t}
            title={indexTitle}
            titleHidden={Boolean(segment)}
            doors={headerDoors}
            disclosure={libraryProviderDisclosure({ route: agent.route }, t)}
            onCollapse={() => setIndexCollapsed(true)}
            collapseRef={indexCollapseRef}
          />
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
            busy={busy}
            runningSources={runningSources}
            stateFilter={stateFilter}
            groupFilter={groupFilter}
            t={t}
          />
        </div>
      </aside>
    </>
  );
}
