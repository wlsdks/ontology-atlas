'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import { ExternalLink, Hash } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import {
  buildDocsVaultHref,
  type VaultDoc,
} from '@/entities/docs-vault';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import { IconButton } from '@/shared/ui';
import { splitHighlightSegments } from '@/shared/lib/highlight-match';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { useDelayedVisible } from '@/shared/lib/use-presence';
import { fetchServerDocContent } from '../lib/server-doc-content';
import { resolveDocLink } from '../lib/resolve-doc-link';

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
  /** Bundled bodies from the same vault as the static manifest the parent settled on.
   *  Stops the viewer re-reading the global sample preference and picking a different
   *  body when a route-scoped sample override is in effect. */
  bundledContent?: Record<string, string>;
  /** The query passed from the search palette. Matches are wrapped in mark per text node. */
  highlightQuery?: string;
  /** Turn a relative image path into a real src (a local vault's asset blob URL and
   *  the like). Unset for a server vault. */
  resolveImage?: (path: string) => Promise<string | null>;
  /** The base for turning a vault-external (`../` escape) relative md link into a
   *  GitHub blob URL. Set only for the bundled docs vault; a local vault leaves it
   *  unset → non-routing render rather than a dead 404. */
  repoBlobBase?: string;
  /** Where this vault sits inside the repo (the bundled docs vault = `docs`). */
  vaultRepoRoot?: string;
}

/**
 * The individual vault document viewer. It fetches /docs-vault/{slug}.md on the
 * client and renders it with react-markdown. Internal links are identified against
 * the vaultSlugs set and swapped for Link; external ones open in a new tab. Images
 * are plain native img for now.
 */
export function DocsVaultViewer({
  doc,
  vaultSlugs,
  onNavigate,
  basePath = '/docs',
  getDocHref = (slug, hash) => buildDocsVaultHref({ slug, hash }),
  getProjectHref = (slug) => `/?p=${encodeURIComponent(slug)}`,
  getDocContent,
  bundledContent: bundledContentOverride,
  highlightQuery,
  resolveImage,
  repoBlobBase,
  vaultRepoRoot,
}: Props) {
  const t = useTranslations('vaultWidgets.viewer');
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * The skeleton appears **only when there is something to wait for**. This component
   * remounts on every document change, so `raw` starts null each time, and since the
   * body is usually already in hand, the three-bar skeleton used to flash for a single
   * frame (measured 8.2–15.9ms · see the `SKELETON_DELAY_MS` comment).
   */
  const showSkeleton = useDelayedVisible(raw === null && error === null);
  // A static vault's bundled bodies — they have to come from **the same vault** the
  // manifest was chosen from. An earlier defect was exactly that mismatch (the manifest
  // was the sample shop and the bodies were dogfood, so title and content pointed at
  // different documents).
  const { content: preferredBundledContent } = useStaticVaultSource();
  const bundledContent = bundledContentOverride ?? preferredBundledContent;

  // Once raw has loaded and highlightQuery is present, auto-scroll to the first match —
  // find the first mark carrying the md-highlight class and scrollIntoView.
  useEffect(() => {
    if (!raw || !highlightQuery) return;
    const handle = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-docs-viewer] mark.docs-match',
      );
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(handle);
  }, [raw, highlightQuery]);

  // This component remounts through key={doc.slug} in the parent, so state resets to a
  // fresh null on a slug change. No reset is needed in the effect.
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
        // Strip the frontmatter block (avoids rendering it twice).
        let cleaned = text.startsWith('---')
          ? text.replace(/^---[\s\S]*?\n---\n?/, '')
          : text;
        /*
         * Wikilink preprocessing — turn `[[slug]]` / `[[slug|text]]` / `[[slug#anchor]]`
         * into a standard markdown link plus a sentinel. The `a` component below
         * catches that sentinel for internal routing.
         *
         * ⚠️ **The sentinel must not look like a URL scheme** (measured fix,
         * 2026-08-08). It used to be `WIKILINK:slug`, but `react-markdown` sanitises
         * URLs (`defaultUrlTransform`) and **turns an unknown scheme into an empty
         * string** — measured: `defaultUrlTransform('WIKILINK:capabilities/x') === ''`.
         * So `href` was empty and the `a` component's first line returned **plain text
         * with no marking at all**, neither a link nor a "not found" indicator. In
         * other words this feature had code and documentation but **had never once
         * worked** (the dogfood vault has 0 body wikilinks, so nobody stepped on it).
         *
         * A query shape survives the sanitiser. Gate:
         * `tests/contract/wikilink-url-scheme.contract.test.ts`.
         */
        cleaned = cleaned.replace(
          /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
          (_, target: string, label?: string) => {
            const text = (label ?? target).trim();
            const clean = target.trim();
            const [slug, anchor] = clean.split('#');
            return `[${text}](${WIKILINK_SENTINEL}${slug}${anchor ? `#${anchor}` : ''})`;
          },
        );
        setRaw(cleaned);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [bundledContent, doc.slug, getDocContent]);

  // Wrap highlightQuery matches in a string node with <mark>. Split out as a pure
  // function so dependencies track well inside useMemo, passing the query as an
  // argument rather than through a closure.
  const highlightChildren = useMemo(() => {
    const hl = (
      children: React.ReactNode,
      q: string,
      key = 'hl',
    ): React.ReactNode => {
      if (!q) return children;
      if (typeof children === 'string') {
        // Substring segmentation reuses the shared splitHighlightSegments (lower
        // complexity). The effect that scrollIntoViews the first match looks for
        // `.docs-match`, so the mark className is preserved.
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

  // A heading id must be the same regardless of render count (idempotent). The previous
  // occurrence-counter Map mutated a closure during render, so under StrictMode's double
  // invocation every id shifted to `-2` and diverged from the manifest's heading slugs
  // (scroll-spy, table-of-contents rail active state, anchor clicks). Duplicate headings
  // with the same text now collide on id (the browser anchors to the first), and that
  // trade-off beats killing navigation for every heading.
  const headingSlugOf = (children: React.ReactNode) => slugFromChildren(children);

  /**
   * An NFC copy of the vault slugs — the lookup set wikilink resolution uses.
   *
   * Using the original `vaultSlugs` directly fails to match Hangul slugs (NFC 21
   * characters against NFD 31). The set is built once rather than normalising per
   * link — with dozens of links in a body, that is repeated work.
   */
  const normalizedVaultSlugs = useMemo(
    () => new Set([...vaultSlugs].map((slug) => slug.normalize('NFC'))),
    [vaultSlugs],
  );

  const components: Components = {
      a({ href, children, ...rest }) {
        if (!href) return <span {...rest}>{children}</span>;
        // The preprocessing sentinel — `[[slug#anchor]]` has been turned into
        // WIKILINK:slug#anchor. Matched directly against vault slugs.
        if (href.startsWith(WIKILINK_SENTINEL)) {
          const spec = href.slice(WIKILINK_SENTINEL.length);
          const [rawWikiSlug, anchor] = spec.split('#');
          /*
           * ⚠️ **Percent-decode and normalise to NFC** (measured fix, 2026-08-08).
           *
           * The markdown parser passes link URLs **percent-encoded** — measured:
           * `capabilities/sweep-verification-procedure` arrived as
           * `capabilities/%EC%8A%A4%EC%9C%95-…` (69 characters). That string is not in
           * the vault's slug set, so **every** wikilink to a Hangul slug fell through
           * to the "link not in the folder" dotted style. ASCII slugs have nothing to
           * encode and stayed fine — which is why this defect appears only in a Hangul
           * vault.
           *
           * NFC is matched too. Hangul slugs split into NFC (21 characters) and NFD
           * (31) depending on origin (the macOS filesystem uses NFD), so the characters
           * are identical while the strings do not match. The CLI validator already
           * recorded the same judgement (`validate.mjs`: *"References are also normalised to NFC — normalising only one side leaves identical characters that don't match"* — references are
           * normalised to NFC too; normalising one side leaves identical characters
           * that do not match). That rule is followed rather than re-decided.
           */
          const wikiSlug = rawWikiSlug ? decodeWikilinkSlug(rawWikiSlug) : rawWikiSlug;
          // A `project:` prefix routes to the public topology route, e.g. [[project:reactor]].
          if (wikiSlug && wikiSlug.startsWith('project:')) {
            const projectSlug = wikiSlug.slice('project:'.length);
            return (
              <a
                href={getProjectHref(projectSlug)}
                className="prose-link text-[color:var(--color-amber-docs-a95)] decoration-[color:var(--color-amber-docs-a35)] hover:decoration-[color:var(--color-amber-docs-a100)]"
                title={t('projectLinkTitle', { slug: projectSlug })}
              >
                {children}
              </a>
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
                        ?.scrollIntoView({ behavior: 'smooth' });
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
              title={t('wikilinkMissing', { slug: wikiSlug })}
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
              /* Fake-prose fix (2026-08-04): inline-flex kills line breaking in a prose
                 position — 1 rect at 320px against 2 for an inline control. A prose link
                 is contractually display:inline (prose-link.contract.test.ts). */
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
                      ?.scrollIntoView({ behavior: 'smooth' });
                  });
                }
              }}
              className="prose-link text-[color:var(--color-indigo-line-a90)] hover:decoration-[color:var(--color-indigo-accent)]"
            >
              {children}
            </Link>
          );
        }
        // A file outside the vault (in the repo) → GitHub blob in a new tab. Fixes the
        // regression where it was handed to app routing and died in the 404.
        if (resolved.kind === 'external') {
          return (
            <a
              href={resolved.url}
              target="_blank"
              rel="noreferrer noopener"
              /* Fake-prose fix (2026-08-04): inline-flex kills line breaking in a prose
                 position — 1 rect at 320px against 2 for an inline control. A prose link
                 is contractually display:inline (prose-link.contract.test.ts). */
              className="prose-link decoration-[color:var(--color-indigo-line-a40)] hover:decoration-[color:var(--color-indigo-accent)]"
              {...rest}
            >
              {children}
              <ExternalLink size={ICON_SIZE.sm} className="ml-1 inline align-baseline opacity-60" aria-hidden />
            </a>
          );
        }
        // Repo location unknown (a local vault) and outside the vault → not routable.
        // Rendered as non-routing text (href removed) rather than a dead 404.
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
      h1({ children, ...rest }) {
        const slug = headingSlugOf(children);
        return (
          <h2
            id={slug}
            className="group relative mt-0 mb-6 text-display font-[var(--font-weight-strong)] leading-display text-[color:var(--color-text-primary)]"
            {...rest}
          >
            {highlightChildren(children, 'h1')}
            <HeadingAnchor anchor={slug} docSlug={doc.slug} basePath={basePath} />
          </h2>
        );
      },
      h2({ children, ...rest }) {
        const slug = headingSlugOf(children);
        return (
          <h2
            id={slug}
            className="group relative mt-10 mb-3 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
            {...rest}
          >
            {highlightChildren(children, 'h2')}
            <HeadingAnchor anchor={slug} docSlug={doc.slug} basePath={basePath} />
          </h2>
        );
      },
      h3({ children, ...rest }) {
        const slug = headingSlugOf(children);
        return (
          <h3
            id={slug}
            className="group relative mt-6 mb-2 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
            {...rest}
          >
            {highlightChildren(children, 'h3')}
            <HeadingAnchor anchor={slug} docSlug={doc.slug} basePath={basePath} />
          </h3>
        );
      },
      p({ children, ...rest }) {
        return (
          <p
            className="my-3 break-keep text-body-lg leading-prose text-[color:var(--color-text-secondary)]"
            {...rest}
          >
            {highlightChildren(children, 'p')}
          </p>
        );
      },
      ul(props) {
        return (
          <ul
            className="my-3 list-disc break-keep pl-6 text-body-lg leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
            {...props}
          />
        );
      },
      ol(props) {
        return (
          <ol
            className="my-3 list-decimal break-keep pl-6 text-body-lg leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
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
        // Callout detection — a first paragraph shaped `[!type] text...` gets dedicated
        // styling. Obsidian/GitHub notation: `> [!note] title\n> body...`. ReactMarkdown
        // has already parsed it into the first p > text of children, so the inner text
        // node has to be inspected.
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
            className="my-4 border-l-2 border-[color:var(--color-indigo-line-a35)] pl-4 italic text-[color:var(--color-text-tertiary)]"
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
        // External URLs (http/data/blob) pass through. Only relative paths use resolveImage.
        const rawSrc = typeof src === 'string' ? src : undefined;
        if (!rawSrc || /^(https?:|data:|blob:)/i.test(rawSrc)) {
          return (
            <Image
              src={rawSrc ?? ''}
              alt={alt ?? ''}
              width={1200}
              height={800}
              sizes="(max-width: 768px) 100vw, 760px"
              unoptimized
              className="my-4 max-w-full rounded-chip border border-[color:var(--color-border-soft)]"
              style={{ height: 'auto' }}
              title={title}
            />
          );
        }
        if (!resolveImage) {
        // Server vault — try referencing directly under public/docs-vault.
          return (
            <Image
              src={rawSrc}
              alt={alt ?? ''}
              width={1200}
              height={800}
              sizes="(max-width: 768px) 100vw, 760px"
              unoptimized
              className="my-4 max-w-full rounded-chip border border-[color:var(--color-border-soft)]"
              style={{ height: 'auto' }}
              title={title}
            />
          );
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
    /*
     * If the body arrives before the window passes, nothing is drawn — an empty space
     * is quieter than a loading bar flashing for one frame. There is nothing to
     * announce either, so no `role="status"` is created then.
     */
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
      className="mx-auto max-w-[760px] px-6 py-8 md:px-10 md:py-10"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {raw}
      </ReactMarkdown>
    </article>
  );
}

/**
 * The wikilink sentinel — **it has to look like a query.** A scheme shape (`X:`) is
 * erased entirely by `react-markdown`'s URL sanitiser (measured fix, 2026-08-08).
 * The gate reads this value from the source and checks that it survives sanitising.
 */
const WIKILINK_SENTINEL = '?wikilink=';

/**
 * Extract the vault slug from a wikilink URL — **percent-decode plus NFC**.
 *
 * Both are needed, in that order: decoding first is what makes NFC normalisation
 * apply to real characters. Input that fails to decode (a truncated `%`) returns the
 * raw value — a throw here means one whole document does not render.
 */
function decodeWikilinkSlug(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* Truncated percent sequence — leave the raw value. */
  }
  return decoded.normalize('NFC');
}

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
 * Extract the `[!kind] title` pattern from blockquote children. Only the very first
 * text of the first paragraph is inspected. Returns null on no match; on a match,
 * returns the remainder with that prefix removed as `rest`, so it renders in the body
 * as-is.
 */
function detectCallout(
  children: React.ReactNode,
): { kind: CalloutKind; title: string; rest: React.ReactNode } | null {
  const kids = Array.isArray(children) ? children : [children];
  // Find the first element-like p (skipping whitespace text and the like).
  const firstIdx = kids.findIndex(
    (c) =>
      c != null &&
      typeof c === 'object' &&
      'type' in (c as object) &&
      (c as { type?: unknown }).type !== undefined,
  );
  if (firstIdx === -1) return null;
  const firstEl = kids[firstIdx] as React.ReactElement<{
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
  // The remaining children of the first paragraph: the piece after the firstText match plus innerArr[1:].
  const remainderText = firstText.slice(m[0].length).trimStart();
  const restFirstP = [
    remainderText,
    ...innerArr.slice(1),
  ].filter((x) => x !== '' && x != null);
  const restKids = [...kids];
  if (restFirstP.length > 0) {
  // Restore the remainder into the same p (a React element clone).
    restKids[firstIdx] = {
      ...firstEl,
      props: { ...firstEl.props, children: restFirstP },
    };
  } else {
    restKids.splice(firstIdx, 1);
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

/**
 * Render a local vault's image src by converting it asynchronously to a blob URL. The
 * blob created with createObjectURL is revoked on unmount or on a src change to avoid
 * a memory leak.
 */
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
  // Normalise a path relative to the document's directory to be relative to the vault root.
    const fromDir = docSlug.includes('/')
      ? docSlug.slice(0, docSlug.lastIndexOf('/'))
      : '';
    const rel = src.replace(/^\.\//, '');
    const joined = fromDir ? `${fromDir}/${rel}` : rel;
    const parts = joined.split('/');
    const stack: string[] = [];
    for (const p of parts) {
      if (p === '' || p === '.') continue;
      if (p === '..') {
        stack.pop();
        continue;
      }
      stack.push(p);
    }
    const normalized = stack.join('/');
    resolve(normalized)
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
  return (
    <Image
      src={blobUrl}
      alt={alt}
      width={1200}
      height={800}
      sizes="(max-width: 768px) 100vw, 760px"
      unoptimized
      className="my-4 max-w-full rounded-chip border border-[color:var(--color-border-soft)]"
      style={{ height: 'auto' }}
    />
  );
}

/**
 * The # icon beside a heading — it lifts slightly on hover and copies the
 * slug#anchor URL to the clipboard on click, with a check mark as feedback for 2
 * seconds.
 */
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
