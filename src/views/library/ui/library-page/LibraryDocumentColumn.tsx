import type { RefObject, Dispatch, SetStateAction } from "react";
import { useTranslations } from "next-intl";
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
import { useLibraryAgent } from "../../lib/use-library-agent";
import { useAnswerRefresh } from "../../lib/use-answer-refresh";
import { LibraryCheckReport } from "../parts/LibraryCheckReport";
import { SelectionAsk } from "../parts/SelectionAsk";
import { SourceSummary } from "../parts/SourceSummary";
import { WikiPageHeader } from "../parts/WikiPageHeader";
import { WikiTemplateProblems } from "../parts/WikiTemplateProblems";
import { RetainedAnswerContext, RetainedAnswerFooter } from "../parts/RetainedAnswerContext";
import type { LibrarySelection, LibraryHomeSurface } from "./library-page-state";
import type { useLibraryReader } from "./use-library-reader";
import type { useLibrarySources } from "./use-library-sources";
import type { useLibraryTurns } from "./use-library-turns";
import type { useLibraryGraphCards } from "./use-library-graph-cards";
import type { useLibraryIndexColumn } from "./use-library-index-column";
import type { useWikiTemplateProblems } from "./use-wiki-template-problems";

export function LibraryDocumentColumn({
  t, locale, nativeVaultRootPath, selected, setHomeSurface, setSourceCitation, skipReaderFocusRef,
  turnRunning, lintRunning, choose, busy, model, retainedAnswers, knownOriginalPaths, agent,
  answerRefresh, handleCompile, reader, sources, turns, graphCards, indexColumn, templateProblems,
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
  handleCompile: () => void;
  reader: ReturnType<typeof useLibraryReader>;
  sources: ReturnType<typeof useLibrarySources>;
  turns: ReturnType<typeof useLibraryTurns>;
  graphCards: ReturnType<typeof useLibraryGraphCards>;
  indexColumn: ReturnType<typeof useLibraryIndexColumn>;
  templateProblems: ReturnType<typeof useWikiTemplateProblems>;
}) {
  const {
    opened, selectedWikiDoc, selectedOriginals, selectedSource, citedPassage, sourceOutlineState,
    selectedAnswer, answerHistory, answerRefreshButtonRef, articleScrollRef, activeHeadingSlug,
    backToTop, reportSpy, reportBackToTop, reportAdvisoryOpen, setReportAdvisoryOpen,
    handleReportHeadingNavigate, outlineHeadings, handleHeadingNavigate, vaultSlugs, getDocContent,
    resolveImage,
  } = reader;
  const { handleOpenSource } = sources;
  const {
    pendingAskRef, fixedKeys, handleFix, pageBodyRef, findings, openCandidates, reportHeadings,
    hasOntology, handlePropose, handleLint, compileBlocked, compileTransfer, agentOnlyReason,
  } = turns;
  const { agentDoor } = graphCards;
  const { indexSegment, indexCollapsed } = indexColumn;
  const { wikiProblems, wikiPageTitle, wikiProblemDoors, wikiProblemFix } = templateProblems;
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
            fix={wikiProblemFix}
            context={{ pageTitle: wikiPageTitle }}
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
          className="relative data-[selecting=true]:[&>:not([data-testid=library-selection-ask])_*]:text-[color:var(--color-text-quaternary)]"
        >
          <DocsVaultViewer
            key={selectedWikiDoc.slug}
            doc={selectedWikiDoc}
            vaultSlugs={vaultSlugs}
            onNavigate={(slug) => choose({ kind: "wiki", slug })}
            getDocContent={getDocContent}
            resolveImage={resolveImage}
            knownOriginalPaths={knownOriginalPaths}
            namedSourcePath={selectedOriginals.length === 1 ? selectedOriginals[0]!.path : undefined}
            compactTop={selectedAnswer !== null}
            onSourceNavigate={(path, anchor) => { skipReaderFocusRef.current = true; choose({ kind: 'source', path }); setSourceCitation({ path, anchor }); }}
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
        {selectedAnswer ? (
          <>
            <WikiTemplateProblems
              problems={wikiProblems}
              file={`${selectedWikiDoc.slug}.md`}
              collapsed
              doors={wikiProblemDoors}
              context={{ pageTitle: wikiPageTitle }}
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
          onCompile={handleCompile}
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
