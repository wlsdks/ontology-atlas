import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useTranslations } from "next-intl";
import { useLocalVault, useVaultSessionIdentityScope } from "@/entities/vault-session";
import { isWikiPage, type VaultDoc } from "@/entities/docs-vault";
import {
  type LintFinding,
  type LintNodeCandidate,
  appendWikiLog,
  buildLintBrief,
  buildProposeNodeBrief,
  describeCompileTurn,
  describeLintTurn,
  judgePageWrite,
  wikiPagePathOf,
  wikiNodeIndexOfDocs,
  dropCandidatesWithNodes,
  planQuestionDeskReportFile,
  questionDeskReportFileCurrent,
  buildFixBrief,
  buildAnswerPage,
  buildHumanPage,
  createWikiFile,
  deleteWikiFile,
  writeWikiFile,
  clearLibraryWork,
  completeLibraryWork,
  libraryWorkErrorEvent,
  observedWikiWriteEvents,
  libraryWorkSince,
  type LibraryUiModel,
} from "@/features/library";
import type { AcpTurnCompletion } from "@/features/acp-session";
import { latestReport, useFolderWorkRun, workRuns, type TurnToolEvent } from "@/features/work-run";
import { useWikiWriteMode } from "@/shared/lib/preferences/library-preferences";
import { nativeVaultFileHashes } from "@/shared/lib/vault-folder/native-vault/tauri-vault-fingerprint";
import { parseFrontmatter } from "@/shared/lib/vault-document/parse-frontmatter";
import { citedPassage as resolveCitedPassage } from "@/shared/lib/library/source-passage";
import { useFailureSentence } from "@/shared/lib/failures/use-failure-sentence";
import { useToast } from "@/shared/ui";
import { isWikiFurnitureSlug } from "@/shared/lib/library/wiki-page-schema";
import { libraryCompileBlockedReason, libraryTransferSentence } from "../../lib/compile/compile-availability";
import { useLibraryAgent } from "../../lib/agent/use-library-agent";
import { useAnswerRefresh } from "../../lib/questions/use-answer-refresh";
import { findingKey, reportOutline } from "../parts/wiki/LibraryCheckReport";
import type { LibraryAgentOpeningRequest } from "../parts/agent/LibraryAgentDock";
import type { QuestionDeskReportRequest } from "../parts/questions/LibraryQuestionDesk";
import type { LibrarySelection } from "./library-page-state";
import type { useLibraryWorkActivity } from "./use-library-work-activity";
import { checkOwner, wikiCheckOutcome, wikiCheckPayload } from "./wiki-check-outcome";
import { libraryAutoDecision, NATIVE_FOLDER_READS } from "../../lib/turns/library-auto-decision";
import { readLiveLibraryFolder } from "../../lib/turns/library-folder-mirror";
import { writingDoor } from "../../lib/turns/writing-door";
import { useEditedPageText } from "./use-edited-page-text";

/** The tool calls of a finished turn, as the work card counts them. */
function turnToolEvents(completion: AcpTurnCompletion): TurnToolEvent[] {
  const tools: TurnToolEvent[] = [];
  for (const event of completion.events) {
    if (event.kind === "tool") tools.push({ id: event.id, toolKind: event.toolKind, status: event.status, title: event.title, rawInput: event.rawInput });
  }
  return tools;
}

export function matchLibraryOpeningRequest(
  text: string,
  request: LibraryAgentOpeningRequest | null,
  consumedNonce: number | null,
): LibraryAgentOpeningRequest | null {
  return request && request.nonce !== consumedNonce && request.text.trim() === text.trim()
    ? request
    : null;
}

export interface RetainedLibraryAnswer {
  generation: number;
  question: string;
  text: string;
  askedOn: string | null;
  origin?: 'question-report';
}

export type LibraryAskContext = {
  question: string;
  askedOn: string | null;
  report?: Pick<QuestionDeskReportRequest, 'searchId' | 'listingVersion' | 'vaultScope' | 'coverage' | 'limits'> & { epoch: number };
};

export function clearFiledAnswer(current: RetainedLibraryAnswer | null, filed: RetainedLibraryAnswer): RetainedLibraryAnswer | null {
  return current === filed ? null : current;
}

export function restoreFiledAnswer(current: RetainedLibraryAnswer | null, filed: RetainedLibraryAnswer, generation: number): RetainedLibraryAnswer | null {
  return generation === filed.generation && current === null ? filed : current;
}

const NO_FIXED_KEYS: ReadonlySet<string> = new Set();

export function useLibraryTurns({
  t, locale, toast, failureSentence, localVault, markSelfWrite, unmarkSelfWrite, workVaultScope,
  latestWorkVaultScopeRef, handle, nativeVaultRootPath, setSelected, latestSelectedRef,
  skipReaderFocusRef, setTurnRunning, setCompileRunning, choose,
  docs, model, currentDeskListingVersion, latestDeskListingVersionRef, agent, captureAnswerRefresh,
  receiveAnswerRefresh, knownSlugs, workActivity, onImportCompleted,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  locale: string;
  toast: ReturnType<typeof useToast>;
  failureSentence: ReturnType<typeof useFailureSentence>;
  localVault: ReturnType<typeof useLocalVault>;
  markSelfWrite: (slug: string) => void;
  unmarkSelfWrite: (slug: string) => void;
  workVaultScope: ReturnType<typeof useVaultSessionIdentityScope>;
  latestWorkVaultScopeRef: RefObject<ReturnType<typeof useVaultSessionIdentityScope>>;
  handle: FileSystemDirectoryHandle | null;
  nativeVaultRootPath: string | null;
  setSelected: Dispatch<SetStateAction<LibrarySelection>>;
  latestSelectedRef: RefObject<LibrarySelection>;
  skipReaderFocusRef: RefObject<boolean>;
  setTurnRunning: Dispatch<SetStateAction<boolean>>;
  setCompileRunning: Dispatch<SetStateAction<boolean>>;
  choose: (next: LibrarySelection) => void;
  docs: VaultDoc[];
  model: LibraryUiModel;
  currentDeskListingVersion: string;
  latestDeskListingVersionRef: RefObject<string>;
  agent: ReturnType<typeof useLibraryAgent>;
  /** A service import turn ended with the agent's work done. */
  onImportCompleted: () => void;
  captureAnswerRefresh: ReturnType<typeof useAnswerRefresh>["capture"];
  receiveAnswerRefresh: ReturnType<typeof useAnswerRefresh>["receive"];
  knownSlugs: Set<string>;
  workActivity: ReturnType<typeof useLibraryWorkActivity>;
}) {
  const { libraryWorkActivity, setLibraryWorkActivity } = workActivity;
  const writeMode = useWikiWriteMode();
  const pendingAskRef = useRef<LibraryAskContext | null>(null);
  const retryAskRef = useRef<{ nonce: number; text: string; scope: string; context: LibraryAskContext } | null>(null);
  const activeReadOnlyTurnRef = useRef(false);
  // Only the check is read-only to the session; it and a turn that may write keep running after the Library goes.
  const activeCheckTurnRef = useRef(false);
  const activeOutlivingTurnRef = useRef(false);
  const turnReadOnly = useCallback(() => activeCheckTurnRef.current, []);
  const turnOutlivesScreen = useCallback(() => activeOutlivingTurnRef.current, []);
  // A check can finish after the Library is gone; opening its report then would mark it read unseen.
  const pageShownRef = useRef(true);
  useEffect(() => {
    pageShownRef.current = true;
    return () => { pageShownRef.current = false; };
  }, []);
  const [lastAnswer, setLastAnswer] = useState<RetainedLibraryAnswer | null>(null);
  const [deskReport, setDeskReport] = useState<{ answer: RetainedLibraryAnswer; searchId: number; listingVersion: string; vaultScope: string; coverage: string; limits: string; generatedAt: string } | null>(null);
  const [deskWorkRequest, setDeskWorkRequest] = useState<{ scope: string; startedAt: number } | null>(null);
  const deskWorkActivity = libraryWorkSince(libraryWorkActivity, deskWorkRequest?.scope === workVaultScope ? deskWorkRequest.startedAt : null);
  const latestDeskReportRef = useRef(deskReport);
  useEffect(() => { latestDeskReportRef.current = deskReport; }, [deskReport]);
  const reportEpochRef = useRef(0);
  const invalidateDeskReport = useCallback(() => {
    reportEpochRef.current += 1;
    retryAskRef.current = null;
    if (pendingAskRef.current?.report) pendingAskRef.current = null;
    const previous = latestDeskReportRef.current;
    latestDeskReportRef.current = null;
    if (previous) setLastAnswer((current) => current === previous.answer ? null : current);
    setDeskReport(null);
  }, []);
  const previousReportScopeRef = useRef(workVaultScope);
  useEffect(() => {
    if (previousReportScopeRef.current === workVaultScope) return;
    previousReportScopeRef.current = workVaultScope;
    pendingAskRef.current = null;
    retryAskRef.current = null;
    queueMicrotask(invalidateDeskReport);
  }, [invalidateDeskReport, workVaultScope]);
  const answerGenerationRef = useRef(0);
  const filedAnswersRef = useRef(new WeakSet<RetainedLibraryAnswer>());
  const [filingAnswer, setFilingAnswer] = useState<RetainedLibraryAnswer | null>(null);
  const [fileAnswerNote, setFileAnswerNote] = useState<string | null>(null);
  const consumedOpeningNonceRef = useRef<number | null>(null);
  const conceptIndex = useMemo(() => wikiNodeIndexOfDocs(docs), [docs]);
  const editedPageText = useEditedPageText(nativeVaultRootPath, docs);
  const judgeWrite = useCallback(
    (request: { filePath: string | null; rawInput: Record<string, unknown>; toolKind: string | null }) => {
      if (!nativeVaultRootPath || request.toolKind === "read") return null;
      const path = wikiPagePathOf(request.filePath, nativeVaultRootPath);
      // A whole-file write needs no current text; an edit waits for its page's read.
      const current = path && typeof request.rawInput.content !== "string" ? editedPageText(path) : null;
      if (current === undefined) return null;
      return judgePageWrite({
        request,
        vaultRoot: nativeVaultRootPath,
        currentText: () => current,
        knownSources: model.sources.map((row) => row.path),
        nodes: conceptIndex,
      });
    },
    [conceptIndex, editedPageText, model.sources, nativeVaultRootPath],
  );
  const pendingFixRef = useRef<LintFinding | null>(null);
  const handleFix = useCallback(
    (finding: LintFinding) => {
      if (!nativeVaultRootPath) return;
      pendingFixRef.current = finding;
      agent.start(buildFixBrief({ finding, locale, vaultRoot: nativeVaultRootPath }), "fix");
    },
    [agent, locale, nativeVaultRootPath],
  );

  const handleNewPage = useCallback(
    async (title: string) => {
      if (!handle) return false;
      const page = buildHumanPage({ title, now: new Date() });
      if (knownSlugs.has(page.slug)) {
        toast.show(t("wiki.newPageExists", { page: page.slug }), "error");
        setSelected({ kind: "wiki", slug: page.slug });
        return true;
      }
      let nativeWriteReserved = false;
      try {
        if (nativeVaultRootPath) {
          markSelfWrite(page.slug);
          nativeWriteReserved = true;
          if (!await createWikiFile(handle, page.path, page.text)) throw new Error(`Document already exists: "${page.slug}"`);
        } else {
          await writeWikiFile(handle, page.path, page.text);
          markSelfWrite(page.slug);
        }
        setSelected({ kind: "wiki", slug: page.slug });
        toast.show(
          t("wiki.newPageDone"),
          "success",
          {
            label: t("wiki.undo"),
            onClick: () => {
              void deleteWikiFile(handle, page.path).then(
                () => {
                  setSelected((current) => (current?.kind === "wiki" && current.slug === page.slug ? null : current));
                  toast.show(t("wiki.undone", { page: page.slug }), "success");
                },
                () => toast.show(t("wiki.undoFailed"), "error"),
              );
            },
          },
          { description: title },
        );
        return true;
      } catch (err) {
        if (nativeWriteReserved) unmarkSelfWrite(page.slug);
        toast.show(failureSentence(err, t("wiki.newPageFailed")).sentence, "error");
        return false;
      }
    },
    [failureSentence, handle, knownSlugs, markSelfWrite, nativeVaultRootPath, setSelected, t, toast, unmarkSelfWrite],
  );

  const handleFileAnswer = useCallback(async (answerOverride?: string) => {
    if (!lastAnswer || !handle || lastAnswer.generation !== answerGenerationRef.current || filedAnswersRef.current.has(lastAnswer)) return;
    if (lastAnswer.origin === 'question-report' && answerOverride === undefined) return;
    const filed = lastAnswer;
    const selectionAtFileStart = latestSelectedRef.current;
    const input = {
      question: lastAnswer.question,
      answer: answerOverride ?? lastAnswer.text,
      askedOn: lastAnswer.askedOn,
      writer: agent.runtime ? `agent:${agent.runtime.id}` : "agent:unknown",
      now: new Date(),
      knownSources: model.sources.map((row) => row.path),
      pagesForSource: (path: string) =>
        [...model.pairing.originalsByWiki.entries()]
          .filter(([, originals]) => originals.some((original) => original.path === path))
          .map(([slug]) => slug),
    };
    let page = buildAnswerPage(input);
    if (page.problems.length > 0) {
      const refusal = t("wiki.fileAnswerRejected", { code: page.problems[0]!.code });
      setFileAnswerNote(refusal);
      toast.show(refusal, "error");
      return;
    }
    // Lock the exact answer synchronously; two presses before a React commit still
    // create only one write. A later answer can be filed independently.
    filedAnswersRef.current.add(filed);
    setFilingAnswer(filed);
    let reservedSelfWrite: string | null = null;
    try {
      const cited = parseFrontmatter(page.text).frontmatter.sources;
      const observedInput = {
        ...input,
        observations: nativeVaultRootPath && Array.isArray(cited)
          ? await nativeVaultFileHashes(nativeVaultRootPath, cited.filter((path): path is string => typeof path === 'string')) ?? undefined
          : undefined,
        observedAt: new Date().toISOString(),
      };
      page = buildAnswerPage(observedInput);
      let created = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        markSelfWrite(page.slug);
        reservedSelfWrite = page.slug;
        if (await createWikiFile(handle, page.path, page.text)) {
          created = true;
          break;
        }
        unmarkSelfWrite(page.slug);
        reservedSelfWrite = null;
        page = buildAnswerPage(observedInput);
      }
      if (!created) throw new Error('Could not reserve a fresh answer filename; existing pages were preserved.');
      reservedSelfWrite = null;
      setLastAnswer((current) => clearFiledAnswer(current, filed));
      setSelected((current) =>
        answerGenerationRef.current === filed.generation && current === selectionAtFileStart
          ? { kind: "wiki", slug: page.slug }
          : current,
      );
      setFileAnswerNote(null);
      toast.show(t("wiki.fileAnswerDone", { page: page.slug }), "success", {
        label: t("wiki.undo"),
        onClick: () => {
            void deleteWikiFile(handle, page.path).then(
              () => {
              filedAnswersRef.current.delete(filed);
              setLastAnswer((current) => restoreFiledAnswer(current, filed, answerGenerationRef.current));
              setSelected((current) => (current?.kind === "wiki" && current.slug === page.slug ? null : current));
              toast.show(t("wiki.undone", { page: page.slug }), "success");
            },
            () => toast.show(t("wiki.undoFailed"), "error"),
          );
        },
      });
    } catch (err) {
      if (reservedSelfWrite) unmarkSelfWrite(reservedSelfWrite);
      filedAnswersRef.current.delete(filed);
      const refusal = failureSentence(err, t("wiki.fileAnswerRejected", { code: "write" })).sentence;
      setFileAnswerNote(refusal);
      toast.show(refusal, "error");
    } finally {
      setFilingAnswer((current) => current === filed ? null : current);
    }
  }, [agent.runtime, failureSentence, handle, lastAnswer, latestSelectedRef, markSelfWrite, model.pairing.originalsByWiki, model.sources, nativeVaultRootPath, setSelected, t, toast, unmarkSelfWrite]);

  const handleFileReport = useCallback(async () => {
    if (!deskReport || deskReport.answer !== lastAnswer || !handle) return;
    if (!questionDeskReportFileCurrent(deskReport.vaultScope, workVaultScope, deskReport.listingVersion, currentDeskListingVersion)) {
      setFileAnswerNote(t('questionDesk.report.outdated'));
      return;
    }
    setFileAnswerNote(null);
    const plan = planQuestionDeskReportFile({
      question: deskReport.answer.question, text: deskReport.answer.text,
      coverage: deskReport.coverage, limits: deskReport.limits, generatedAt: deskReport.generatedAt,
    }, locale, new Set(model.sources.map((source) => source.path)));
    if (!plan.ok) { setFileAnswerNote(t(`questionDesk.report.fileRefused.${plan.reason}`)); return; }
    const bytesByPath = new Map<string, Uint8Array>();
    try {
      for (const { path, anchor } of plan.citations) {
        const listed = model.sources.find((source) => source.path === path);
        const sourceHandle = localVault.sourceHandles.get(path);
        if (!listed || !sourceHandle) { setFileAnswerNote(t('questionDesk.report.fileRefused.source')); return; }
        let bytes = bytesByPath.get(path);
        if (!bytes) {
          const file = await sourceHandle.getFile();
          if (file.lastModified !== listed.mtime || (typeof file.size === 'number' && file.size !== listed.bytes)) { setFileAnswerNote(t('questionDesk.report.fileRefused.changed')); return; }
          bytes = new Uint8Array(await file.arrayBuffer());
          bytesByPath.set(path, bytes);
        }
        if (resolveCitedPassage(bytes, path, anchor).state !== 'resolved') { setFileAnswerNote(t('questionDesk.report.fileRefused.anchor')); return; }
      }
      if (answerGenerationRef.current !== deskReport.answer.generation || latestDeskReportRef.current !== deskReport
        || !questionDeskReportFileCurrent(deskReport.vaultScope, latestWorkVaultScopeRef.current,
          deskReport.listingVersion, latestDeskListingVersionRef.current)) {
        setFileAnswerNote(t('questionDesk.report.outdated'));
        return;
      }
      await handleFileAnswer(plan.answer);
    } catch { setFileAnswerNote(t('questionDesk.report.fileRefused.source')); }
  }, [currentDeskListingVersion, deskReport, handle, handleFileAnswer, lastAnswer, latestDeskListingVersionRef, latestWorkVaultScopeRef, localVault.sourceHandles, locale, model.sources, t, workVaultScope]);

  // Read at each request, not from this render: a turn that outlives the page keeps this callback.
  const autoDecide = useCallback(
    async (request: { filePath: string | null; rawInput: Record<string, unknown>; toolKind: string | null; toolName: string | null }) => {
      if (activeReadOnlyTurnRef.current || !nativeVaultRootPath || captureAnswerRefresh()) return null;
      return libraryAutoDecision(request, nativeVaultRootPath, readLiveLibraryFolder(), NATIVE_FOLDER_READS);
    },
    [captureAnswerRefresh, nativeVaultRootPath],
  );

  const pageBodyRef = useRef<HTMLDivElement | null>(null);
  const checkRun = useFolderWorkRun(workVaultScope);
  const { candidates, findings } = wikiCheckPayload(checkRun);
  const fixedKeys = latestReport(checkRun)?.handled ?? NO_FIXED_KEYS;
  const openCandidates = useMemo(() => dropCandidatesWithNodes(candidates, docs), [candidates, docs]);
  const reportHeadings = useMemo(
    () => reportOutline(model.structural, findings, openCandidates.length, t),
    [findings, model.structural, openCandidates.length, t],
  );
  const reportDoorCount = useMemo(() => {
    const structuralCount = model.structural.findingCount;
    const agentCount = findings.length + openCandidates.length;
    if (model.wikiPages.length === 0 && structuralCount + agentCount === 0 && !model.log.lastLint) {
      return null;
    }
    return structuralCount + agentCount;
  }, [findings.length, model.log.lastLint, model.structural.findingCount, model.wikiPages.length, openCandidates.length]);
  const latestDocsRef = useRef(docs);
  useEffect(() => {
    latestDocsRef.current = docs;
  }, [docs]);
  const handleTurnStarted = useCallback(
    (start: { text: string; startedAt: string; runtimeId: string; vaultRoot: string | null }) => {
      if (!handle) return null;
      const generation = ++answerGenerationRef.current;
      const opening = matchLibraryOpeningRequest(start.text, agent.openingRequest, consumedOpeningNonceRef.current);
      if (opening) consumedOpeningNonceRef.current = opening.nonce;
      const exactAsk = matchLibraryOpeningRequest(start.text, agent.openingRequest, null);
      const kind = opening?.kind ?? "ask";
      const door = writingDoor(kind, exactAsk?.kind !== 'ask');
      activeReadOnlyTurnRef.current = exactAsk?.kind === 'ask' || kind === 'lint';
      activeCheckTurnRef.current = kind === 'lint';
      activeOutlivingTurnRef.current = kind === 'lint' || door !== null;
      const refreshTurn = kind === 'refresh' ? captureAnswerRefresh() : null;
      const selectionAtStart = latestSelectedRef.current;
      let asked: LibraryAskContext | null = null;
      if (exactAsk?.kind === 'ask') {
        if (opening && pendingAskRef.current) {
          retryAskRef.current = { nonce: exactAsk.nonce, text: exactAsk.text.trim(), scope: workVaultScope, context: pendingAskRef.current };
          pendingAskRef.current = null;
        }
        const retry = retryAskRef.current;
        if (retry?.nonce === exactAsk.nonce && retry.text === start.text.trim() && retry.scope === workVaultScope
          && (!retry.context.report || (retry.context.report.epoch === reportEpochRef.current
            && retry.context.report.vaultScope === workVaultScope
            && retry.context.report.listingVersion === currentDeskListingVersion))) {
          asked = retry.context;
          if (asked.report) setDeskWorkRequest({ scope: workVaultScope, startedAt: Date.now() });
        }
      } else {
        retryAskRef.current = null;
        if (kind === 'ask') asked = { question: start.text.trim(), askedOn: selectionAtStart?.kind === 'wiki' ? selectionAtStart.slug : null };
      }
      setLastAnswer(null);
      setDeskReport(null);
      setFileAnswerNote(null);
      const stamp = (list: readonly VaultDoc[]) =>
        new Map(
          list
            .filter((doc) => isWikiPage(doc) && !isWikiFurnitureSlug(doc.slug))
            .map((doc) => [doc.slug, doc.mtime ?? 0] as const),
        );
      const currentDocs = () => {
        const live = readLiveLibraryFolder();
        return live.vaultRoot !== null && live.vaultRoot === start.vaultRoot ? live.docs : latestDocsRef.current;
      };
      const before = stamp(currentDocs());
      // The log names the sources this turn was sent, not every source still waiting.
      const sources = opening?.sources ? [...opening.sources] : [];
      const writer = agent.runtime ? `agent:${agent.runtime.id}` : "agent:unknown";
      setTurnRunning(true);
      if (kind === "compile") setCompileRunning(true);
      // The check's run is the app session's, so its result lands after this page is gone.
      const checkRunId = kind === "lint"
        ? workRuns.begin({
            folder: workVaultScope,
            owner: checkOwner(start.vaultRoot, start.runtimeId),
            agent: agent.runtime?.label ?? "",
            startedAt: Date.now(),
          })
        : null;
      // A turn that may write is the app session's too: it keeps running and its card stands elsewhere.
      const turnRunId = door !== null && start.vaultRoot
        ? workRuns.beginTurn({
            folder: workVaultScope,
            folderName: handle.name,
            owner: checkOwner(start.vaultRoot, start.runtimeId),
            runtimeId: start.runtimeId,
            agent: agent.runtime?.label ?? "",
            door,
            request: door === "typed" ? start.text : "",
            startedAt: Date.now(),
          })
        : null;
      return async (completion: AcpTurnCompletion) => {
        if (checkRunId !== null) workRuns.finish(checkRunId, wikiCheckOutcome(completion), Date.now());
        if (turnRunId !== null && start.vaultRoot) {
          workRuns.finishTurn(turnRunId, { outcome: completion.outcome, events: turnToolEvents(completion), vaultRoot: start.vaultRoot }, Date.now());
        }
        if (generation !== answerGenerationRef.current) return;
        activeReadOnlyTurnRef.current = false;
        activeCheckTurnRef.current = false;
        activeOutlivingTurnRef.current = false;
        setTurnRunning(false);
        setCompileRunning(false);
        if (kind === 'refresh') {
          setLibraryWorkActivity(clearLibraryWork);
          if (refreshTurn) receiveAnswerRefresh(refreshTurn,
            [...completion.events].reverse().find((event) => event.kind === 'agent')?.text ?? null,
            completion.outcome);
          return;
        }
        // A cancelled or failed turn reported nothing: reading its absence as "nothing to fix"
        // would print a clean report over a check that never finished.
        if (completion.outcome !== "completed") {
          setLibraryWorkActivity((current) =>
            completion.outcome === "failed"
              ? completeLibraryWork(
                  clearLibraryWork(current),
                  libraryWorkErrorEvent(`acp:${completion.userEventId}:failure`, Date.now()),
                )
              : clearLibraryWork(current),
          );
          return;
        }
        const after = stamp(currentDocs());
        const observedAt = Date.now();
        const receipts = observedWikiWriteEvents(before, after, observedAt);
        setLibraryWorkActivity((current) =>
          receipts.reduce(completeLibraryWork, clearLibraryWork(current)),
        );
        const lastAgentText = [...completion.events].reverse().find((event) => event.kind === "agent")?.text ?? null;
        if (kind === "fix" && pendingFixRef.current) {
          const key = findingKey(pendingFixRef.current);
          pendingFixRef.current = null;
          workRuns.markHandled(workVaultScope, key);
        }
        if (kind === "lint" && pageShownRef.current) {
          const current = latestSelectedRef.current;
          if (current === null || current.kind === "report") {
            skipReaderFocusRef.current = true;
            choose({ kind: "report" });
          }
        }
        if (kind === "ask") {
          if (generation === answerGenerationRef.current && asked && lastAgentText && lastAgentText.trim()
            && (!asked.report || asked.report.epoch === reportEpochRef.current)) {
            const answer: RetainedLibraryAnswer = { generation, question: asked.question, text: lastAgentText, askedOn: asked.askedOn,
              ...(asked.report ? { origin: 'question-report' as const } : {}) };
            setLastAnswer(answer);
            if (asked.report) {
              const { epoch: _epoch, ...report } = asked.report;
              setDeskReport({ answer, ...report, generatedAt: completion.endedAt });
            }
          }
          return;
        }
        if (kind === "import") onImportCompleted();
        if (kind === "propose" || kind === "import") return;
        const summary =
          kind === "lint"
            ? describeLintTurn(lastAgentText)
            : describeCompileTurn({ sources: kind === "fix" ? [] : sources, before, after });
        try {
          await appendWikiLog(handle, { at: completion.endedAt, kind, summary, writer });
        } catch {
        }
      };
    },
    [agent.openingRequest, agent.runtime, captureAnswerRefresh, choose, currentDeskListingVersion, handle, latestSelectedRef, onImportCompleted, receiveAnswerRefresh, setCompileRunning, setLibraryWorkActivity, setTurnRunning, skipReaderFocusRef, workVaultScope],
  );

  const hasOntology = useMemo(
    () => docs.some((doc) => typeof doc.frontmatter.kind === "string" && doc.frontmatter.kind.trim() !== "" && !doc.slug.startsWith("wiki/")),
    [docs],
  );

  const handlePropose = useCallback(
    (candidate: LintNodeCandidate) => {
      try {
        agent.start(
          buildProposeNodeBrief({ candidate, locale, vaultRoot: nativeVaultRootPath ?? "" }),
          "propose",
        );
      } catch (error) {
        toast.show(
          t("wiki.compileFailed", { reason: error instanceof Error ? error.message : String(error) }),
          "error",
        );
      }
    },
    [agent, locale, nativeVaultRootPath, t, toast],
  );

  const handleLint = useCallback(() => {
    try {
      agent.start(
        buildLintBrief({
          pages: model.wikiPages,
          findings: new Map(
            [...model.verdicts].filter(([, verdict]) => !verdict.ok).map(([slug, verdict]) => [slug, verdict.problems]),
          ),
          locale,
          vaultRoot: nativeVaultRootPath ?? "",
        }),
        "lint",
      );
    } catch (error) {
      toast.show(
        t("wiki.compileFailed", {
          reason: error instanceof Error ? error.message : String(error),
        }),
        "error",
      );
    }
  }, [agent, locale, model.verdicts, model.wikiPages, nativeVaultRootPath, t, toast]);

  const compileBlocked = libraryCompileBlockedReason(
    {
      route: agent.route,
      inApp: nativeVaultRootPath !== null,
      sourceCount: model.sources.length,
      needsCompileCount: model.needsCompileCount,
      localModel: agent.localModel,
      sources: model.sources,
    },
    t,
  );
  const compileTransfer = libraryTransferSentence(
    { route: agent.route, localModel: agent.localModel },
    t,
  );

  const agentOnlyReason =
    agent.route === "agent"
      ? null
      : nativeVaultRootPath === null
        ? t("stage.blockedWeb")
        : agent.route === "checking"
          ? t("stage.blockedChecking")
          : agent.route === "unavailable"
            ? t("stage.blockedNoAgent")
            : t("stage.blockedLocalOnly");

  return {
    writeMode, pendingAskRef, retryAskRef, activeReadOnlyTurnRef, turnReadOnly, turnOutlivesScreen, checkRun,
    checkFolder: workVaultScope, lastAnswer, setLastAnswer,
    deskReport, setDeskReport, deskWorkRequest, setDeskWorkRequest, deskWorkActivity,
    latestDeskReportRef, reportEpochRef, invalidateDeskReport, previousReportScopeRef,
    answerGenerationRef, filedAnswersRef, filingAnswer, setFilingAnswer, fileAnswerNote,
    setFileAnswerNote, consumedOpeningNonceRef, judgeWrite, pendingFixRef, fixedKeys,
    handleFix, handleNewPage, handleFileAnswer, handleFileReport, autoDecide, pageBodyRef,
    candidates, findings, openCandidates, reportHeadings,
    reportDoorCount, latestDocsRef, handleTurnStarted, hasOntology, handlePropose, handleLint,
    compileBlocked, compileTransfer, agentOnlyReason,
  };
}
