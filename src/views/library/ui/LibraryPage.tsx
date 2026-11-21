"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useLocalVault, useVaultSessionIdentityScope } from "@/entities/vault-session";
import { isWikiPage, type LibrarySourceRow } from "@/entities/docs-vault";
import { opensLocally } from "@/features/vault-agent";
import { useRouter } from "@/i18n/navigation";
import { MCP_CONNECTORS_HREF } from "@/shared/config/destinations";
import { useVaultConnectors } from "@/features/mcp-connectors";
import { isAcpBridgeAvailable } from "@/shared/lib/agent-chat/tauri-acp";
import {
  buildCompileBrief,
  FindDocumentsDialog,
  questionDeskListingVersion,
  showLibraryWorkStrip,
  useLibraryModel,
} from "@/features/library";
import { isRunActive, useActiveTurn, useTurnStage, useWorkRunSnapshot, workCardHoldsSeat, workRuns, type TurnWorkReport, type WorkRunActivity } from "@/features/work-run";
import type { AcpEvent } from "@/features/acp-session";
import { completedAcpReadEvent } from "@/features/library";
import { SourcesOverview, sourceGroupKey, type SourcePick } from "@/widgets/library-sources-overview";
import { LibraryWorkActivityStrip } from "@/widgets/library-work-activity";
import { LibraryImportDialog } from "@/widgets/library-import";
import { clearLibraryImportRequest, pendingLibraryImport, type ImportDestination } from "@/shared/lib/library-import/destination";
import { isRouteCrossfadeRunning, navigateWithViewTransition, subscribeRouteCrossfade } from "@/shared/lib/navigation/route-view-transition";
import {
  writeLibraryIndexSegment,
  writeWikiWriteMode,
  type LibraryIndexSegment,
} from "@/shared/lib/preferences/appearance-preferences";
import { cn } from "@/shared/lib/cn";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import { getTauriVaultRootPath } from "@/shared/lib/vault-folder/tauri-vault-fs";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { ArrowLeft } from "lucide-react";
import { PAGE_COLUMN_STAGE } from "@/shared/ui/tokens/page-frame";
import {
  LIBRARY_TOAST_BOTTOM_OFFSET,
  LIBRARY_TOAST_DIALOG_OFFSET,
  LIBRARY_TOAST_RIGHT_OFFSET,
} from "@/shared/ui/toast/toast-position";
import { useFailureSentence } from "@/shared/lib/failures/use-failure-sentence";
import { ChromeChip, useToast, useToastAnchor } from "@/shared/ui";
import { isWikiFurnitureSlug } from "@/shared/lib/library/wiki-page-schema";
import { useLibraryAgent } from "../lib/agent/use-library-agent";
import { useAnswerRefresh } from "../lib/questions/use-answer-refresh";
import { LocalCompileCard } from "./parts/compile/LocalCompileCard";
import { LibraryStatusStrip } from "./parts/compile/LibraryStatusStrip";
import { LibraryAgentDock } from "./parts/agent/LibraryAgentDock";
import { LibraryConversationDoor } from "./parts/agent/LibraryConversationDoor";
import { useChatWidth } from "@/widgets/acp-chat-panel";
import { selectOpenVaultHandle } from "@/shared/lib/vault-folder/select-open-vault-handle";
import { LibraryQuestionDesk } from "./parts/questions/LibraryQuestionDesk";
import { AnswerRevisionComparison } from "./parts/questions/AnswerRevisionComparison";
import { LibraryHomeStrip } from "./parts/LibraryHomeStrip";
import { useLibraryReader } from "./library-page/use-library-reader";
import { WikiReaderTopRow } from "./parts/wiki/WikiReaderTopRow";
import type { ReaderLanding } from "./parts/wiki/reader-landing";
import { useLibrarySources } from "./library-page/use-library-sources";
import { useLibraryWorkActivity } from "./library-page/use-library-work-activity";
import { useLibraryHome } from "./library-page/use-library-home";
import { useLibraryTurns } from "./library-page/use-library-turns";
import { useLibraryFocus } from "./library-page/use-library-focus";
import { useLibraryIndexColumn } from "./library-page/use-library-index-column";
import { useWikiTemplateProblems } from "./library-page/use-wiki-template-problems";
import { libraryHomeStrip } from "./library-page/library-home-strip";
import { LibraryNoFolderStage } from "./library-page/LibraryNoFolderStage";
import { LibraryEmptyFolderStage } from "./library-page/LibraryEmptyFolderStage";
import { LibraryIndexColumn } from "./library-page/LibraryIndexColumn";
import { LibraryDocumentColumn } from "./library-page/LibraryDocumentColumn";
import { LibraryHomePopovers } from "./library-page/LibraryHomePopovers";
import { AgentDoor } from "./parts/agent/AgentDoor";
import { SourceProgressBand } from "./parts/progress/SourceProgressBand";
import { useContinuePress } from "./parts/progress/use-continue-press";
import { LibraryWorkLine } from "./parts/progress/LibraryWorkLine";
import { useSourceFilter } from "./library-page/use-source-filter";
import { AfterFirstFrame } from "./library-page/AfterFirstFrame";
import { overviewNextBatch } from "./library-page/overview-next-batch";
import { checkOwner, folderRelativePage } from "./library-page/wiki-check-outcome";

/** A tool's file inside the folder by its folder-relative name; anything else as it came. */
function folderRelativeFile(target: string, vaultRoot: string): string {
  const root = vaultRoot.replace(/\/+$/, "");
  return target.startsWith(`${root}/`) ? target.slice(root.length + 1) : target;
}

/** The work card's box (`h-36` in `WorkRunCard`); a toast above it clears this much. */
const WORK_CARD_HEIGHT = "9rem";

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
  const [sourceCitation, setSourceCitation] = useState<{ path: string; anchor?: string } | null>(null);
  const [answerComparisonOpen, setAnswerComparisonOpen] = useState(false);
  const guideDoorRef = useRef<HTMLButtonElement | null>(null);
  const questionsDoorRef = useRef<HTMLButtonElement | null>(null);
  const compileClauseRef = useRef<HTMLButtonElement | null>(null);
  const overflowDoorRef = useRef<HTMLButtonElement | null>(null);

  useToastAnchor("bottom-right");
  const viewportDialogOpen = answerComparisonOpen;
  const workRunSnapshot = useWorkRunSnapshot();
  const workCardShown = workCardHoldsSeat(workRunSnapshot);
  useEffect(() => {
    const root = document.documentElement;
    const right = viewportDialogOpen ? LIBRARY_TOAST_DIALOG_OFFSET : LIBRARY_TOAST_RIGHT_OFFSET;
    const bottom = viewportDialogOpen ? LIBRARY_TOAST_DIALOG_OFFSET : LIBRARY_TOAST_BOTTOM_OFFSET;
    // The work card keeps this corner; a toast stands on top of it rather than over it.
    const toastBottom = workCardShown ? `calc(${bottom} + ${WORK_CARD_HEIGHT} + 12px)` : bottom;
    root.style.setProperty("--app-toast-right-offset", right);
    root.style.setProperty("--app-work-card-bottom-offset", bottom);
    root.style.setProperty("--app-toast-bottom-offset", toastBottom);
    root.style.setProperty("--app-toast-mobile-right-offset", right);
    root.style.setProperty("--app-toast-mobile-bottom-offset", toastBottom);
    return () => {
      root.style.removeProperty("--app-toast-right-offset");
      root.style.removeProperty("--app-work-card-bottom-offset");
      root.style.removeProperty("--app-toast-bottom-offset");
      root.style.removeProperty("--app-toast-mobile-right-offset");
      root.style.removeProperty("--app-toast-mobile-bottom-offset");
    };
  }, [viewportDialogOpen, workCardShown]);
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
    reducedMotion, localVault, manifest, hasFolder, selected, sourceCitation, docs, model, locale,
  });
  /*
   * Where the next page body lands once painted: a desk row's claim, or the scroll a Back returns
   * to. The trail is the pages a link press left, valid only while the page it leads from is open.
   */
  const landingRef = useRef<ReaderLanding | null>(null);
  const [trail, setTrail] = useState<{ at: string | null; stack: Array<{ slug: string; title: string; top: number }> }>({ at: null, stack: [] });
  const activeTrail = selected?.kind === "wiki" && trail.at === selected.slug ? trail.stack : EMPTY_TRAIL;
  const openLinkedPage = useCallback((slug: string) => {
    const from = reader.selectedWikiDoc;
    if (from) {
      const top = reader.articleScrollRef.current?.scrollTop ?? 0;
      setTrail({ at: slug, stack: [...activeTrail, { slug: from.slug, title: from.title, top }] });
    }
    choose({ kind: "wiki", slug });
  }, [activeTrail, choose, reader.articleScrollRef, reader.selectedWikiDoc]);
  const backAlongTrail = () => {
    const last = activeTrail[activeTrail.length - 1];
    if (!last) return;
    setTrail({ at: last.slug, stack: activeTrail.slice(0, -1) });
    landingRef.current = { slug: last.slug, top: last.top };
    choose({ kind: "wiki", slug: last.slug });
  };
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
  const answerRefresh = useAnswerRefresh({
    handle, sources: model.sources, vaultRoot: nativeVaultRootPath,
    writer: agent.runtime ? `agent:${agent.runtime.id}` : 'agent:unknown', start: agent.start,
  });
  const { capture: captureAnswerRefresh, receive: receiveAnswerRefresh } = answerRefresh;
  const knownSlugs = useMemo(
    () => new Set((manifest?.docs ?? []).map((doc) => doc.slug)),
    [manifest],
  );

  // `useChatWidth` keeps the in-flight drag locally, so a second copy publishes a stale width.
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

  const [importOpen, setImportOpen] = useState(() => pendingLibraryImport() !== null);
  const [importDestination, setImportDestination] = useState<ImportDestination>(() => pendingLibraryImport() ?? "sources");
  const home = useLibraryHome({
    selected, setHomeSurface, chatWidth, dockOpen, workActivity, importOpen,
  });
  const { homeVisible } = home;
  const connectors = useVaultConnectors(handle);
  const importRouter = useRouter();
  /* A concept named on a page opens where concepts are judged: the Ontology tab, at that document. */
  const openConcept = useCallback((slug: string) => {
    navigateWithViewTransition(() => importRouter.push(`/library/?tab=ontology&slug=${encodeURIComponent(slug)}`));
  }, [importRouter]);
  const openImport = useCallback(() => { setImportDestination("sources"); setImportOpen(true); }, []);
  const openPlanning = useCallback(() => { navigateWithViewTransition(() => importRouter.push("/planning/")); }, [importRouter]);
  // An import asked for from Planning arrives through a route crossfade; the dialog rises once the pane has settled.
  const routeCrossfading = useSyncExternalStore(subscribeRouteCrossfade, isRouteCrossfadeRunning, () => false);
  const importHeadsToPlanningRef = useRef(false);
  const offerPlanningAfterImport = useCallback(() => {
    if (!importHeadsToPlanningRef.current) return;
    importHeadsToPlanningRef.current = false;
    toast.show(t("sources.importedToPlanning"), "success", { label: t("sources.openPlanning"), onClick: openPlanning });
  }, [openPlanning, t, toast]);
  useEffect(() => { clearLibraryImportRequest(); }, []);
  const sendCompile = useCallback((batch: readonly LibrarySourceRow[]): boolean => {
    try {
      const localExecution = agent.route === 'local';
      agent.start(
        buildCompileBrief({
          sources: batch,
          existingPages: model.wikiPages,
          hashes: model.hashes,
          locale,
          execution: localExecution ? 'local' : 'acp',
          writerId: localExecution
            ? `model:${agent.localModel?.model ?? 'unknown'}`
            : `agent:${agent.runtime?.id ?? 'unknown'}`,
          vaultRoot: nativeVaultRootPath ?? "",
          now: new Date(),
        }),
        'compile',
        batch.map((row) => row.path),
      );
      return true;
    } catch (error) {
      toast.show(
        t("wiki.compileFailed", {
          reason: error instanceof Error ? error.message : String(error),
        }),
        "error",
      );
      return false;
    }
  }, [agent, locale, model.hashes, model.wikiPages, nativeVaultRootPath, t, toast]);
  const indexColumn = useLibraryIndexColumn({ segment, model });
  const { indexSegment, setReaderEl, indexCollapsed, libraryIsEmpty } = indexColumn;
  const bandShown = homeVisible && indexSegment !== 'wiki' && model.sources.length > 0;
  const sourceFilter = useSourceFilter({
    sources: model.sources, vaultScope: workVaultScope, indexColumn, listening: bandShown,
  });
  // A row picked on the Sources home belongs to its folder and narrows the index list with it.
  const [sourcePickAt, setSourcePickAt] = useState<{ scope: string; pick: SourcePick } | null>(null);
  const sourcePick = sourcePickAt?.scope === workVaultScope ? sourcePickAt.pick : null;
  const { unfold: unfoldIndex } = sourceFilter;
  const setSourcePick = useCallback(
    (pick: SourcePick | null) => {
      setSourcePickAt(pick ? { scope: workVaultScope, pick } : null);
      if (pick) unfoldIndex();
    },
    [unfoldIndex, workVaultScope],
  );
  const sourceGroupFilter = useMemo(() => {
    if (!sourcePick) return null;
    const keys = new Set(sourcePick.keys);
    return {
      label: sourcePick.grouping === "folder" ? t("sourcesHome.listFolder", { folder: sourcePick.name }) : t("sourcesHome.listType", { type: sourcePick.name }),
      includes: (row: LibrarySourceRow) => keys.has(sourceGroupKey(row, sourcePick.grouping)),
      onClear: () => setSourcePick(null),
    };
  }, [setSourcePick, sourcePick, t]);
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
  const agentDoor = nativeVaultRootPath !== null && (agent.route === "unavailable" || agent.route === "local");
  const { readerRef, paneBodyRef } = useLibraryFocus({
    selected, setSelected, mobileBrowseOpen, mobileBrowseBackRef, homeSurface,
    answerComparisonOpen, skipReaderFocusRef, agent, sources, workActivity,
  });
  const templateProblems = useWikiTemplateProblems({
    t, locale, toast, nativeVaultRootPath, turnRunning, choose, busy, model, agent, reader, turns,
  });
  // Each conversation reports only to the run it owns, so a newly seated agent cannot touch the check.
  const conversationOwner = checkOwner(nativeVaultRootPath, agent.runtime?.id ?? "");
  const observeCheckWork = useCallback((work: (WorkRunActivity & TurnWorkReport) | null) => {
    const turnId = workRuns.turnOwnedBy(conversationOwner);
    if (turnId !== null) {
      const target = work?.target && nativeVaultRootPath ? folderRelativeFile(work.target, nativeVaultRootPath) : work?.target ?? null;
      workRuns.observeTurnWork(turnId, work && { ...work, target }, Date.now());
    }
    const runId = workRuns.runOwnedBy(conversationOwner);
    if (!work || runId === null) return;
    const page = work.target ? folderRelativePage(work.target, nativeVaultRootPath) : null;
    workRuns.observeActivity(runId, { ...work, target: page });
  }, [conversationOwner, nativeVaultRootPath]);
  const observeTerminalTool = useCallback((event: Extract<AcpEvent, { kind: "tool" }>) => {
    handleTerminalToolObservation(event);
    const turnId = workRuns.turnOwnedBy(conversationOwner);
    if (turnId !== null && nativeVaultRootPath) workRuns.observeTurnTool(turnId, event, nativeVaultRootPath);
    const runId = workRuns.runOwnedBy(conversationOwner);
    const read = runId === null ? null : completedAcpReadEvent(event, nativeVaultRootPath, Date.now());
    if (runId !== null && read?.target) workRuns.observeRead(runId, read.target.ref);
  }, [conversationOwner, handleTerminalToolObservation, nativeVaultRootPath]);
  const reportCheckStop = useCallback((stop: (() => void) | null) => {
    const turnId = workRuns.turnOwnedBy(conversationOwner);
    if (turnId !== null) workRuns.setTurnStop(turnId, stop);
    const runId = workRuns.runOwnedBy(conversationOwner);
    if (runId !== null) workRuns.setStop(runId, stop);
  }, [conversationOwner]);
  // The conversation on screen is its turn's stage: no card stands for it while it is shown.
  useTurnStage(conversationOwner, dockOpen && hasFolder);
  const setAgentOpen = agent.setOpen;
  const setAgentRuntime = agent.setRuntimeId;
  // Opening the Library reads every finished turn of this folder, and a turn still running
  // brings its own conversation back on screen.
  const returningTurn = useRef(writingTurn);
  useEffect(() => {
    if (!hasFolder) return;
    workRuns.seeTurns(workVaultScope);
    const turn = returningTurn.current;
    if (!turn || turn.folder !== workVaultScope) return;
    setAgentRuntime(turn.runtimeId);
    setAgentOpen(true);
  }, [hasFolder, setAgentOpen, setAgentRuntime, workVaultScope]);
  // A turn's card door: its conversation, with the asking agent chosen again, or the page it wrote.
  useEffect(() => {
    if (!hasFolder) return;
    const takeTurnDoor = () => {
      const { turnDoor, runs } = workRuns.read();
      const entry = turnDoor ? runs.get(`turn:${turnDoor.turnId}`) : null;
      if (!turnDoor || entry?.kind !== "turn" || entry.run.folder !== workVaultScope) return;
      workRuns.takeTurnDoor(turnDoor.turnId);
      if (turnDoor.kind === "page") {
        choose({ kind: "wiki", slug: turnDoor.page });
        return;
      }
      setAgentRuntime(entry.run.runtimeId);
      setAgentOpen(true);
    };
    queueMicrotask(takeTurnDoor);
    return workRuns.subscribe(takeTurnDoor);
  }, [choose, hasFolder, setAgentOpen, setAgentRuntime, workVaultScope]);
  // The card elsewhere asked for a door; it opens once this folder's Library is on screen.
  useEffect(() => {
    if (!hasFolder) return;
    const takeDoor = () => {
      const { door, run } = workRuns.read();
      if (!door || !run || run.folder !== workVaultScope || door.runId !== run.id) return;
      workRuns.takeDoor(door.runId);
      if (door.kind === "results") choose({ kind: "report" });
      else setAgentOpen(true);
    };
    queueMicrotask(takeDoor);
    return workRuns.subscribe(takeDoor);
  }, [choose, hasFolder, setAgentOpen, workVaultScope]);
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
      onOpenAdvanced={() => { navigateWithViewTransition(() => importRouter.push(MCP_CONNECTORS_HREF)); }}
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
          indexBeside={!libraryIsEmpty && !indexCollapsed}
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
          conversationDoor={agent.openingRequest ? conversationDoor : null} sources={sources}
        />
        {agentDock}
        {importDialog}
        {findDocumentsDialog}
      </main>
    );
  }


  const narrowShowsReader = selected !== null || localReviewVisible;

  const openConversation = conversationDoor ? () => agent.setOpen(true) : null;
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
        handle={handle} nativeVaultRootPath={nativeVaultRootPath} selected={selected}
        mobileBrowseOpen={mobileBrowseOpen} setMobileBrowseOpen={setMobileBrowseOpen}
        mobileBrowseBackRef={mobileBrowseBackRef} browseFocusPendingRef={browseFocusPendingRef}
        searchHost={searchHost} setSearchHost={setSearchHost} setSourceCitation={setSourceCitation}
        sourceCitation={sourceCitation} compileRunning={compileRunning} runningSources={continueBatch.running}
        lintRunning={lintRunning} turnRunning={turnRunning}
        reportUnseen={reportUnseen} choose={choose} busy={busy} docs={docs} model={model} agent={agent}
        openImport={openImport} handleCompile={handleCompile} narrowShowsReader={narrowShowsReader}
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
            <div className="flex flex-none items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3 py-2">
              <button
                type="button"
                onClick={() => localReviewVisible ? agent.localCompile.dismiss() : setSelected(null)}
                disabled={localReviewVisible && localReviewBusy}
                data-testid="library-reader-back"
                className={controlClass({ shape: "chip", tone: "muted" })}
              >
                {t(localReviewVisible ? "localCompile.back" : "wikiReader.close")}
              </button>
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
                <LibraryWorkLine activity={libraryWorkActivity} onSelect={openWorkTarget} className="max-w-[45%] flex-none" />
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
                      // Reserved from the first paint while an agent can work here, so its first event moves nothing.
                      reserved={!turns.compileBlocked}
                      className="w-full"
                    />
                  ) : null}
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
        homeStrip={homeStrip} compileBatch={compileBatch}
      />
      {agentDock}

      {importDialog}

      {findDocumentsDialog}
    </main>
  );
}

const EMPTY_DOCS: never[] = [];
const EMPTY_TRAIL: never[] = [];

