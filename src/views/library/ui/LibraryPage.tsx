"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

import { useLocalVault, useVaultIdentityScope } from "@/entities/vault-session";
import type { LibrarySourceRow, SourceCandidate } from "@/entities/docs-vault";
import { OpenVaultCta } from "@/features/docs-vault-local";
import {
  addSources,
  addSourcesInBrowser,
  buildCompileBrief,
  discoverSources,
  FindDocumentsDialog,
  forgetDeclinedCandidates,
  partitionByDeclined,
  readDeclinedCandidates,
  rememberDeclinedCandidates,
  summarizeAddSources,
  withoutImportedNames,
  type DiscoveryOutcome,
} from "@/features/library";
import {
  DocReadingPane,
  shouldShowOutlineRail,
  useBackToTop,
  useDocReadingScrollSpy,
} from "@/widgets/doc-reading-pane";
import { DocsVaultViewer } from "@/widgets/docs-vault";
import { cn } from "@/shared/lib/cn";
import { getTauriVaultRootPath, revealTauriVaultFile } from "@/shared/lib/tauri-vault-fs";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { PAGE_COLUMN_STAGE } from "@/shared/ui/page-frame";
import { useToast } from "@/shared/ui";

import { libraryCompileBlockedReason } from "../lib/compile-availability";
import { useLibraryModel } from "../lib/use-library-model";
import { useLibraryAgent } from "../lib/use-library-agent";
import { LibrarySection } from "./parts/LibrarySection";
import { LibraryStage } from "./parts/LibraryStage";
import { LibraryAgentDock } from "./parts/LibraryAgentDock";
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
 * Below `lg` there is one column and selecting swaps it, with a way back. Two 280px-plus
 * panes do not fit a phone, and hiding the index behind a drawer would bury the two doors
 * (`Add files`, `Find documents`) that are the reason someone opens this screen at all.
 *
 * ## With no folder open
 *
 * One centred stage, not an empty two-pane workbench. There is no folder to add a
 * document *to*, so an index of nothing beside a reader of nothing would be two empty
 * boxes asking the same question. `PAGE_COLUMN_STAGE` is this repository's existing
 * answer for "nothing to open yet" (2026-08-12).
 */
export function LibraryPage() {
  const t = useTranslations("library");
  const locale = useLocale();
  const toast = useToast();
  const localVault = useLocalVault();

  const handle = localVault.status === "loaded" ? (localVault.handle ?? null) : null;
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

  /*
   * `.claude/rules/architecture.md`: the condition that draws a surface must also guard
   * the work that builds its model. The model hashes files and reads page bodies, so it
   * is switched off, not merely hidden, until a folder is really open.
   */
  const model = useLibraryModel({
    docs: manifest?.docs ?? EMPTY_DOCS,
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
  const agent = useLibraryAgent(nativeVaultRootPath);
  const knownSlugs = useMemo(
    () => new Set((manifest?.docs ?? []).map((doc) => doc.slug)),
    [manifest],
  );
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
          locale,
          writerId: agent.runtime ? `agent:${agent.runtime.id}` : "agent:unknown",
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
  }, [agent, locale, model.sources, nativeVaultRootPath, t, toast]);

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
      className="topology-ui-scale flex min-h-0 w-full flex-1 bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]"
    >
      {/*
        The index. Below `lg` it is the whole column and stands aside once something is
        open; the reader's back control is what brings it back.
      */}
      <aside
        data-testid="library-index"
        aria-label={t("title")}
        className={cn(
          "flex w-full min-w-0 flex-none flex-col overflow-hidden bg-[color:var(--color-panel)] lg:w-[var(--docs-list-width)] lg:border-r lg:border-[color:var(--color-border-soft)]",
          narrowShowsReader && "max-lg:hidden",
        )}
      >
        <div className="flex-none border-b border-[color:var(--color-overlay-2)] px-3 pb-3 pt-4">
          <LibraryHeader t={t} />
        </div>
        {/* Below `lg` the bottom tab bar stands over this column, so the last row of a
            long list would sit behind it. The reserve is the surface's own to pay
            (`.claude/rules/design.md`), and it belongs to the box that scrolls. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]">
          <LibrarySection
            model={model}
            selectedSlug={opened?.kind === "wiki" ? opened.slug : null}
            selectedSourcePath={opened?.kind === "source" ? opened.path : null}
            onSelect={(slug) => setSelected({ kind: "wiki", slug })}
            onOpenSource={(row) => setSelected({ kind: "source", path: row.path })}
            onAddFiles={handleAddFiles}
            onFindDocuments={handleFindDocuments}
            onCompile={agent.route === "agent" ? handleCompile : null}
            // Compile hands the folder to a coding agent, whose own provider traffic
            // Atlas is not in the path of and does not log. Saying so beside the button
            // rather than in a settings page is the whole point.
            transferNote={agent.route === "agent" ? t("wiki.transfer") : null}
            vaultLabel={nativeVaultRootPath ?? handle.name}
            busy={busy}
            t={t}
          />
        </div>
      </aside>

      <div
        ref={readerRef}
        tabIndex={-1}
        data-testid="library-reader"
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden",
          !narrowShowsReader && "max-lg:hidden",
        )}
      >
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
        ) : (
          /*
           * Nothing chosen: the three steps of the work, with the folder's own numbers in
           * them. This replaced two sentences that between them could not tell a person
           * what to do next — see `LibraryStage` for the owner's reading that produced it.
           */
          <LibraryStage
            model={model}
            route={agent.route}
            agentLabel={agent.runtime?.label ?? null}
            localModel={agent.localModel}
            inApp={nativeVaultRootPath !== null}
            onAddFiles={handleAddFiles}
            onFindDocuments={handleFindDocuments}
            onCompile={handleCompile}
            onOpenWiki={(slug) => setSelected({ kind: "wiki", slug })}
            lastDiscoveryCount={discovery?.candidates.length ?? null}
            busy={busy}
            locale={locale}
            t={t}
          />
        )}
      </div>

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
