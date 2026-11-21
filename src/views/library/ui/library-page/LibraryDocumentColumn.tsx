import { useCallback, useEffect, useMemo, useRef, type RefObject, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import type { LibrarySourceRow } from "@/entities/docs-vault";
import {
  buildAskBrief,
  answerHistoryUnreadable,
  answerObservation,
  type LibraryUiModel,
  type RetainedAnswerHead,
} from "@/features/library";
import { DocReadingPane, shouldShowOutlineRail } from "@/widgets/doc-reading-pane";
import { DocsVaultViewer } from "@/widgets/docs-vault";
import { cn } from "@/shared/lib/cn";
import { workRuns } from "@/features/work-run";
import { useLibraryAgent } from "../../lib/agent/use-library-agent";
import { useAnswerRefresh } from "../../lib/questions/use-answer-refresh";
import { LibraryCheckReport } from "../wiki/LibraryCheckReport";
import { SelectionAsk } from "../questions/SelectionAsk";
import { SourceSummary } from "../sources/SourceSummary";
import { WikiPageHeader } from "../wiki/WikiPageHeader";
import { WikiTemplateProblems } from "../wiki/WikiTemplateProblems";
import { useSteadyFix } from "../wiki/use-steady-fix";
import { WikiCitationPopover, type WikiCitationPopoverHandle, type ReaderCitation } from "../wiki/WikiCitationPopover";
import { WikiPageFoot, createPaintedBody } from "../wiki/WikiPageFoot";
import { landAtLine, type ReaderLanding } from "../../model/reader/reader-landing";
import { RetainedAnswerContext, RetainedAnswerFooter } from "../questions/RetainedAnswerContext";
import type { LibrarySelection, LibraryHomeSurface } from "../../model/library-selection";
import type { useLibraryReader } from "../../model/reader/use-library-reader";
import type { useLibrarySources } from "../../model/sources/use-library-sources";
import type { useLibraryTurns } from "../../model/turns/use-library-turns";
import type { useLibraryIndexColumn } from "../../model/index-column/use-library-index-column";
import type { useWikiTemplateProblems } from "../../model/reader/use-wiki-template-problems";

export function LibraryDocumentColumn({
  t, locale, nativeVaultRootPath, selected, setHomeSurface, setSourceCitation, skipReaderFocusRef,
  turnRunning, lintRunning, choose, busy, model, retainedAnswers, knownOriginalPaths, agent,
  answerRefresh, compileSources, reader, sources, turns, agentDoor, indexColumn, templateProblems,
  reducedMotion, landingRef, onOpenLinkedPage, onOpenConcept,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  locale: string;
  nativeVaultRootPath: string | null;
  selected: LibrarySelection;
  setHomeSurface: Dispatch<SetStateAction<LibraryHomeSurface>>;
  setSourceCitation: Dispatch<SetStateAction<{ path: string; anchor?: string } | null>>;
  skipReaderFocusRef: RefObject<boolean>;
  turnRunning: boolean;
  lintRunning: boolean;
  choose: (next: LibrarySelection) => void;
  busy: boolean;
  model: LibraryUiModel;
  retainedAnswers: readonly RetainedAnswerHead[];
  knownOriginalPaths: Set<string>;
  agent: ReturnType<typeof useLibraryAgent>;
  answerRefresh: ReturnType<typeof useAnswerRefresh>;
  /** Sends exactly these sources: the selected source's own Write wiki page door. */
  compileSources: (rows: readonly LibrarySourceRow[]) => void;
  reader: ReturnType<typeof useLibraryReader>;
  sources: ReturnType<typeof useLibrarySources>;
  turns: ReturnType<typeof useLibraryTurns>;
  /** The app has no agent to write with, so a blocked write names the agents page. */
  agentDoor: boolean;
  indexColumn: ReturnType<typeof useLibraryIndexColumn>;
  templateProblems: ReturnType<typeof useWikiTemplateProblems>;
  reducedMotion: boolean;
  /** Where the next painted page should stand; consumed by the paint it names. */
  landingRef: RefObject<ReaderLanding | null>;
  /** A page link pressed in the body: the trail remembers where the reader was. */
  onOpenLinkedPage: (slug: string) => void;
  onOpenConcept: (slug: string) => void;
}) {
  const {
    opened, selectedWikiDoc, selectedOriginals, selectedSource, citedPassage, sourceOutlineState,
    selectedAnswer, answerHistory, answerRefreshButtonRef, articleScrollRef, activeHeadingSlug,
    backToTop, reportSpy, reportBackToTop, reportAdvisoryOpen, setReportAdvisoryOpen,
    handleReportHeadingNavigate, outlineHeadings, handleHeadingNavigate, vaultSlugs, getDocContent,
    resolveImage, linkTargets, neighbours, recordedHash, sourceHandles,
  } = reader;
  const { handleOpenSource } = sources;
  const {
    pendingAskRef, fixedKeys, handleFix, pageBodyRef, findings, openCandidates, reportHeadings,
    hasOntology, handlePropose, handleLint, compileBlocked, compileTransfer, agentOnlyReason,
    checkRun, checkFolder,
  } = turns;
  const { indexSegment, indexCollapsed } = indexColumn;
  const { wikiProblems, wikiPageTitle, wikiProblemDoors, wikiProblemFix } = templateProblems;
  const pageSlug = selectedWikiDoc?.slug ?? null;
  /* One object per title lookup, so the memoised problem list is not drawn again on a scroll. */
  const problemContext = useMemo(() => ({ pageTitle: wikiPageTitle }), [wikiPageTitle]);
  const steadyFix = useSteadyFix(wikiProblemFix);
  const citationPopoverRef = useRef<WikiCitationPopoverHandle>(null);
  const listedBytes = useMemo(() => new Map(model.sources.map((row) => [row.path, row.bytes])), [model.sources]);
  /* Stable, so opening a popover hands the press over without rendering the page body again. */
  const onCitationPress = useCallback((citation: ReaderCitation, button: HTMLButtonElement) => {
    citationPopoverRef.current?.open(citation, button);
  }, []);
  // One painted body per page, so a page never shows the foot of the one before it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const painted = useMemo(() => createPaintedBody(), [pageSlug]);
  const paintedSlugRef = useRef<string | null>(null);
  const landingCleanupRef = useRef<(() => void) | null>(null);
  /* A page that arrives clears the last one's landing itself; this covers leaving the reader. */
  useEffect(() => () => landingCleanupRef.current?.(), []);
  const onBodyPainted = useCallback((body: string | null, citations: ReadonlyMap<string, number>) => {
    painted.set(body === null ? null : citations);
    const scroller = articleScrollRef.current;
    if (body === null || !pageSlug || !scroller) return;
    const arrived = paintedSlugRef.current !== pageSlug;
    paintedSlugRef.current = pageSlug;
    const landing = landingRef.current?.slug === pageSlug ? landingRef.current : null;
    if (landing) landingRef.current = null;
    else if (!arrived) return;
    /*
     * In the next frame, before it paints: placing the scroll lays the new body out, and doing
     * that inside the commit that rendered a long page would add the whole layout to that task.
     */
    landingCleanupRef.current?.();
    const layer = pageBodyRef.current;
    let undo: (() => void) | null = null;
    const frame = requestAnimationFrame(() => {
      if (!landing) scroller.scrollTop = 0;
      else if ("top" in landing) scroller.scrollTop = landing.top;
      else if (layer) undo = landAtLine(scroller, layer, landing, reducedMotion);
    });
    landingCleanupRef.current = () => {
      cancelAnimationFrame(frame);
      undo?.();
    };
  }, [articleScrollRef, landingRef, pageBodyRef, pageSlug, painted, reducedMotion]);
  const openSourceAt = useCallback((path: string, anchor?: string) => {
    skipReaderFocusRef.current = true;
    choose({ kind: "source", path });
    setSourceCitation({ path, anchor });
  }, [choose, setSourceCitation, skipReaderFocusRef]);
  return (
    <div
      data-testid="library-document-column"
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col", !selected && "hidden")}
    >
    {opened?.kind === "report" ? (
      <DocReadingPane
        data-testid="library-report-pane"
        scrollRef={reportSpy.articleScrollRef}
        outline={
          reportHeadings.length >= 2
            ? {
                headings: reportHeadings,
                activeHeadingSlug: reportSpy.activeHeadingSlug,
                onHeadingClick: handleReportHeadingNavigate,
              }
            : null
        }
        backToTop={reportBackToTop}
      >
        <LibraryCheckReport
          structural={model.structural}
          findings={findings}
          candidates={openCandidates}
          lastLint={model.log.lastLint}
          busy={busy || turnRunning}
          running={lintRunning}
          onLint={agent.route === "agent" ? handleLint : null}
          lintBlockedReason={agentOnlyReason}
          agentMissing={nativeVaultRootPath !== null && agent.route === "unavailable"}
          onJumpToSection={handleReportHeadingNavigate}
          advisoryOpen={reportAdvisoryOpen}
          onAdvisoryOpenChange={setReportAdvisoryOpen}
          onFix={agent.route === "agent" ? handleFix : null}
          onPropose={agent.route === "agent" && hasOntology ? handlePropose : null}
          onOpenPage={(slug) => choose({ kind: "wiki", slug })}
          onOpenSource={(path) => choose({ kind: "source", path })}
          pageTitle={wikiPageTitle}
          fixedKeys={fixedKeys}
          checkRun={checkRun}
          folder={checkFolder}
          onStopCheck={workRuns.stop}
          onOpenConversation={agent.runtime && nativeVaultRootPath ? () => agent.setOpen(true) : undefined}
          conversationOpen={agent.open}
          t={t}
        />
      </DocReadingPane>
    ) : null}
    {selectedWikiDoc ? (
      <DocReadingPane
        data-testid="library-reading-pane"
        scrollRef={articleScrollRef}
        outline={
          shouldShowOutlineRail(outlineHeadings.length)
            ? {
                headings: outlineHeadings,
                activeHeadingSlug,
                onHeadingClick: handleHeadingNavigate,
              }
            : null
        }
        backToTop={backToTop}
      >
        <WikiPageHeader
          doc={selectedWikiDoc}
          originals={selectedOriginals}
          onOpenSource={(path) => choose({ kind: "source", path })}
          compactTop={selectedAnswer !== null}
          missingOriginalNamedBelow={
            selectedAnswer === null &&
            wikiProblems.some((problem) => problem.code === "citation-target-missing")
          }
          t={t}
        />
        {selectedAnswer ? null : (
          <WikiTemplateProblems
            problems={wikiProblems}
            file={`${selectedWikiDoc.slug}.md`}
            doors={wikiProblemDoors}
            fix={steadyFix}
            context={problemContext}
            t={t}
          />
        )}
        {selectedAnswer ? <RetainedAnswerContext
          refreshButtonRef={answerRefreshButtonRef}
          observation={answerObservation(selectedAnswer.frontmatter, knownOriginalPaths, model.hashes)}
          phase={turnRunning ? 'running' : answerRefresh.phase}
          historyState={answerHistory.state}
          older={!retainedAnswers.some((answer) => answer.slug === selectedAnswer.slug)}
          onRefresh={agent.route === 'agent' && nativeVaultRootPath ? () => { void answerRefresh.begin(selectedAnswer.slug); } : null}
          agentDoor={agentDoor}
          historyBlocked={answerHistoryUnreadable(selectedAnswer.slug, selectedAnswer.frontmatter)}
          error={answerRefresh.error} t={t} /> : null}
        <div
          ref={pageBodyRef}
          className="relative isolate data-[selecting=true]:[&>:not([data-testid=library-selection-ask])_*]:text-[color:var(--color-text-quaternary)]"
        >
          <DocsVaultViewer
            key={selectedWikiDoc.slug}
            doc={selectedWikiDoc}
            vaultSlugs={vaultSlugs}
            onNavigate={onOpenLinkedPage}
            getDocContent={getDocContent}
            resolveImage={resolveImage}
            knownOriginalPaths={knownOriginalPaths}
            namedSourcePath={selectedOriginals.length === 1 ? selectedOriginals[0]!.path : undefined}
            compactTop={selectedAnswer !== null}
            onSourceNavigate={openSourceAt}
            linkTargets={linkTargets}
            onConceptNavigate={onOpenConcept}
            onCitationPress={onCitationPress}
            markSourceLines
            onBodyPainted={onBodyPainted}
          />
          {agent.route === "agent" ? (
            <SelectionAsk
              containerRef={pageBodyRef}
              disabled={agent.runtime === null}
              onAsk={(selection, question, customQuestion) => {
                pendingAskRef.current = {
                  question: question === "custom" ? (customQuestion ?? "").trim() : t(`ask.${question}`),
                  askedOn: selectedWikiDoc.slug,
                };
                agent.start(
                  buildAskBrief({
                    selection,
                    pageSlug: selectedWikiDoc.slug,
                    question,
                    customQuestion,
                    locale,
                    vaultRoot: nativeVaultRootPath ?? "",
                  }),
                  "ask",
                );
              }}
              t={t}
            />
          ) : null}
        </div>
        {neighbours ? (
          <WikiPageFoot
            painted={painted}
            originals={selectedOriginals}
            isPresent={(path) => knownOriginalPaths.has(path)}
            linkedFrom={neighbours.linkedFrom}
            concepts={neighbours.concepts}
            onOpenSource={(path) => choose({ kind: "source", path })}
            onOpenPage={(slug) => choose({ kind: "wiki", slug })}
            onOpenConcept={onOpenConcept}
            t={t}
          />
        ) : null}
        <WikiCitationPopover
          key={selectedWikiDoc.slug}
          ref={citationPopoverRef}
          sourceHandles={sourceHandles}
          recordedHash={recordedHash}
          listedBytes={listedBytes}
          canReveal={nativeVaultRootPath !== null}
          onOpenSource={openSourceAt}
          onReveal={(path) => { const row = model.sources.find((one) => one.path === path); if (row) handleOpenSource(row); }}
          t={t}
        />
        {selectedAnswer ? (
          <>
            <WikiTemplateProblems
              problems={wikiProblems}
              file={`${selectedWikiDoc.slug}.md`}
              doors={wikiProblemDoors}
              context={problemContext}
              t={t}
            />
            <RetainedAnswerFooter
              onHome={() => { choose(null); setHomeSurface("questions"); }}
              onPrevious={answerHistory.previous && answerHistory.exists ? () => choose({ kind: 'wiki', slug: answerHistory.previous! }) : null}
              t={t}
            />
          </>
        ) : null}
      </DocReadingPane>
    ) : selectedSource ? (
      <div className="min-h-0 flex-1 overflow-auto max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]">
        <SourceSummary
          row={selectedSource}
          hash={model.hashes.get(selectedSource.path) ?? null}
          passage={citedPassage}
          outline={sourceOutlineState}
          canReveal={nativeVaultRootPath !== null}
          writeUps={model.pairing.writeUpsBySource.get(selectedSource.path) ?? EMPTY_WRITE_UPS}
          onOpen={() => handleOpenSource(selectedSource)}
          onOpenPassage={(anchor) => setSourceCitation({ path: selectedSource.path, anchor })}
          onOpenWiki={(slug) => choose({ kind: "wiki", slug })}
          onCompile={() => compileSources([selectedSource])}
          compileNote={compileBlocked ?? compileTransfer}
          compileBlocked={compileBlocked !== null}
          agentDoor={agentDoor}
          indexShowsState={indexSegment === "sources" && !indexCollapsed}
          busy={busy}
          t={t}
        />
      </div>
    ) : null}
    </div>
  );
}

const EMPTY_WRITE_UPS: never[] = [];
