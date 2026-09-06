"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ListChecks } from "lucide-react";

import { useLocalVault, useVaultIdentityScope } from "@/entities/vault-session";
import { isWikiPage } from "@/entities/docs-vault";
import type { LintNodeCandidate } from "@/features/library";
import type { LibrarySourceRow, SourceCandidate } from "@/entities/docs-vault";
import { useRouter } from "@/i18n/navigation";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { useVaultConnectors } from "@/features/mcp-connectors";
import { isAcpBridgeAvailable } from "@/shared/lib/tauri-acp";
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
} from "@/features/library";
import {
  DocReadingPane,
  shouldShowOutlineRail,
  useBackToTop,
  useDocReadingScrollSpy,
} from "@/widgets/doc-reading-pane";
import { DocsVaultViewer } from "@/widgets/docs-vault";
import { LibraryGraph } from "@/widgets/library-graph";
import { LibraryImportDialog } from "@/widgets/library-import";
import { cn } from "@/shared/lib/cn";
import { getTauriVaultRootPath, revealTauriVaultFile } from "@/shared/lib/tauri-vault-fs";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { PAGE_COLUMN_STAGE } from "@/shared/ui/page-frame";
import { useToast } from "@/shared/ui";

import { isWikiFurnitureSlug } from "@/shared/lib/wiki-page-schema";
import { libraryCompileBlockedReason, libraryTransferSentence } from "../lib/compile-availability";
import { useLibraryModel } from "../lib/use-library-model";
import { useLibraryAgent } from "../lib/use-library-agent";
import { LibrarySection } from "./parts/LibrarySection";
import { CompileBrainSelect } from "./parts/CompileBrainSelect";
import { LibraryShelfPopover } from "./parts/LibraryShelfPopover";
import { LibraryStage } from "./parts/LibraryStage";
import { LibraryStartStage } from "./parts/LibraryStartStage";
import { LibraryStatusStrip } from "./parts/LibraryStatusStrip";
import { LibraryAgentDock } from "./parts/LibraryAgentDock";
import { selectLibraryHandle } from "../lib/select-library-handle";
import { SourceSummary } from "./parts/SourceSummary";
import { WikiPageHeader } from "./parts/WikiPageHeader";
import { WikiTemplateProblems } from "./parts/WikiTemplateProblems";

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
 * **With nothing selected the pane is the graph** (2026-09-06, owner, third pass). It was
 * a 320px graph strip with the guided shelf stacked under it, and the owner opened the
 * installed app on a folder a local `qwen3:8b` had just compiled and read exactly that:
 * *"shouldn't the Library tab's default be the graph on top? why is the area split above
 * and below? the area underneath should come up as a popup."* Two surfaces were sharing
 * one column and neither was the screen. So the picture fills the pane the way the map
 * fills its own tab, and the shelf — a guide, which is a thing a person consults rather
 * than reads — is a `Surface` one chip away, with its verdict left behind on the graph's
 * header as a one-line status strip. `docs/DECISIONS.md`, 2026-09-06.
 *
 * Below `lg` the two panes become one column — **the graph on top, the lists under it** —
 * and selecting swaps the column for the reader, with a way back. Two 280px-plus panes do
 * not fit a phone, and hiding the index behind a drawer would bury the two doors
 * (`Add files`, `Find documents`) that are the reason someone opens this screen at all.
 *
 * ⚠️ **The narrow column used to draw nothing at all in this state** (fixed 2026-09-06).
 * The reader box was `max-lg:hidden` whenever nothing was chosen, which is exactly the
 * state this pane is for — so a phone, and any window under 1024px, got the two lists and
 * no overview and no guidance. Measured a zero rect at 390×844 and 768×1024 on the seeded
 * folder. It is now the top half of that column at every width.
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
export function LibraryPage() {
  const t = useTranslations("library");
  const locale = useLocale();
  const toast = useToast();
  const localVault = useLocalVault();

  const handle = selectLibraryHandle(localVault.status, localVault.handle);
  const manifest = localVault.manifest;
  const hasFolder = handle !== null && manifest !== null;
  /**
   * An absolute path only. On the web there is none, and handing a native bridge the
   * handle's name would name a path that does not exist.
   */
  const nativeVaultRootPath = handle ? (getTauriVaultRootPath(handle) ?? null) : null;

  const [selected, setSelected] = useState<
    { kind: "wiki"; slug: string } | { kind: "source"; path: string } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const shelfChipRef = useRef<HTMLButtonElement | null>(null);

  /*
   * `.claude/rules/architecture.md`: the condition that draws a surface must also guard
   * the work that builds its model. The model hashes files and reads page bodies, so it
   * is switched off, not merely hidden, until a folder is really open.
   */
  const docs = manifest?.docs ?? EMPTY_DOCS;
  const model = useLibraryModel({
    docs,
    sources: manifest?.sources,
    sourceHandles: localVault.sourceHandles,
    fileHandles: localVault.fileHandles,
    vaultRootPath: nativeVaultRootPath,
    enabled: hasFolder,
  });

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

  // ── The reading pane's own state, keyed by the open page. ────────────────────────
  const { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug } = useDocReadingScrollSpy(
    selectedWikiDoc?.slug ?? null,
    "local",
  );
  const backToTop = useBackToTop(articleScrollRef, selectedWikiDoc?.slug ?? null);
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
      document.getElementById(slug)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveHeadingSlug(slug);
    },
    [setActiveHeadingSlug],
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
  });
  const knownSlugs = useMemo(
    () => new Set((manifest?.docs ?? []).map((doc) => doc.slug)),
    [manifest],
  );

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
    /*
     * **A press that does nothing must never be silent** (installed app, 2026-09-05).
     * Without this catch, anything thrown between the click and the dock leaves a chip
     * that looks pressed and a screen that did not change, which reads as a broken
     * product rather than a failure with a cause.
     */
    try {
      agent.start(
        buildCompileBrief({
          sources: model.sources,
          existingPages: model.wikiPages,
          locale,
          /*
           * Whoever will actually write it. On the local route Atlas mints `created_by`
           * itself from the runner's model name, so this is the brief's own statement of
           * the same fact rather than a second source for it.
           */
          writerId: agent.runtime
            ? `agent:${agent.runtime.id}`
            : agent.localModel
              ? `model:${agent.localModel.model}`
              : "agent:unknown",
          vaultRoot: nativeVaultRootPath ?? "",
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
  const [candidates, setCandidates] = useState<LintNodeCandidate[]>([]);
  /* A candidate the card already turned into a node leaves the list; the report cannot know. */
  const openCandidates = useMemo(() => dropCandidatesWithNodes(candidates, docs), [candidates, docs]);
  const latestDocsRef = useRef(docs);
  useEffect(() => {
    latestDocsRef.current = docs;
  }, [docs]);
  const handleTurnStarted = useCallback(
    (_start: { text: string; startedAt: string }) => {
      const kind = agent.openingRequest?.kind ?? "compile";
      if (!handle) return null;
      const stamp = (list: typeof docs) =>
        new Map(
          list
            .filter((doc) => isWikiPage(doc) && !isWikiFurnitureSlug(doc.slug))
            .map((doc) => [doc.slug, doc.mtime ?? 0] as const),
        );
      const before = stamp(latestDocsRef.current);
      const sources = selectCompileTargets(model.sources).map((row) => row.path);
      const writer = agent.runtime ? `agent:${agent.runtime.id}` : "agent:unknown";
      return async (completion: { endedAt: string; outcome: string; events: ReadonlyArray<{ kind: string; text?: string }> }) => {
        if (completion.outcome === "cancelled") return;
        const after = stamp(latestDocsRef.current);
        const lastAgentText = [...completion.events].reverse().find((event) => event.kind === "agent")?.text ?? null;
        if (kind === "lint") setCandidates(parseLintCandidates(lastAgentText));
        /*
         * The wiki log records what happened to the wiki. A proposal writes one ontology node
         * and an import writes documents under `sources/`; neither touches a page, so neither
         * is an entry, or the log would claim a compile that never ran.
         */
        if (kind === "propose" || kind === "import") return;
        const summary =
          kind === "lint"
            ? describeLintTurn(lastAgentText)
            : describeCompileTurn({ sources, before, after });
        try {
          await appendWikiLog(handle, { at: completion.endedAt, kind, summary, writer });
        } catch {
          // A log that cannot be written is not a reason to interrupt the person; the
          // pages themselves are unaffected and the activity receipts still exist.
        }
      };
    },
    [agent.openingRequest?.kind, agent.runtime, handle, model.sources],
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
  const lastFocusedSelection = useRef<typeof selected | undefined>(undefined);
  useEffect(() => {
    if (lastFocusedSelection.current === undefined) {
      lastFocusedSelection.current = selected;
      return;
    }
    if (lastFocusedSelection.current === selected) return;
    lastFocusedSelection.current = selected;
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
    if (selected === null || findOpen || agent.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [agent.open, findOpen, selected]);

  /**
   * **Nothing raises itself any more** (owner, 2026-09-06).
   *
   * The panel used to open by itself over a folder with no sources, on the reasoning that
   * there was nothing else to look at. The owner opened exactly that folder in the
   * installed app and read the result as broken: the guide lay across the graph's own
   * "Nothing to draw yet…" sentence while three other surfaces said the same emptiness.
   *
   * A folder with nothing in it is now an **empty state** rather than a workbench with a
   * popup over it (`LibraryStartStage`), so the state that justified the automatic open
   * no longer reaches this shape at all. What is left is a press: the chip opens the
   * guidance, Escape or an outside press closes it, and focus goes back to the chip.
   */
  const [shelfOpen, setShelfOpen] = useState(false);
  /**
   * **Choosing a file closes the guide, by any route** (design-interaction, 2026-09-06).
   *
   * Selecting hides the canvas, and the chip lives in the canvas's header — so a panel
   * left open after a choice floats over the reader with its anchor gone: `onExited`
   * focuses a `display:none` chip (a silent no-op), the panel's own Escape handler eats
   * the first press, and the way back needs two. The pointer path happened to be covered
   * because the outside-press listener is `pointerdown`; **Enter on a row is not a
   * pointerdown**, so the keyboard path was the one that broke.
   *
   * It is a setter rather than `open={shelfOpen && selected === null}` on purpose: the
   * derived form would raise the panel again the moment somebody pressed back, which is
   * the self-raising behaviour this redesign removed.
   */
  const choose = useCallback((next: typeof selected) => {
    setShelfOpen(false);
    setSelected(next);
  }, []);
  /**
   * Whether this folder has anything for the workbench to show — the same test the canvas
   * makes, so the two can never disagree about whether there is a picture.
   */
  const libraryIsEmpty = model.sources.length === 0 && model.wikiPages.length === 0;
  const closeShelf = useCallback(() => setShelfOpen(false), []);
  /**
   * Pressing a door inside the panel keeps it open: without this, `Add files` succeeding
   * would re-render the pane under the hand that just used it.
   */
  const keepShelf = useCallback(() => setShelfOpen(true), []);

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
      <main
        id="main"
        tabIndex={-1}
        data-testid="library-page"
        data-library-state="no-folder"
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-5 py-10 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]"
      >
        <div className={PAGE_COLUMN_STAGE}>
          <LibraryHeader t={t} inFolder={false} />
          {/* One step under the h1 (14px): the hierarchy gate reads a tie as two titles. */}
          <h2 className="mt-6 text-body font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
            {t("emptyTitle")}
          </h2>
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
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-5 py-10 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]"
      >
        <LibraryStartStage
          vaultLabel={nativeVaultRootPath ?? handle.name}
          busy={busy}
          onAddFiles={handleAddFiles}
          onFindDocuments={handleFindDocuments}
          onImportFromService={openImport}
          t={t}
        />
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

  const narrowShowsReader = selected !== null;

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
      data-library-state={opened ? opened.kind : "nothing-open"}
      /* `relative` is the shelf popup's containing block: it hangs from this row so it can
         be taller than the pane it is drawn over (see `LibraryShelfPopover`). */
      className="topology-ui-scale relative flex min-h-0 w-full flex-1 bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)] max-lg:flex-col"
    >
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
          "flex w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--color-panel)] max-lg:border-t max-lg:border-[color:var(--color-border-soft)] lg:w-[var(--docs-list-width)] lg:flex-none lg:border-r lg:border-[color:var(--color-border-soft)]",
          narrowShowsReader && "max-lg:hidden",
        )}
      >
        {/*
          **One scroller, at every width** (owner, 2026-09-06): *"I don't like this left
          panel being split into a top and a bottom like this … improve it!"*

          It used to be three boxes — a fixed intro, then two lists that each owned their
          own overflow at `lg` and stood at natural height below it. On the owner's folder
          of seven sources and seven pages the longer list was cut mid-row, and the two
          halves slid past each other whenever either was scrolled, which is what makes one
          column read as two panes. The narrow layout had already been forced onto one
          scroller (two lists in half a phone measured 30px and **zero**); this is the same
          answer at every width, which is one answer instead of two.

          The intro rides inside it, so the section heads — which are `sticky` — can pin to
          the top of the box that actually scrolls. Below `lg` the bottom tab bar stands
          over this column, and the reserve is the scrolling box's own to pay
          (`.claude/rules/design.md`).
        */}
        <div
          data-testid="library-index-scroll"
          className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]"
        >
          <div className="border-b border-[color:var(--color-overlay-2)] px-3 pb-3 pt-4">
            <LibraryHeader t={t} />
          </div>
          <LibrarySection
            model={model}
            selectedSlug={opened?.kind === "wiki" ? opened.slug : null}
            selectedSourcePath={opened?.kind === "source" ? opened.path : null}
            onSelect={(slug) => choose({ kind: "wiki", slug })}
            onOpenSource={(row) => choose({ kind: "source", path: row.path })}
            onAddFiles={handleAddFiles}
            onFindDocuments={handleFindDocuments}
            onImportFromService={openImport}
            onCompile={agent.route === "agent" || agent.route === "local" ? handleCompile : null}
            onLint={agent.route === "agent" ? handleLint : null}
            candidates={openCandidates}
            hasWikiTemplate={docs.some((doc) => doc.slug === "wiki/_template")}
            onPropose={agent.route === "agent" && hasOntology ? handlePropose : null}
            /*
             * The same picker as step two, reading and writing the same stored answer, so
             * the sidebar and the shelf can never name different brains.
             */
            brainControl={
              agent.brainChoosable ? (
                <CompileBrainSelect
                  brain={agent.brain}
                  agentLabel={agent.runtime?.label ?? null}
                  localModel={agent.localModel}
                  onChoose={agent.chooseBrain}
                  t={t}
                />
              ) : null
            }
            /*
             * Exactly one surface discloses what leaves this computer, and it is the one a
             * person is looking at. Both ask `libraryTransferSentence`, so neither can name
             * a different brain.
             *
             * ⚠️ **"While the shelf is drawn" had to be redefined when the shelf became a
             * popup** (2026-09-06). The rule shipped as `selected === null`, which was the
             * same thing while the shelf owned the pane: nothing chosen meant the steps
             * were on screen. The shelf is now raised over the graph by a chip, so nothing
             * chosen no longer means it is showing — with the popup closed the sentence
             * would have been on **no** surface at all, which is the one outcome this
             * disclosure may not have. So the condition is the popup itself: while it is
             * open step two owns the sentence, and every other moment this column does.
             * The redesign of that popup into a 360px stepper kept the rule intact: the
             * sentence still sits directly under the Compile press, which is the placement
             * `.claude/rules/local-first.md` asks for.
             */
            compileNote={
              shelfOpen
                ? null
                : (compileBlocked ??
                  libraryTransferSentence(
                    { route: agent.route, localModel: agent.localModel },
                    t,
                  ))
            }
            busy={busy}
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
        ref={readerRef}
        tabIndex={-1}
        data-testid="library-reader"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden max-lg:order-first"
      >
        {/*
          **This pane is the picture.** The Library's two lists say what is in the folder
          one row at a time; this says it all at once — which page came from which file,
          and which concepts a page reaches into. It is the same two file kinds, drawn
          instead of listed, so it belongs to this screen rather than to the map, which
          draws neither of them (`docs/DECISIONS.md`, 2026-09-06).

          ⚠️ **`hidden`, never unmounted.** Choosing a document stands the canvas aside and
          the reader takes the pane, but the widget keeps its ForceAtlas2 pass and its
          settled positions: unmounting would throw both away and pay up to 95ms again,
          replaying the arrival, every time somebody looked at a page and came back.
        */}
        <div className={cn("flex min-h-0 flex-1 flex-col", selected && "hidden")}>
          <LibraryGraph
            docs={manifest?.docs ?? EMPTY_DOCS}
            wikiPages={model.wikiPages}
            /* `model.sources`, never `manifest.sources`: the rows carry the state the list
               prints, so the canvas cannot draw a confident citation beside a row that says
               the file changed underneath it (design-infoviz, 2026-09-06). */
            sources={model.sources}
            selection={
              opened === null
                ? null
                : opened.kind === "wiki"
                  ? { kind: "wiki", ref: opened.slug }
                  : { kind: "source", ref: opened.path }
            }
            onSelect={(next) =>
              choose(
                next.kind === "wiki"
                  ? { kind: "wiki", slug: next.ref }
                  : { kind: "source", path: next.ref },
              )
            }
            /* Below `lg` the canvas is the top half of one column and the guide reaches
               the legend at its foot; measured with `elementsFromPoint` at 768 and 390. */
            captionQuiet={shelfOpen}
            headerEnd={
              <>
                <LibraryStatusStrip model={model} t={t} />
                <button
                  type="button"
                  ref={shelfChipRef}
                  onClick={() => setShelfOpen(!shelfOpen)}
                  aria-expanded={shelfOpen}
                  /*
                   * `true`, not `"dialog"`: the surface it raises is deliberately not one —
                   * no scrim, no trap, no `aria-modal`, because it exists to be read
                   * against the picture behind it. Claiming a dialog and drawing a popover
                   * is the mismatch a screen reader has no way to recover from
                   * (design-interaction, 2026-09-06).
                   */
                  aria-haspopup="true"
                  aria-controls={shelfOpen ? "library-shelf-popover" : undefined}
                  data-testid="library-shelf-open"
                  className={controlClass({
                    shape: "chip",
                    tone: "muted",
                    hoverInk: "strong",
                    className: "flex-none gap-1.5",
                  })}
                >
                  <ListChecks size={ICON_SIZE.sm} aria-hidden />
                  {t("stage.open")}
                </button>
              </>
            }
          />
        </div>
        {selected ? (
          /*
           * **The way back exists at every width now.** It was `lg:hidden`, because below
           * `lg` selecting swaps the whole column and the person visibly needs a door
           * home, while at `lg` and above the index never left. That reasoning stopped
           * being true on 2026-09-06: with nothing selected the right pane is the guided
           * shelf, so it became a place a person can reach only once per session —
           * measured by design-interaction, the only ways back were a reload and the
           * browser's own Back, which leaves the Library and drops the open folder.
           *
           * `ArrowLeft` stays: it carries direction, which the label-decoration rule
           * allows and a trailing chevron would not.
           */
          <div className="flex flex-none items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3 py-2">
            <button
              type="button"
              onClick={() => setSelected(null)}
              data-testid="library-reader-back"
              className={controlClass({ shape: "chip", tone: "muted", className: "gap-1.5" })}
            >
              <ArrowLeft size={ICON_SIZE.sm} aria-hidden />
              {t("title")}
            </button>
          </div>
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
              onOpenSource={(path) => setSelected({ kind: "source", path })}
              t={t}
            />
            <WikiTemplateProblems problems={wikiProblems} t={t} />
            <DocsVaultViewer
              key={selectedWikiDoc.slug}
              doc={selectedWikiDoc}
              vaultSlugs={vaultSlugs}
              onNavigate={(slug) => setSelected({ kind: "wiki", slug })}
              getDocContent={getDocContent}
              resolveImage={resolveImage}
            />
          </DocReadingPane>
        ) : selectedSource ? (
          <div className="min-h-0 flex-1 overflow-auto max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]">
            <SourceSummary
              row={selectedSource}
              hash={model.hashes.get(selectedSource.path) ?? null}
              canReveal={nativeVaultRootPath !== null}
              writeUps={model.pairing.writeUpsBySource.get(selectedSource.path) ?? EMPTY_WRITE_UPS}
              onOpen={() => handleOpenSource(selectedSource)}
              onOpenWiki={(slug) => setSelected({ kind: "wiki", slug })}
              onCompile={handleCompile}
              compileBlockedReason={compileBlocked}
              busy={busy}
              t={t}
            />
          </div>
        ) : null}
      </div>

      {/*
        The guided shelf, raised over the picture rather than sharing the pane with it.
        It is parented **here**, on the row, and not inside the pane: below `lg` that pane
        is half a phone and would cut the panel to 373px (measured 390×844).
      */}
      <LibraryShelfPopover
        open={shelfOpen}
        onClose={closeShelf}
        anchorRef={shelfChipRef}
        title={t("stage.title")}
        closeLabel={t("stage.close")}
      >
<LibraryStage
          model={model}
          route={agent.route}
          agentLabel={agent.runtime?.label ?? null}
          localModel={agent.localModel}
          localCompile={agent.localCompile}
          brain={agent.brain}
          brainChoosable={agent.brainChoosable}
          onChooseBrain={agent.chooseBrain}
          inApp={nativeVaultRootPath !== null}
          onAddFiles={() => {
            keepShelf();
            handleAddFiles();
          }}
          onFindDocuments={() => {
            keepShelf();
            handleFindDocuments();
          }}
          onCompile={() => {
            keepShelf();
            handleCompile();
          }}
          onLint={
            agent.route === "agent"
              ? () => {
                  keepShelf();
                  handleLint();
                }
              : null
          }
          onOpenWiki={(slug) => {
            closeShelf();
            setSelected({ kind: "wiki", slug });
          }}
          busy={busy}
          t={t}
        />
      </LibraryShelfPopover>

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
          judgeWrite={judgeWrite}
          onTurnStarted={handleTurnStarted}
          open={agent.open}
          runtime={agent.runtime}
          runtimes={agent.runtimes}
          onRuntimeChange={agent.setRuntimeId}
          vaultRoot={nativeVaultRootPath}
          mcpServers={agent.mcpServers}
          openingRequest={agent.openingRequest}
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

/** Eyebrow, name, one line. Not a display title: this is a workbench, not a document. */
function LibraryHeader({ t, inFolder = true }: { t: ReturnType<typeof useTranslations<"library">>; inFolder?: boolean }) {
  return (
    <div data-testid="library-header">
      {/* "In this folder" is only true once a folder is open; the stage before that has none. */}
      {inFolder ? (
        <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
          {t("eyebrow")}
        </p>
      ) : null}
      <h1 className="mt-1 text-body-lg font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
        {t("title")}
      </h1>
      {/* `text-label`, not `text-caption`: 9.5px is the eyebrow's size, and measured in the
          280px column this lede is three lines a person reads once and has to be able to
          read. The chrome ladder's next step up is the one for a sentence. */}
      <p className="mt-1.5 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
        {t("lede")}
      </p>
    </div>
  );
}

/** A stable empty array, so the model's memo does not see a new identity every render. */
const EMPTY_DOCS: never[] = [];
/** The same reason, for the two crossings: a fresh `[]` each render remounts their rows. */
const EMPTY_ORIGINALS: never[] = [];
const EMPTY_WRITE_UPS: never[] = [];
