'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import {
  buildDocsVaultHref,
  type VaultDoc,
} from '@/entities/docs-vault';
import { useStaticVaultSource } from '@/entities/vault-session';
import { useDelayedVisible } from '@/shared/lib/render-timing/use-presence';
import { useArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { normalizeOriginalPaths, rewriteWikilinks } from '@/shared/lib/library/source-citation';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import { fetchServerDocContent } from '../lib/server-doc-content';
import { readerTree } from '../lib/viewer/reader-tree';
import { buildTopologyProjectHref } from '@/entities/project';
import { createMatchHighlighter } from './viewer/create-match-highlighter';
import { createMarkdownComponents } from './viewer/create-markdown-components';
import type { ViewerCitation } from './viewer/render-markdown-link';

interface Props {
  doc: VaultDoc;
  vaultSlugs: Set<string>;
  onNavigate: (slug: string) => void;
  basePath?: string;
  getDocHref?: (slug: string, hash?: string) => string;
  getProjectHref?: (slug: string) => string;
  getDocContent?: (slug: string) => Promise<string>;
  /**
   * Bundled bodies from the same vault as the parent's static manifest, so a route-scoped sample
   * override is respected.
   */
  bundledContent?: Record<string, string>;
  highlightQuery?: string;
  resolveImage?: (path: string) => Promise<string | null>;
  /**
   * Base for turning a vault-escaping `.md` link into a GitHub blob URL; set only for the bundled
   * docs vault.
   */
  repoBlobBase?: string;
  vaultRepoRoot?: string;
  knownOriginalPaths?: ReadonlySet<string>;
  onSourceNavigate?: (path: string, anchor?: string) => void;
  /**
   * The original the parent already names beside this page; its citations say only where in it,
   * others also name their file.
   */
  namedSourcePath?: string;
  compactTop?: boolean;
  /**
   * Called once a body is painted, or with null when it failed. `citations` counts the citations
   * the Library reader drew, per NFC path: one inside a comment or a code block is not drawn.
   */
  onBodyPainted?: (body: string | null, citations: ReadonlyMap<string, number>) => void;
  /**
   * Titles by NFC slug, from the listing the parent already holds. When given, an unlabelled
   * wikilink says its target's title (a concept's with its kind glyph), a link to this page is
   * plain text, and a link to nothing keeps its written path and says it is missing.
   */
  linkTargets?: ReadonlyMap<string, { title: string; kind: string | null }>;
  onConceptNavigate?: (slug: string) => void;
  /**
   * When given, a source citation's press hands its resolution and its button here instead of
   * navigating, and a citation to a file the folder lacks is a press too. The path is still
   * only the allow-listed one; a missing citation carries `path: null`.
   */
  onCitationPress?: (citation: ViewerCitation, button: HTMLButtonElement) => void;
  markSourceLines?: boolean;
}

export function DocsVaultViewer({
  doc,
  vaultSlugs,
  onNavigate,
  basePath = '/docs',
  getDocHref = defaultDocHref,
  // Map links point to /topology; a locale-less root redirect would drop the query.
  getProjectHref = buildTopologyProjectHref,
  getDocContent,
  bundledContent: bundledContentOverride,
  highlightQuery,
  resolveImage,
  repoBlobBase,
  vaultRepoRoot,
  knownOriginalPaths,
  onSourceNavigate,
  namedSourcePath,
  compactTop = false,
  onBodyPainted,
  linkTargets,
  onConceptNavigate,
  onCitationPress,
  markSourceLines = false,
}: Props) {
  const t = useTranslations('vaultWidgets.viewer');
  const libraryT = useTranslations('library');
  const reducedMotion = usePrefersReducedMotion();
  /*
   * A body already read once arrives painted: the memory key carries mtime
   * (`shared/lib/navigation/route-arrival-memory.ts`), so an edited file is read again. The read below still
   * runs and replaces it.
   */
  const [raw, setRaw] = useArrivalMemory<string | null>(
    `docs-vault-body:${getDocContent ? 'local' : 'bundled'}:${doc.slug}:${doc.mtime ?? 0}`,
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const showSkeleton = useDelayedVisible(raw === null && error === null);
  // Bundled bodies must come from the same vault as the manifest, or title and content point at
  // different documents.
  const { content: preferredBundledContent } = useStaticVaultSource();
  const bundledContent = bundledContentOverride ?? preferredBundledContent;

  useEffect(() => {
    if (!raw || !highlightQuery) return;
    const handle = requestAnimationFrame(() => {
      const htmlElement = document.querySelector<HTMLElement>(
        '[data-docs-viewer] mark.docs-match',
      );
      htmlElement?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    });
    return () => cancelAnimationFrame(handle);
  }, [raw, highlightQuery, reducedMotion]);

  // Remounted through key={doc.slug} and the memory is keyed by slug and mtime, so no reset is
  // needed here.
  useEffect(() => {
    let cancelled = false;
    const fetcher = getDocContent
      ? getDocContent(doc.slug)
      : fetchServerDocContent(doc.slug, {
          bundledContent,
          locationHref:
            typeof window === 'undefined' ? undefined : window.location.href,
        });
    fetcher
      .then((text) => {
        if (cancelled) return;
        /* The body as the question desk reads it (BOM and CRLF normalised), so a claim's line agrees. */
        let cleaned = parseFrontmatter(text).body;
        /*
         * Wikilinks become standard links with a sentinel the `a` component catches. The sentinel
         * must not look like a URL scheme, or react-markdown's `defaultUrlTransform` empties the
         * href (`tests/contract/security/wikilink-url-scheme.contract.test.ts`).
         */
        cleaned = rewriteWikilinks(cleaned);
        setRaw(cleaned);
      })
      .catch((caughtError) => {
        if (cancelled) return;
        setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      });
    return () => {
      cancelled = true;
    };
  }, [bundledContent, doc.slug, getDocContent, setRaw]);

  const drawnCitations = useRef<ReadonlyMap<string, number>>(NO_CITATIONS);
  useLayoutEffect(() => {
    if (raw !== null) onBodyPainted?.(raw, drawnCitations.current);
    else if (error !== null) onBodyPainted?.(null, NO_CITATIONS);
  }, [raw, error, onBodyPainted]);

  const highlightChildren = useMemo(() => createMatchHighlighter(highlightQuery), [highlightQuery]);

  /** NFC copy of the vault slugs, built once; raw `vaultSlugs` misses NFD Hangul slugs. */
  const normalizedVaultSlugs = useMemo(
    () => new Set([...vaultSlugs].map((slug) => slug.normalize('NFC'))),
    [vaultSlugs],
  );
  /**
   * Source paths are looked up by their decoded NFC form, while the callback receives
   * the exact path supplied by the parent so a macOS NFD path still selects its row.
   */
  const normalizedOriginalPaths = useMemo(
    () => normalizeOriginalPaths(knownOriginalPaths),
    [knownOriginalPaths],
  );
  const namedSource = namedSourcePath?.normalize('NFC');

  /*
   * One renderer per set of inputs: `react-markdown` takes each entry as a component type, so a fresh
   * object on every parent render would remount every link and citation in the body.
   */
  const components = useMemo(
    () => createMarkdownComponents({
      link: {
        docSlug: doc.slug,
        t,
        libraryT,
        vaultSlugs,
        normalizedVaultSlugs,
        normalizedOriginalPaths,
        namedSource,
        reducedMotion,
        getDocHref,
        getProjectHref,
        onNavigate,
        onSourceNavigate,
        onCitationPress,
        onConceptNavigate,
        linkTargets,
        repoBlobBase,
        vaultRepoRoot,
      },
      highlightChildren,
      markSourceLines,
      basePath,
      resolveImage,
    }),
    [
      basePath, doc.slug, getDocHref, getProjectHref, highlightChildren, libraryT, linkTargets,
      markSourceLines, namedSource, normalizedOriginalPaths, normalizedVaultSlugs, onCitationPress,
      onConceptNavigate, onNavigate, onSourceNavigate, reducedMotion, repoBlobBase, resolveImage, t,
      vaultRepoRoot, vaultSlugs,
    ],
  );
  /* Only the Library reader reshapes the tree; every other surface parses exactly as before. */
  const remarkPlugins = useMemo(
    () => (linkTargets
      ? [remarkGfm, () => readerTree(namedSource, (counts) => { drawnCitations.current = counts; })]
      : REMARK_PLUGINS),
    [linkTargets, namedSource],
  );
  const rendered = useMemo(
    () => (raw === null ? null : (
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {raw}
      </ReactMarkdown>
    )),
    [components, raw, remarkPlugins],
  );

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <div className="text-body text-[color:var(--color-text-tertiary)]">
          {t('loadFailed')}
        </div>
        <div className="font-mono text-label text-[color:var(--color-text-quaternary)]">
          {error}
        </div>
      </div>
    );
  }
  if (raw === null) {
    if (!showSkeleton) return <div className="p-8" aria-hidden />;
    return (
      <div className="flex flex-col gap-3 p-8" role="status" aria-label={t('loadingLabel')}>
        <div className="h-3 w-2/3 animate-pulse rounded-micro bg-[color:var(--color-border-soft)]" aria-hidden />
        <div className="h-3 w-1/2 animate-pulse rounded-micro bg-[color:var(--color-overlay-2)]" aria-hidden />
        <div className="h-3 w-5/6 animate-pulse rounded-micro bg-[color:var(--color-overlay-2)]" aria-hidden />
      </div>
    );
  }
  return (
    <article
      data-docs-viewer
      className={
        compactTop
          ? "mx-auto max-w-[var(--measure-doc-column)] px-6 pb-8 pt-3 md:px-10 md:pb-10 md:pt-3"
          : "mx-auto max-w-[var(--measure-doc-column)] px-6 py-8 md:px-10 md:py-10"
      }
    >
      {rendered}
    </article>
  );
}

/** Module-level, so the default never changes identity between renders. */
function defaultDocHref(slug: string, hash?: string): string {
  return buildDocsVaultHref({ slug, hash });
}

const REMARK_PLUGINS = [remarkGfm];

const NO_CITATIONS: ReadonlyMap<string, number> = new Map();
