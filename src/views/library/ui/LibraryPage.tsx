"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BookOpen } from "lucide-react";
import { useLocalVault, useVaultSessionIdentityScope } from "@/entities/vault-session";
import { isWikiPage } from "@/entities/docs-vault";
import { useRouter } from "@/i18n/navigation";
import { MCP_CONNECTORS_HREF } from "@/shared/config/destinations";
import { useVaultConnectors } from "@/features/mcp-connectors";
import { isAcpBridgeAvailable } from "@/shared/lib/tauri-acp";
import {
  buildCompileBrief,
  FindDocumentsDialog,
  questionDeskListingVersion,
  showLibraryWorkStrip,
  useLibraryModel,
} from "@/features/library";
import { LibraryGraph } from "@/widgets/library-graph";
import { LibraryWorkActivityStrip } from "@/widgets/library-work-activity";
import { LibraryImportDialog } from "@/widgets/library-import";
import {
  writeLibraryIndexSegment,
  writeWikiWriteMode,
  type LibraryIndexSegment,
} from "@/shared/lib/appearance-preferences";
import { cn } from "@/shared/lib/cn";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { PAGE_COLUMN_STAGE } from "@/shared/ui/page-frame";
import {
  LIBRARY_TOAST_BOTTOM_OFFSET,
  LIBRARY_TOAST_DIALOG_OFFSET,
  LIBRARY_TOAST_RIGHT_OFFSET,
} from "@/shared/ui/toast-position";
import { useFailureSentence } from "@/shared/lib/use-failure-sentence";
import { Button, Chip, useToast, useToastAnchor } from "@/shared/ui";
import { isWikiFurnitureSlug } from "@/shared/lib/wiki-page-schema";
import { useLibraryAgent } from "../lib/use-library-agent";
import { useAnswerRefresh } from "../lib/use-answer-refresh";
import { LocalCompileCard } from "./parts/LocalCompileCard";
import { LibraryStatusStrip } from "./parts/LibraryStatusStrip";
import { LibraryAgentDock } from "./parts/LibraryAgentDock";
import { LibraryConversationDoor } from "./parts/LibraryConversationDoor";
import { useChatWidth } from "@/widgets/acp-chat-panel";
import { selectOpenVaultHandle } from "@/shared/lib/select-open-vault-handle";
import { LibraryQuestionDesk } from "./parts/LibraryQuestionDesk";
import { AnswerRevisionComparison } from "./parts/AnswerRevisionComparison";
import { LibraryHomeStrip } from "./parts/LibraryHomeStrip";
import { useLibraryReader } from "./library-page/use-library-reader";
import { useLibrarySources } from "./library-page/use-library-sources";
import { useLibraryWorkActivity } from "./library-page/use-library-work-activity";
import { useLibraryHome } from "./library-page/use-library-home";
import { useLibraryTurns } from "./library-page/use-library-turns";
import { useLibraryGraphCards } from "./library-page/use-library-graph-cards";
import { useLibraryFocus } from "./library-page/use-library-focus";
import { useLibraryIndexColumn } from "./library-page/use-library-index-column";
import { useWikiTemplateProblems } from "./library-page/use-wiki-template-problems";
import { libraryHomeStrip } from "./library-page/library-home-strip";
import { LibraryNoFolderStage } from "./library-page/LibraryNoFolderStage";
import { LibraryEmptyFolderStage } from "./library-page/LibraryEmptyFolderStage";
import { LibraryIndexColumn } from "./library-page/LibraryIndexColumn";
import { LibraryDocumentColumn } from "./library-page/LibraryDocumentColumn";
import { LibraryHomePopovers } from "./library-page/LibraryHomePopovers";

export function LibraryPage({ segment, onSegmentChange, toolsHost = null }: {
  segment?: LibraryIndexSegment;
  onSegmentChange?: (segment: LibraryIndexSegment) => void;
  toolsHost?: HTMLElement | null;
} = {}) {
  const reducedMotion = usePrefersReducedMotion();
  const t = useTranslations("library");
  const tChat = useTranslations("acpChat");
  const locale = useLocale();
  const toast = useToast();
  const failureSentence = useFailureSentence();
  const localVault = useLocalVault();
  const { markSelfWrite, unmarkSelfWrite } = localVault;
  const workVaultScope = useVaultSessionIdentityScope();
  const latestWorkVaultScopeRef = useRef(workVaultScope);
  useEffect(() => { latestWorkVaultScopeRef.current = workVaultScope; }, [workVaultScope]);

  const handle = selectOpenVaultHandle(localVault.status, localVault.handle);
  const manifest = localVault.manifest;
  const hasFolder = handle !== null && manifest !== null;
  const nativeVaultRootPath = handle ? (getTauriVaultRootPath(handle) ?? null) : null;

  const [selected, setSelected] = useState<
    { kind: "wiki"; slug: string } | { kind: "source"; path: string } | { kind: "report" } | null
  >(null);
  const [mobileBrowseOpen, setMobileBrowseOpen] = useState(false);
  const mobileBrowseBackRef = useRef<HTMLButtonElement | null>(null);
  const browseFocusPendingRef = useRef(false);
  useEffect(() => {
    if (mobileBrowseOpen) mobileBrowseBackRef.current?.focus();
    else if (browseFocusPendingRef.current) {
      browseFocusPendingRef.current = false;
      document.querySelector<HTMLButtonElement>('[data-testid="question-desk-browse"]')?.focus();
    }
  }, [mobileBrowseOpen]);
  const latestSelectedRef = useRef<typeof selected>(null);
  useEffect(() => {
    latestSelectedRef.current = selected;
  }, [selected]);
  const [homeSurface, setHomeSurface] = useState<"guide" | "questions" | "compile" | "overflow" | null>(null);
  const [searchHost, setSearchHost] = useState<HTMLDivElement | null>(null);
  const [staleLit, setStaleLit] = useState(false);
  const [sourceCitation, setSourceCitation] = useState<{ path: string; anchor?: string } | null>(null);
  const [answerComparisonOpen, setAnswerComparisonOpen] = useState(false);
  const guideDoorRef = useRef<HTMLButtonElement | null>(null);
  const questionsDoorRef = useRef<HTMLButtonElement | null>(null);
  const compileClauseRef = useRef<HTMLButtonElement | null>(null);
  const overflowDoorRef = useRef<HTMLButtonElement | null>(null);

  useToastAnchor("bottom-right");
  const viewportDialogOpen = answerComparisonOpen;
  useEffect(() => {
    const root = document.documentElement;
    const right = viewportDialogOpen ? LIBRARY_TOAST_DIALOG_OFFSET : LIBRARY_TOAST_RIGHT_OFFSET;
    const bottom = viewportDialogOpen ? LIBRARY_TOAST_DIALOG_OFFSET : LIBRARY_TOAST_BOTTOM_OFFSET;
    root.style.setProperty("--app-toast-right-offset", right);
    root.style.setProperty("--app-toast-bottom-offset", bottom);
    root.style.setProperty("--app-toast-mobile-right-offset", right);
    root.style.setProperty("--app-toast-mobile-bottom-offset", bottom);
    return () => {
      root.style.removeProperty("--app-toast-right-offset");
      root.style.removeProperty("--app-toast-bottom-offset");
      root.style.removeProperty("--app-toast-mobile-right-offset");
      root.style.removeProperty("--app-toast-mobile-bottom-offset");
    };
  }, [viewportDialogOpen]);
  const skipReaderFocusRef = useRef(false);
  const [turnRunning, setTurnRunning] = useState(false);
  const [compileRunning, setCompileRunning] = useState(false);
  const [lintRunning, setLintRunning] = useState(false);
  const [reportUnseen, setReportUnseen] = useState(false);
  const choose = useCallback((next: typeof selected) => {
    setSourceCitation(null);
    setSelected(next);
    if (next?.kind === "report") setReportUnseen(false);
    if (next && next.kind !== "report") {
      const nextSegment = next.kind === "wiki" ? "wiki" : "sources";
      writeLibraryIndexSegment(nextSegment);
      onSegmentChange?.(nextSegment);
    }
  }, [onSegmentChange]);
  const [busy, setBusy] = useState(false);

  const docs = manifest?.docs ?? EMPTY_DOCS;
  const wikiRevisionStamp = useMemo(
    () =>
      new Map(
        docs
          .filter((doc) => isWikiPage(doc) && !isWikiFurnitureSlug(doc.slug))
          .map((doc) => [doc.slug, doc.mtime ?? 0] as const),
      ),
    [docs],
  );
  const model = useLibraryModel({
    docs,
    sources: manifest?.sources,
    sourceHandles: localVault.sourceHandles,
    fileHandles: localVault.fileHandles,
    vaultRootPath: nativeVaultRootPath,
    vaultScope: workVaultScope,
    enabled: hasFolder,
  });
  const currentDeskListingVersion = questionDeskListingVersion(docs, model.sources);
  const latestDeskListingVersionRef = useRef(currentDeskListingVersion);
  useEffect(() => { latestDeskListingVersionRef.current = currentDeskListingVersion; }, [currentDeskListingVersion]);
  const retainedAnswers = model.retainedAnswers ?? EMPTY_DOCS;
  const knownOriginalPaths = useMemo(() => new Set(model.sources.map((source) => source.path)), [model.sources]);
  const retainedAnswerSlugs = useMemo(
    () => new Set(retainedAnswers.map((answer) => answer.slug)),
    [retainedAnswers],
  );

  const reader = useLibraryReader({
    reducedMotion, localVault, manifest, hasFolder, selected, sourceCitation, docs, model,
  });
  const { opened, pendingAnswerFocus } = reader;
  const sources = useLibrarySources({
    t, toast, localVault, handle, manifest, nativeVaultRootPath, busy, setBusy,
  });
  const {
    findOpen, setFindOpen, discovery, declinedCount, sourceImportFeedback, handleAddFiles,
    handleAddCandidates, handleForgetDeclined,
  } = sources;
  const agent = useLibraryAgent(nativeVaultRootPath, model.sources, {
    createFile: (path: string) => t("wiki.compileCreateFile", { path }),
    modifyFile: (path: string) => t("wiki.compileModifyFile", { path }),
    bridgeMissing: t("stage.blockedWeb"),
  }, model.pageTexts);
  const answerRefresh = useAnswerRefresh({
    handle, sources: model.sources, vaultRoot: nativeVaultRootPath,
    writer: agent.runtime ? `agent:${agent.runtime.id}` : 'agent:unknown', start: agent.start,
  });
  const { capture: captureAnswerRefresh, receive: receiveAnswerRefresh } = answerRefresh;
  const knownSlugs = useMemo(
    () => new Set((manifest?.docs ?? []).map((doc) => doc.slug)),
    [manifest],
  );

  // One owner: useChatWidth keeps the in-flight drag locally, so a second copy publishes a stale width.
  const chatWidth = useChatWidth();
  const dockOpen = agent.route === "agent" && agent.runtime !== null && nativeVaultRootPath !== null && agent.open;
  const workActivity = useLibraryWorkActivity({ workVaultScope, nativeVaultRootPath, wikiRevisionStamp, agent });
  const {
    agentActivity, setAgentActivity, libraryWorkActivity, handleAcpToolActivityChange,
    localReviewVisible, localReviewBusy, handleTerminalToolObservation,
  } = workActivity;
  const conversationDoor =
    agent.route === "agent" && agent.runtime !== null && nativeVaultRootPath !== null && !agent.open ? (
      <LibraryConversationDoor
        activity={agentActivity}
        agentLabel={agent.runtime.label}
        onOpen={() => agent.setOpen(true)}
      />
    ) : null;
  const closeHomeSurface = useCallback(() => setHomeSurface(null), []);

  const home = useLibraryHome({
    selected, setHomeSurface, setStaleLit, staleLit, choose, model, chatWidth, dockOpen,
    workActivity,
  });
  const { homeVisible, staleHighlight } = home;
  const connectors = useVaultConnectors(handle);
  const importRouter = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const openImport = useCallback(() => setImportOpen(true), []);
  const handleCompile = useCallback(() => {
    try {
      const localExecution = agent.route === 'local';
      agent.start(
        buildCompileBrief({
          sources: localExecution
            ? model.sources.filter((source) => agent.localCompile.targets.includes(source.path))
            : model.sources,
          existingPages: model.wikiPages,
          locale,
          execution: localExecution ? 'local' : 'acp',
          writerId: localExecution
            ? `model:${agent.localModel?.model ?? 'unknown'}`
            : `agent:${agent.runtime?.id ?? 'unknown'}`,
          vaultRoot: nativeVaultRootPath ?? "",
          now: new Date(),
        }),
      );
    } catch (error) {
      toast.show(
        t("wiki.compileFailed", {
          reason: error instanceof Error ? error.message : String(error),
        }),
        "error",
      );
    }
  }, [agent, locale, model.sources, model.wikiPages, nativeVaultRootPath, t, toast]);

  const turns = useLibraryTurns({
    t, locale, toast, failureSentence, localVault, markSelfWrite, unmarkSelfWrite, workVaultScope,
    latestWorkVaultScopeRef, handle, nativeVaultRootPath, setSelected, latestSelectedRef,
    skipReaderFocusRef, setTurnRunning, setCompileRunning, setLintRunning, setReportUnseen, choose,
    docs, model, currentDeskListingVersion, latestDeskListingVersionRef, agent,
    captureAnswerRefresh, receiveAnswerRefresh, knownSlugs, workActivity,
  });
  const {
    pendingAskRef, lastAnswer, deskReport, setDeskWorkRequest, deskWorkActivity, reportEpochRef,
    invalidateDeskReport, filingAnswer, fileAnswerNote, judgeWrite, handleFileAnswer,
    handleFileReport, autoDecide, handleTurnStarted,
  } = turns;
  const graphCards = useLibraryGraphCards({
    localVault, nativeVaultRootPath, docs, model, agent, handleCompile, sources, turns,
  });
  const { cardFacts } = graphCards;
  const { readerRef, paneBodyRef } = useLibraryFocus({
    selected, setSelected, mobileBrowseOpen, mobileBrowseBackRef, homeSurface,
    answerComparisonOpen, skipReaderFocusRef, agent, sources, workActivity,
  });
  const indexColumn = useLibraryIndexColumn({ segment, model });
  const { indexSegment, setReaderEl, indexCollapsed, libraryIsEmpty } = indexColumn;
  const templateProblems = useWikiTemplateProblems({
    t, locale, toast, nativeVaultRootPath, turnRunning, choose, busy, model, agent, reader, turns,
  });
  if (!hasFolder) return <LibraryNoFolderStage t={t} locale={locale} />;

  const importDialog = (
    <>
    <LibraryImportDialog
      open={importOpen}
      onClose={() => setImportOpen(false)}
      onAttach={(connector) => connectors.upsert(connector, { allowHere: true })}
      onBrief={(brief) => agent.start(brief, "import")}
      canRunAgent={agent.route === "agent"}
      agentGap={isAcpBridgeAvailable() ? "runtime" : "browser"}
      onOpenAdvanced={() => importRouter.push(MCP_CONNECTORS_HREF)}
    />
    </>
  );

  const findDocumentsDialog = (
    <FindDocumentsDialog
      open={findOpen}
      onClose={() => setFindOpen(false)}
      outcome={discovery}
      declinedCount={declinedCount}
      onForgetDeclined={handleForgetDeclined}
      onAdd={handleAddCandidates}
      busy={busy}
      onAddFiles={handleAddFiles}
        addFilesFeedback={sourceImportFeedback}
      addFilesLabel={t("sources.add")}
    />
  );

  if (libraryIsEmpty) {
    return (
      <LibraryEmptyFolderStage
        t={t} handle={handle} nativeVaultRootPath={nativeVaultRootPath} busy={busy} openImport={openImport}
        importDialog={importDialog} findDocumentsDialog={findDocumentsDialog} sources={sources}
      />
    );
  }


  const narrowShowsReader = selected !== null || localReviewVisible;

  const homeStrip = libraryHomeStrip({
    t, homeSurface, setHomeSurface, setStaleLit, staleLit, choose, model, retainedAnswers, home,
  });
  const { homeClauses, homeDoors } = homeStrip;

  const indexTitle = segment
    ? t(`index.${segment}`, {
        count: segment === "sources" ? model.sources.length : model.wikiPages.length,
      })
    : t("title");
  const questionDeskVisible = homeVisible && indexSegment === 'wiki';

  return (
    <main
      id="main"
      tabIndex={-1}
      data-testid="library-page"
      data-library-state={localReviewVisible ? "local-review" : opened ? opened.kind : "nothing-open"}
      className="topology-ui-scale relative flex min-h-0 w-full flex-1 bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)] max-lg:flex-col"
    >
      <h1 className="sr-only">{indexTitle}</h1>
      <LibraryIndexColumn
        segment={segment} toolsHost={toolsHost} t={t} localVault={localVault} workVaultScope={workVaultScope}
        handle={handle} nativeVaultRootPath={nativeVaultRootPath} selected={selected}
        mobileBrowseOpen={mobileBrowseOpen} setMobileBrowseOpen={setMobileBrowseOpen}
        mobileBrowseBackRef={mobileBrowseBackRef} browseFocusPendingRef={browseFocusPendingRef}
        searchHost={searchHost} setSearchHost={setSearchHost} setSourceCitation={setSourceCitation}
        sourceCitation={sourceCitation} compileRunning={compileRunning} lintRunning={lintRunning}
        reportUnseen={reportUnseen} choose={choose} busy={busy} docs={docs} model={model} agent={agent}
        openImport={openImport} handleCompile={handleCompile} narrowShowsReader={narrowShowsReader}
        indexTitle={indexTitle} reader={reader} sources={sources} home={home} turns={turns}
        indexColumn={indexColumn}
      />

      <div
        ref={(node) => {
          readerRef.current = node;
          setReaderEl(node);
        }}
        tabIndex={-1}
        data-testid="library-reader"
        className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden max-lg:order-first focus-visible:outline-none", indexSegment === 'wiki' && homeVisible && mobileBrowseOpen && 'max-lg:hidden')}
      >
        {!questionDeskVisible ? <LibraryWorkActivityStrip
          activity={libraryWorkActivity}
          reserved={dockOpen}
          onSelect={(target) =>
            choose(
              target.kind === "wiki"
                ? { kind: "wiki", slug: target.ref }
                : { kind: "source", path: target.ref },
            )
          }
        /> : null}
        <div ref={paneBodyRef} data-testid="library-pane-body" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {narrowShowsReader ? (
            <div className="flex flex-none items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3 py-2">
              <button
                type="button"
                onClick={() => localReviewVisible ? agent.localCompile.dismiss() : setSelected(null)}
                disabled={localReviewVisible && localReviewBusy}
                data-testid="library-reader-back"
                className={controlClass({ shape: "chip", tone: "muted" })}
              >
                {t(localReviewVisible ? "localCompile.back" : "graph.readerClose")}
              </button>
              <div className="min-w-0 flex-1"><LibraryStatusStrip
                model={model}
                indexShowsSourceStates={indexSegment === "sources" && !indexCollapsed}
                onCompileNext={localReviewVisible ? undefined : () => {
                  setStaleLit(false);
                  setHomeSurface((current) => (current === "compile" ? null : "compile"));
                }}
                compileAnchorRef={compileClauseRef}
                compileOpen={homeSurface === "compile"}
                t={t}
              /></div>
              <span className="flex shrink-0 items-center gap-2">
                {answerRefresh.proposal ? <Button className="atlas-touch-floor" size="sm" variant="outline" data-testid="answer-review-open" onClick={() => setAnswerComparisonOpen(true)}>{t('answers.reviewDraft')}</Button> : null}
                {conversationDoor}
              </span>
            </div>
          ) : null}
          {localReviewVisible ? (
            <div data-testid="library-local-review" className="min-h-0 flex-1 overflow-y-auto px-3 py-6">
              <div className={`${PAGE_COLUMN_STAGE} mx-auto`}>
                <LocalCompileCard session={agent.localCompile} model={agent.localModel?.model ?? ""} t={t} />
              </div>
            </div>
          ) : null}
          <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', (!homeVisible || indexSegment !== 'wiki') && 'hidden')}>
            <LibraryQuestionDesk
              key={workVaultScope}
              docs={docs}
              pageTexts={model.pageTexts}
              sources={model.sources}
              sourceHandles={localVault.sourceHandles}
              hashes={model.hashes}
              vaultRoot={nativeVaultRootPath}
              vaultScope={workVaultScope}
              agentReady={agent.route === 'agent' && agent.runtime !== null && nativeVaultRootPath !== null}
              dockOpen={dockOpen}
              visible={homeVisible && indexSegment === 'wiki'}
              turnRunning={turnRunning}
              navigationActions={questionDeskVisible ? <>
                {retainedAnswers.length > 0 ? <Chip ref={questionsDoorRef} tone="muted" className="min-w-0 max-w-full"
                  active={homeDoors[1]!.open === true} aria-expanded={homeDoors[1]!.open}
                  title={homeDoors[1]!.label} data-testid="library-questions-open"
                  onClick={homeDoors[1]!.onPress}>
                  <BookOpen size={ICON_SIZE.sm} aria-hidden />
                  <span className="min-w-0 max-w-[12rem] truncate">{homeDoors[1]!.label}</span>
                </Chip> : null}
                {conversationDoor}
              </> : null}
              workActivity={questionDeskVisible && showLibraryWorkStrip(deskWorkActivity, true) ? <LibraryWorkActivityStrip
                compact activity={deskWorkActivity}
                onOpenConversation={agent.runtime && nativeVaultRootPath ? () => agent.setOpen(true) : undefined}
                onSelect={(target) => choose(target.kind === 'wiki' ? { kind: 'wiki', slug: target.ref } : { kind: 'source', path: target.ref })}
              /> : null}
              report={deskReport && deskReport.answer === lastAnswer ? {
                question: deskReport.answer.question,
                text: deskReport.answer.text,
                searchId: deskReport.searchId,
                listingVersion: deskReport.listingVersion,
                vaultScope: deskReport.vaultScope,
                coverage: deskReport.coverage,
                limits: deskReport.limits,
                generatedAt: deskReport.generatedAt,
              } : null}
              onSummarize={({ brief, question, searchId, listingVersion, vaultScope, coverage, limits }) => {
                invalidateDeskReport();
                setDeskWorkRequest({ scope: vaultScope, startedAt: Date.now() });
                pendingAskRef.current = { question, askedOn: null, report: { searchId, listingVersion, vaultScope, coverage, limits, epoch: reportEpochRef.current } };
                agent.start(brief, 'ask');
              }}
              onInvalidateReport={invalidateDeskReport}
              onFileReport={deskReport && deskReport.answer === lastAnswer ? () => void handleFileReport() : null}
              filingReport={lastAnswer !== null && filingAnswer === lastAnswer}
              fileReportNote={fileAnswerNote}
              onBrowse={() => setMobileBrowseOpen(true)}
              onOpenWiki={(slug) => choose({ kind: 'wiki', slug })}
              onOpenSource={(path, anchor) => {
                choose({ kind: 'source', path });
                setSourceCitation(anchor ? { path, anchor } : null);
              }}
            />
          </div>
          {homeVisible && indexSegment !== 'wiki' ? (
            <div
              data-testid="library-reader-landing"
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              <LibraryGraph
                docs={manifest?.docs ?? EMPTY_DOCS}
                wikiPages={model.wikiPages}
                sources={model.sources}
                activity={libraryWorkActivity}
                selection={null}
                highlight={staleLit ? staleHighlight.ids : null}
                highlightNote={
                  staleLit
                    ? t("home.staleLit", { count: model.staleCount, pages: staleHighlight.pages })
                    : null
                }
                onSelect={(next) => {
                  setStaleLit(false);
                  setHomeSurface(null);
                  choose(next.kind === "wiki" ? { kind: "wiki", slug: next.ref } : { kind: "source", path: next.ref });
                }}
                cardFacts={cardFacts}
                headerEnd={
                  <LibraryHomeStrip
                    clauses={homeClauses}
                    doors={homeDoors}
                    overflowOpen={homeSurface === "overflow"}
                    onToggleOverflow={() =>
                      setHomeSurface((current) => (current === "overflow" ? null : "overflow"))
                    }
                    compileAnchorRef={compileClauseRef}
                    guideAnchorRef={guideDoorRef}
                    questionsAnchorRef={questionsDoorRef}
                    overflowAnchorRef={overflowDoorRef}
                    trailing={
                      <>
                        {answerRefresh.proposal ? <Button className="atlas-touch-floor flex-none" size="sm" variant="outline" data-testid="answer-review-open" onClick={() => setAnswerComparisonOpen(true)}>{t('answers.reviewDraft')}</Button> : null}
                        {conversationDoor}
                      </>
                    }
                    t={t}
                  />
                }
              />
            </div>
          ) : null}
          {!localReviewVisible ? (
            <LibraryDocumentColumn
              t={t} locale={locale} nativeVaultRootPath={nativeVaultRootPath} selected={selected}
              setHomeSurface={setHomeSurface} setSourceCitation={setSourceCitation}
              skipReaderFocusRef={skipReaderFocusRef} turnRunning={turnRunning} lintRunning={lintRunning}
              choose={choose} busy={busy} model={model} retainedAnswers={retainedAnswers}
              knownOriginalPaths={knownOriginalPaths} agent={agent} answerRefresh={answerRefresh}
              handleCompile={handleCompile} reader={reader} sources={sources} turns={turns}
              graphCards={graphCards} indexColumn={indexColumn} templateProblems={templateProblems}
            />
          ) : null}
        </div>
      </div>

      {answerRefresh.snapshot && answerRefresh.proposal ? <AnswerRevisionComparison
        open={answerComparisonOpen} question={answerRefresh.snapshot.question}
        before={answerRefresh.snapshot.previousText} after={answerRefresh.proposal.text}
        knownOriginalPaths={knownOriginalPaths}
        problems={answerRefresh.proposal.problems} error={answerRefresh.error}
        saving={answerRefresh.phase === 'saving'} onClose={() => setAnswerComparisonOpen(false)}
        onOpenSource={(path, anchor) => { setAnswerComparisonOpen(false); skipReaderFocusRef.current = true; choose({ kind: 'source', path }); setSourceCitation({ path, anchor }); }}
        onSave={() => { void answerRefresh.save().then((result) => {
          if (!result) return;
          pendingAnswerFocus.current = result.slug;
          markSelfWrite(result.slug); setAnswerComparisonOpen(false); agent.setOpen(false); choose({ kind: 'wiki', slug: result.slug });
          toast.show(t(result.state === 'saved' ? 'answers.saved' : 'answers.savedNeedsReview'), result.state === 'saved' ? 'success' : 'error');
        }); }} t={t} /> : null}
      <LibraryHomePopovers
        t={t} nativeVaultRootPath={nativeVaultRootPath} homeSurface={homeSurface}
        setHomeSurface={setHomeSurface} guideDoorRef={guideDoorRef} questionsDoorRef={questionsDoorRef}
        compileClauseRef={compileClauseRef} overflowDoorRef={overflowDoorRef} choose={choose} busy={busy}
        model={model} retainedAnswers={retainedAnswers} knownOriginalPaths={knownOriginalPaths}
        retainedAnswerSlugs={retainedAnswerSlugs} agent={agent} closeHomeSurface={closeHomeSurface}
        handleCompile={handleCompile} sources={sources} home={home} turns={turns} graphCards={graphCards}
        homeStrip={homeStrip}
      />
      {agent.route === "agent" && agent.runtime && nativeVaultRootPath ? (
        <LibraryAgentDock
          chatWidth={chatWidth}
          judgeWrite={judgeWrite}
          autoDecide={autoDecide}
          onTurnStarted={handleTurnStarted}
          onTurnActivityChange={setAgentActivity}
          onTurnToolActivityChange={handleAcpToolActivityChange}
          onTerminalToolObservation={handleTerminalToolObservation}
          onFileAnswer={lastAnswer ? lastAnswer.origin === 'question-report'
            ? deskReport?.answer === lastAnswer && deskReport.vaultScope === workVaultScope ? handleFileReport : null
            : () => void handleFileAnswer() : null}
          filingAnswer={lastAnswer !== null && filingAnswer === lastAnswer}
          fileAnswerNote={fileAnswerNote}
          noticeActions={{
            openPage: (path) => choose({ kind: "wiki", slug: path.replace(/\.md$/, "") }),
            askNext: () => {
              writeWikiWriteMode("ask");
              toast.show(t("wiki.askNextDone"), "success");
            },
          }}
          open={agent.open}
          runtime={agent.runtime}
          runtimes={agent.runtimes}
          onRuntimeChange={agent.setRuntimeId}
          vaultRoot={nativeVaultRootPath}
          mcpServers={agent.mcpServers}
          openingRequest={agent.openingRequest}
          answerFold={
            agent.openingRequest?.kind === "lint"
              ? {
                  request: agent.openingRequest.text,
                  line: tChat("checkAnswerLine"),
                  doorLabel: tChat("checkAnswerDoor"),
                  onOpen: () => choose({ kind: "report" }),
                }
              : null
          }
          knownSlugs={knownSlugs}
          indexBeside={!indexCollapsed}
          onClose={() => agent.setOpen(false)}
        />
      ) : null}

      {importDialog}

      {findDocumentsDialog}
    </main>
  );
}

const EMPTY_DOCS: never[] = [];

