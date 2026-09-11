"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Info, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useLocalVault, useVaultIdentityScope, useVaultSessionIdentityScope } from "@/entities/vault-session";
import { isWikiPage } from "@/entities/docs-vault";
import type { LibraryWorkActivity, LibraryWorkEvent, LintFinding, LintNodeCandidate } from "@/features/library";
import type { LibrarySourceRow, SourceCandidate } from "@/entities/docs-vault";
import { useRouter } from "@/i18n/navigation";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { useVaultConnectors } from "@/features/mcp-connectors";
import { isAcpBridgeAvailable } from "@/shared/lib/tauri-acp";
import type { AcpEvent, AcpTurnActivity, AcpTurnCompletion, AcpTurnToolActivity } from "@/features/acp-session";
import {
  addSources,
  addSourcesInBrowser,
  buildCompileBrief,
  appendWikiLog,
  buildLintBrief,
  buildProposeNodeBrief,
  describeCompileTurn,
  describeLintTurn,
  judgePageWrite,
  parseLintCandidates,
  selectCompileTargets,
  discoverSources,
  FindDocumentsDialog,
  forgetDeclinedCandidates,
  partitionByDeclined,
  readDeclinedCandidates,
  rememberDeclinedCandidates,
  summarizeAddSources,
  withoutImportedNames,
  type DiscoveryOutcome,
  dropCandidatesWithNodes,
  wikiPagePathOf,
  buildAskBrief,
  buildFixBrief,
  parseLintFindings,
  buildAnswerPage,
  automaticWikiWriteAllowed,
  answerObservation,
  isRetainedAnswerPath,
  buildHumanPage,
  createWikiFile,
  deleteWikiFile,
  writeWikiFile,
  EMPTY_LIBRARY_WORK_ACTIVITY,
  beginLibraryWork,
  appendLibraryWorkReceipt,
  clearLibraryWork,
  completeLibraryWork,
  completedAcpReadEvent,
  libraryWorkErrorEvent,
  libraryWorkEventFromAcpSnapshot,
  libraryWorkEventFromLocalSnapshot,
  localCompileWaitingEvent,
  observedWikiWriteEvents,
  successfulLocalWriteEvents,
} from "@/features/library";
import {
  DocReadingPane,
  shouldShowOutlineRail,
  useBackToTop,
  useDocReadingScrollSpy,
} from "@/widgets/doc-reading-pane";
import { DocsVaultViewer } from "@/widgets/docs-vault";
import { LibraryGraph } from "@/widgets/library-graph";
import { LibraryWorkActivityStrip } from "@/widgets/library-work-activity";
import { LibraryImportDialog } from "@/widgets/library-import";
import {
  useLibraryIndexCollapsed,
  useLibraryIndexSegment,
  writeLibraryIndexCollapsed,
  useWikiWriteMode,
  writeLibraryIndexSegment,
  writeWikiWriteMode,
  type LibraryIndexSegment,
} from "@/shared/lib/appearance-preferences";
import { cn } from "@/shared/lib/cn";
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { RIGHT_DOCK_WIDTH_VAR } from "@/shared/lib/right-dock-reserve";
import { getTauriVaultRootPath, nativeVaultFileHashes, revealTauriVaultFile } from "@/shared/lib/tauri-vault-fs";
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { PAGE_COLUMN_STAGE } from "@/shared/ui/page-frame";
import {
  TOAST_TOP_OFFSET_UNDER_LIBRARY_PANE_CHROME_NARROW_PX,
  TOAST_TOP_OFFSET_UNDER_LIBRARY_PANE_CHROME_PX,
} from "@/shared/ui/toast-position";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { Button, Dialog, Tooltip, TooltipProvider, useToast } from "@/shared/ui";

import { isWikiFurnitureSlug } from "@/shared/lib/wiki-page-schema";
import { libraryCompileBlockedReason, libraryTransferSentence } from "../lib/compile-availability";
import { useCitedPassage } from "../lib/use-cited-passage";
import { useSourceOutline } from "../lib/use-source-outline";
import { useLibraryModel } from "../lib/use-library-model";
import { useObservedWikiWork } from "../lib/use-observed-wiki-work";
import { useLibraryAgent } from "../lib/use-library-agent";
import { useAnswerRefresh } from '../lib/use-answer-refresh';
import { useAnswerHistory } from '../lib/use-answer-history';
import { LibraryCheckReport, findingKey, reportOutline } from "./parts/LibraryCheckReport";
import { LibrarySection } from "./parts/LibrarySection";
import { CompileBrainSelect } from "./parts/CompileBrainSelect";
import { LibraryStage } from "./parts/LibraryStage";
import { LocalCompileCard } from "./parts/LocalCompileCard";
import { LibraryStartStage } from "./parts/LibraryStartStage";
import { LibraryStatusStrip } from "./parts/LibraryStatusStrip";
import { LibraryAgentDock, type LibraryAgentOpeningRequest } from "./parts/LibraryAgentDock";
import { LibraryConversationDoor } from "./parts/LibraryConversationDoor";
import { SelectionAsk } from "./parts/SelectionAsk";
import { useChatWidth } from "@/widgets/acp-chat-panel";
import { selectOpenVaultHandle } from "@/shared/lib/select-open-vault-handle";
import { SourceSummary } from "./parts/SourceSummary";
import { WikiPageHeader } from "./parts/WikiPageHeader";
import { WikiTemplateProblems } from "./parts/WikiTemplateProblems";
import { LibraryQuestions } from './parts/LibraryQuestions';
import { RetainedAnswerContext } from './parts/RetainedAnswerContext';
import { AnswerRevisionComparison } from './parts/AnswerRevisionComparison';
import { LibraryConstellation } from "./parts/LibraryConstellation";
import { LibrarySynapseField } from "./parts/LibrarySynapseField";

/**
 * The **Library** — project documents of any format, and the wiki pages written from
 * them.
 *
 * ## Why it left Docs (2026-09-06)
 *
 * Everything on this screen shipped one day earlier inside the Docs sidebar, and the
 * owner read the result: *"the screen is very cluttered … is it right that everything
 * for gathering and scaling data collects inside the Docs tab, rather than being
 * separated out? Docs was originally where ontology information (md) was gathered."*
 *
 * The measurement agreed with the reading. Docs' 280px column was carrying five capped
 * lists — review queue, Sources, Wiki, recently changed, and the document tree — so the
 * two library lists took 22dvh each and the tree, which is what Docs is for, lived on
 * what was left. And the two halves do not even want the same reader: a wiki page is
 * Markdown, while a source is a file Atlas has deliberately never opened.
 *
 * ⚠️ **This overturns "ingest is a job, not a place" only for the library, not for
 * Compile.** Compile is still a job: it starts one agent turn beside the shelf it is
 * compiling, in a dock on this same screen, rather than sending anyone to another
 * destination. What became a place is the shelf.
 *
 * ## The shape
 *
 * Two panes, the same grammar Docs uses: an index on the left, one thing open on the
 * right. The right pane branches on **what kind of file is selected**, which is the whole
 * point of the destination — a wiki page opens in the reading pane every Markdown surface
 * in this product shares (`@/widgets/doc-reading-pane`), and a source opens as the six
 * facts the folder knows about it, because there is nothing else that could honestly be
 * drawn for a PDF.
 *
 * With nothing selected the reader shows the existing gather/compile/read guidance.
 * The graph opens from one header action in a viewport dialog, leaving the selected
 * document and conversation mounted behind it. It is a requested view, never a
 * permanent strip competing with the text (owner-selected direction B, 2026-09-09).
 *
 * Below `lg`, guidance stands above the index; selecting gives the reader the full
 * column, and closing the page returns to the same guidance and index.
 *
 * ## With no folder open, and with an empty one
 *
 * One centred stage, not an empty two-pane workbench. There is no folder to add a
 * document *to*, so an index of nothing beside a reader of nothing would be two empty
 * boxes asking the same question. `PAGE_COLUMN_STAGE` is this repository's existing
 * answer for "nothing to open yet" (2026-08-12).
 *
 * ⚠️ **A folder that is open and empty gets the same answer** (owner, 2026-09-06). It
 * used to get the workbench plus a guide that raised itself over the picture, and the
 * owner read that frame as broken: *"why does this design look like this? … the sizes
 * inside the right panel are no good … and it overlaps this text."* Measured at 1512×982
 * on a folder with nothing in it, six surfaces stated the same emptiness — the caption's
 * three zeroes, a strip of three turns-not-yet-come, both index lists' own "nothing here"
 * copy with **two duplicate doors**, the canvas's own sentence, and a 560px panel lying
 * across it. The screen is now `LibraryStartStage`, and the guide is only ever a press.
 */

/** Presentation/capture only: a normal conversation retains the same write permission path. */
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
}

export function clearFiledAnswer(current: RetainedLibraryAnswer | null, filed: RetainedLibraryAnswer): RetainedLibraryAnswer | null {
  return current === filed ? null : current;
}

export function restoreFiledAnswer(current: RetainedLibraryAnswer | null, filed: RetainedLibraryAnswer, generation: number): RetainedLibraryAnswer | null {
  return generation === filed.generation && current === null ? filed : current;
}

export function LibraryPage() {
  const reducedMotion = usePrefersReducedMotion();
  const t = useTranslations("library");
  /* The folded check answer is drawn inside the chat, so its two strings live in that
     namespace rather than the Library's. */
  const tChat = useTranslations("acpChat");
  const locale = useLocale();
  const toast = useToast();
  const localVault = useLocalVault();
  const { markSelfWrite } = localVault;
  const workVaultScope = useVaultSessionIdentityScope();

  const handle = selectOpenVaultHandle(localVault.status, localVault.handle);
  const manifest = localVault.manifest;
  const hasFolder = handle !== null && manifest !== null;
  /**
   * An absolute path only. On the web there is none, and handing a native bridge the
   * handle's name would name a path that does not exist.
   */
  const nativeVaultRootPath = handle ? (getTauriVaultRootPath(handle) ?? null) : null;

  const [selected, setSelected] = useState<
    { kind: "wiki"; slug: string } | { kind: "source"; path: string } | { kind: "report" } | null
  >(null);
  /** What is open right now, readable from a completion callback made turns ago. */
  const latestSelectedRef = useRef<typeof selected>(null);
  useEffect(() => {
    latestSelectedRef.current = selected;
  }, [selected]);
  /*
   * Stand the toaster over the canvas, the way the map already stands its own. The
   * toaster is top-centred on the viewport and this pane stacks 160px of chrome there —
   * the reserved work lane, then the graph's header row — so at the default 16px the
   * box came to rest two pixels into the receipt row, and clearing only the lane simply
   * moved it onto the header row instead. The constant carries both measurements.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--app-toast-top-offset",
      `${TOAST_TOP_OFFSET_UNDER_LIBRARY_PANE_CHROME_PX}px`,
    );
    /*
     * And the narrow band's own clearance. sonner stops reading the value above at 600px
     * of viewport, where this pane's work lane keeps both of its rows — so the stack to
     * clear there is a different measurement, not the same number applied twice
     * (design-responsive C2, council 2026-09-11).
     */
    root.style.setProperty(
      "--app-toast-mobile-top-offset",
      `${TOAST_TOP_OFFSET_UNDER_LIBRARY_PANE_CHROME_NARROW_PX}px`,
    );
    return () => {
      root.style.removeProperty("--app-toast-top-offset");
      root.style.removeProperty("--app-toast-mobile-top-offset");
    };
  }, []);
  const [graphOpen, setGraphOpen] = useState(false);
  const [sourceCitation, setSourceCitation] = useState<{ path: string; anchor?: string } | null>(null);
  const [answerComparisonOpen, setAnswerComparisonOpen] = useState(false);
  const graphTriggerRef = useRef<HTMLButtonElement | null>(null);
  const graphRestoreFrameRef = useRef<number | null>(null);
  /** Set when a page opened on its own (a check ending), so the focus stays where the person had it. */
  const skipReaderFocusRef = useRef(false);
  /*
   * Whether an agent turn is in flight. The Fix and Propose doors disable on it: the dock
   * keeps only the newest opening request while a turn runs, so five presses would drop
   * three in silence (design-interaction, council 2026-09-07).
   */
  const [turnRunning, setTurnRunning] = useState(false);
  /*
   * **Compile alone, not every turn.** `turnRunning` covers Check, Fix, Propose and Ask
   * too, and only Compile is about the wiki pages the shelf draws. Lighting a shelf while
   * a Check reads it, or while an Ask answers a question about one page, would say the
   * pages are being rewritten when nothing is writing them.
   */
  const [compileRunning, setCompileRunning] = useState(false);
  /*
   * **The check's own two states, which only the index row can carry** (owner, 2026-09-12).
   * A check runs in the dock, so a person who started one and went back to reading a page
   * had nothing on screen saying it was still going, or that it had finished. `lintRunning`
   * is that turn in flight — narrower than `turnRunning`, which is also true of Fix, Ask and
   * Propose. `reportUnseen` is a finished check this person has not opened yet; it clears on
   * opening the report, including the automatic open below.
   */
  const [lintRunning, setLintRunning] = useState(false);
  const [reportUnseen, setReportUnseen] = useState(false);
  const choose = useCallback((next: typeof selected) => {
    setSourceCitation(null);
    setSelected(next);
    // Opening the report is what "seen" means. Every door — the index row, the automatic
    // open after a check, a deep link — goes through here, so the mark cannot outlive a read.
    if (next?.kind === "report") setReportUnseen(false);
    /*
     * **The switch follows what was opened.** A file can be reached from three places that
     * are not the index — the graph, the guide, and a reader's own crossings — and the
     * index would otherwise say *Sources* while the pane showed a wiki page. Only a real
     * choice moves it; the back control leaves the switch where the person left it.
     */
    if (next && next.kind !== "report") writeLibraryIndexSegment(next.kind === "wiki" ? "wiki" : "sources");
  }, []);
  const [busy, setBusy] = useState(false);

  /*
   * `.claude/rules/architecture.md`: the condition that draws a surface must also guard
   * the work that builds its model. The model hashes files and reads page bodies, so it
   * is switched off, not merely hidden, until a folder is really open.
  */
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
  const retainedAnswers = model.retainedAnswers ?? EMPTY_DOCS;
  const knownOriginalPaths = useMemo(() => new Set(model.sources.map((source) => source.path)), [model.sources]);
  /** What step three already lists, so "Start with …" names a different page than the rows. */
  const retainedAnswerSlugs = useMemo(
    () => new Set(retainedAnswers.map((answer) => answer.slug)),
    [retainedAnswers],
  );

  /**
   * **Nothing chosen is its own state, and it is the one this screen is for.**
   *
   * Until 2026-09-06 this line read `selected ?? firstWikiSelection(model.wikiPages)`: with
   * nothing clicked the pane opened the first wiki page, on the grammar Docs uses, so that
   * a workbench would not arrive empty. The owner read the result and said *"entering the
   * Library I don't know what to do"* — and the default was part of why. Opening a page
   * nobody asked for answers "what am I looking at" with a document, and leaves "what is
   * this screen for" unanswered on every visit after the first.
   *
   * So the reader now branches three ways, and `null` is the guided shelf
   * (`LibraryStage`) rather than a stand-in document. It stays a **derivation of the real
   * click**, which is what keeps the narrow layout honest: below `lg` selecting swaps the
   * whole column, and a default written into state would open a reader nobody asked for
   * and need an effect to undo.
   */
  const opened = selected;
  const selectedWikiDoc = useMemo(() => {
    if (opened?.kind !== "wiki") return null;
    return manifest?.docs.find((doc) => doc.slug === opened.slug) ?? null;
  }, [manifest, opened]);
  const selectedSource = useMemo(() => {
    if (opened?.kind !== "source") return null;
    return model.sources.find((row) => row.path === opened.path) ?? null;
  }, [model.sources, opened]);
  /*
   * **Pressing a citation reads that one file.** The handle is the one the folder walk
   * already granted — `read_vault_binary_file` in the app, the File System Access handle
   * in a browser — so this is one ability on both surfaces rather than a bridge. The
   * text is never stored and is dropped when the pane closes; `use-cited-passage.ts`
   * owns the local-first reasoning.
   */
  const citedPassage = useCitedPassage({
    citation: sourceCitation?.path === selectedSource?.path ? sourceCitation : null,
    handle: sourceCitation ? localVault.sourceHandles.get(sourceCitation.path) : undefined,
    enabled: hasFolder && selectedSource !== null,
  });
  /*
   * **The open source's own shape, for the outline section.** Choosing the row is the person naming
   * this file, which is the clause `use-source-outline.ts` documents; the read is one
   * file, through the handle the walk granted, and nothing is kept.
   */
  const sourceOutlineState = useSourceOutline({
    path: selectedSource?.path ?? null,
    handle: selectedSource ? localVault.sourceHandles.get(selectedSource.path) : undefined,
    enabled: hasFolder,
  });
  const selectedAnswer = selectedWikiDoc && isRetainedAnswerPath(selectedWikiDoc.slug) ? selectedWikiDoc : null;
  const answerHistory = useAnswerHistory(selectedAnswer, docs, model.pageTexts);
  const answerRefreshButtonRef = useRef<HTMLButtonElement>(null);
  const pendingAnswerFocus = useRef<string | null>(null);
  useEffect(() => {
    const target = pendingAnswerFocus.current;
    if (!target) return;
    if (opened?.kind !== 'wiki' || opened.slug !== target) {
      pendingAnswerFocus.current = null;
      return;
    }
    if (selectedAnswer?.slug !== target) return;
    const frame = requestAnimationFrame(() => {
      answerRefreshButtonRef.current?.focus();
      pendingAnswerFocus.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [opened, selectedAnswer?.slug]);

  // ── The reading pane's own state, keyed by the open page. ────────────────────────
  const { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug } = useDocReadingScrollSpy(
    selectedWikiDoc?.slug ?? null,
    "local",
  );
  const backToTop = useBackToTop(articleScrollRef, selectedWikiDoc?.slug ?? null);
  /*
   * The report page has the reader's furniture too — a jump list and the way back to the
   * top — because a check on a real folder runs to 2+3+6 findings and 7 names, and the
   * wiki page beside it in the same box has both (design-workbench, council 2026-09-07).
   * The rail shows from two sections up: a report has at most four, so the document
   * floor of four would never let it show.
   */
  const reportSpy = useDocReadingScrollSpy(opened?.kind === "report" ? "library:report" : null, "report");
  const reportBackToTop = useBackToTop(reportSpy.articleScrollRef, opened?.kind === "report" ? "library:report" : null);
  const handleReportHeadingNavigate = useCallback(
    (slug: string) => {
      document.getElementById(slug)?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      reportSpy.setActiveHeadingSlug(slug);
    },
    [reducedMotion, reportSpy],
  );
  const outlineHeadings = useMemo(() => {
    const headings = (selectedWikiDoc?.headings ?? []).filter(
      (heading) => heading.depth >= 2 && heading.depth <= 3,
    );
    const totals = new Map<string, number>();
    for (const heading of headings) totals.set(heading.text, (totals.get(heading.text) ?? 0) + 1);
    const seen = new Map<string, number>();
    return headings.map((heading) => {
      const occurrence = (seen.get(heading.text) ?? 0) + 1;
      seen.set(heading.text, occurrence);
      return { ...heading, duplicate: (totals.get(heading.text) ?? 0) > 1, occurrence };
    });
  }, [selectedWikiDoc]);
  const handleHeadingNavigate = useCallback(
    (slug: string) => {
      document.getElementById(slug)?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      setActiveHeadingSlug(slug);
    },
    [reducedMotion, setActiveHeadingSlug],
  );

  const vaultSlugs = useMemo(
    () => new Set((manifest?.docs ?? []).map((doc) => doc.slug)),
    [manifest],
  );
  const getDocContent = useMemo<((slug: string) => Promise<string>) | undefined>(() => {
    if (localVault.fileHandles.size === 0) return undefined;
    const handles = localVault.fileHandles;
    return async (slug: string) => {
      const file = handles.get(slug);
      if (!file) throw new Error(`Local vault: no file handle for "${slug}"`);
      return (await file.getFile()).text();
    };
  }, [localVault.fileHandles]);
  const resolveImage = useMemo<((path: string) => Promise<string | null>) | undefined>(() => {
    const handles = localVault.imageHandles;
    return async (path: string) => {
      const image = handles.get(path);
      if (!image) return null;
      return URL.createObjectURL(await image.getFile());
    };
  }, [localVault.imageHandles]);

  // ── The two doors, and the dialog between proposing and copying. ─────────────────
  const vaultScope = useVaultIdentityScope();
  const [findOpen, setFindOpen] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryOutcome | null>(null);
  const [declinedCount, setDeclinedCount] = useState(0);
  const importedSourceNames = useMemo(
    () => new Set((manifest?.sources ?? []).map((source) => source.name)),
    [manifest],
  );

  const handleAddFiles = useCallback(() => {
    if (!handle || busy) return;
    setBusy(true);
    void addSources({
      root: handle,
      vaultRootPath: nativeVaultRootPath,
      dialogTitle: t("sources.addTooltip"),
    })
      .then(async (outcome) => {
        if (outcome.cancelled) return;
        const { added, duplicate, failed } = summarizeAddSources(outcome);
        // Three different things happened and the sentence says all three. "Imported 2
        // files" while one was silently refused is the kind of half-truth that teaches a
        // person to re-check the folder in Finder afterwards.
        if (added > 0) toast.show(t("sources.added", { count: added }), "success");
        if (duplicate > 0) {
          const first = outcome.results.find((row) => row.status === "duplicate");
          toast.show(
            t("sources.duplicate", { count: duplicate, path: first?.relativePath ?? "" }),
            "info",
          );
        }
        if (failed > 0) toast.show(t("sources.failed", { count: failed }), "error");
        // The folder changed under us; the walk is what turns that into rows.
        await localVault.refresh();
      })
      .catch((error) => {
        toast.show(
          t("sources.failedReason", {
            reason: error instanceof Error ? error.message : String(error),
          }),
          "error",
        );
      })
      .finally(() => setBusy(false));
  }, [busy, handle, localVault, nativeVaultRootPath, t, toast]);

  const runDiscovery = useCallback(async () => {
    if (!handle) return;
    setDiscovery(null);
    const outcome = await discoverSources({
      handle,
      vaultRootPath: nativeVaultRootPath,
      vaultLabel: handle.name,
    });
    const declined = readDeclinedCandidates(vaultScope);
    const { fresh, declinedCount: hidden } = partitionByDeclined(
      withoutImportedNames(outcome.candidates, importedSourceNames),
      declined,
    );
    setDeclinedCount(hidden);
    setDiscovery({ ...outcome, candidates: fresh });
  }, [handle, importedSourceNames, nativeVaultRootPath, vaultScope]);

  const handleFindDocuments = useCallback(() => {
    // A toast is an aside that dismisses itself; a blocking dialog is not. Left standing,
    // an "added 2 documents" toast floats above the scrim of the surface that asks the
    // next question, and a person is reading two things at once — the floating-box soup
    // the design charter refuses. Clearing is the caller's job, not the dialog's.
    toast.dismiss();
    setFindOpen(true);
    void runDiscovery();
  }, [runDiscovery, toast]);

  const handleAddCandidates = useCallback(
    (chosen: SourceCandidate[], declined: SourceCandidate[]) => {
      if (!handle || chosen.length === 0) return;
      setBusy(true);
      // The refusals are remembered first. A person who ticks three of twenty has said
      // something about the other seventeen, and losing that because the copy failed
      // would make them scroll the same list again.
      rememberDeclinedCandidates(vaultScope, declined);
      void (async () => {
        try {
          if (nativeVaultRootPath) {
            const { importTauriSourceFiles } = await import("@/shared/lib/tauri-vault-fs");
            const absolute = chosen.map(
              (candidate) => `${candidate.rootPath}/${candidate.relativePath}`,
            );
            const results = (await importTauriSourceFiles(nativeVaultRootPath, absolute)) ?? [];
            reportAddOutcome(summarizeAddSources({ results, cancelled: false }));
          } else {
            // The browser can only reach what its own handle covers, which is exactly the
            // set discovery proposed there.
            const files: File[] = [];
            for (const candidate of chosen) {
              const segments = candidate.relativePath.split("/");
              const name = segments.pop() as string;
              let cursor: FileSystemDirectoryHandle = handle;
              for (const segment of segments) cursor = await cursor.getDirectoryHandle(segment);
              files.push(await (await cursor.getFileHandle(name)).getFile());
            }
            reportAddOutcome(summarizeAddSources(await addSourcesInBrowser(handle, files)));
          }
          setFindOpen(false);
          await localVault.refresh();
        } catch (error) {
          toast.show(
            t("sources.failedReason", {
              reason: error instanceof Error ? error.message : String(error),
            }),
            "error",
          );
        } finally {
          setBusy(false);
        }
      })();

      function reportAddOutcome({
        added,
        duplicate,
        failed,
      }: {
        added: number;
        duplicate: number;
        failed: number;
      }) {
        if (added > 0) toast.show(t("sources.added", { count: added }), "success");
        if (duplicate > 0) {
          toast.show(t("sources.duplicate", { count: duplicate, path: "" }), "info");
        }
        if (failed > 0) toast.show(t("sources.failed", { count: failed }), "error");
      }
    },
    [handle, localVault, nativeVaultRootPath, t, toast, vaultScope],
  );

  const handleForgetDeclined = useCallback(() => {
    forgetDeclinedCandidates(vaultScope);
    setDeclinedCount(0);
    void runDiscovery();
  }, [runDiscovery, vaultScope]);

  const handleOpenSource = useCallback(
    (row: LibrarySourceRow) => {
      // Two surfaces, one intent: put the person in front of the file. The app selects it
      // in Finder — reveal, never open, because Atlas launches no program on somebody's
      // behalf. The browser has no Finder and no absolute path, so it hands over the
      // bytes it was already granted.
      if (nativeVaultRootPath) {
        void revealTauriVaultFile(nativeVaultRootPath, row.path).catch((error) => {
          toast.show(
            t("sources.revealFailed", {
              reason: error instanceof Error ? error.message : String(error),
            }),
            "error",
          );
        });
        return;
      }
      const sourceHandle = localVault.sourceHandles.get(row.path);
      if (!sourceHandle) return;
      void sourceHandle
        .getFile()
        .then((file) => {
          const url = URL.createObjectURL(file);
          window.open(url, "_blank", "noopener");
          // The tab has the blob by the time this runs; revoking frees the copy the page
          // would otherwise hold for its whole life.
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        })
        .catch(() => toast.show(t("sources.openFailed"), "error"));
    },
    [localVault.sourceHandles, nativeVaultRootPath, t, toast],
  );

  // ── Compile: one in-app agent turn, docked to this screen. ───────────────────────
  /*
   * The rows go in because the local route needs to know **which** files it can open, not
   * only how many are waiting: a PDF is waiting forever on a runner with no PDF reader,
   * and a step that keeps offering it never rests (`docs/DECISIONS.md`, 2026-09-06).
   */
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

  /**
   * **What the dock takes from the row, said out loud.**
   *
   * The dock's frame is already a flex sibling of the reader at `xl`
   * (`LibraryAgentDock`: `xl:relative xl:shrink-0`), so the graph's box really does narrow
   * when it opens and the canvas refits against it. What was missing is the *published*
   * width: `--app-right-dock-width` is how every surface positioned against the viewport's
   * right edge learns that the right-hand wall is the dock's edge and not the window's
   * (`right-dock-reserve.ts`), and the toaster reads it to stay centred over what is left.
   * The map has published it since 2026-08-16; this screen grew a dock on 2026-09-06 and
   * did not, so a toast on the Library landed on the composer.
   *
   * The width is lifted out of the dock so one instance owns it: `useChatWidth` keeps the
   * in-flight drag in local state, and a second copy of the hook would publish the stored
   * width while the handle was still moving.
   */
  const chatWidth = useChatWidth();
  const dockOpen = agent.route === "agent" && agent.runtime !== null && nativeVaultRootPath !== null && agent.open;
  /**
   * **The dock, put away.** One turn's step and target while this screen's conversation is
   * running; `null` between turns and while the panel has never opened.
   */
  const [agentActivity, setAgentActivity] = useState<AcpTurnActivity | null>(null);
  const [libraryWorkActivity, setLibraryWorkActivity] = useState<LibraryWorkActivity>(
    EMPTY_LIBRARY_WORK_ACTIVITY,
  );
  const scheduleLibraryWork = useCallback(
    (update: (current: LibraryWorkActivity) => LibraryWorkActivity) => {
      queueMicrotask(() => setLibraryWorkActivity(update));
    },
    [],
  );
  const handleAcpToolActivityChange = useCallback(
    (snapshot: AcpTurnToolActivity | null) => {
      const event = snapshot
        ? libraryWorkEventFromAcpSnapshot(snapshot, nativeVaultRootPath, Date.now())
        : null;
      setLibraryWorkActivity((current) =>
        event ? beginLibraryWork(current, event) : clearLibraryWork(current),
      );
    },
    [nativeVaultRootPath],
  );
  const localToolActivity = agent.localCompile.toolActivity;
  const localWorkInScope = agent.localCompile.originVaultScope === workVaultScope;
  const localReviewVisible = agent.route === "local" && localWorkInScope && agent.localCompile.status !== "idle";
  const localReviewBusy = agent.localCompile.status === "running" || agent.localCompile.status === "applying";
  const handleTerminalToolObservation = useCallback((event: Extract<AcpEvent, { kind: "tool" }>) => {
    const receipt = completedAcpReadEvent(event, nativeVaultRootPath, Date.now());
    if (receipt) setLibraryWorkActivity((current) => completeLibraryWork(current, receipt));
  }, [nativeVaultRootPath]);
  const resetObservedWork = useCallback(() => {
    scheduleLibraryWork(() => EMPTY_LIBRARY_WORK_ACTIVITY);
  }, [scheduleLibraryWork]);
  const receiveObservedWork = useCallback((receipts: readonly LibraryWorkEvent[]) => {
    scheduleLibraryWork((current) => receipts.reduce(appendLibraryWorkReceipt, current));
  }, [scheduleLibraryWork]);
  useObservedWikiWork(workVaultScope, wikiRevisionStamp, resetObservedWork, receiveObservedWork);
  useEffect(() => {
    if (agent.route !== "local" || !localWorkInScope || !localToolActivity) return;
    const event = libraryWorkEventFromLocalSnapshot(
      localToolActivity,
      nativeVaultRootPath,
      Date.now(),
    );
    if (!event) return;
    scheduleLibraryWork((current) =>
      event.phase === "active"
        ? beginLibraryWork(current, event)
        : completeLibraryWork(current, event),
    );
  }, [agent.route, localWorkInScope, localToolActivity, nativeVaultRootPath, scheduleLibraryWork]);
  useEffect(() => {
    if (agent.route !== "local" || !localWorkInScope || agent.localCompile.status !== "waiting") return;
    const turnId = agent.localCompile.turn?.id;
    if (!turnId) return;
    const proposal = agent.localCompile.card?.proposal;
    const event = localCompileWaitingEvent(turnId, Date.now(), Boolean(proposal),
      proposal?.changes.flatMap((change) => change.files.map((file) => file.path)));
    scheduleLibraryWork((current) =>
      event ? beginLibraryWork(current, event) : clearLibraryWork(current),
    );
  }, [agent.localCompile.status, agent.localCompile.card?.proposal, agent.localCompile.turn?.id, agent.route, localWorkInScope, scheduleLibraryWork]);
  useEffect(() => {
    if (agent.route !== "local" || !localWorkInScope) return;
    const turnId = agent.localCompile.turn?.id;
    if (agent.localCompile.status === "written" && turnId) {
      scheduleLibraryWork((current) =>
        successfulLocalWriteEvents(agent.localCompile.writtenPaths, turnId, Date.now()).reduce(
          completeLibraryWork,
          clearLibraryWork(current),
        ),
      );
      return;
    }
    if (agent.localCompile.status === "failed" && turnId) {
      scheduleLibraryWork((current) =>
        completeLibraryWork(
          clearLibraryWork(current),
          libraryWorkErrorEvent(`local:${turnId}:failure`, Date.now()),
        ),
      );
      return;
    }
    if (agent.localCompile.status === "idle") {
      scheduleLibraryWork(clearLibraryWork);
      return;
    }
    if (agent.localCompile.status === "running" || agent.localCompile.status === "applying") {
      scheduleLibraryWork(clearLibraryWork);
    }
  }, [
    agent.localCompile.status,
    agent.localCompile.turn?.id,
    agent.localCompile.writtenPaths,
    localWorkInScope,
    agent.route,
    scheduleLibraryWork,
  ]);
  /*
   * **The conversation can be reopened.** Closing the dock used to be the end of it: no
   * control on the Library brought it back, and the only way to see the transcript again
   * was to start another turn from a door (owner, installed app, 2026-09-07: "after
   * talking with the agent and going back, there is no way to open that agent again").
   * The chip stands where the person is — on the graph's status row and on the reader's
   * top row — and only while there is a conversation to return to and the dock is shut.
   *
   * ## The same chip is the resting state (owner, 2026-09-08)
   *
   * *"If I press X while it is working, it should shrink into a small icon in the right-hand
   * area, and pressing it again should show the conversation I was having."* That control
   * already exists — this chip — and it already sits at the right end of both rows, which is
   * where a put-away right-hand dock belongs. So the running turn is drawn **on** it rather
   * than beside it; `LibraryConversationDoor` owns what it says in each state and why.
   */
  const conversationDoor =
    agent.route === "agent" && agent.runtime !== null && nativeVaultRootPath !== null && !agent.open ? (
      <LibraryConversationDoor
        activity={agentActivity}
        agentLabel={agent.runtime.label}
        onOpen={() => agent.setOpen(true)}
      />
    ) : null;
  const graphAction = (
    <Button
      ref={graphTriggerRef}
      variant="outline"
      size="sm"
      /*
       * 69×32 on a finger until 2026-09-12 — a real defect, unlike the two controls beside
       * it: `Button` is the one primitive that does **not** emit the floor from the value
       * layer, which is why its neighbour `answer-review-open` carries the marker by hand.
       * Height only; the label is wide enough that `atlas-touch-floor-wide` would add
       * nothing but push its neighbours.
       */
      className="atlas-touch-floor"
      data-testid="library-graph-open"
      onClick={(event) => {
        if (graphRestoreFrameRef.current !== null) {
          window.cancelAnimationFrame(graphRestoreFrameRef.current);
          graphRestoreFrameRef.current = null;
        }
        event.currentTarget.focus({ preventScroll: true });
        setGraphOpen(true);
      }}
    >
      {t("graph.title")}
    </Button>
  );
  const closeGraph = useCallback(() => {
    setGraphOpen(false);
    if (graphRestoreFrameRef.current !== null) window.cancelAnimationFrame(graphRestoreFrameRef.current);
    graphRestoreFrameRef.current = window.requestAnimationFrame(() => {
      graphRestoreFrameRef.current = null;
      graphTriggerRef.current?.focus({ preventScroll: true });
    });
  }, []);
  useEffect(
    () => () => {
      if (graphRestoreFrameRef.current !== null) window.cancelAnimationFrame(graphRestoreFrameRef.current);
    },
    [],
  );
  useEffect(() => {
    const root = document.documentElement;
    if (!dockOpen) {
      root.style.removeProperty(RIGHT_DOCK_WIDTH_VAR);
      return undefined;
    }
    root.style.setProperty(RIGHT_DOCK_WIDTH_VAR, `${Math.round(chatWidth.width)}px`);
    return () => {
      root.style.removeProperty(RIGHT_DOCK_WIDTH_VAR);
    };
  }, [chatWidth.width, dockOpen]);

  /*
   * ── The third door: documents that are not on this computer yet ────────────────────────────
   *
   * Owner, 2026-09-07: *"connecting a service is mostly for the Library anyway — people want the
   * things they already wrote somewhere else."* Add files and Find documents both assume the
   * document is already on disk; for somebody whose notes live in Notion, neither is a door.
   *
   * The whole flow lives in `@/widgets/library-import` and never says MCP, stdio or environment
   * variable. What it needs from this view is the two things only this view has: the folder's
   * connector list to write the descriptor into, and the agent turn that does the fetching. The
   * technical dialog on `/mcp` is unchanged and is the last tile, for a service the list does not
   * know.
   */
  const connectors = useVaultConnectors(handle);
  const importRouter = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const openImport = useCallback(() => setImportOpen(true), []);
  const handleCompile = useCallback(() => {
    // Local review owns its pane while preserving the document to return to.
    /*
     * **A press that does nothing must never be silent** (installed app, 2026-09-05).
     * Without this catch, anything thrown between the click and the dock leaves a chip
     * that looks pressed and a screen that did not change, which reads as a broken
     * product rather than a failure with a cause.
     */
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
          /*
           * Whoever will actually write it. On the local route Atlas mints `created_by`
           * itself from the runner's model name, so this is the brief's own statement of
           * the same fact rather than a second source for it.
           */
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

  /**
   * The verdict the permission card shows before Allow: the page as this write would leave
   * it, judged against the wiki page contract. Edits are applied to the page text the model
   * last read; a page it has not read yet gets no verdict rather than a guessed one.
   */
  /*
   * How an agent's wiki page write is handled. Owner direction 2026-09-07: agents act and
   * people can step in — not every write waits. Default: a page that fits the contract
   * lands and the transcript says so; a page that does not still stops at the card. The
   * choice is a per-screen convenience kept in this browser, never a vault fact.
   */
  // How an agent's page lands, chosen in Settings (owner, 2026-09-07): the column is an index.
  const writeMode = useWikiWriteMode();
  /* The last question asked from a page and the answer it got: the pair a person can file
     back as a wiki page (owner direction 2026-09-07, the LLM Wiki pattern). */
  const pendingAskRef = useRef<{ question: string; askedOn: string | null } | null>(null);
  const [lastAnswer, setLastAnswer] = useState<RetainedLibraryAnswer | null>(null);
  const answerGenerationRef = useRef(0);
  const filedAnswersRef = useRef(new WeakSet<RetainedLibraryAnswer>());
  const [filingAnswer, setFilingAnswer] = useState<RetainedLibraryAnswer | null>(null);
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
  /** The finding a running Fix turn is about, and the ones fixed since the last check. */
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
      if (!handle) return;
      const page = buildHumanPage({ title, now: new Date() });
      if (knownSlugs.has(page.slug)) {
        toast.show(t("wiki.newPageExists", { page: page.slug }), "error");
        setSelected({ kind: "wiki", slug: page.slug });
        return;
      }
      try {
        if (nativeVaultRootPath) {
          if (!await createWikiFile(handle, page.path, page.text)) throw new Error(`Document already exists: "${page.slug}"`);
        } else {
          await writeWikiFile(handle, page.path, page.text);
        }
        markSelfWrite(page.slug);
        setSelected({ kind: "wiki", slug: page.slug });
        toast.show(t("wiki.newPageDone", { page: page.slug }), "success", {
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
        });
      } catch (err) {
        toast.show(err instanceof Error && err.message ? err.message : t("wiki.newPageFailed"), "error");
      }
    },
    [handle, knownSlugs, markSelfWrite, nativeVaultRootPath, t, toast],
  );

  const handleFileAnswer = useCallback(async () => {
    if (!lastAnswer || !handle || lastAnswer.generation !== answerGenerationRef.current || filedAnswersRef.current.has(lastAnswer)) return;
    const filed = lastAnswer;
    const selectionAtFileStart = latestSelectedRef.current;
    const input = {
      question: lastAnswer.question,
      answer: lastAnswer.text,
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
      toast.show(t("wiki.fileAnswerRejected", { code: page.problems[0]!.code }), "error");
      return;
    }
    // Lock the exact answer synchronously; two presses before a React commit still
    // create only one write. A later answer can be filed independently.
    filedAnswersRef.current.add(filed);
    setFilingAnswer(filed);
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
        if (await createWikiFile(handle, page.path, page.text)) {
          created = true;
          break;
        }
        page = buildAnswerPage(observedInput);
      }
      if (!created) throw new Error('Could not reserve a fresh answer filename; existing pages were preserved.');
      markSelfWrite(page.slug);
      setLastAnswer((current) => clearFiledAnswer(current, filed));
      setSelected((current) =>
        answerGenerationRef.current === filed.generation && current === selectionAtFileStart
          ? { kind: "wiki", slug: page.slug }
          : current,
      );
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
      filedAnswersRef.current.delete(filed);
      toast.show(err instanceof Error && err.message ? err.message : t("wiki.fileAnswerRejected", { code: "write" }), "error");
    } finally {
      setFilingAnswer((current) => current === filed ? null : current);
    }
  }, [agent.runtime, handle, lastAnswer, markSelfWrite, model.pairing.originalsByWiki, model.sources, nativeVaultRootPath, t, toast]);

  const autoDecide = useCallback(
    (request: { filePath: string | null; rawInput: Record<string, unknown>; toolKind: string | null; toolName: string | null }) => {
      if (writeMode !== "auto" || !nativeVaultRootPath || captureAnswerRefresh()) return null;
      const page = wikiPagePathOf(request.filePath, nativeVaultRootPath);
      if (!page || !automaticWikiWriteAllowed(page)) return null;
      const verdict = judgeWrite(request);
      return verdict?.ok ? page : null;
    },
    [captureAnswerRefresh, judgeWrite, nativeVaultRootPath, writeMode],
  );

  /**
   * `wiki/_log.md`, one line per run, written by the app from what it saw: the pages
   * present before the turn and after it (new, revised), the sources the turn was handed,
   * and for a check the counts the report ended with. The agent's transcript is not the
   * source of the compile line; the folder is.
   */
  /**
   * Names the last Check-the-wiki run found on three or more pages with no page of their
   * own — the wiki's candidates for the graph. Read from the report's closing block when
   * a lint turn completes; cleared by the next lint. Never persisted: a candidate is an
   * offer, and the offer is remade each time the wiki is checked.
   */
  const pageBodyRef = useRef<HTMLDivElement | null>(null);
  const [candidates, setCandidates] = useState<LintNodeCandidate[]>([]);
  const [findings, setFindings] = useState<LintFinding[]>([]);
  /* A candidate the card already turned into a node leaves the list; the report cannot know. */
  const openCandidates = useMemo(() => dropCandidatesWithNodes(candidates, docs), [candidates, docs]);
  /**
   * The rail's headings and the index door's count, both derived from what the page
   * actually holds — the app's computed half plus the agent's remembered one.
   *
   * `reportDoorCount` is `null` only when there is no wiki to report on at all. Any other
   * state has a door: the structural half is computed from the folder, so "nobody has
   * pressed anything yet" is no longer a reason to hide the screen (both PO seats,
   * 2026-09-12).
   */
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
      // Unmatched prompts are ordinary conversation, not another run of the last
      // Compile/Check action. This classification never changes judgeWrite/autoDecide.
      const kind = opening?.kind ?? "ask";
      const refreshTurn = kind === 'refresh' ? captureAnswerRefresh() : null;
      const selectionAtStart = latestSelectedRef.current;
      const asked = kind === "ask"
        ? opening && pendingAskRef.current
          ? pendingAskRef.current
          : { question: start.text.trim(), askedOn: selectionAtStart?.kind === "wiki" ? selectionAtStart.slug : null }
        : null;
      if (opening?.kind === "ask") pendingAskRef.current = null;
      setLastAnswer(null);
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
        // would print a clean report over a check that never finished (design-interaction,
        // council 2026-09-07).
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
        // A new check re-judges every page: the "fixed" marks are its to give again.
        if (kind === "lint") setFixedKeys(new Set());
        if (kind === "fix" && pendingFixRef.current) {
          const key = findingKey(pendingFixRef.current);
          pendingFixRef.current = null;
          setFixedKeys((current) => new Set([...current, key]));
        }
        // The check's answer is a page in the pane, not rows in the index (owner, 2026-09-07).
        // It takes the pane only when nothing else has it — a person reading a page keeps the
        // page — and it never takes the focus, because a completion is not a press.
        if (kind === "lint") {
          const current = latestSelectedRef.current;
          if (current === null || current.kind === "report") {
            skipReaderFocusRef.current = true;
            choose({ kind: "report" });
          }
        }
        /*
         * The wiki log records what happened to the wiki. A proposal writes one ontology node
         * and an import writes documents under `sources/`; neither touches a page, so neither
         * is an entry, or the log would claim a compile that never ran.
         */
        if (kind === "ask") {
          if (generation === answerGenerationRef.current && asked && lastAgentText && lastAgentText.trim()) setLastAnswer({ generation, question: asked.question, text: lastAgentText, askedOn: asked.askedOn });
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
          // A log that cannot be written is not a reason to interrupt the person; the
          // pages themselves are unaffected and the activity receipts still exist.
        }
      };
    },
    [agent.openingRequest, agent.runtime, captureAnswerRefresh, choose, handle, model.sources, receiveAnswerRefresh],
  );

  /**
   * The bridge shows only where there is a map to bridge to. A folder of documents with
   * no `kind:` node anywhere is a wiki on its own — the person who opened it asked for
   * pages, not an ontology — and offering "propose as node" there would press a concept
   * they never chose. With even one node in the folder the offer is meaningful.
   */
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

  /*
   * One sentence, two surfaces. The shelf's step two and a source with no write-up ask
   * the same question, and answering it twice is how two screens come to disagree.
   */
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

  /**
   * **Why a coding-agent-only Library control cannot run — the sentence already written.**
   *
   * Ask and Check the wiki need a verified coding agent, and until 2026-09-11 they were
   * simply **absent** without one. `docs/DECISIONS.md`, "The Library keeps its spine, and
   * computes the structural check itself", replaces that with a rule: a feature the
   * product has is always on screen, and availability is a state with its reason. So the
   * control is drawn, disabled, beside the reason.
   *
   * ⚠️ **`null` means "no true sentence exists yet", not "available".** Every route now
   * has one. The `local` route was the last hole: a runner *is* saved there, so
   * `stage.blockedNoAgent` — which says no agent and no saved address — would be false,
   * and Ask and Check stayed absent rather than shipping a sentence that is not true.
   * `stage.blockedLocalOnly` is that route's own fact (design-lead F5 with
   * design-interaction C3, council 2026-09-11): the runner compiles, and the two turns
   * that read and judge need a coding agent. With it the presence rule — a feature the
   * product has is on screen, disabled, beside its reason — holds on every route.
   */
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

  /**
   * **Which card on the landing prints that sentence — one paragraph, whatever the route.**
   *
   * Measured at 1512 on the no-agent folder (design-interaction C2, council 2026-09-11):
   * `stage.blockedNoAgent` stood at y≈410 under step two's Compile and again at y≈633
   * under Ask. Both were true and both were the same words, which is how a screen teaches
   * a reader to skip its reasons.
   *
   * The rule is that the sentence belongs to the card whose **own press** it stops. On
   * the web, while an agent is still being looked for, and with none set up, Compile is
   * blocked by exactly this sentence — `libraryCompileBlockedReason` returns the same
   * string — so step two prints it and Ask points at that paragraph. On the `local` route
   * Compile can run and only the agent-only turns cannot, so step three prints it beside
   * Ask and step two's Check the wiki points down at it. Either way the landing carries
   * one `data-landing-blocked-reason`, which is what `library-spine.spec.ts` counts.
   */
  const agentReasonPrintedId =
    agentOnlyReason === null
      ? null
      : agentOnlyReason === compileBlocked
        ? "library-stage-compile-blocked"
        : "library-questions-ask-blocked";

  /**
   * **Whether an availability sentence on this screen earns a door — decided once.**
   *
   * Slice U2's third decision: a reason a person cannot act on teaches them to stop
   * reading reasons. Measured 2026-09-11, `stage.blockedNoAgent` printed under a dead
   * Compile and named a destination with no way to reach it, while `/agents` sat in the
   * rail 26px away.
   *
   * It is deliberately **not** a string test. The three sentences that earn the door —
   * `stage.blockedNoAgent`, `stage.blockedLocalOnly` and `answers.refreshUnavailable` —
   * are exactly the states where the missing thing is a verified coding agent on this
   * computer, so the condition is the route, and a later copy edit cannot silently move
   * a door.
   *
   * Two states deliberately earn nothing. **The web** (`nativeVaultRootPath === null`):
   * the missing thing there is the app itself, and the existing degradation card to
   * `/download/` is the honest door — a second door to `/agents` would send someone to
   * install a coding agent for a screen that still could not run one. **`checking`**: an
   * agent is still being looked for, and a door out of a state that may resolve itself in
   * a moment is an answer to a question nobody has been given yet.
   *
   * The door follows the printed sentence, so it appears at most twice on the product at
   * once — once on the landing, whose single reason `agentReasonPrintedId` places, and
   * once in the answer reader, which is a different screen. The source pane's own
   * `compileNote` is the third site.
   */
  const agentDoor =
    nativeVaultRootPath !== null && (agent.route === "unavailable" || agent.route === "local");

  /**
   * **Where the keyboard lands after the pane swaps.**
   *
   * Pressing "Start with …", a source chip, or "View write-up" replaces the whole right
   * pane, and the control that was pressed leaves the document with it — measured
   * 2026-09-06, `document.activeElement` fell back to `<body>`, so the next Tab landed in
   * the middle of whatever had arrived. Moving focus to the pane itself keeps the reading
   * order honest: the next Tab is the first control of the thing the person just chose.
   *
   * It deliberately does nothing on the first render. Focusing a region because a page
   * loaded is not the same event as focusing it because somebody pressed something.
   */
  const readerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (localReviewVisible) readerRef.current?.focus({ preventScroll: true });
  }, [localReviewVisible]);
  const lastFocusedSelection = useRef<typeof selected | undefined>(undefined);
  useEffect(() => {
    if (lastFocusedSelection.current === undefined) {
      lastFocusedSelection.current = selected;
      return;
    }
    if (lastFocusedSelection.current === selected) return;
    lastFocusedSelection.current = selected;
    if (skipReaderFocusRef.current) {
      skipReaderFocusRef.current = false;
      return;
    }
    readerRef.current?.focus({ preventScroll: true });
  }, [selected]);

  /**
   * Escape returns to the shelf, the same as the back control.
   *
   * Guarded on the two surfaces that own the key first: the discovery dialog traps it, and
   * the agent dock's own conversation uses it. Answering Escape from underneath either
   * would close two things with one press.
   */
  useEffect(() => {
    if (localReviewVisible || selected === null || findOpen || graphOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [agent.open, findOpen, graphOpen, localReviewVisible, selected]);

  /** Which list the index draws, and whether the column is folded — both per machine. */
  const indexSegment = useLibraryIndexSegment();
  const indexCollapsedByChoice = useLibraryIndexCollapsed();
  /*
   * **The reader keeps 420px, or the index folds on its own** (design-workbench, council
   * 2026-09-07). The dock's drag floor protects the map's 480px, and the Library's row
   * costs 280px more, so at the app's own 1040px minimum with a 496px dock the reading
   * column computed to 120px. Below 420px the index folds to its tab — the fold the
   * person can press, not a new one — and unfolds again above 460px so a one-pixel drag
   * cannot make it flap. Pressing the tab while narrow is the person's choice and stands
   * until the pane is wide enough on its own. Only at `lg` and above: below it the index
   * is the lower half of one column and has no width to give.
   */
  const [autoFolded, setAutoFolded] = useState(false);
  const autoFoldDeclinedRef = useRef(false);
  /*
   * **A state, not a ref.** The effect below runs once, and with no folder open this pane
   * does not exist yet — the screen is the centred start stage. A ref would still be null
   * at that moment and the observer would never attach, which is exactly what happened:
   * measured 2026-09-08, the pane reported 1384px wide while the verdict still said the
   * auto-fold observer had never attached. Holding the node in state re-runs the effect when
   * the workbench arrives.
   */
  const [readerEl, setReaderEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = readerEl;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observe = () => {
      const width = el.getBoundingClientRect().width;
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      if (!wide) {
        setAutoFolded(false);
        return;
      }
      setAutoFolded((current) => {
        if (current) {
          // Folded: the reader holds the column's 280px too; unfold once that leaves 460.
          if (width - 280 + 38 >= 460) {
            autoFoldDeclinedRef.current = false;
            return false;
          }
          return true;
        }
        if (width < 420 && !autoFoldDeclinedRef.current) return true;
        if (width >= 460) autoFoldDeclinedRef.current = false;
        return false;
      });
    };
    observe();
    const observer = new ResizeObserver(observe);
    observer.observe(el);
    return () => observer.disconnect();
  }, [readerEl]);

  const indexCollapsed = indexCollapsedByChoice || autoFolded;
  const indexTabRef = useRef<HTMLButtonElement | null>(null);
  const indexCollapseRef = useRef<HTMLButtonElement | null>(null);
  /**
   * **Folding moves focus with the control that vanished.** Both halves of this toggle are
   * the same act, so the hand that pressed one has to land on the other; without it a
   * keyboard press dropped focus to `<body>` and Tab restarted at the top of the document.
   *
   * The pending side is a **ref**, not state: the effect below consumes it, and a `setState`
   * to clear it would be a cascading render for a value nothing renders
   * (`react-hooks/set-state-in-effect`). The preference itself is what re-renders, so the
   * effect already runs exactly when the control it must reach has appeared.
   */
  const pendingIndexFocusRef = useRef<"tab" | "head" | null>(null);
  const setIndexCollapsed = useCallback((next: boolean) => {
    pendingIndexFocusRef.current = next ? "tab" : "head";
    writeLibraryIndexCollapsed(next);
  }, []);
  /**
   * **The bar was the "there is more" mark, so a fade takes its place** (2026-09-07).
   *
   * Every scroller in the shell now hides its bar (`app/globals.css`), and this column is
   * the case that rule warns about: a list of file names cut by a hard edge says nothing
   * about whether the cut is the end. So the edge that still has rows behind it fades,
   * exactly as the tab strips and the conversation's history list already do —
   * `--tabbar-edge-fade`, four states, no new value.
   */
  const indexScrollRef = useRef<HTMLDivElement | null>(null);
  const [indexEdge, setIndexEdge] = useState({ top: false, bottom: false });
  const measureIndexEdges = useCallback(() => {
    const box = indexScrollRef.current;
    if (!box) return;
    const top = box.scrollTop > 1;
    const bottom = box.scrollTop < box.scrollHeight - box.clientHeight - 1;
    setIndexEdge((previous) =>
      previous.top === top && previous.bottom === bottom ? previous : { top, bottom },
    );
  }, []);
  const handleIndexScroll = useCallback(() => measureIndexEdges(), [measureIndexEdges]);
  /*
   * The box's own rect answers the window resizing and the column folding; the row counts
   * answer the list changing under it. Switching the segment replaces every row, so a fade
   * left over from a list that is no longer drawn would point at nothing.
   */
  useEffect(() => {
    const box = indexScrollRef.current;
    if (!box || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measureIndexEdges());
    observer.observe(box);
    return () => observer.disconnect();
  }, [measureIndexEdges]);
  useEffect(() => {
    measureIndexEdges();
  }, [indexSegment, measureIndexEdges, model.sources.length, model.wikiPages.length]);

  useEffect(() => {
    const pending = pendingIndexFocusRef.current;
    if (pending === null) return;
    pendingIndexFocusRef.current = null;
    (pending === "tab" ? indexTabRef.current : indexCollapseRef.current)?.focus();
  }, [indexCollapsed]);
  /** A source or a page gives the index and guidance something to show. */
  const libraryIsEmpty = model.sources.length === 0 && model.wikiPages.length === 0;
  /**
   * **Where the keyboard lands when the empty folder stops being empty.**
   *
   * Pressing `Add files` on the start stage succeeds and the whole branch unmounts — the
   * button that was pressed goes with it, and `document.activeElement` falls back to
   * `<body>`, so the next Tab starts at the rail rather than at the workbench that just
   * arrived (design-interaction, 2026-09-06). The reader's own focus repair does not fire
   * here because nothing was **selected**; the screen changed underneath instead.
   *
   * It is deliberately silent on the first render: arriving at a folder that already has
   * files is not the same event as a folder filling up under somebody's hand.
   */
  const wasEmpty = useRef<boolean | null>(null);
  useEffect(() => {
    const before = wasEmpty.current;
    wasEmpty.current = libraryIsEmpty;
    if (before !== true || libraryIsEmpty) return;
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [libraryIsEmpty]);

  const wikiProblems = selectedWikiDoc
    ? (model.verdicts.get(selectedWikiDoc.slug)?.problems ?? [])
    : [];

  // ── With no folder, one centred stage rather than two empty panes. ───────────────
  if (!hasFolder) {
    return (
      /*
        ⚠️ **The screen a person meets before they have anything** (owner, 2026-09-09:
        *"this screen isn't pretty… make it cool! something with motion too… three.js is
        fine! something like geometric shapes!"*).

        What was here was a left-aligned text column on an unbroken black field, and the
        void around it was most of the viewport. The repair is not a bigger column: it is
        giving the screen a **ground**. `LibraryConstellation` draws the Library's own
        shape behind the copy — cubes for documents, spheres for the write-ups made from
        them, lines for the citations — anonymous here because no folder is open, and
        rebuilt from the person's real counts the moment one is. The picture they meet is
        the picture they will keep.

        ⚠️ **The words are beside the object, never on top of it.** The first build laid a
        glass panel over the constellation's middle and measured badly on its own terms:
        the panel covered the inner shell, so every write-up in the object was hidden and
        what remained was a scatter of cubes at the edges — the structure the picture
        exists to show was the one part nobody could see. The bright marks that did fall
        behind the glass smeared into soft discs and read as dirt on the panel.

        So the screen splits. The ask keeps the reading column it always had, at full
        contrast on the canvas itself with no glass and nothing moving under the type; the
        object gets its own half and is drawn whole. Below `lg` the object stands under
        the copy at a fixed height instead of beside it — a backdrop is the first thing to
        yield when there is one column of room.
      */
      <main
        id="main"
        tabIndex={-1}
        data-testid="library-page"
        data-library-state="no-folder"
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-10 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]"
      >
        <div className="flex w-full max-w-[var(--library-empty-max)] flex-col items-center gap-8 lg:flex-row lg:items-center lg:gap-12">
        <div className={`${PAGE_COLUMN_STAGE} relative shrink-0`}>
          {/*
            ⚠️ **The state is the headline here, not the destination's name**
            (design-lead, 2026-09-09). This column used to open with the workbench header:
            an `h1` carrying "Library" at 14px, then the state as an `h2` at 12.5px under
            it. Nothing on the frame was larger than 14px and the widest gap in the whole
            type stack was 14/11 — a ratio of **1.27** on a screen whose entire job is one
            sentence, so the eye reached the door before it had read what it was being
            asked. The stage one step further in already settled this and measured 2.42:
            *"there the heading is the state and the rail carries the name."* The rail
            carries the name here too, so the two empty screens now share one shape.

            The `lede` tooltip goes with the header, and loses nothing: it says the Library
            holds gathered documents and the pages written from them, which is what the
            two rows below say at length, with their own names for the two kinds.
          */}
          <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
            {t("title")}
          </p>
          <h1 className="mt-1 text-display leading-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
            {t("emptyTitle")}
          </h1>
          <p className="mt-2 text-body leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
            {t("emptyBody")}
          </p>
          {/*
            Two rows, not a paragraph. The person reading this has not opened a folder,
            so "sources" and "wiki" are words they have never seen used this way, and the
            page is about to ask them to hand over their documents. Naming the two kinds
            before the ask is cheaper than explaining them afterwards.
          */}
          <dl
            aria-label={t("kindsAria")}
            data-testid="library-kinds"
            className="mt-5 flex flex-col gap-3 border-t border-[color:var(--color-border-soft)] pt-4"
          >
            <div>
              <dt className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t("kindSourcesTitle")}
              </dt>
              <dd className="mt-0.5 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
                {t("kindSourcesBody")}
              </dd>
            </div>
            <div>
              <dt className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t("kindWikiTitle")}
              </dt>
              <dd className="mt-0.5 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
                {t("kindWikiBody")}
              </dd>
            </div>
          </dl>
          <div className="mt-5">
            {/* The ask is this region's one emphasis, so it wears the indigo. */}
            <OpenVaultCta
              testId="library-open-vault"
              tone="accentOnTint"
              className="border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]"
            />
          </div>
        </div>
        {/*
          The object's own half.

          ⚠️ **Square at every width.** Below `lg` it was given the pane's full width at a
          fixed height, which made a 728×280 box — and its vignette is an ellipse fitted to
          the box, so at 2.6:1 the clear middle was 59px tall and swallowed the object
          whole. Measured at 768×1024: a correctly sized canvas drawing nothing anyone
          could see. A square box keeps the fade concentric with the object it is fading.
        */}
        <div
          data-testid="library-empty-object"
          className="relative aspect-square w-full max-w-[var(--library-empty-object-max)] shrink-0"
        >
          <LibraryConstellation />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,var(--color-canvas-a70)_82%,var(--color-canvas)_100%)]"
          />
        </div>
        </div>
      </main>
    );
  }

  /**
   * **A folder with nothing in it is an empty state, not a workbench with a popup over
   * it** (owner, 2026-09-06 — `docs/DECISIONS.md`).
   *
   * The condition is exactly the one that makes the canvas empty: no sources and no
   * pages means `buildLibraryGraph` returns no nodes, so the pane would draw its
   * "Nothing to draw yet…" sentence, the header would count three zeroes, the strip
   * would print three turns-not-yet-come, both index lists would carry their own
   * "nothing here" copy **and their own two doors**, and the guide would raise itself
   * over all of it. Six statements of one fact, one of them lying across another.
   *
   * ⚠️ It is not "no sources". A folder with hand-written pages and no sources still has
   * a picture to draw and an index worth reading, so it keeps the workbench.
   */
  /*
   * The service door, shared by the empty stage and the workbench: the folder that has
   * nothing in it yet is exactly where a person whose notes live elsewhere arrives.
   */
  const importDialog = (
    <>
    {/*
      The service door. Blocking, because it ends in a connection being written into the
      folder and a conversation opening — an errand with a beginning and an end, which is what
      `Dialog` is for. It closes before it hands the brief over, so the dock is never behind a
      scrim (`.claude/rules/design.md` forbids two blocking surfaces at once).
    */}
    <LibraryImportDialog
      open={importOpen}
      onClose={() => setImportOpen(false)}
      onAttach={(connector) => connectors.upsert(connector)}
      onBrief={(brief) => agent.start(brief, "import")}
      /*
       * ⚠️ **Whether the last press can do anything** (cold walkthrough, 2026-09-07). Only the
       * coding-agent route can fetch from a service: `useLocalCompile` reads files already
       * under `sources/` and has no tool that reaches outward, and a browser has no agent at
       * all. Without this the dialog closed on a press that started nothing, which reads as a
       * broken product rather than a surface that cannot do it.
       */
      canRunAgent={agent.route === "agent"}
      /*
       * Two different absences: a browser cannot start any program, while the installed app can
       * and has simply verified no coding tool yet. The remedies differ too — one is the app,
       * the other is the runtimes screen — so the card is told which it is meeting.
       */
      agentGap={isAcpBridgeAvailable() ? "runtime" : "browser"}
      /*
       * A service this list does not know goes to the technical dialog, which lives on `/mcp`
       * and is unchanged. `?tab=connectors` opens it on the half that adds one, so nobody
       * arrives on the share tab wondering where the connectors went.
       */
      onOpenAdvanced={() => importRouter.push(`${DESTINATION_HREF.mcp}?tab=connectors`)}
    />
    </>
  );

  if (libraryIsEmpty) {
    return (
      <main
        id="main"
        tabIndex={-1}
        data-testid="library-page"
        data-library-state="empty-folder"
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto px-5 py-10 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]"
      >
        {/*
          ⚠️ **A ground, but the texture one — not the other empty screen's object.**

          Both empty screens open on the same sentence, and this one was left on an unbroken
          field when the other was given a ground: measured on the installed app at
          1512x949, its card ended at 61.5% of the window with the bottom 38.5% empty.

          The object is the wrong piece to move here, for the reason its own decision gives.
          `buildConstellation` takes a folder; the anonymous one is drawn **where nobody has
          opened one**. Here a folder *is* open and holds nothing, so ten marks beside the
          sentence "nothing gathered yet" would be a picture contradicting the words next to
          it — the falsifier that decision already names. Passing this folder's real counts
          draws nothing at all, because they are zero.

          `LibrarySynapseField` is the piece minted for exactly this: texture, not data. It
          draws no count and no link that exists, so there is nothing on it to mistake for a
          claim about the folder. The guided pane reached the same place from the same
          complaint, and takes the same mask — the field clears the middle where the column
          stands and fades into the canvas at every rim.

          The card does not move. `tests/e2e/library.spec.ts` holds this stage's centre
          within half a column of the viewport's, and a backdrop behind it keeps that.
        */}
        <LibrarySynapseField paused={findOpen} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--color-canvas)_0%,var(--color-canvas-a70)_30%,transparent_56%,var(--color-canvas-a70)_88%,var(--color-canvas)_100%)]"
        />
        <div className="relative">
        <LibraryStartStage
          vaultLabel={nativeVaultRootPath ?? handle.name}
          busy={busy}
          onAddFiles={handleAddFiles}
          onFindDocuments={handleFindDocuments}
          onImportFromService={openImport}
          t={t}
        />
        </div>
        {importDialog}
        {/* The same dialog the workbench uses: discovery proposes, a person approves. */}
        <FindDocumentsDialog
          open={findOpen}
          onClose={() => setFindOpen(false)}
          outcome={discovery}
          declinedCount={declinedCount}
          onForgetDeclined={handleForgetDeclined}
          onAdd={handleAddCandidates}
          busy={busy}
        />
      </main>
    );
  }

  const narrowShowsReader = selected !== null || localReviewVisible;
  // Four states — both edges, either, neither — the way `AcpChatPanel` writes its own.
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
    /*
     * ⚠️ **`<main>` is the whole row, not just the reader.** Docs can put its tree in a
     * sibling `<aside>` because its `<main>` always holds a document; here, below `lg`,
     * the reader stands aside until something is chosen — and a `<main>` that is
     * `display:none` is a landmark with nothing in it and a "skip to content" link that
     * lands nowhere. Making the row the landmark also keeps the dock inside a box with
     * height, which is the whole of what makes it visible (see its own comment below).
     */
    <main
      id="main"
      tabIndex={-1}
      data-testid="library-page"
      data-library-state={localReviewVisible ? "local-review" : opened ? opened.kind : "nothing-open"}
      /* The conversation dock remains anchored to this stable row. */
      className="topology-ui-scale relative flex min-h-0 w-full flex-1 bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)] max-lg:flex-col"
    >
      {/*
        **The folded index is one icon control, where the fold control stood.**

        The first shape borrowed the map's edge tab — a 26px column with a vertical
        *Index* label and a chevron. On the installed app the owner read it as two odd
        controls beside the reader's back chip and asked what the arrow was for
        (2026-09-07, evening). The map's tab floats over a canvas as a drawer handle; here
        it sat in a row of chrome and read as noise. Now the fold and the unfold are the
        same control in the same place — `PanelLeftClose` on the column's eyebrow line,
        `PanelLeftOpen` at the pane's top-left once the column is gone — so the person
        learns one glyph and one spot.

        `lg` and above only. Below it the index is the bottom half of one column with the
        graph above it — there is no second pane for the width to go to.
      */}
      {indexCollapsed ? (
        <div className="hidden flex-none self-start pl-3 pt-2 lg:block">
          <button
            type="button"
            ref={indexTabRef}
            onClick={() => {
              // Pressing the control while the pane is narrow is a choice: the auto-fold
              // stands down until the pane is wide enough on its own.
              if (autoFolded) autoFoldDeclinedRef.current = true;
              setAutoFolded(false);
              setIndexCollapsed(false);
            }}
            aria-label={t("index.expand")}
            aria-expanded={false}
            data-testid="library-index-tab"
            className={controlClass({ shape: "icon", size: "sm", tone: "muted", hoverInk: "strong" })}
          >
            <PanelLeftOpen size={ICON_SIZE.sm} aria-hidden />
          </button>
        </div>
      ) : null}

      {/*
        The index. Below `lg` it is the lower half of one column and stands aside once
        something is open; the reader's back control is what brings it back.
      */}
      <aside
        data-testid="library-index"
        aria-label={t("title")}
        className={cn(
          /* Below `lg` the two panes stack, and the rule states the boundary the panel
             tone already implies, so the top of this column does not read as the bottom
             of the canvas. */
          /* `--library-index-min` is the floor below `lg`, where this column shares one
             pane with the stage and a short pane squeezed it until a search that answered
             had nowhere to show the answer (design-responsive, council 2026-09-11;
             measured 0 of 2 rows at 756×450 without it, 1 of 2 with it — that token's own
             block in `app/globals.css` carries the numbers). Above `lg` the column has
             the window's height and the floor never binds. */
          "flex w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--color-panel)] max-lg:min-h-[var(--library-index-min)] max-lg:border-t max-lg:border-[color:var(--color-border-soft)] lg:w-[var(--docs-list-width)] lg:flex-none lg:border-r lg:border-[color:var(--color-border-soft)]",
          narrowShowsReader && "max-lg:hidden",
          indexCollapsed && "lg:hidden",
        )}
      >
        {/*
          **The head does not scroll** (owner, 2026-09-07: *"a switch at the top is
          better"*). It is the name of the place, the switch, and the fold — three things a
          person needs while they are inside a list, so none of them may pass under the
          fold with the rows. The lede that used to sit here is now the `Info` glyph's
          tooltip: measured at 280px it was three lines of a sentence read once, and it was
          the ~60px this switch now stands in.
        */}
        <div className="flex-none border-b border-[color:var(--color-overlay-2)] px-3 pb-2.5 pt-4">
          <LibraryHeader
            t={t}
            onCollapse={() => setIndexCollapsed(true)}
            collapseRef={indexCollapseRef}
          />
          <SegmentedControl
            ariaLabel={t("index.aria")}
            value={indexSegment}
            onChange={(next: LibraryIndexSegment) => writeLibraryIndexSegment(next)}
            /*
             * `lg` (32px), not the `md` this first shipped as. Measured at 280px, `md`
             * drew the switch 24px tall under a title and **over** the 32px door chips it
             * governs — the control that decides what the column is, smaller than the
             * controls inside it. 32 also puts it on the same step as those chips, which
             * is the one step this head's role gets.
             */
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
          />
        </div>
        {/*
          One scroller, and it holds one list. Below `lg` the bottom tab bar stands over
          this column and the reserve is the scrolling box's own to pay
          (`.claude/rules/design.md`).

          The bar is hidden here as it is everywhere (`app/globals.css`, 2026-09-07), so
          the mask is what says a list continues past the fold — the same
          `--tabbar-edge-fade` the strips use. It is applied only while there is something
          below, or a short list would fade its own last row for no reason.
        */}
        <div
          data-testid="library-index-scroll"
          ref={indexScrollRef}
          onScroll={handleIndexScroll}
          style={indexMask ? { maskImage: indexMask, WebkitMaskImage: indexMask } : undefined}
          className="atlas-scroll-quiet flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]"
        >
          <LibrarySection
            model={model}
            segment={indexSegment}
            selectedSlug={opened?.kind === "wiki" ? opened.slug : null}
            selectedSourcePath={opened?.kind === "source" ? opened.path : null}
            /* Which passage the pane is standing on, so the caption that opened it says so
               and no other caption claims it (slice U2, council 2026-09-11). */
            selectedSourceAnchor={
              opened?.kind === "source" && sourceCitation?.path === opened.path
                ? sourceCitation.anchor ?? null
                : null
            }
            sourceHandles={localVault.sourceHandles}
            vaultScope={workVaultScope}
            onSelect={(slug) => choose({ kind: "wiki", slug })}
            /*
             * A search hit's caption carries an anchor, and it goes where a pressed
             * citation goes: `choose` clears `sourceCitation`, so the anchor is set after
             * it, exactly as the answer reader's own source link does below (slice U2).
             */
            onOpenSource={(row, anchor) => {
              choose({ kind: "source", path: row.path });
              if (anchor) setSourceCitation({ path: row.path, anchor });
            }}
            onAddFiles={handleAddFiles}
            onFindDocuments={handleFindDocuments}
            onImportFromService={openImport}
            onCompile={agent.route === "agent" || agent.route === "local" ? handleCompile : null}
            onLint={agent.route === "agent" ? handleLint : null}
            lintBlockedReason={agentOnlyReason}
            hasWikiTemplate={docs.some((doc) => doc.slug === "wiki/_template")}
            onNewPage={handle ? handleNewPage : null}
            /*
             * The door is open whenever there is a wiki to report on. It used to require
             * `findings.length + … > 0 || model.log.lastLint` — an agent having run at
             * least once — so a person with no agent had no way to reach the one screen
             * that could tell them which of their pages carried which structural finding,
             * although the app had already computed every one of them (both PO seats,
             * 2026-09-12). The count now counts what the page actually holds: the app's
             * own findings plus the agent's.
             */
            report={
              reportDoorCount !== null
                ? {
                    count: reportDoorCount,
                    open: opened?.kind === "report",
                    onOpen: () => choose({ kind: "report" }),
                    running: lintRunning,
                    unseen: reportUnseen && opened?.kind !== "report",
                  }
                : null
            }
            /*
             * The same picker as step two, reading and writing the same stored answer, so
             * the sidebar and the shelf can never name different brains.
             */
            /*
             * ⚠️ **One control per setting per screen** (guardian, council 2026-09-11).
             * Step two of the spine carries this same picker, and before the spine was
             * unconditional the two never coexisted — the stage vanished at one saved
             * answer. Now the landing is always drawn, so with a folder open in the wiki
             * segment both pickers stood on screen at once, naming the same brain twice
             * and turning `library-compile-brain` into two elements (CI, chromium 2/3 of
             * `library-local-wiki-context.spec.ts`). The step-two card owns the setting
             * while the landing is visible; the index takes it back the moment a
             * document, a source, the report or the local review replaces that pane —
             * which is the same condition its transfer sentence already switches on.
             */
            brainControl={
              agent.brainChoosable && narrowShowsReader ? (
                <CompileBrainSelect
                  brain={agent.brain}
                  agentLabel={agent.runtime?.label ?? null}
                  localModel={agent.localModel}
                  onChoose={agent.chooseBrain}
                  t={t}
                />
              ) : null
            }
            /* Guidance owns the disclosure while it is visible; after a selection,
               the index keeps it beside its Compile action. */
            compileNote={
              selected === null || compileBlocked !== null
                ? null
                : libraryTransferSentence({ route: agent.route, localModel: agent.localModel }, t)
            }
            busy={busy}
            /*
             * Both routes that can write a page: the agent turn this view starts, and the
             * local runner's own session. The shelf carries the progress either way, so a
             * person watching the pages sees the work happen on the pages.
             */
            compiling={compileRunning || agent.localCompile.status === "running"}
            t={t}
          />
        </div>
      </aside>

      {/*
       * The reader — and, with nothing chosen, the guided shelf.
       *
       * ⚠️ **`max-lg:order-first` is the whole of the narrow layout** (2026-09-06). Until
       * then this box carried `!narrowShowsReader && "max-lg:hidden"`, so below `lg` a
       * folder with nothing chosen drew the two lists and **nothing else**: the three
       * steps that answer "what is this screen for" existed only at `lg` and above, and a
       * phone got the one state the shelf was written to replace. Measured at 390×844 and
       * 768×1024 on the seeded folder: `library-stage` had a zero rect at both.
       *
       * So below `lg` the row becomes a column (`max-lg:flex-col` on `<main>`) and this
       * box takes the top of it, above the lists — the order of the work, the same order
       * the two panes read in at `lg`. Both halves keep `min-h-0` and their own scroller,
       * so the index's nested list scrollers still own their overflow rather than handing
       * it to a page scroll (design-responsive, 2026-09-06).
       *
       * Choosing something still swaps the whole column: the index hides, this box is the
       * width of the screen, and the back control above the document is the way home.
       */}
      <div
        ref={(node) => {
          readerRef.current = node;
          setReaderEl(node);
        }}
        tabIndex={-1}
        data-testid="library-reader"
        /* One stable column keeps reading focus and the work lane across selections. */
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden max-lg:order-first"
      >
        {/* Work stays above the reader and guidance, independent of the graph dialog. */}
        <LibraryWorkActivityStrip
          activity={libraryWorkActivity}
          /* The lane belongs to an open conversation, not to the folder: see the prop's
             own note for the 112px an idle Library was paying without one. */
          reserved={dockOpen}
          onSelect={(target) =>
            choose(
              target.kind === "wiki"
                ? { kind: "wiki", slug: target.ref }
                : { kind: "source", path: target.ref },
            )
          }
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-none items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3 py-2">
            {selected || localReviewVisible ? (
              <button
                type="button"
                onClick={() => localReviewVisible ? agent.localCompile.dismiss() : setSelected(null)}
                disabled={localReviewVisible && localReviewBusy}
                data-testid="library-reader-back"
                /*
                 * ⚠️ **No `atlas-touch-floor` here, and that is measured.** The council
                 * read this exit at 96×32 and called the floor missing; re-measured under
                 * `hasTouch` on 2026-09-12 it is 96×44, because `shape: "chip"` emits the
                 * marker from the value layer (`control-class.ts`, `TOUCH_FLOOR`). The
                 * seat's own correction about the 24px door — a desktop run measures the
                 * fine-pointer box — applies to its own reading of this control. A second
                 * copy of the class would say the floor came from this site.
                 */
                className={controlClass({ shape: "chip", tone: "muted" })}
              >
                {t(localReviewVisible ? "localCompile.back" : "graph.readerClose")}
              </button>
            ) : null}
            <div className="min-w-0 flex-1"><LibraryStatusStrip model={model} t={t} /></div>
            <span className="flex shrink-0 items-center gap-2">
              {answerRefresh.proposal ? <Button className="atlas-touch-floor" size="sm" variant="outline" data-testid="answer-review-open" onClick={() => setAnswerComparisonOpen(true)}>{t('answers.reviewDraft')}</Button> : null}
              {graphAction}{conversationDoor}
            </span>
          </div>
          {localReviewVisible ? (
            <div data-testid="library-local-review" className="min-h-0 flex-1 overflow-y-auto px-3 py-6">
              <div className={`${PAGE_COLUMN_STAGE} mx-auto`}>
                <LocalCompileCard session={agent.localCompile} model={agent.localModel?.model ?? ""} t={t} />
              </div>
            </div>
          ) : null}
          {!selected && !localReviewVisible ? (
            <div
              data-testid="library-reader-landing"
              /*
               * `library-spine-scope` makes this pane a size container, so the stage can
               * fold its finished steps when **this box** is short rather than when the
               * window is (`app/globals.css`, `--library-spine-collapse-height`).
               * Measured below `lg`, where the reader is the upper half of one column:
               * the first saved-question row stood 272px below the fold at 390×844 and
               * 34 at 1024×640 (design-responsive C1, council 2026-09-11).
               */
              className="library-spine-scope relative min-h-0 flex-1 overflow-y-auto px-3 py-6"
            >
              <LibrarySynapseField paused={graphOpen} />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--color-canvas)_0%,var(--color-canvas-a70)_30%,transparent_56%,var(--color-canvas-a70)_88%,var(--color-canvas)_100%)]"
              />
              <div className="relative z-10 flex min-h-full items-center justify-center">
                <div className={PAGE_COLUMN_STAGE + " mx-auto"}>
                  {/*
                    **The spine is drawn at every count** (`docs/DECISIONS.md`, 2026-09-11,
                    "The Library keeps its spine, and computes the structural check
                    itself"). It used to be `retainedAnswers.length === 0 ? <stage> :
                    null`, so the first saved answer removed the only screen naming the
                    next step and left a list with no order around it. The stage is now
                    this landing's one headline — `text-display`, the page grade the
                    questions heading used to hold — and the questions are a section
                    inside step three.
                  */}
                  <h2 data-testid="library-stage-title" className="mb-3 px-3 text-display font-[var(--font-weight-signature)] leading-display text-[color:var(--color-text-primary)]">
                    {t("stage.title")}
                  </h2>
                  <LibraryStage
                    model={model}
                    route={agent.route}
                    agentLabel={agent.runtime?.label ?? null}
                    localModel={agent.localModel}
                    brain={agent.brain}
                    brainChoosable={agent.brainChoosable}
                    onChooseBrain={agent.chooseBrain}
                    inApp={nativeVaultRootPath !== null}
                    onAddFiles={handleAddFiles}
                    onFindDocuments={handleFindDocuments}
                    onCompile={handleCompile}
                    onLint={agent.route === "agent" ? handleLint : null}
                    lintBlockedReason={agentOnlyReason}
                    lintBlockedReasonId={agentReasonPrintedId}
                    agentDoor={agentDoor}
                    onOpenWiki={(slug) => choose({ kind: "wiki", slug })}
                    answerSlugs={retainedAnswerSlugs}
                    busy={busy}
                    questions={
                      <LibraryQuestions
                        answers={retainedAnswers}
                        knownSources={knownOriginalPaths}
                        hashes={model.hashes}
                        onOpen={(slug) => choose({ kind: "wiki", slug })}
                        onAsk={agent.route === "agent" ? () => agent.setOpen(true) : null}
                        askBlockedReason={agentOnlyReason}
                        askBlockedReasonId={
                          agentReasonPrintedId === "library-questions-ask-blocked"
                            ? null
                            : agentReasonPrintedId
                        }
                        agentDoor={agentDoor}
                        t={t}
                      />
                    }
                    t={t}
                  />
                </div>
              </div>
            </div>
          ) : null}
          {!localReviewVisible ? <div
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
                onJumpToSection={handleReportHeadingNavigate}
                onFix={agent.route === "agent" ? handleFix : null}
                onPropose={agent.route === "agent" && hasOntology ? handlePropose : null}
                onOpenPage={(slug) => choose({ kind: "wiki", slug })}
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
                originals={model.pairing.originalsByWiki.get(selectedWikiDoc.slug) ?? EMPTY_ORIGINALS}
                onOpenSource={(path) => choose({ kind: "source", path })}
                t={t}
              />
              <WikiTemplateProblems problems={wikiProblems} t={t} />
              {selectedAnswer ? <RetainedAnswerContext
                refreshButtonRef={answerRefreshButtonRef}
                observation={answerObservation(selectedAnswer.frontmatter, knownOriginalPaths, model.hashes)}
                phase={turnRunning ? 'running' : answerRefresh.phase}
                historyState={answerHistory.state}
                older={!retainedAnswers.some((answer) => answer.slug === selectedAnswer.slug)}
                onHome={() => choose(null)}
                onPrevious={answerHistory.previous && answerHistory.exists ? () => choose({ kind: 'wiki', slug: answerHistory.previous! }) : null}
                onRefresh={agent.route === 'agent' && nativeVaultRootPath ? () => { void answerRefresh.begin(selectedAnswer.slug); } : null}
                agentDoor={agentDoor}
                error={answerRefresh.error} t={t} /> : null}
              {/* The passage a person selects here can be asked about at once; the chip and
                  its list hang from the selection inside this positioned box. */}
              <div
                ref={pageBodyRef}
                // With a passage selected (`data-selecting`, set by SelectionAsk), every line of
                // the page except the selection itself and the ask chip steps back to quaternary
                // ink; `::selection` keeps the selected words at primary over the indigo wash.
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
                  /* The passage owns the landing, so the pane does not take focus from
                     it — `skipReaderFocusRef` is the existing seam for "this pane was
                     opened by something that knows where focus belongs". Measured
                     2026-09-11: without it the passage section was focused and the pane
                     stole it back in the same frame. */
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
            </DocReadingPane>
          ) : selectedSource ? (
            <div className="min-h-0 flex-1 overflow-auto max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]">
              <SourceSummary
                row={selectedSource}
                hash={model.hashes.get(selectedSource.path) ?? null}
                /*
                 * The passage lives inside the pane now, beneath the facts, instead of a
                 * line above the card that printed the anchor and nothing else. Pressing
                 * a citation still opens this pane — today's behaviour, brief decision 5 —
                 * and now lands on the text it names.
                 */
                passage={citedPassage}
                /* The outline, above the passage: the coarse answer before the exact one. */
                outline={sourceOutlineState}
                canReveal={nativeVaultRootPath !== null}
                writeUps={model.pairing.writeUpsBySource.get(selectedSource.path) ?? EMPTY_WRITE_UPS}
                onOpen={() => handleOpenSource(selectedSource)}
                /* An outline heading is an address; pressing it is the citation press,
                   arriving from inside the pane instead of from the index (slice U2). */
                onOpenPassage={(anchor) => setSourceCitation({ path: selectedSource.path, anchor })}
                onOpenWiki={(slug) => choose({ kind: "wiki", slug })}
                onCompile={handleCompile}
                /*
                 * The same one slot the column carries, asked the same way: the reason
                 * Compile is refused, or what leaves this computer when it runs. This press
                 * is the one a person is looking at while a source is open, so this is where
                 * the disclosure belongs (`.claude/rules/local-first.md`).
                 */
                compileNote={
                  compileBlocked ??
                  libraryTransferSentence({ route: agent.route, localModel: agent.localModel }, t)
                }
                compileBlocked={compileBlocked !== null}
                agentDoor={agentDoor}
                busy={busy}
                t={t}
              />
            </div>
          ) : null}
          </div> : null}
        </div>
      </div>

      {/* A requested graph owns its viewport; closing it leaves the reader and dock intact. */}
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
      <Dialog
        open={graphOpen}
        onClose={closeGraph}
        size="viewport"
        labelledBy="library-graph-dialog-title"
        testId="library-graph-dialog"
        className="flex min-h-0 flex-col p-0"
      >
        <div className="flex flex-none items-center gap-3 border-b border-[color:var(--color-border-soft)] px-4 py-3">
          <h2 id="library-graph-dialog-title" className="min-w-0 flex-1 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {t("graph.title")}
          </h2>
          <Button variant="ghost" size="sm" onClick={closeGraph}>
            {t("stage.close")}
          </Button>
        </div>
        <LibraryGraph
          docs={manifest?.docs ?? EMPTY_DOCS}
          wikiPages={model.wikiPages}
          sources={model.sources}
          activity={libraryWorkActivity}
          visible={graphOpen}
          selection={
            opened === null || opened.kind === "report"
              ? null
              : opened.kind === "wiki"
                ? { kind: "wiki", ref: opened.slug }
                : { kind: "source", ref: opened.path }
          }
          onSelect={(next) => {
            choose(next.kind === "wiki" ? { kind: "wiki", slug: next.ref } : { kind: "source", path: next.ref });
            setGraphOpen(false);
          }}
        />
      </Dialog>

      {/*
        The dock is a **sibling of the reader inside this row**, which is the whole of what
        makes it visible: its surface is `absolute inset-y-3 right-3`, so the frame needs a
        parent that gives it height. Measured in the installed app on 2026-09-05 — the
        first placement put it after the row, inside a flex **column**, where a frame whose
        only child is absolutely positioned collapses to zero height and `overflow-hidden`
        finished the job. Compile ran, the session started, and nothing appeared.
      */}
      {agent.route === "agent" && agent.runtime && nativeVaultRootPath ? (
        <LibraryAgentDock
          chatWidth={chatWidth}
          judgeWrite={judgeWrite}
          autoDecide={autoDecide}
          onTurnStarted={handleTurnStarted}
          onTurnActivityChange={setAgentActivity}
          onTurnToolActivityChange={handleAcpToolActivityChange}
          onTerminalToolObservation={handleTerminalToolObservation}
          onFileAnswer={lastAnswer ? handleFileAnswer : null}
          filingAnswer={lastAnswer !== null && filingAnswer === lastAnswer}
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
          /*
           * The check's answer is the Library's own ledger, so the chat carries one line
           * and a door instead of the whole report (owner, 2026-09-12). Matched on the
           * request this dock actually sent, so an older check in the scrollback folds the
           * same way it did when it arrived.
           */
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
          onClose={() => agent.setOpen(false)}
        />
      ) : null}

      {importDialog}

      {/* Discovery proposes; this dialog is where a person approves. Blocking, because it
          is asking to take copies of their files. */}
      <FindDocumentsDialog
        open={findOpen}
        onClose={() => setFindOpen(false)}
        outcome={discovery}
        declinedCount={declinedCount}
        onForgetDeclined={handleForgetDeclined}
        onAdd={handleAddCandidates}
        busy={busy}
      />
    </main>
  );
}

/**
 * Eyebrow, name, and the two controls that belong to the column itself. Not a display
 * title: this is a workbench, not a document.
 *
 * ⚠️ **The lede is a glyph now** (owner, 2026-09-07: *"put one icon beside the title and
 * show the explanation in a tooltip on hover"*). It was three lines of `text-label` in a
 * 280px column — a sentence read once on the first visit and then re-read on every visit
 * after it, holding the ~60px the switch under it now stands in. It is not deleted: the
 * `Info` glyph is a real focusable control with the sentence as its accessible name, so a
 * keyboard and a screen reader reach it the same way a pointer does, which a paragraph
 * that had been cut would not have offered either.
 */
function LibraryHeader({
  t,
  inFolder = true,
  onCollapse,
  collapseRef,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  inFolder?: boolean;
  /** Folds the column to its edge tab. Absent where there is no column to fold. */
  onCollapse?: () => void;
  collapseRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div data-testid="library-header">
      {/* "In this folder" is only true once a folder is open; the stage before that has none. */}
      <div className="flex min-h-4 items-center gap-2">
        {inFolder ? (
          <p className="min-w-0 flex-1 truncate font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
            {t("eyebrow")}
          </p>
        ) : null}
        {/*
          ⚠️ **The fold rides on the eyebrow line, not beside the title** — and that is a
          placement the tooltip decided. The description opens to the `right` of the `Info`
          glyph, and Radix tooltip content takes pointer events, so with the fold on the
          same row the panel lay directly on the control a hand travels to next: measured,
          the press was intercepted for as long as the tooltip stood. One row up, the
          tooltip opens over the picture, where nothing is being aimed at.
        */}
        {onCollapse ? (
          <button
            type="button"
            ref={collapseRef}
            onClick={onCollapse}
            aria-label={t("index.collapse")}
            aria-expanded
            data-testid="library-index-collapse"
            /* `lg` and up: below it the column is the bottom half of one column and has
               nowhere to fold to. The glyph is the panel itself closing; its pair opens
               it from the same spot once the column is gone. */
            className={controlClass({
              shape: "icon",
              size: "sm",
              tone: "muted",
              hoverInk: "strong",
              className: "-mr-1 ml-auto hidden flex-none lg:inline-flex",
            })}
          >
            <PanelLeftClose size={ICON_SIZE.sm} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1.5">
        <h1 className="min-w-0 truncate text-body-lg font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
          {t("title")}
        </h1>
        {/*
          Three corrections, each from a measurement (2026-09-07).

          **A width.** The sentence is 150 characters and a tooltip has no width of its
          own, so on the default `top` side it drew as one line the width of the window,
          clipped at the left edge and lying across the graph's header (1040×760).

          **`side="right"`.** `bottom` put the panel on the switch the hand travels to
          next; `right` opens into the picture, where nothing is being aimed at, and the
          fold moved up to the eyebrow line to leave that side clear.

          **`disableHoverableContent`.** Radix keeps a tooltip open while the pointer is
          over the panel *and* the panel takes pointer events, so a control underneath it
          could not be pressed for as long as it stood — measured as a click intercepted
          indefinitely. This is a sentence, not a surface with anything to reach in it, so
          the grace area is worth nothing and costs the press.
        */}
        <TooltipProvider disableHoverableContent>
          <Tooltip
            withProvider={false}
            side="right"
            content={<span className="block max-w-64 [word-break:keep-all]">{t("lede")}</span>}
          >
            <button
              type="button"
              data-testid="library-lede-info"
              aria-label={t("lede")}
              className={controlClass({
                shape: "icon",
                size: "sm",
                tone: "muted",
                hoverInk: "strong",
                className: "flex-none",
              })}
            >
              <Info size={ICON_SIZE.sm} aria-hidden />
            </button>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

/** A stable empty array, so the model's memo does not see a new identity every render. */
const EMPTY_DOCS: never[] = [];
/** The same reason, for the two crossings: a fresh `[]` each render remounts their rows. */
const EMPTY_ORIGINALS: never[] = [];
const EMPTY_WRITE_UPS: never[] = [];
