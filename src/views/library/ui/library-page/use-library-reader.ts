import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalVault } from "@/entities/vault-session";
import type { LibraryOriginalLink, VaultDoc, VaultManifest } from "@/entities/docs-vault";
import { isRetainedAnswerPath, type LibraryUiModel } from "@/features/library";
import { useBackToTop, useDocReadingScrollSpy } from "@/widgets/doc-reading-pane";
import { vaultImageUrl } from "@/shared/lib/open-vault-file";
import { useCitedPassage } from "../../lib/use-cited-passage";
import { useSourceOutline } from "../../lib/use-source-outline";
import { useAnswerHistory } from "../../lib/use-answer-history";
import { advisoryReportSlugs } from "../parts/LibraryCheckReport";
import type { LibrarySelection } from "./library-page-state";

export function useLibraryReader({
  reducedMotion, localVault, manifest, hasFolder, selected, sourceCitation, docs, model,
}: {
  reducedMotion: boolean;
  localVault: ReturnType<typeof useLocalVault>;
  manifest: VaultManifest | null;
  hasFolder: boolean;
  selected: LibrarySelection;
  sourceCitation: { path: string; anchor?: string } | null;
  docs: VaultDoc[];
  model: LibraryUiModel;
}) {
  const opened = selected;
  const selectedWikiDoc = useMemo(() => {
    if (opened?.kind !== "wiki") return null;
    return manifest?.docs.find((doc) => doc.slug === opened.slug) ?? null;
  }, [manifest, opened]);
  const selectedOriginals: readonly LibraryOriginalLink[] = selectedWikiDoc
    ? model.pairing.originalsByWiki.get(selectedWikiDoc.slug) ?? EMPTY_ORIGINALS
    : EMPTY_ORIGINALS;
  const selectedSource = useMemo(() => {
    if (opened?.kind !== "source") return null;
    return model.sources.find((row) => row.path === opened.path) ?? null;
  }, [model.sources, opened]);
  const citedPassage = useCitedPassage({
    citation: sourceCitation?.path === selectedSource?.path ? sourceCitation : null,
    handle: sourceCitation ? localVault.sourceHandles.get(sourceCitation.path) : undefined,
    enabled: hasFolder && selectedSource !== null,
  });
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

  const { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug } = useDocReadingScrollSpy(
    selectedWikiDoc?.slug ?? null,
    "local",
  );
  const backToTop = useBackToTop(articleScrollRef, selectedWikiDoc?.slug ?? null);
  const reportSpy = useDocReadingScrollSpy(opened?.kind === "report" ? "library:report" : null, "report");
  const reportBackToTop = useBackToTop(reportSpy.articleScrollRef, opened?.kind === "report" ? "library:report" : null);
  const [reportAdvisoryOpen, setReportAdvisoryOpen] = useState(false);
  const pendingReportJumpRef = useRef<string | null>(null);
  const jumpToReportSection = useCallback(
    (slug: string) => {
      document.getElementById(slug)?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      reportSpy.setActiveHeadingSlug(slug);
    },
    [reducedMotion, reportSpy],
  );
  const advisorySlugs = useMemo(() => advisoryReportSlugs(model.structural), [model.structural]);
  const handleReportHeadingNavigate = useCallback(
    (slug: string) => {
      if (advisorySlugs.has(slug) && !reportAdvisoryOpen) {
        pendingReportJumpRef.current = slug;
        reportSpy.setActiveHeadingSlug(slug);
        setReportAdvisoryOpen(true);
        return;
      }
      jumpToReportSection(slug);
    },
    [advisorySlugs, jumpToReportSection, reportAdvisoryOpen, reportSpy],
  );
  useEffect(() => {
    const slug = pendingReportJumpRef.current;
    if (!slug || !reportAdvisoryOpen) return;
    pendingReportJumpRef.current = null;
    jumpToReportSection(slug);
  }, [jumpToReportSection, reportAdvisoryOpen]);
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
      return vaultImageUrl(await image.getFile());
    };
  }, [localVault.imageHandles]);

  return {
    opened, selectedWikiDoc, selectedOriginals, selectedSource, citedPassage, sourceOutlineState,
    selectedAnswer, answerHistory, answerRefreshButtonRef, pendingAnswerFocus, articleScrollRef,
    activeHeadingSlug, setActiveHeadingSlug, backToTop, reportSpy, reportBackToTop,
    reportAdvisoryOpen, setReportAdvisoryOpen, pendingReportJumpRef, jumpToReportSection,
    advisorySlugs, handleReportHeadingNavigate, outlineHeadings, handleHeadingNavigate, vaultSlugs,
    getDocContent, resolveImage,
  };
}

const EMPTY_ORIGINALS: never[] = [];
