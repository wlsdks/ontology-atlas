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
  parseLintCandidates,
  selectCompileTargets,
  dropCandidatesWithNodes,
  wikiPagePathOf,
  planQuestionDeskReportFile,
  questionDeskReportFileCurrent,
  buildFixBrief,
  parseLintFindings,
  buildAnswerPage,
  automaticWikiWriteAllowed,
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
import { useWikiWriteMode } from "@/shared/lib/appearance-preferences";
import { nativeVaultFileHashes } from "@/shared/lib/tauri-vault-fs";
import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";
import { citedPassage as resolveCitedPassage } from "@/shared/lib/source-passage";
import { useFailureSentence } from "@/shared/lib/use-failure-sentence";
import { useToast } from "@/shared/ui";
import { isWikiFurnitureSlug } from "@/shared/lib/wiki-page-schema";
import { libraryCompileBlockedReason, libraryTransferSentence } from "../../lib/compile-availability";
import { useLibraryAgent } from "../../lib/use-library-agent";
import { useAnswerRefresh } from "../../lib/use-answer-refresh";
import { findingKey, reportOutline } from "../parts/LibraryCheckReport";
import type { LibraryAgentOpeningRequest } from "../parts/LibraryAgentDock";
import type { QuestionDeskReportRequest } from "../parts/LibraryQuestionDesk";
import type { LibrarySelection } from "./library-page-state";
import type { useLibraryWorkActivity } from "./use-library-work-activity";

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

export function useLibraryTurns({
  t, locale, toast, failureSentence, localVault, markSelfWrite, unmarkSelfWrite, workVaultScope,
  latestWorkVaultScopeRef, handle, nativeVaultRootPath, setSelected, latestSelectedRef,
  skipReaderFocusRef, setTurnRunning, setCompileRunning, setLintRunning, setReportUnseen, choose,
  docs, model, currentDeskListingVersion, latestDeskListingVersionRef, agent, captureAnswerRefresh,
  receiveAnswerRefresh, knownSlugs, workActivity,
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
  setLintRunning: Dispatch<SetStateAction<boolean>>;
  setReportUnseen: Dispatch<SetStateAction<boolean>>;
  choose: (next: LibrarySelection) => void;
  docs: VaultDoc[];
  model: LibraryUiModel;
  currentDeskListingVersion: string;
  latestDeskListingVersionRef: RefObject<string>;
  agent: ReturnType<typeof useLibraryAgent>;
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
  const judgeWrite = useCallback(
    (request: { filePath: string | null; rawInput: Record<string, unknown>; toolKind: string | null }) =>
      nativeVaultRootPath
        ? judgePageWrite({
            request,
            vaultRoot: nativeVaultRootPath,
            currentText: (slug) => model.pageTexts.get(slug) ?? null,
            knownSources: model.sources.map((row) => row.path),
          })
        : null,
    [model.pageTexts, model.sources, nativeVaultRootPath],
  );
  const pendingFixRef = useRef<LintFinding | null>(null);
  const [fixedKeys, setFixedKeys] = useState<ReadonlySet<string>>(() => new Set());
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

  const autoDecide = useCallback(
    (request: { filePath: string | null; rawInput: Record<string, unknown>; toolKind: string | null; toolName: string | null }) => {
      if (activeReadOnlyTurnRef.current) return null;
      if (writeMode !== "auto" || !nativeVaultRootPath || captureAnswerRefresh()) return null;
      const page = wikiPagePathOf(request.filePath, nativeVaultRootPath);
      if (!page || !automaticWikiWriteAllowed(page)) return null;
      const verdict = judgeWrite(request);
      return verdict?.ok ? page : null;
    },
    [captureAnswerRefresh, judgeWrite, nativeVaultRootPath, writeMode],
  );

  const pageBodyRef = useRef<HTMLDivElement | null>(null);
  const [candidates, setCandidates] = useState<LintNodeCandidate[]>([]);
  const [findings, setFindings] = useState<LintFinding[]>([]);
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
    (start: { text: string; startedAt: string }) => {
      if (!handle) return null;
      const generation = ++answerGenerationRef.current;
      const opening = matchLibraryOpeningRequest(start.text, agent.openingRequest, consumedOpeningNonceRef.current);
      if (opening) consumedOpeningNonceRef.current = opening.nonce;
      const exactAsk = matchLibraryOpeningRequest(start.text, agent.openingRequest, null);
      const kind = opening?.kind ?? "ask";
      activeReadOnlyTurnRef.current = exactAsk?.kind === 'ask';
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
      const stamp = (list: typeof docs) =>
        new Map(
          list
            .filter((doc) => isWikiPage(doc) && !isWikiFurnitureSlug(doc.slug))
            .map((doc) => [doc.slug, doc.mtime ?? 0] as const),
        );
      const before = stamp(latestDocsRef.current);
      const sources = selectCompileTargets(model.sources).map((row) => row.path);
      const writer = agent.runtime ? `agent:${agent.runtime.id}` : "agent:unknown";
      setTurnRunning(true);
      if (kind === "compile") setCompileRunning(true);
      if (kind === "lint") setLintRunning(true);
      return async (completion: AcpTurnCompletion) => {
        if (generation !== answerGenerationRef.current) return;
        activeReadOnlyTurnRef.current = false;
        setTurnRunning(false);
        setCompileRunning(false);
        setLintRunning(false);
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
        const after = stamp(latestDocsRef.current);
        const observedAt = Date.now();
        const receipts = observedWikiWriteEvents(before, after, observedAt);
        setLibraryWorkActivity((current) =>
          receipts.reduce(completeLibraryWork, clearLibraryWork(current)),
        );
        const lastAgentText = [...completion.events].reverse().find((event) => event.kind === "agent")?.text ?? null;
        if (kind === "lint") setCandidates(parseLintCandidates(lastAgentText));
        if (kind === "lint") setFindings(parseLintFindings(lastAgentText));
        if (kind === "lint") setReportUnseen(true);
        if (kind === "lint") setFixedKeys(new Set());
        if (kind === "fix" && pendingFixRef.current) {
          const key = findingKey(pendingFixRef.current);
          pendingFixRef.current = null;
          setFixedKeys((current) => new Set([...current, key]));
        }
        if (kind === "lint") {
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
    [agent.openingRequest, agent.runtime, captureAnswerRefresh, choose, currentDeskListingVersion, handle, latestSelectedRef, model.sources, receiveAnswerRefresh, setCompileRunning, setLibraryWorkActivity, setLintRunning, setReportUnseen, setTurnRunning, skipReaderFocusRef, workVaultScope],
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
    writeMode, pendingAskRef, retryAskRef, activeReadOnlyTurnRef, lastAnswer, setLastAnswer,
    deskReport, setDeskReport, deskWorkRequest, setDeskWorkRequest, deskWorkActivity,
    latestDeskReportRef, reportEpochRef, invalidateDeskReport, previousReportScopeRef,
    answerGenerationRef, filedAnswersRef, filingAnswer, setFilingAnswer, fileAnswerNote,
    setFileAnswerNote, consumedOpeningNonceRef, judgeWrite, pendingFixRef, fixedKeys, setFixedKeys,
    handleFix, handleNewPage, handleFileAnswer, handleFileReport, autoDecide, pageBodyRef,
    candidates, setCandidates, findings, setFindings, openCandidates, reportHeadings,
    reportDoorCount, latestDocsRef, handleTurnStarted, hasOntology, handlePropose, handleLint,
    compileBlocked, compileTransfer, agentOnlyReason,
  };
}
