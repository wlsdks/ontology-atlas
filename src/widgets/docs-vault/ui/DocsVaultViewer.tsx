'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import { ExternalLink, Hash } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { PROSE_MEASURE_REM } from '@/shared/ui/reading-measure';
import {
  buildDocsVaultHref,
  type VaultDoc,
} from '@/entities/docs-vault';
import { useStaticVaultSource } from '@/entities/vault-session';
import { IconButton, controlClass } from '@/shared/ui';
import { splitHighlightSegments } from '@/shared/lib/highlight-match';
import { githubAnchorSlug } from '@/shared/lib/github-anchor-slug';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { useDelayedVisible } from '@/shared/lib/use-presence';
import { useArrivalMemory } from '@/shared/lib/route-arrival-memory';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import {
  decodeWikilinkSlug,
  normalizeOriginalPaths,
  parseWikilinkHref,
  resolveSourceCitation,
  rewriteWikilinks,
} from '@/shared/lib/source-citation';
import { sourceCitationWords } from '@/features/library';
import { resolveWikilinkTargetSlug } from '@/shared/lib/parse-frontmatter';
import { fetchServerDocContent } from '../lib/server-doc-content';
import { resolveDocLink } from '../lib/resolve-doc-link';
import { getTopologyProjectHref } from '@/entities/project';

interface Props {
  doc: VaultDoc;
  vaultSlugs: Set<string>;
  /** Routing when an in-vault link is clicked. Usually HomePage passes setSelectedSlug. */
  onNavigate: (slug: string) => void;
  /** The current route prefix that in-vault slugs replace. Defaults to '/docs'. */
  basePath?: string;
  /** Used where the parent has to preserve URL state, such as account-scoped routing. */
  getDocHref?: (slug: string, hash?: string) => string;
  getProjectHref?: (slug: string) => string;
  /** Optional. When given, the md body is fetched through this function (for a local
   *  vault). Unset falls back to fetching /docs-vault/{slug}.md. */
  getDocContent?: (slug: string) => Promise<string>;
  /**
   * Bundled bodies from the same vault as the parent's static manifest, so a route-scoped sample
   * override is respected.
   */
  bundledContent?: Record<string, string>;
  /** The query passed from the search palette. Matches are wrapped in mark per text node. */
  highlightQuery?: string;
  /** Turn a relative image path into a real src (a local vault's asset blob URL and
   *  the like). Unset for a server vault. */
  resolveImage?: (path: string) => Promise<string | null>;
  /**
   * Base for turning a vault-escaping `.md` link into a GitHub blob URL; set only for the bundled
   * docs vault.
   */
  repoBlobBase?: string;
  /** Where this vault sits inside the repo (the bundled docs vault = `docs`). */
  vaultRepoRoot?: string;
  /** Original source paths that this Library can currently navigate to. */
  knownOriginalPaths?: ReadonlySet<string>;
  /** Opens a known original source at the cited anchor. */
  onSourceNavigate?: (path: string, anchor?: string) => void;
  /**
   * The original the parent already names beside this page; its citations say only where in it,
   * others also name their file.
   */
  namedSourcePath?: string;
  /** Uses the smaller top inset when parent context already separates the body. */
  compactTop?: boolean;
}

/**
 * The vault document viewer: fetches the md body and renders it with react-markdown; internal links
 * become Link, external ones open in a new tab.
 */
export function DocsVaultViewer({
  doc,
  vaultSlugs,
  onNavigate,
  basePath = '/docs',
  getDocHref = (slug, hash) => buildDocsVaultHref({ slug, hash }),
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
}: Props) {
  const t = useTranslations('vaultWidgets.viewer');
  const libraryT = useTranslations('library');
  const reducedMotion = usePrefersReducedMotion();
  /*
   * A body already read once arrives painted: the memory key carries mtime
   * (`shared/lib/route-arrival-memory.ts`), so an edited file is read again. The read below still
   * runs and replaces it.
   */
  const [raw, setRaw] = useArrivalMemory<string | null>(
    `docs-vault-body:${getDocContent ? 'local' : 'bundled'}:${doc.slug}:${doc.mtime ?? 0}`,
    null,
  );
  const [error, setError] = useState<string | null>(null);
  /* The skeleton appears only when there is something to wait for (`SKELETON_DELAY_MS`). */
  const showSkeleton = useDelayedVisible(raw === null && error === null);
  // Bundled bodies must come from the same vault as the manifest, or title and content point at
  // different documents.
  const { content: preferredBundledContent } = useStaticVaultSource();
  const bundledContent = bundledContentOverride ?? preferredBundledContent;

  // Once the body loads with a highlightQuery, scroll to the first `mark.docs-match`.
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
        let cleaned = text.replace(FRONTMATTER_BLOCK, '');
        /*
         * Wikilinks become standard links with a sentinel the `a` component catches. The sentinel
         * must not look like a URL scheme, or react-markdown's `defaultUrlTransform` empties the
         * href (`tests/contract/wikilink-url-scheme.contract.test.ts`).
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

  // Pure function taking the query as an argument so useMemo dependencies stay accurate.
  const highlightChildren = useMemo(() => {
    const hl = (
      children: React.ReactNode,
      q: string,
      key = 'hl',
    ): React.ReactNode => {
      if (!q) return children;
      if (typeof children === 'string') {
        // Reuses splitHighlightSegments; the `.docs-match` class is what the scroll effect looks
        // for.
        return splitHighlightSegments(children, q).map((seg, i) =>
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
      <Tag id={slug} className={className} {...rest}>
        {alias ? <span id={alias} aria-hidden /> : null}
        {highlightChildren(children, highlightKey)}
        <HeadingAnchor anchor={slug} docSlug={doc.slug} basePath={basePath} />
      </Tag>
    );
  };

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
  /** Compared with a citation's decoded path, which `resolveSourceCitation` returns in NFC. */
  const namedSource = namedSourcePath?.normalize('NFC');

  const components: Components = {
      a({ href, children, ...rest }) {
        if (!href) return <span {...rest}>{children}</span>;
        // The preprocessing sentinel, matched directly against vault slugs.
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
            /*
             * An unlabelled citation's text says where ("line 5") instead of its target; an
             * author's label is kept.
             */
            const words = sourceCitationWords(
              { path: citation.path ?? citation.rawPath, anchor: citation.anchor },
              { nameFile: citation.rawPath !== namedSource },
              libraryT,
            );
            const shown = labelled ? children : words.text;
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
            // Missing and unavailable citations both render as a visibly non-navigable span; only
            // the title differs.
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
           * Resolve against the linking document, as `extractOutLinksWithContext`
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
          // A slug absent from the vault renders dotted (an unresolved wikilink).
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
              /* A prose link stays display:inline so it wraps (`prose-link.contract.test.ts`). */
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
        // A file outside the vault opens as a GitHub blob in a new tab.
        if (resolved.kind === 'external') {
          return (
            <a
              href={resolved.url}
              target="_blank"
              rel="noreferrer noopener"
              /* A prose link stays display:inline so it wraps (`prose-link.contract.test.ts`). */
              className="prose-link decoration-[color:var(--color-indigo-line-a40)] hover:decoration-[color:var(--color-indigo-accent)]"
              {...rest}
            >
              {children}
              <ExternalLink size={ICON_SIZE.sm} className="ml-1 inline align-baseline opacity-60" aria-hidden />
            </a>
          );
        }
        // Outside the vault with no repo location: non-routing text, not a dead 404.
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
          <li className="my-1" {...rest}>
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
        // Callout detection: `[!type] text` in the first paragraph gets callout styling;
        // ReactMarkdown already parsed it into children, so the inner text node is inspected.
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
        // A server vault has no resolveImage and references public/docs-vault directly.
        if (!rawSrc || /^(https?:|data:|blob:)/i.test(rawSrc) || !resolveImage) {
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
    /* A body arriving within the delay draws nothing and announces nothing. */
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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {raw}
      </ReactMarkdown>
    </article>
  );
}

/** A leading frontmatter block, stripped so it is not rendered twice. */
const FRONTMATTER_BLOCK = /^---[\s\S]*?\n---\n?/;

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
const IMAGE_SIZES = `(max-width: 768px) 100vw, ${PROSE_MEASURE_REM.toFixed(4)}rem`;

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

/**
 * Extracts a leading `[!kind] title` from blockquote children; returns null or the remainder
 * as `rest`.
 */
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

/** Local vault image through a blob URL, revoked on unmount or src change. */
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

/** A path relative to the document's folder, resolved to a vault-root path. */
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

/** Heading anchor icon: copies the slug#anchor URL and shows a check for 2 seconds. */
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
