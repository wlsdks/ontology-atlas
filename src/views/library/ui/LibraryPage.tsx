"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useLocalVault, useVaultIdentityScope, useVaultSessionIdentityScope } from "@/entities/vault-session";
import { isWikiPage } from "@/entities/docs-vault";
import { opensLocally } from "@/features/vault-agent";
import { isAcpBridgeAvailable } from "@/shared/lib/agent-chat/tauri-acp";
import {
  FindDocumentsDialog,
  questionDeskListingVersion,
  showLibraryWorkStrip,
  useLibraryModel,
} from "@/features/library";
import { isRunActive, useActiveTurn, useTurnStage, useWorkRunSnapshot, workCardHoldsSeat, workRuns } from "@/features/work-run";
import { SourcesOverview } from "@/widgets/library-sources-overview";
import { LibraryWorkActivityStrip } from "@/widgets/library-work-activity";
import { LibraryImportDialog } from "@/widgets/library-import";
import {
  writeLibraryIndexSegment,
  writeWikiWriteMode,
  type LibraryIndexSegment,
} from "@/shared/lib/preferences/library-preferences";
import { cn } from "@/shared/lib/cn";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import { getTauriVaultRootPath } from "@/shared/lib/vault-folder/native-vault/tauri-vault-runtime";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { ArrowLeft } from "lucide-react";
import { PAGE_COLUMN_STAGE } from "@/shared/ui/tokens/page-frame";
import { useFailureSentence } from "@/shared/lib/failures/use-failure-sentence";
import { ChromeChip, useToast, useToastAnchor } from "@/shared/ui";
import { useLibraryAgent } from "../lib/agent/use-library-agent";
import { useAnswerRefresh } from "../lib/questions/use-answer-refresh";
import { LocalCompileCard } from "./compile/LocalCompileCard";
import { useSourceCopy } from "../model/sources/use-source-drop";
import { LibraryStatusStrip } from "./compile/LibraryStatusStrip";
import { LibraryAgentDock } from "./agent/LibraryAgentDock";
import { LibraryConversationDoor } from "./agent/LibraryConversationDoor";
import { useChatWidth } from "@/widgets/acp-chat-panel";
import { selectOpenVaultHandle } from "@/shared/lib/vault-folder/select-open-vault-handle";
import { LibraryQuestionDesk } from "./questions/LibraryQuestionDesk";
import { AnswerRevisionComparison } from "./questions/AnswerRevisionComparison";
import { LibraryHomeStrip } from "./home/LibraryHomeStrip";
import { useLibraryReader } from "../model/reader/use-library-reader";
import { WikiReaderTopRow } from "./wiki/WikiReaderTopRow";
import type { ReaderLanding } from "../model/reader/reader-landing";
import { useLibrarySources } from "../model/sources/use-library-sources";
import { useLibraryWorkActivity } from "../model/turns/use-library-work-activity";
import { useLibraryHome } from "../model/home/use-library-home";
import { useLibraryTurns } from "../model/turns/use-library-turns";
import { useLibraryFocus } from "../model/reader/use-library-focus";
import { useLibraryIndexColumn } from "../model/index-column/use-library-index-column";
import { useWikiTemplateProblems } from "../model/reader/use-wiki-template-problems";
import { libraryHomeStrip } from "../model/home/library-home-strip";
import { LibraryNoFolderStage } from "./library-page/LibraryNoFolderStage";
import { LibraryEmptyFolderStage } from "./library-page/LibraryEmptyFolderStage";
import { SourceCopyStrip } from "./first-run/SourceCopyStrip";
import { LibraryIndexColumn } from "./library-page/LibraryIndexColumn";
import { LibraryDocumentColumn } from "./library-page/LibraryDocumentColumn";
import { LibraryHomePopovers } from "./home/LibraryHomePopovers";
import { AgentDoor } from "./agent/AgentDoor";
import { SourceProgressBand } from "./progress/SourceProgressBand";
import { useContinuePress } from "../model/sources/use-continue-press";
import { LibraryWorkLine } from "./progress/LibraryWorkLine";
import { useSourceFilter } from "../model/sources/use-source-filter";
import { AfterFirstFrame } from "./library-page/AfterFirstFrame";
import { overviewNextBatch } from "../model/sources/overview-next-batch";
import { useLibraryToastOffsets } from "../model/home/library-toast-offsets";
import { useReaderTrail } from "../model/reader/reader-trail";
import { useLibraryImportFlow } from "../model/sources/use-library-import-flow";
import { useCompileSender } from "../model/sources/use-compile-sender";
import { useSourcePick } from "../model/sources/use-source-pick";
import { useConversationWorkReports } from "../model/turns/use-conversation-work-reports";
import { useWorkRunDoors } from "../model/turns/use-work-run-doors";
import { answerFilingKind } from "../model/turns/library-answer";
import { agentWriterId } from "../model/turns/writer-id";
import { wikiRevisionStamp } from "../model/turns/wiki-revision-stamp";

export function LibraryPage({ segment, onSegmentChange, toolsHost = null, showHomeRef }: {
  segment?: LibraryIndexSegment;
  onSegmentChange?: (segment: LibraryIndexSegment) => void;
  toolsHost?: HTMLElement | null;
  /** Receives the press that leaves an open page for the tab's home, for a press on the tab already shown. */
  showHomeRef?: Ref<(() => void) | null>;
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
  const [sourceCitation, setSourceCitation] = useState<{ path: string; anchor?: string } | null>(null);
  const [answerComparisonOpen, setAnswerComparisonOpen] = useState(false);
  const guideDoorRef = useRef<HTMLButtonElement | null>(null);
  const questionsDoorRef = useRef<HTMLButtonElement | null>(null);
  const compileClauseRef = useRef<HTMLButtonElement | null>(null);
  const overflowDoorRef = useRef<HTMLButtonElement | null>(null);

  useToastAnchor("bottom-right");
  const workRunSnapshot = useWorkRunSnapshot();
  const workCardShown = workCardHoldsSeat(workRunSnapshot);
  useLibraryToastOffsets({ dialogOpen: answerComparisonOpen, workCardShown });
  const skipReaderFocusRef = useRef(false);
  const [pageTurnRunning, setTurnRunning] = useState(false);
  const [pageCompileRunning, setCompileRunning] = useState(false);
  const checkRun = workRunSnapshot.run?.folder === workVaultScope ? workRunSnapshot.run : null;
  // A check or a writing turn started by an earlier visit is still this folder's running turn.
  const lintRunning = isRunActive(checkRun);
  const writingTurn = useActiveTurn(workVaultScope);
  const turnRunning = pageTurnRunning || lintRunning || writingTurn !== null;
  const compileRunning = pageCompileRunning || writingTurn?.door === "compile";
  const reportUnseen = checkRun?.unseen ?? false;
  const choose = useCallback((next: typeof selected) => {
    setSourceCitation(null);
    setSelected(next);
    if (next?.kind === "report") workRuns.markSeen(workVaultScope);
    if (next && next.kind !== "report") {
      const nextSegment = next.kind === "wiki" ? "wiki" : "sources";
      writeLibraryIndexSegment(nextSegment);
      onSegmentChange?.(nextSegment);
    }
  }, [onSegmentChange, workVaultScope]);
  useImperativeHandle(showHomeRef, () => () => choose(null), [choose]);
  const [workBusy, setBusy] = useState(false);
  const sourceCopyScope = useVaultIdentityScope();
  // A copy outlives this page, so its store answers; while it runs no other import may start.
  const sourceCopyRunning = useSourceCopy(sourceCopyScope)?.phase === "copying";
  const busy = workBusy || sourceCopyRunning;

  const docs = manifest?.docs ?? EMPTY_DOCS;
  const revisionStamps = useMemo(() => wikiRevisionStamp(docs), [docs]);
  const wikiTitleBySlug = useMemo(
    () => new Map(docs.filter((doc) => isWikiPage(doc)).map((doc) => [doc.slug, doc.title] as const)),
    [docs],
  );
  const wikiPageTitle = useCallback((ref: string) => wikiTitleBySlug.get(ref) ?? null, [wikiTitleBySlug]);
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
    reducedMotion, localVault, manifest, hasFolder, selected, sourceCitation, docs, model, locale,
  });
  // Where the next page body lands once painted: a desk row's claim, or the scroll a Back returns to.
  const landingRef = useRef<ReaderLanding | null>(null);
  const { activeTrail, openLinkedPage, backAlongTrail } = useReaderTrail({
    selected, openPage: reader.selectedWikiDoc, articleScrollRef: reader.articleScrollRef, landingRef, choose,
  });
  const { opened, pendingAnswerFocus } = reader;
  const sources = useLibrarySources({
    t, toast, localVault, handle, manifest, nativeVaultRootPath, busy, setBusy,
  });
  const {
    findOpen, setFindOpen, discovery, declinedCount, sourceImportFeedback, handleAddFiles,
    handleAddCandidates, handleForgetDeclined,
  } = sources;
  const retrievalPages = useMemo(
    () => new Map([...model.pageFacts].map(([slug, facts]) => [slug, facts.retrieval] as const)),
    [model.pageFacts],
  );
  const agent = useLibraryAgent(nativeVaultRootPath, model.sources, {
    createFile: (path: string) => t("wiki.compileCreateFile", { path }),
    modifyFile: (path: string) => t("wiki.compileModifyFile", { path }),
    bridgeMissing: t("stage.blockedWeb"),
  }, retrievalPages);
  const stageAgentName = agent.runtime?.label ?? null;
  const answerRefresh = useAnswerRefresh({
    handle, sources: model.sources, vaultRoot: nativeVaultRootPath,
    writer: agentWriterId(agent.runtime), start: agent.start,
  });
  const { capture: captureAnswerRefresh, receive: receiveAnswerRefresh } = answerRefresh;
  const knownSlugs = useMemo(
    () => new Set((manifest?.docs ?? []).map((doc) => doc.slug)),
    [manifest],
  );

  // `useChatWidth` keeps the in-flight drag locally, so a second copy publishes a stale width.
  const chatWidth = useChatWidth();
  const dockOpen = agent.route === "agent" && agent.runtime !== null && nativeVaultRootPath !== null && agent.open;
  const workActivity = useLibraryWorkActivity({ workVaultScope, nativeVaultRootPath, wikiRevisionStamp: revisionStamps, agent });
  const {
    agentActivity, setAgentActivity, libraryWorkActivity, handleAcpToolActivityChange,
    localReviewVisible, localReviewBusy, handleTerminalToolObservation, changedWikiPages,
  } = workActivity;
  const conversationDoor =
    agent.route === "agent" && agent.runtime !== null && nativeVaultRootPath !== null ? (
      <LibraryConversationDoor
        activity={agentActivity}
        agentLabel={agent.runtime.label}
        open={agent.open}
        onToggle={() => agent.setOpen(!agent.open)}
      />
    ) : null;
  const closeHomeSurface = useCallback(() => setHomeSurface(null), []);

  const {
    importOpen, setImportOpen, importDestination, connectors, routeCrossfading, importHeadsToPlanningRef,
    openConcept, openImport, openPlanning, openConnectorSettings, offerPlanningAfterImport,
  } = useLibraryImportFlow({ handle, t, toast });
  const home = useLibraryHome({
    selected, setHomeSurface, chatWidth, dockOpen, workActivity, importOpen,
  });
  const { homeVisible } = home;
  const sendCompile = useCompileSender({ agent, model, locale, nativeVaultRootPath, t, toast });
  const indexColumn = useLibraryIndexColumn({ segment, model });
  const { indexSegment, setReaderEl, indexFolded, libraryIsEmpty } = indexColumn;
  const bandShown = homeVisible && indexSegment !== 'wiki' && model.sources.length > 0;
  const sourceFilter = useSourceFilter({
    sources: model.sources, vaultScope: workVaultScope, listening: bandShown,
  });
  const { sourcePick, setSourcePick, sourceGroupFilter } = useSourcePick({ workVaultScope, t });
  /*
   * Every Compile door sends what it names: the band and the popover the next batch, a source's own
   * door that source. The batch is picked only while one of them draws it, and on press.
   */
  const localRoute = agent.route === 'local';
  const { compileBatch, continueBatch, press: handleCompile, pressFor: compileSources } = useContinuePress({
    sources: model.sources,
    folderKey: workVaultScope,
    // The local runner reads its own capped targets; the batch names as many, all files it can open.
    size: localRoute ? Math.max(1, agent.localCompile.targets.length) : undefined,
    running: compileRunning || agent.localCompile.status === 'running',
    shown: bandShown || homeSurface === 'compile',
    eligible: localRoute ? opensLocally : undefined,
    send: sendCompile,
  });
  const overviewBatch = useMemo(() => overviewNextBatch(model.sources, continueBatch), [continueBatch, model.sources]);

  const turns = useLibraryTurns({
    t, locale, toast, failureSentence, localVault, markSelfWrite, unmarkSelfWrite, workVaultScope,
    latestWorkVaultScopeRef, handle, nativeVaultRootPath, setSelected, latestSelectedRef,
    skipReaderFocusRef, setTurnRunning, setCompileRunning, choose,
    docs, model, currentDeskListingVersion, latestDeskListingVersionRef, agent,
    captureAnswerRefresh, receiveAnswerRefresh, knownSlugs, workActivity,
    onImportCompleted: offerPlanningAfterImport,
  });
  const {
    pendingAskRef, lastAnswer, deskReport, setDeskWorkRequest, deskWorkActivity, reportEpochRef,
    invalidateDeskReport, filingAnswer, fileAnswerNote, judgeWrite, handleFileAnswer,
    handleFileReport, autoDecide, handleTurnStarted,
  } = turns;
  const answerFiling = answerFilingKind(lastAnswer, deskReport, workVaultScope);
  const agentDoor = nativeVaultRootPath !== null && (agent.route === "unavailable" || agent.route === "local");
  const { readerRef, paneBodyRef } = useLibraryFocus({
    selected, setSelected, mobileBrowseOpen, mobileBrowseBackRef, homeSurface,
    answerComparisonOpen, skipReaderFocusRef, agent, sources, workActivity,
  });
  const templateProblems = useWikiTemplateProblems({
    t, locale, toast, nativeVaultRootPath, turnRunning, choose, busy, model, agent, reader, turns,
  });
  const { conversationOwner, observeCheckWork, observeTerminalTool, reportCheckStop } = useConversationWorkReports({
    nativeVaultRootPath, runtimeId: agent.runtime?.id ?? "", onTerminalToolObservation: handleTerminalToolObservation,
  });
  // The conversation on screen is its turn's stage: no card stands for it while it is shown.
  useTurnStage(conversationOwner, dockOpen && hasFolder);
  useWorkRunDoors({
    hasFolder, workVaultScope, writingTurn, choose, setAgentOpen: agent.setOpen, setAgentRuntime: agent.setRuntimeId,
  });
  if (!hasFolder) return <LibraryNoFolderStage t={t} />;

  const importDialog = (
    <>
    <LibraryImportDialog
      open={importOpen && !routeCrossfading}
      onClose={() => setImportOpen(false)}
      onDismiss={importDestination === "planning" ? openPlanning : undefined}
      setup={connectors.setup}
      onSetupSaved={() => void connectors.reload()}
      onAddFiles={handleAddFiles}
      onBrief={(brief) => { importHeadsToPlanningRef.current = importDestination === "planning"; agent.start(brief, "import"); }}
      canRunAgent={agent.route === "agent"}
      agentGap={isAcpBridgeAvailable() ? "runtime" : "browser"}
      destination={importDestination}
      onOpenAdvanced={openConnectorSettings}
    />
    </>
  );

  const findDocumentsDialog = (
    <FindDocumentsDialog
      open={findOpen}
      onClose={() => setFindOpen(false)}
      outcome={discovery}
      folders={[handle.name, ...(discovery?.walkedRoots ?? [])].join(", ")}
      declinedCount={declinedCount}
      onForgetDeclined={handleForgetDeclined}
      onAdd={handleAddCandidates}
      busy={busy}
      onAddFiles={handleAddFiles}
        addFilesFeedback={sourceImportFeedback}
      addFilesLabel={t("sources.add")}
    />
  );

  // Keyed so the conversation and its agent session survive the first file turning the empty stage into the workspace.
  const agentDock = agent.route === "agent" && agent.runtime && nativeVaultRootPath ? (
        <LibraryAgentDock
          key="agent-dock"
          chatWidth={chatWidth}
          judgeWrite={judgeWrite}
          autoDecide={autoDecide}
          onTurnStarted={handleTurnStarted}
          onTurnActivityChange={setAgentActivity}
          onTurnToolActivityChange={handleAcpToolActivityChange}
          onTerminalToolObservation={observeTerminalTool}
          onTurnStopChange={reportCheckStop}
          onTurnWorkChange={observeCheckWork}
          turnReadOnly={turns.turnReadOnly}
          turnOutlivesScreen={turns.turnOutlivesScreen}
          onFileAnswer={answerFiling === "report" ? handleFileReport : answerFiling === "answer" ? () => void handleFileAnswer() : null}
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
          indexBeside={!libraryIsEmpty && !indexFolded}
          onClose={() => agent.setOpen(false)}
        />
      ) : null;

  if (libraryIsEmpty) {
    return (
      <main
        id="main"
        tabIndex={-1}
        data-testid="library-page"
        data-library-state="empty-folder"
        className="relative flex min-h-0 w-full flex-1"
      >
        <LibraryEmptyFolderStage
          key="empty-stage"
          t={t} handle={handle} nativeVaultRootPath={nativeVaultRootPath} busy={busy} openImport={openImport}
          conversationDoor={agent.openingRequest && !agent.open ? conversationDoor : null} sources={sources}
          agentName={stageAgentName} agentConnected={agent.route === "agent"}
        />
        {agentDock}
        {importDialog}
        {findDocumentsDialog}
      </main>
    );
  }


  const narrowShowsReader = selected !== null || localReviewVisible;

  const openConversation = conversationDoor && !agent.open ? () => agent.setOpen(true) : null;
  const reviewAnswer = answerRefresh.proposal ? () => setAnswerComparisonOpen(true) : null;
  const homeStrip = libraryHomeStrip({
    t, homeSurface, setHomeSurface, choose, model, retainedAnswers,
    onOpenConversation: openConversation, onReview: reviewAnswer,
  });
  const { homeDoors } = homeStrip;
  const headerDoors = (
    <LibraryHomeStrip
      doors={homeDoors}
      conversation={conversationDoor}
      review={reviewAnswer ? (
        <ChromeChip data-testid="answer-review-open" data-library-door="review" onClick={reviewAnswer} className="min-w-0 max-w-[14rem] flex-none shadow-none">
          {t('answers.reviewDraft')}
        </ChromeChip>
      ) : null}
      overflowOpen={homeSurface === "overflow"}
      onToggleOverflow={() => setHomeSurface((current) => (current === "overflow" ? null : "overflow"))}
      guideAnchorRef={guideDoorRef}
      questionsAnchorRef={questionsDoorRef}
      overflowAnchorRef={overflowDoorRef}
      t={t}
    />
  );
  const openWorkTarget = (target: { kind: "source" | "wiki"; ref: string }) =>
    choose(target.kind === "wiki" ? { kind: "wiki", slug: target.ref } : { kind: "source", path: target.ref });

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
        handle={handle} nativeVaultRootPath={nativeVaultRootPath}
        mobileBrowseOpen={mobileBrowseOpen} setMobileBrowseOpen={setMobileBrowseOpen}
        mobileBrowseBackRef={mobileBrowseBackRef} browseFocusPendingRef={browseFocusPendingRef}
        searchHost={searchHost} setSearchHost={setSearchHost} setSourceCitation={setSourceCitation}
        sourceCitation={sourceCitation} runningSources={continueBatch.running}
        lintRunning={lintRunning}
        reportUnseen={reportUnseen} choose={choose} busy={busy} docs={docs} model={model}
        openImport={openImport} narrowShowsReader={narrowShowsReader}
        indexTitle={indexTitle} reader={reader} sources={sources} home={home} turns={turns}
        indexColumn={indexColumn} stateFilter={sourceFilter.state} groupFilter={sourceGroupFilter}
        headerDoors={headerDoors}
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
        <div ref={paneBodyRef} data-testid="library-pane-body" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {narrowShowsReader ? (
            // One height for every open page, so a page, a source and Check results never move the reader under it.
            <div className="flex h-[var(--control-h-lg)] flex-none items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3">
              {localReviewVisible ? (
                <button
                  type="button"
                  onClick={() => agent.localCompile.dismiss()}
                  disabled={localReviewBusy}
                  data-testid="library-local-review-back"
                  className={controlClass({ shape: "chip", tone: "muted" })}
                >
                  {t("localCompile.back")}
                </button>
              ) : null}
              {activeTrail.length > 0 && !localReviewVisible ? (
                <button
                  type="button"
                  onClick={backAlongTrail}
                  data-testid="library-reader-trail-back"
                  title={activeTrail[activeTrail.length - 1]!.title}
                  className={controlClass({ shape: "chip", tone: "default", className: "gap-1.5" })}
                >
                  <ArrowLeft size={ICON_SIZE.sm} aria-hidden />
                  {t("wikiReader.back")}
                </button>
              ) : null}
              <div className="min-w-0 flex-1">{reader.selectedWikiDoc && !localReviewVisible ? (
                <WikiReaderTopRow doc={reader.selectedWikiDoc} sourceChanged={reader.selectedSourceChanged} t={t} />
              ) : <LibraryStatusStrip
                model={model}
                onCompileNext={localReviewVisible ? undefined : () => {
                  setHomeSurface((current) => (current === "compile" ? null : "compile"));
                }}
                compileAnchorRef={compileClauseRef}
                compileOpen={homeSurface === "compile"}
                t={t}
              />}</div>
              {nativeVaultRootPath !== null ? (
                <LibraryWorkLine activity={libraryWorkActivity} onSelect={openWorkTarget} pageTitle={wikiPageTitle} changedPages={changedWikiPages} className="max-w-[45%] flex-none" />
              ) : null}
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
              pageFacts={model.pageFacts}
              sources={model.sources}
              sourceHandles={localVault.sourceHandles}
              hashes={model.hashes}
              vaultRoot={nativeVaultRootPath}
              vaultScope={workVaultScope}
              agentReady={agent.route === 'agent' && agent.runtime !== null && nativeVaultRootPath !== null}
              dockOpen={dockOpen}
              visible={homeVisible && indexSegment === 'wiki'}
              turnRunning={turnRunning}
              workActivity={questionDeskVisible && showLibraryWorkStrip(deskWorkActivity, true) ? <LibraryWorkActivityStrip
                compact activity={deskWorkActivity}
                onSelect={openWorkTarget}
                pageTitle={wikiPageTitle}
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
              onOpenWiki={(slug, claim) => {
                landingRef.current = claim ? { slug, ...claim } : null;
                choose({ kind: 'wiki', slug });
              }}
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
              {bandShown ? (
                <SourceProgressBand
                  sources={model.sources}
                  vaultScope={workVaultScope}
                  batch={continueBatch}
                  blocked={turns.compileBlocked
                    ? { reason: turns.compileBlocked, door: agentDoor ? <AgentDoor testId="library-progress-blocked-door" /> : null }
                    : null}
                  inApp={nativeVaultRootPath !== null}
                  filter={sourceFilter}
                  workLine={nativeVaultRootPath !== null ? (
                    <LibraryWorkLine
                      activity={libraryWorkActivity}
                      onSelect={openWorkTarget}
                      pageTitle={wikiPageTitle}
                      changedPages={changedWikiPages}
                      // Reserved from the first paint while an agent can work here, so its first event moves nothing.
                      reserved={!turns.compileBlocked}
                      className="w-full"
                    />
                  ) : null}
                  agentName={agent.runtime?.label ?? null}
                  locale={locale}
                  t={t}
                />
              ) : null}
              {model.sources.length > 0 ? (
                <AfterFirstFrame key={workVaultScope} reading={localVault.partialTotal > 0}>
                <SourcesOverview
                  scope={workVaultScope}
                  sources={model.sources}
                  pages={model.wikiPages}
                  batch={overviewBatch}
                  inApp={nativeVaultRootPath !== null}
                  readingCount={localVault.partialTotal > 0 ? model.sources.length : null}
                  pick={sourcePick}
                  onPick={setSourcePick}
                  onOpenPage={(slug) => {
                    setHomeSurface(null);
                    choose({ kind: "wiki", slug });
                  }}
                  onOpenSource={(path) => {
                    setHomeSurface(null);
                    choose({ kind: "source", path });
                  }}
                />
                </AfterFirstFrame>
              ) : (
                <LibraryEmptyFolderStage
                  t={t} handle={handle} nativeVaultRootPath={nativeVaultRootPath} busy={busy} openImport={openImport}
                  conversationDoor={null} sources={sources}
                  agentName={stageAgentName} agentConnected={agent.route === "agent"} wikiOnly
                />
              )}
            </div>
          ) : null}
          {!localReviewVisible ? (
            <LibraryDocumentColumn
              t={t} locale={locale} nativeVaultRootPath={nativeVaultRootPath} selected={selected}
              setHomeSurface={setHomeSurface} setSourceCitation={setSourceCitation}
              skipReaderFocusRef={skipReaderFocusRef} turnRunning={turnRunning} lintRunning={lintRunning}
              choose={choose} busy={busy} model={model} retainedAnswers={retainedAnswers}
              knownOriginalPaths={knownOriginalPaths} agent={agent} answerRefresh={answerRefresh}
              compileSources={compileSources} reader={reader} sources={sources} turns={turns}
              agentDoor={agentDoor} indexColumn={indexColumn} templateProblems={templateProblems}
              reducedMotion={reducedMotion} landingRef={landingRef} onOpenLinkedPage={openLinkedPage}
              onOpenConcept={openConcept}
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
        handleCompile={handleCompile} sources={sources} home={home} turns={turns} agentDoor={agentDoor}
        homeStrip={homeStrip} compileBatch={compileBatch} folderName={handle.name}
      />
      {agentDock}
      {model.sources.length > 0 ? <SourceCopyStrip scope={sources.vaultScope} t={t} /> : null}

      {importDialog}

      {findDocumentsDialog}
    </main>
  );
}

const EMPTY_DOCS: never[] = [];

