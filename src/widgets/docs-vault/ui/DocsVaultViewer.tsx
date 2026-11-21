'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import { ExternalLink, Hash } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { PROSE_MEASURE_REM, PROSE_MEASURE_WIDE_REM, WIDE_READING_MIN_VIEWPORT_PX } from '@/shared/ui/tokens/reading-measure';
import {
  buildDocsVaultHref,
  type VaultDoc,
} from '@/entities/docs-vault';
import { useStaticVaultSource } from '@/entities/vault-session';
import { IconButton, OntologyMapKindGlyph, controlClass } from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';
import { splitHighlightSegments } from '@/shared/lib/search-match/highlight-match';
import { githubAnchorSlug } from '@/shared/lib/library/github-anchor-slug';
import { useCopyFeedback } from '@/shared/lib/clipboard/use-copy-feedback';
import { useDelayedVisible } from '@/shared/lib/render-timing/use-presence';
import { useArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import {
  decodeWikilinkSlug,
  normalizeOriginalPaths,
  parseWikilinkHref,
  resolveSourceCitation,
  rewriteWikilinks,
} from '@/shared/lib/library/source-citation';
import { sourceCitationWords } from '@/features/library';
import { parseFrontmatter, resolveWikilinkTargetSlug } from '@/shared/lib/vault-document/parse-frontmatter';
import { fetchServerDocContent } from '../lib/server-doc-content';
import { resolveDocLink } from '../lib/resolve-doc-link';
import { getTopologyProjectHref } from '@/entities/project';

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

export interface ViewerCitation {
  path: string | null;
  rawPath: string;
  anchor?: string;
}

export function DocsVaultViewer({
  doc,
  vaultSlugs,
  onNavigate,
  basePath = '/docs',
  getDocHref = defaultDocHref,
  // Map links point to /topology; a locale-less root redirect would drop the query.
  getProjectHref = getTopologyProjectHref,
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
      const el = document.querySelector<HTMLElement>(
        '[data-docs-viewer] mark.docs-match',
      );
      el?.scrollIntoView({
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
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
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

  const highlightChildren = useMemo(() => {
    const hl = (
      children: React.ReactNode,
      q: string,
      key = 'hl',
    ): React.ReactNode => {
      if (!q) return children;
      if (typeof children === 'string') {
        // Literal only: searchDocs found this document by literal text, not Hangul keystrokes.
        // The `.docs-match` class is what the scroll effect looks for.
        return splitHighlightSegments(children, q, false).map((seg, i) =>
          seg.match ? (
            <mark
              key={`${key}-${i}`}
              className="docs-match rounded-micro bg-[color:var(--color-indigo-line-a22)] px-0.5 text-[color:var(--color-search-mark-text)]"
            >
              {seg.text}
            </mark>
          ) : (
            seg.text
          ),
        );
      }
      if (Array.isArray(children)) {
        return children.map((c, idx) => hl(c, q, `${key}-${idx}`));
      }
      return children;
    };
    const q = highlightQuery?.toLowerCase() ?? '';
    return (children: React.ReactNode, key = 'hl') => hl(children, q, key);
  }, [highlightQuery]);


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
  const components = useMemo<Components>(() => {
    /**
     * The GitHub-rule heading id when it differs from this viewer's, rendered as a second empty
     * anchor so links written for either surface work; scroll-spy keeps the id above.
     */
    const headingAliasOf = (children: React.ReactNode) => {
      const canonical = slugFromChildren(children);
      const alias = githubAnchorSlug(flattenText(children));
      return alias && alias !== canonical ? alias : null;
    };

    const renderHeading = (
      Tag: 'h2' | 'h3',
      className: string,
      highlightKey: string,
      children: React.ReactNode,
      rest: React.HTMLAttributes<HTMLHeadingElement>,
    ) => {
      // Heading ids must be idempotent across StrictMode double renders; duplicate headings share an id
      // (the browser anchors to the first).
      const slug = slugFromChildren(children);
      const alias = headingAliasOf(children);
      return (
        <Tag id={slug} className={className} data-line={lineOf(rest)} {...rest}>
          {alias ? <span id={alias} aria-hidden /> : null}
          {highlightChildren(children, highlightKey)}
          <HeadingAnchor anchor={slug} docSlug={doc.slug} basePath={basePath} />
        </Tag>
      );
    };

    const lineOf = (props: object): number | undefined =>
      markSourceLines ? (props as { node?: { position?: { start?: { line?: number } } } }).node?.position?.start?.line : undefined;

    return {
      a({ href, children, ...rest }) {
        if (!href) return <span {...rest}>{children}</span>;
        const wikilink = parseWikilinkHref(href);
        if (wikilink) {
          const { rawSlug: rawWikiSlug, rawAnchor, labelled } = wikilink;
          const typedSlug = rawWikiSlug ? decodeWikilinkSlug(rawWikiSlug) : rawWikiSlug;
          const wikiSlug = typedSlug
            ? resolveWikilinkTargetSlug(typedSlug, doc.slug)
            : typedSlug;
          const anchor = rawAnchor ? decodeWikilinkSlug(rawAnchor) : rawAnchor;
          /*
           * Percent-decode and NFC-normalise: the parser passes Hangul slugs encoded and macOS
           * stores NFD; same rule as the CLI's `validate.mjs`.
           */
          const citation = rawWikiSlug
            ? resolveSourceCitation(
                rawWikiSlug,
                rawAnchor,
                normalizedOriginalPaths,
                onSourceNavigate !== undefined,
              )
            : null;
          if (citation) {
            const words = sourceCitationWords(
              { path: citation.path ?? citation.rawPath, anchor: citation.anchor },
              { nameFile: citation.rawPath !== namedSource },
              libraryT,
            );
            const shown = labelled ? children : words.text;
            /*
             * The press opens the passage beside the citation rather than leaving the page. The
             * resolution above is unchanged: `path` is the allow-listed one or null, and nothing
             * here reads the file.
             */
            if (onCitationPress && citation.status !== 'unavailable') {
              const known = citation.status === 'known' && citation.path !== null;
              const label = words.place
                ? t('sourceCitationTitleAt', { path: citation.path ?? citation.rawPath, place: words.place })
                : t('sourceCitationTitle', { path: citation.path ?? citation.rawPath });
              return (
                <button
                  type="button"
                  aria-label={label}
                  aria-expanded={false}
                  data-source-path={citation.path ?? undefined}
                  data-source-anchor={citation.anchor}
                  data-citation-state={known ? 'known' : 'missing'}
                  onClick={(event) => onCitationPress(
                    { path: known ? citation.path : null, rawPath: citation.rawPath, anchor: citation.anchor },
                    event.currentTarget,
                  )}
                  className={known ? CITATION_CHIP_CLASS : `${CITATION_CHIP_CLASS} ${CITATION_CHIP_MISSING_CLASS}`}
                >
                  {shown}
                </button>
              );
            }
            if (citation.status === 'known' && citation.path && onSourceNavigate) {
              return (
                <button
                  type="button"
                  aria-label={
                    words.place
                      ? t('sourceCitationTitleAt', { path: citation.path, place: words.place })
                      : t('sourceCitationTitle', { path: citation.path })
                  }
                  data-source-path={citation.path}
                  data-source-anchor={citation.anchor}
                  onClick={() => onSourceNavigate(citation.path!, citation.anchor)}
                  className={controlClass({
                    shape: 'link',
                    tone: 'accent',
                    hoverInk: 'strong',
                    className: 'inline align-baseline break-keep whitespace-normal',
                  })}
                >
                  {shown}
                </button>
              );
            }
            return (
              <span
                className="border-b border-dashed border-[color:var(--color-amber-source-a50)] text-[color:var(--color-amber-source-text-a85)]"
                title={t(
                  citation.status === 'missing'
                    ? 'sourceCitationMissing'
                    : 'sourceCitationUnavailable',
                  { path: citation.rawPath },
                )}
                {...rest}
              >
                {shown}
              </span>
            );
          }
          /*
           * Resolve against the linking document, as `extractOutLinkTargets`
           * and `validateWikiFolder` do, so `[[budget]]` in `wiki/handover.md` means `wiki/budget`.
           */
          // A `project:` prefix routes to the public topology route, e.g. [[project:reactor]].
          if (wikiSlug && wikiSlug.startsWith('project:')) {
            const projectSlug = wikiSlug.slice('project:'.length);
            // A locale-aware Link; a raw anchor loads the locale-less root and drops `?p=`.
            return (
              <Link
                href={getProjectHref(projectSlug)}
                className="prose-link text-[color:var(--color-amber-docs-a95)] decoration-[color:var(--color-amber-docs-a35)] hover:decoration-[color:var(--color-amber-docs-a100)]"
                title={t('projectLinkTitle', { slug: projectSlug })}
              >
                {children}
              </Link>
            );
          }
          if (linkTargets && wikiSlug) {
            const target = linkTargets.get(wikiSlug);
            if (target && normalizedVaultSlugs.has(wikiSlug)) {
              if (wikiSlug === doc.slug.normalize('NFC')) return <span>{labelled ? children : target.title}</span>;
              const concept = target.kind !== null && onConceptNavigate !== undefined;
              return (
                <Link
                  href={getDocHref(wikiSlug, anchor)}
                  data-link-target={wikiSlug}
                  onClick={(e) => {
                    e.preventDefault();
                    if (concept) {
                      onConceptNavigate(wikiSlug);
                      return;
                    }
                    onNavigate(wikiSlug);
                    if (anchor && typeof window !== 'undefined') {
                      requestAnimationFrame(() => {
                        document
                          .getElementById(anchor)
                          ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
                      });
                    }
                  }}
                  className="prose-link text-[color:var(--color-indigo-line-a90)] hover:decoration-[color:var(--color-indigo-accent)]"
                >
                  {target.kind ? (
                    <OntologyMapKindGlyph kind={target.kind} size={ICON_SIZE.sm} className="mr-1 inline-block shrink-0 align-[-0.125em]" />
                  ) : null}
                  {labelled ? children : target.title}
                </Link>
              );
            }
            if (!target) {
              return <MissingWikilink text={labelled ? children : typedSlug} description={libraryT('wikiReader.linkMissing')} />;
            }
          }
          if (wikiSlug && normalizedVaultSlugs.has(wikiSlug)) {
            return (
              <Link
                href={getDocHref(wikiSlug, anchor)}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(wikiSlug);
                  if (anchor && typeof window !== 'undefined') {
                    requestAnimationFrame(() => {
                      document
                        .getElementById(anchor)
                        ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
                    });
                  }
                }}
                className="prose-link text-[color:var(--color-indigo-line-a90)] hover:decoration-[color:var(--color-indigo-accent)]"
              >
                {children}
              </Link>
            );
          }
          return (
            <span
              className="border-b border-dashed border-[color:var(--color-amber-source-a50)] text-[color:var(--color-amber-source-text-a85)]"
              title={t('wikilinkMissing', { slug: typedSlug })}
              {...rest}
            >
              {children}
            </span>
          );
        }
        if (href.startsWith('#')) {
          return (
            <a href={href} {...rest}>
              {children}
            </a>
          );
        }
        if (/^https?:\/\//i.test(href)) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              /* A prose link stays display:inline so it wraps. */
              className="prose-link decoration-[color:var(--color-indigo-line-a40)] hover:decoration-[color:var(--color-indigo-accent)]"
              {...rest}
            >
              {children}
              <ExternalLink size={ICON_SIZE.sm} className="ml-1 inline align-baseline opacity-60" aria-hidden />
            </a>
          );
        }
        const resolved = resolveDocLink({
          href,
          fromSlug: doc.slug,
          vaultSlugs,
          repoBlobBase,
          vaultRepoRoot,
        });
        if (resolved.kind === 'internal') {
          const anchor = resolved.anchor;
          return (
            <Link
              href={getDocHref(resolved.slug, anchor)}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(resolved.slug);
                if (anchor && typeof window !== 'undefined') {
                  requestAnimationFrame(() => {
                    document
                      .getElementById(anchor)
                      ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
                  });
                }
              }}
              className="prose-link text-[color:var(--color-indigo-line-a90)] hover:decoration-[color:var(--color-indigo-accent)]"
            >
              {children}
            </Link>
          );
        }
        if (resolved.kind === 'external') {
          return (
            <a
              href={resolved.url}
              target="_blank"
              rel="noreferrer noopener"
              /* A prose link stays display:inline so it wraps. */
              className="prose-link decoration-[color:var(--color-indigo-line-a40)] hover:decoration-[color:var(--color-indigo-accent)]"
              {...rest}
            >
              {children}
              <ExternalLink size={ICON_SIZE.sm} className="ml-1 inline align-baseline opacity-60" aria-hidden />
            </a>
          );
        }
        if (resolved.kind === 'unresolved') {
          return (
            <span
              className="text-[color:var(--color-text-tertiary)] underline decoration-dotted underline-offset-2"
              title={t('externalLinkUnresolved', { href })}
              {...rest}
            >
              {children}
            </span>
          );
        }
        return (
          <a href={href} {...rest}>
            {children}
          </a>
        );
      },
      h1: ({ children, ...rest }) => renderHeading('h2', HEADING_CLASS.h1, 'h1', children, rest),
      h2: ({ children, ...rest }) => renderHeading('h2', HEADING_CLASS.h2, 'h2', children, rest),
      h3: ({ children, ...rest }) => renderHeading('h3', HEADING_CLASS.h3, 'h3', children, rest),
      p({ children, ...rest }) {
        return (
          <p
            className={`${PROSE_MEASURE} my-3 break-keep text-reading leading-prose text-[color:var(--color-text-secondary)]`}
            data-line={lineOf(rest)}
            {...rest}
          >
            {highlightChildren(children, 'p')}
          </p>
        );
      },
      ul(props) {
        return (
          <ul
            className={`${PROSE_MEASURE} my-3 list-disc break-keep pl-6 text-reading leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]`}
            {...props}
          />
        );
      },
      ol(props) {
        return (
          <ol
            className={`${PROSE_MEASURE} my-3 list-decimal break-keep pl-6 text-reading leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]`}
            {...props}
          />
        );
      },
      li({ children, ...rest }) {
        return (
          <li className="my-1" data-line={lineOf(rest)} {...rest}>
            {highlightChildren(children, 'li')}
          </li>
        );
      },
      code({ className, children, ...rest }) {
        const isBlock = /language-/.test(className ?? '');
        if (!isBlock) {
          return (
            <code
              className="rounded-micro bg-[color:var(--color-indigo-line-a06)] px-1 py-0.5 font-mono text-label text-[color:var(--color-indigo-pale-a95)] md:text-body"
              {...rest}
            >
              {children}
            </code>
          );
        }
        return (
          <code className={`${className} font-mono text-label md:text-body`} {...rest}>
            {children}
          </code>
        );
      },
      pre(props) {
        return (
          <pre
            className="my-4 overflow-x-auto rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-surface-deep-a80)] p-3 font-mono text-label leading-body text-[color:var(--color-indigo-pale-a92)] md:text-body"
            {...props}
          />
        );
      },
      blockquote({ children, ...rest }) {
        const callout = detectCallout(children);
        if (callout) {
          return (
            <CalloutBlock kind={callout.kind} title={callout.title}>
              {callout.rest}
            </CalloutBlock>
          );
        }
        return (
          <blockquote
            className={`${PROSE_MEASURE} my-4 border-l-2 border-[color:var(--color-indigo-line-a35)] pl-4 italic text-[color:var(--color-text-tertiary)]`}
            {...rest}
          >
            {children}
          </blockquote>
        );
      },
      table(props) {
        return (
          <div className="my-4 overflow-x-auto">
            <table
              className="w-full border-collapse text-body text-[color:var(--color-text-secondary)]"
              {...props}
            />
          </div>
        );
      },
      th(props) {
        return (
          <th
            className="border-b border-[color:var(--color-divider)] px-2 py-1.5 text-left font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
            {...props}
          />
        );
      },
      td(props) {
        return (
          <td
            className="border-b border-[color:var(--color-overlay-2)] px-2 py-1.5 align-top [&_a]:-mx-2 [&_a]:inline-flex [&_a]:min-h-8 [&_a]:items-center [&_a]:rounded-chip [&_a]:px-2"
            {...props}
          />
        );
      },
      hr() {
        return <hr className="my-6 border-[color:var(--color-border-soft)]" />;
      },
      img({ src, alt, title }) {
        const rawSrc = typeof src === 'string' ? src : undefined;
        if (rawSrc && /^https?:/i.test(rawSrc)) return <RemoteImage src={rawSrc} alt={alt ?? ''} />;
        // A server vault has no resolveImage and references public/docs-vault directly.
        if (!rawSrc || /^(data:|blob:)/i.test(rawSrc) || !resolveImage) {
          return <BodyImage src={rawSrc ?? ''} alt={alt ?? ''} title={title} />;
        }
        return (
          <VaultImage
            src={rawSrc}
            alt={alt ?? ''}
            docSlug={doc.slug}
            resolve={resolveImage}
          />
        );
      },
    };
  }, [
    basePath, doc.slug, getDocHref, getProjectHref, highlightChildren, libraryT, linkTargets,
    markSourceLines, namedSource, normalizedOriginalPaths, normalizedVaultSlugs, onCitationPress,
    onConceptNavigate, onNavigate, onSourceNavigate, reducedMotion, repoBlobBase, resolveImage, t,
    vaultRepoRoot, vaultSlugs,
  ]);
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

/**
 * A citation the Library opens in place: a chip after the sentence, quiet until pointed at. It
 * stays inline so a long run of citations wraps with the text.
 */
const CITATION_CHIP_CLASS =
  'mx-0.5 inline rounded-micro bg-[color:var(--color-indigo-line-a06)] px-1 py-px align-baseline text-label leading-label text-[color:var(--color-indigo-line-a90)] [box-decoration-break:clone] whitespace-normal transition-colors hover:bg-[color:var(--color-indigo-line-a22)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--color-indigo-focus-ring)] aria-expanded:bg-[color:var(--color-indigo-line-a22)] aria-expanded:text-[color:var(--color-text-primary)]';
const CITATION_CHIP_MISSING_CLASS =
  'bg-transparent border-b border-dashed border-[color:var(--color-amber-source-a50)] rounded-none text-[color:var(--color-amber-source-text-a85)]';

/**
 * A wikilink whose target is not in the folder: the written path in danger ink, focusable, and
 * described as missing to a pointer, the keyboard and a screen reader alike.
 */
function MissingWikilink({ text, description }: { text: React.ReactNode; description: string }) {
  const descriptionId = useId();
  /*
   * The description is said once: by `aria-describedby` to a screen reader, and by the hint a
   * pointer or the keyboard raises, which is hidden from assistive technology so it is not
   * read twice.
   */
  return (
    <span className="group/missing relative">
      <span
        tabIndex={0}
        data-link-missing="true"
        aria-describedby={descriptionId}
        className="border-b border-dashed border-[color:var(--color-danger-a50)] text-[color:var(--color-danger-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--color-indigo-focus-ring)]"
      >
        {text}
      </span>
      <span id={descriptionId} className="sr-only">
        {description}
      </span>
      <span
        aria-hidden
        data-link-missing-hint="true"
        className="pointer-events-none absolute bottom-full left-0 z-[var(--z-tooltip)] mb-1.5 w-max max-w-64 rounded-chip border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] px-2 py-1 text-label leading-label not-italic text-[color:var(--color-text-primary)] opacity-0 shadow-[var(--shadow-elevation-1)] transition-opacity group-hover/missing:opacity-100 group-focus-within/missing:opacity-100"
      >
        {description}
      </span>
    </span>
  );
}

/** Module-level, so the default never changes identity between renders. */
function defaultDocHref(slug: string, hash?: string): string {
  return buildDocsVaultHref({ slug, hash });
}

const REMARK_PLUGINS = [remarkGfm];

interface ReaderNode {
  type: string;
  value?: string;
  url?: string;
  children?: ReaderNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

const isBlank = (node: ReaderNode) => node.type === 'text' && (node.value ?? '').trim() === '';

/**
 * What a link node is to the reader: a citation (with its decoded path), a page or concept link,
 * or neither. It only reads the destination the wikilink rewrite wrote; the `a` component still
 * resolves and guards every link when it renders.
 */
function wikilinkKind(node: ReaderNode): { kind: 'citation'; path: string } | { kind: 'page' } | null {
  if (node.type !== 'link' || !node.url) return null;
  const rawSlug = parseWikilinkHref(node.url)?.rawSlug;
  if (!rawSlug) return null;
  const slug = decodeWikilinkSlug(rawSlug);
  return slug.startsWith('src:') ? { kind: 'citation', path: slug.slice('src:'.length) } : { kind: 'page' };
}

const LINK_SEPARATOR_CLASS = 'text-[color:var(--color-text-tertiary)]';
const CITATION_RUN_CLASS = 'block [&>:first-child]:ml-0';

/**
 * The Library reader's tree step, after the wikilink rewrite and before rendering; the file is never
 * changed. Whitespace between two page or concept links becomes a " · " that belongs to neither;
 * citations that end a paragraph and name their file stand together on their own line.
 */
function readerTree(namedSource: string | undefined, onCounted: (counts: ReadonlyMap<string, number>) => void) {
  const counts = new Map<string, number>();
  const namesFile = (node: ReaderNode) => {
    const link = wikilinkKind(node);
    return link?.kind === 'citation' && link.path.normalize('NFC') !== namedSource;
  };
  const separate = (children: ReaderNode[]) => {
    for (let index = 1; index < children.length - 1; index += 1) {
      if (!isBlank(children[index]!)) continue;
      if (wikilinkKind(children[index - 1]!)?.kind !== 'page' || wikilinkKind(children[index + 1]!)?.kind !== 'page') continue;
      children[index] = {
        type: 'text',
        value: ' · ',
        data: { hName: 'span', hProperties: { className: [LINK_SEPARATOR_CLASS], dataLinkSeparator: '' } },
      };
    }
  };
  const lowerTrailingCitations = (paragraph: ReaderNode) => {
    const children = paragraph.children ?? [];
    let start = children.length;
    let named = false;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]!;
      if (isBlank(child)) continue;
      if (wikilinkKind(child)?.kind !== 'citation') break;
      named ||= namesFile(child);
      start = index;
    }
    if (!named || !children.slice(0, start).some((child) => !isBlank(child))) return;
    const run = children.splice(start);
    children.push({
      type: 'readerCitationRun',
      children: run,
      data: { hName: 'span', hProperties: { className: [CITATION_RUN_CLASS], dataCitationRun: '' } },
    });
  };
  const visit = (node: ReaderNode) => {
    const link = wikilinkKind(node);
    if (link?.kind === 'citation') {
      const path = link.path.normalize('NFC');
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    if (!node.children) return;
    separate(node.children);
    if (node.type === 'paragraph') lowerTrailingCitations(node);
    for (const child of node.children) visit(child);
  };
  return (tree: ReaderNode) => {
    counts.clear();
    visit(tree);
    onCounted(new Map(counts));
  };
}

const NO_CITATIONS: ReadonlyMap<string, number> = new Map();

const HEADING_CLASS = {
  h1: 'group relative mt-0 mb-6 text-display font-[var(--font-weight-strong)] leading-display text-[color:var(--color-text-primary)]',
  // No section gap above a first-line heading; the Library draws the title in its own header.
  h2: 'group relative mt-10 mb-3 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)] first:mt-0',
  h3: 'group relative mt-6 mb-2 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]',
} as const;

/**
 * Next `sizes` hint for body images, in rem so it follows the root font size like the prose measure
 * (`app/globals.css`); unparsable units fall back to 100vw.
 */
const IMAGE_SIZES = `(max-width: 768px) 100vw, (min-width: ${WIDE_READING_MIN_VIEWPORT_PX}px) ${PROSE_MEASURE_WIDE_REM.toFixed(4)}rem, ${PROSE_MEASURE_REM.toFixed(4)}rem`;

/**
 * Line-length cap on prose elements only (paragraphs, lists, quotes); headings, tables, code and
 * images keep the full column. A max-width only narrows, and prose stays left-aligned.
 */
const PROSE_MEASURE = 'max-w-[var(--measure-prose)]';

type CalloutKind = 'note' | 'tip' | 'info' | 'warning' | 'danger' | 'success';

const CALLOUT_STYLES: Record<
  CalloutKind,
  { border: string; bg: string; title: string; icon: string }
> = {
  note: {
    border: 'var(--color-indigo-line-a40)',
    bg: 'var(--color-indigo-a06)',
    title: 'var(--color-indigo-pale-a95)',
    icon: '📝',
  },
  tip: {
    border: 'var(--color-success-a40)',
    bg: 'var(--color-success-a06)',
    title: 'var(--color-success-text-a95)',
    icon: '💡',
  },
  info: {
    border: 'var(--color-indigo-line-a40)',
    bg: 'var(--color-indigo-a06)',
    title: 'var(--color-indigo-pale-a95)',
    icon: 'ℹ️',
  },
  warning: {
    border: 'var(--color-amber-source-a45)',
    bg: 'var(--color-amber-source-a06)',
    title: 'var(--color-amber-source-text-a95)',
    icon: '⚠️',
  },
  danger: {
    border: 'var(--color-danger-a50)',
    bg: 'var(--color-danger-a08)',
    title: 'var(--color-danger-text-strong)',
    icon: '🚫',
  },
  success: {
    border: 'var(--color-success-a45)',
    bg: 'var(--color-success-a07)',
    title: 'var(--color-success-text-a95)',
    icon: '✓',
  },
};

function detectCallout(
  children: React.ReactNode,
): { kind: CalloutKind; title: string; rest: React.ReactNode } | null {
  const kids = Array.isArray(children) ? children : [children];
  const firstElementIdx = kids.findIndex(
    (c) =>
      c != null &&
      typeof c === 'object' &&
      'type' in (c as object) &&
      (c as { type?: unknown }).type !== undefined,
  );
  if (firstElementIdx === -1) return null;
  const firstEl = kids[firstElementIdx] as React.ReactElement<{
    children?: React.ReactNode;
  }>;
  const inner = firstEl.props?.children;
  const innerArr = Array.isArray(inner) ? inner : [inner];
  const firstText = innerArr[0];
  if (typeof firstText !== 'string') return null;
  const m = firstText.match(
    /^\[!(note|tip|info|warning|danger|success)\]\s*(.*?)(?:\n|$)/i,
  );
  if (!m) return null;
  const kind = m[1].toLowerCase() as CalloutKind;
  const title = m[2].trim() || kind.toUpperCase();
  const remainderText = firstText.slice(m[0].length).trimStart();
  const firstParagraphRemainder = [
    remainderText,
    ...innerArr.slice(1),
  ].filter((x) => x !== '' && x != null);
  const restKids = [...kids];
  if (firstParagraphRemainder.length > 0) {
    restKids[firstElementIdx] = {
      ...firstEl,
      props: { ...firstEl.props, children: firstParagraphRemainder },
    };
  } else {
    restKids.splice(firstElementIdx, 1);
  }
  return { kind, title, rest: restKids };
}

function CalloutBlock({
  kind,
  title,
  children,
}: {
  kind: CalloutKind;
  title: string;
  children: React.ReactNode;
}) {
  const s = CALLOUT_STYLES[kind];
  return (
    <aside
      className="my-4 rounded-chip border-l-4 px-4 py-3"
      style={{ borderLeftColor: s.border, backgroundColor: s.bg }}
    >
      <div
        className="mb-1 flex items-center gap-1.5 text-body font-[var(--font-weight-emphasis)]"
        style={{ color: s.title }}
      >
        <span aria-hidden>{s.icon}</span>
        <span>{title}</span>
      </div>
      <div className="text-body leading-prose text-[color:var(--color-text-secondary)]">
        {children}
      </div>
    </aside>
  );
}

function VaultImage({
  src,
  alt,
  docSlug,
  resolve,
}: {
  src: string;
  alt: string;
  docSlug: string;
  resolve: (path: string) => Promise<string | null>;
}) {
  const t = useTranslations('vaultWidgets.viewer');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    resolve(vaultPathFromDoc(docSlug, src))
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (!url) {
          setError(true);
          return;
        }
        created = url;
        setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src, docSlug, resolve]);
  if (error) {
    return (
      <span
        className="my-3 inline-block rounded-micro border border-dashed border-[color:var(--color-amber-source-a50)] px-2 py-1 font-mono text-caption text-[color:var(--color-amber-source-text-a80)]"
        title={t('imageMissing', { src })}
      >
        🖼 {alt || src}
      </span>
    );
  }
  if (!blobUrl) {
    return (
      <span
        className="my-3 inline-block h-5 w-24 animate-pulse rounded-micro bg-[color:var(--color-overlay-2)]"
        aria-label={alt}
      />
    );
  }
  return <BodyImage src={blobUrl} alt={alt} />;
}

function RemoteImage({ src, alt }: { src: string; alt: string }) {
  const t = useTranslations('vaultWidgets.viewer');
  let host = src;
  try {
    host = new URL(src).host;
  } catch {
    host = src;
  }
  return (
    <span
      data-testid="docs-viewer-remote-image"
      className={badgeClass({
        shape: 'micro',
        className:
          'my-3 max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 border border-dashed border-[color:var(--color-border-strong)] text-[color:var(--color-text-tertiary)]',
      })}
    >
      {alt ? <span className="text-[color:var(--color-text-secondary)]">{alt}</span> : null}
      <span>{t('remoteImage', { host })}</span>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className={controlClass({ shape: 'link', tone: 'accent', className: 'text-caption' })}
      >
        <span aria-hidden data-external-link-marker>
          ↗
        </span>
        {t('remoteImageOpen', { host })}
      </a>
    </span>
  );
}

function BodyImage({ src, alt, title }: { src: string; alt: string; title?: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={1200}
      height={800}
      sizes={IMAGE_SIZES}
      unoptimized
      className="my-4 max-w-full rounded-chip border border-[color:var(--color-border-soft)]"
      style={{ height: 'auto' }}
      title={title}
    />
  );
}

function vaultPathFromDoc(docSlug: string, src: string): string {
  const fromDir = docSlug.includes('/') ? docSlug.slice(0, docSlug.lastIndexOf('/')) : '';
  const rel = src.replace(/^\.\//, '');
  const stack: string[] = [];
  for (const part of (fromDir ? `${fromDir}/${rel}` : rel).split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function HeadingAnchor({
  anchor,
  docSlug,
  basePath,
}: {
  anchor: string;
  docSlug: string;
  basePath: string;
}) {
  const t = useTranslations('vaultWidgets.viewer');
  const { state, copy } = useCopyFeedback(2000);
  const copied = state === "copied";
  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.pathname = basePath.endsWith('/') ? basePath : `${basePath}/`;
    url.searchParams.set('slug', docSlug);
    url.hash = anchor;
    await copy(url.toString());
  };
  return (
    <IconButton
      label={copied ? t('anchorCopiedAria') : t('anchorCopyAria')}
      size="lg"
      tone="muted"
      active={copied}
      onClick={onClick}
      title={copied ? t('anchorCopiedTitle') : t('anchorCopyTitle')}
      className={`absolute right-0 top-1/2 -translate-y-1/2 transition-[background-color,color,opacity] sm:-left-9 sm:right-auto ${
        copied
          ? 'opacity-100'
          : 'opacity-100 hover:bg-[color:var(--color-indigo-line-a06)] hover:text-[color:var(--color-indigo-line-a90)] [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
      }`}
      contentEditable={false}
    >
      <Hash size={ICON_SIZE.sm} aria-hidden />
    </IconButton>
  );
}

function slugFromChildren(children: React.ReactNode): string {
  const text = flattenText(children);
  return text
    .toLowerCase()
    .replace(/[^\w가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function flattenText(node: React.ReactNode): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: React.ReactNode } }).props;
    return flattenText(props?.children);
  }
  return '';
}
