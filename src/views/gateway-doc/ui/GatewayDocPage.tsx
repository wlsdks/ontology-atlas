'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { GatewayNav, GatewayReadingLinks } from '@/widgets/gateway-chrome';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { ChevronRight, Languages } from 'lucide-react';
import { GithubMark } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import {
  extractEntries,
  separateCategoryLines,
  normalizeHeadingKey,
  readVaultDoc,
  readVaultDocOmittedSections,
  trimToRecentSections,
  type DocEntry,
} from '../lib/vault-doc';
import { GUIDE_ENTRY_PAGE, GUIDE_PAGES, type GuidePage } from '../model/guide-pages';
import { Link } from '@/i18n/navigation';
import { controlClass } from '@/shared/ui/control-class';

/**
 * One page of gateway reading, shared by `/guide` and `/changelog`: a reading surface, not a work
 * surface. Lines hold the prose measure (`--measure-prose`; `ch` is the digit `0`'s advance, so the
 * derivation lives in `app/globals.css` and `tests/e2e/prose-measure-calibration.spec.ts` holds it),
 * the body uses `leading-prose` (`.claude/rules/design.md`), and wide section gaps carry hierarchy.
 * The palette stays neutrals plus one indigo.
 */
export interface GatewayDocPageProps {
  /** Vault slug: `GUIDE` or `CHANGELOG`. */
  slug: string;
  /** The screen title, used instead of the vault document's `# H1` because it must be translated. */
  title: string;
  /** One line under the title, only on the first chapter, where it introduces the guide as a whole. */
  lead?: string;
  /** How many `## ` sections to draw, only for growing documents such as CHANGELOG; the guide is read whole. */
  recentSectionLimit?: number;
  /** The source file's repo-relative path — used for "the rest is here" when truncated. */
  sourcePath: string;
  /**
   * One notice line above the body, for the guide's unknown-segment fallback: static export cannot
   * route real 404s, and an unstated substitution is a misdelivery. The page passes translated text.
   */
  notice?: string;
  /** The left table of contents, only for a set of chapters such as the guide. */
  sidebar?: boolean;
  /** Which chapter is current in the table of contents — used only when `sidebar` is true. */
  activeSegment?: string;
  /** This document's own `## ` entries on the left (the changelog): anchors inside one document, unlike `sidebar`'s routes. */
  entryNav?: boolean;
}

export function GatewayDocPage({
  slug,
  title,
  lead,
  recentSectionLimit,
  sourcePath,
  notice,
  sidebar = false,
  activeSegment,
  entryNav = false,
}: GatewayDocPageProps) {
  const t = useTranslations('gatewayNav');
  /* The body is the English source on every locale, so the page says so and the article carries `lang="en"` for screen readers. */
  const locale = useLocale();
  const bodyIsForeign = locale !== 'en';

  const { body, omittedSections } = useMemo(() => {
    const raw = readVaultDoc(slug);
    if (raw === null) return { body: '', omittedSections: 0 };
    /* The screen title occupies the `# H1` slot, so the document's own is stripped. */
    const withoutH1 = raw.replace(/^#\s+.*(\r?\n)+/, '');
    /* The changelog's leading blockquote and `---` are contributor meta the translated lead already covers. */
    const withoutPreamble = entryNav
      ? separateCategoryLines(withoutH1.replace(/^(?:>.*(?:\r?\n)+)+(?:---(?:\r?\n)+)?/, ''))
      : withoutH1;
    /* Folded sections are the bundle-time fold (`gateway-changelog.json`) plus the screen's own; either alone understates. */
    const bundledOmitted = readVaultDocOmittedSections(slug);
    if (!recentSectionLimit) {
      return { body: withoutPreamble, omittedSections: bundledOmitted };
    }
    const trimmed = trimToRecentSections(withoutPreamble, recentSectionLimit);
    return {
      body: trimmed.body,
      omittedSections: trimmed.omittedSections + bundledOmitted,
    };
  }, [slug, recentSectionLimit, entryNav]);

  /** The entry list and the body headings get ids from the same function, or anchors silently miss. */
  const entries = useMemo(() => (entryNav ? extractEntries(body) : []), [entryNav, body]);
  const headingIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      const key = normalizeHeadingKey(entry.heading);
      if (!map.has(key)) map.set(key, entry.id);
    }
    return map;
  }, [entries]);

  const components = useMemo(
    () => (entryNav ? proseComponentsWithAnchors(headingIds) : PROSE_COMPONENTS),
    [entryNav, headingIds],
  );

  return (
    <div className="flex min-h-full w-full flex-col bg-[color:var(--color-canvas)]">
      <GatewayNav />

      {/*
       * A reading page centres its prose column. The gateway's one-origin rule exists because its
       * panel must not cover the map, and this page has no map or camera, so `mx-auto` creates no
       * second origin here. The chrome still uses the shared origin.
       */}
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          PAGE_GUTTER,
          'w-full flex-1 pt-10 md:pt-16',
          /*
           * Bottom reserve below `lg`, where a tab bar sits over a scrolling document. An
           * unconditional base plus an `lg:` override, because a `max-lg:` variant can lose on CSS
           * order (`.claude/rules/design.md`).
           */
          'pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] lg:pb-20',
        )}
      >
        <div className={cn(PAGE_COLUMN, 'mx-auto')}>
          {/* Two columns only with a table of contents, which folds below xl; GuideChapterPicker stands in, since the chrome's guide chip also folds below sm. */}
          {/*
           * The grid waits for `xl`, and the middle track reaches the full measure before either side
           * gets a pixel; the `1fr` sides split the rest, so text sits on the centre when there is room.
           * The right side collapses first; the left minimum is
           * `clamp(9rem, 100% - measure - 4rem, 11.5rem)` so the list yields before the measure does.
           * The list starts on the gutter, sharing the brand's line at every width.
           */}
          <div
            className={cn(
              sidebar || entryNav
                ? 'xl:grid xl:grid-cols-[minmax(clamp(9rem,calc(100%_-_var(--measure-prose)_-_4rem),11.5rem),1fr)_minmax(0,var(--measure-prose))_minmax(0,1fr)] xl:gap-x-8'
                : 'flex flex-col items-center',
            )}
          >
            {sidebar ? <GuideSidebar activeSegment={activeSegment} /> : null}
            {entryNav ? <EntrySidebar entries={entries} /> : null}
            <div className="flex min-w-0 flex-col items-center">
          {/* The notice stands before the title; same panel grammar as `gateway-doc-truncated`. */}
          {notice ? (
            <aside
              data-testid="gateway-doc-notice"
              className="mb-6 w-full max-w-[var(--measure-prose)] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4"
            >
              <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">{notice}</p>
            </aside>
          ) : null}
          <header className="w-full max-w-[var(--measure-prose)]">
            <h1
              data-testid="gateway-doc-title"
              /*
               * The top of the ramp (`--text-hero-lg`) with its pair `--leading-hero-lg`, the gateway
               * headline's step; a size outside the ramp is dropped unless registered in
               * `TYPE_RAMP_STEPS` in `cn.ts`.
               */
              className="text-hero-lg leading-hero-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
            >
              {title}
            </h1>
            {lead ? (
              <p className="mt-3 text-body-lg leading-prose text-[color:var(--color-text-tertiary)]">
                {lead}
              </p>
            ) : null}
            {bodyIsForeign ? (
              <p
                data-testid="gateway-doc-language-note"
                className="mt-4 inline-flex items-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-label leading-label text-[color:var(--color-text-tertiary)]"
              >
                <Languages size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
                {t('bodyLanguageNote')}
              </p>
            ) : null}
          </header>

          {sidebar ? <GuideChapterPicker activeSegment={activeSegment} /> : null}

          {/* The body is bundled synchronously, so the only failure is a build without the document; it says so and names where the text is. */}
          {body.trim() === '' ? (
            <aside
              data-testid="gateway-doc-empty"
              className="mt-10 w-full max-w-[var(--measure-prose)] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4"
            >
              <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">
                {t('emptyBody')}
              </p>
              <ReadFullSourceLink sourcePath={sourcePath} label={t('readFullSource')} />
            </aside>
          ) : (
            /* `[&>*:first-child]:mt-0` so the first block sits exactly `mt-10` under the header on both pages. */
            <article
              data-testid="gateway-doc-body"
              lang={bodyIsForeign ? 'en' : undefined}
              className="mt-10 w-full max-w-[var(--measure-prose)] [&>*:first-child]:mt-0"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {body}
              </ReactMarkdown>
            </article>
          )}

          {/* These routes have no footer, so the reading destinations the chrome folds at narrow widths live here. */}
          {/* Prev/next at a chapter's end, ordered by `GUIDE_PAGES`; the changelog is not a chapter. */}
          {sidebar ? <GuidePager activeSegment={activeSegment} /> : null}

          <GatewayReadingLinks className="mt-12 w-full max-w-[var(--measure-prose)]" />

          {/* When truncated, say how many were hidden and where to read the rest. */}
          {omittedSections > 0 ? (
            <aside
              data-testid="gateway-doc-truncated"
              className="mt-12 w-full max-w-[var(--measure-prose)] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4"
            >
              <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">
                {t('truncatedNote', { count: omittedSections })}
              </p>
              <ReadFullSourceLink sourcePath={sourcePath} label={t('readFullSource')} />
            </aside>
          ) : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/** "Read the full file on GitHub" — one link shared by the truncation and empty notices. */
function ReadFullSourceLink({ sourcePath, label }: { sourcePath: string; label: string }) {
  return (
    <a
      href={`${GITHUB_REPO_URL}/blob/main/${sourcePath}`}
      target="_blank"
      rel="noreferrer noopener"
      className={controlClass({ shape: "link", tone: "secondary", className: "mt-3 gap-2 text-body leading-body underline underline-offset-2 decoration-[color:var(--color-indigo-line-a32)] hover:decoration-[color:var(--color-indigo-accent)]" })}
    >
      <GithubMark size={13} aria-hidden />
      {label}
    </a>
  );
}

/** Segments that exist as guide chapters — the test separating a slug from a route. */
const GUIDE_SEGMENTS = new Set(GUIDE_PAGES.map((page) => page.segment));

/**
 * Resolves a prose link's `href` for this locale, since one markdown copy serves every locale.
 * Internal body links point only at guide chapters: a visitor without a vault sees the sample, so
 * vault-document links would open nothing with a 200. Vault documents go to GitHub instead
 * (`tests/contract/guide-inbody-links.contract.test.ts`).
 */
function resolveProseHref(href: string, locale: string): string {
  if (!href.startsWith('/')) return href;
  const path = href.split('?')[0];
  const segment = /^\/guide\/([^/]+)\/?$/.exec(path)?.[1];
  if (segment && GUIDE_SEGMENTS.has(segment)) return `/${locale}/guide/${segment}`;
  // A leaked root-absolute link keeps its locale, so the 404 stays in the reader's language.
  return `/${locale}${path}`;
}

/**
 * Body links: a root-absolute link is a vault slug, resolved to a locale-prefixed route here.
 * It stays an `<a>` with `.prose-link` because a link inside prose is prose, not a control
 * (`.claude/rules/design.md`, `prose-link.contract`); only the address is resolved. `docs:links`
 * cannot see this class of defect: `tests/contract/guide-inbody-links.contract.test.ts` checks
 * where the source points and `tests/e2e/guide-inbody-links.spec.ts` that it returns 200.
 */
function ProseLink({ href, children, ...rest }: React.ComponentPropsWithoutRef<'a'>) {
  const locale = useLocale();
  const target = href ?? '';
  const external = /^https?:\/\//.test(target);
  return (
    <a
      href={external ? href : resolveProseHref(target, locale)}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      className="prose-link text-[color:var(--color-indigo-line-a90)] transition-colors hover:decoration-[color:var(--color-indigo-accent)]"
      {...rest}
    >
      {children}
    </a>
  );
}

/**
 * The prose component map, deliberately not shared with `widgets/docs-vault`, whose work-surface
 * machinery is dead weight here; both use the same ramp tokens.
 */
const PROSE_COMPONENTS: Components = {
  h2: ({ children, ...rest }) => (
    <h2
      className="mt-12 mb-3 text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      {...rest}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...rest }) => (
    <h3
      className="mt-8 mb-2 text-body-lg leading-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      {...rest}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...rest }) => (
    <p
      className="my-4 text-body-lg leading-prose text-[color:var(--color-text-secondary)]"
      {...rest}
    >
      {children}
    </p>
  ),
  ul: ({ children, ...rest }) => (
    <ul
      className="my-4 list-disc pl-6 text-body-lg leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
      {...rest}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...rest }) => (
    <ol
      className="my-4 list-decimal pl-6 text-body-lg leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
      {...rest}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...rest }) => (
    <li className="my-1.5" {...rest}>
      {children}
    </li>
  ),
  strong: ({ children, ...rest }) => (
    <strong className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" {...rest}>
      {children}
    </strong>
  ),
  blockquote: ({ children, ...rest }) => (
    <blockquote
      className="my-6 border-l-2 border-[color:var(--color-indigo-line-a35)] pl-4 text-body-lg leading-prose text-[color:var(--color-text-tertiary)]"
      {...rest}
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-12 border-t border-[color:var(--color-divider)]" />,
  code: ({ className, children, ...rest }) => {
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
  pre: ({ children, ...rest }) => (
    <pre
      className="my-6 overflow-x-auto rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-surface-deep-a80)] p-4 font-mono text-label leading-body text-[color:var(--color-indigo-pale-a92)] md:text-body"
      {...rest}
    >
      {children}
    </pre>
  ),
  // A wide table scrolls inside its own box, so the body never scrolls sideways.
  table: ({ children, ...rest }) => (
    <div className="my-6 overflow-x-auto">
      <table
        className="w-full border-collapse text-body leading-body text-[color:var(--color-text-secondary)]"
        {...rest}
      >
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...rest }) => (
    <th
      className="border-b border-[color:var(--color-divider)] px-2 py-2 text-left font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
      {...rest}
    >
      {children}
    </th>
  ),
  td: ({ children, ...rest }) => (
    <td className="border-b border-[color:var(--color-overlay-1)] px-2 py-2 align-top" {...rest}>
      {children}
    </td>
  ),
  /** Body links — definition and rationale in `ProseLink`. */
  a: ProseLink,
};

/** The chapter list, shared by `GuideSidebar` at `xl` and `GuideChapterPicker` below it. */
function GuideChapterList({ activeSegment }: { activeSegment?: string }) {
  const t = useTranslations('gatewayNav');
  return (
    <ul className="flex flex-col gap-0.5">
      {GUIDE_PAGES.map((page) => {
        const active = page.segment === activeSegment;
        return (
          <li key={page.segment}>
            <Link
              href={`/guide/${page.segment}`}
              aria-current={active ? 'page' : undefined}
              data-testid={`guide-nav-${page.segment}`}
              className={controlClass({
                shape: 'row',
                size: 'sm',
                tone: active ? 'default' : 'muted',
                className: cn(
                  'block leading-body',
                  active
                    ? 'bg-[color:var(--color-elevated)]'
                    : 'hover:bg-[color:var(--color-elevated)] hover:text-[color:var(--color-text-primary)]',
                ),
              })}
            >
              {t(`guidePages.${page.titleKey}`)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Prev/next at a chapter's end, with no arrow glyphs: the eyebrow and alignment carry direction (`label-decoration` gate). */
function GuidePager({ activeSegment }: { activeSegment?: string }) {
  const t = useTranslations('gatewayNav');
  const segment = activeSegment ?? GUIDE_ENTRY_PAGE.segment;
  const index = GUIDE_PAGES.findIndex((page) => page.segment === segment);
  if (index === -1) return null;
  const prev = GUIDE_PAGES[index - 1] ?? null;
  const next = GUIDE_PAGES[index + 1] ?? null;
  if (!prev && !next) return null;
  return (
    <nav
      aria-label={t('guidePagerLabel')}
      data-testid="guide-pager"
      className="mt-12 flex w-full max-w-[var(--measure-prose)] items-stretch gap-3 border-t border-[color:var(--color-divider)] pt-4"
    >
      {prev ? (
        <GuidePagerLink page={prev} eyebrow={t('guidePrev')} edge="start" testId="guide-pager-prev" />
      ) : (
        <span aria-hidden className="flex-1" />
      )}
      {next ? (
        <GuidePagerLink page={next} eyebrow={t('guideNext')} edge="end" testId="guide-pager-next" />
      ) : (
        <span aria-hidden className="flex-1" />
      )}
    </nav>
  );
}

function GuidePagerLink({
  page,
  eyebrow,
  edge,
  testId,
}: {
  page: GuidePage;
  eyebrow: string;
  edge: 'start' | 'end';
  testId: string;
}) {
  const t = useTranslations('gatewayNav');
  return (
    <Link
      href={`/guide/${page.segment}`}
      data-testid={testId}
      className={controlClass({
        shape: 'card',
        className: cn(
          'flex-1 flex-col gap-1 rounded-card border-[color:var(--color-border-soft)] px-4 py-3 hover:border-[color:var(--color-indigo-a46)] hover:bg-[color:var(--color-indigo-a06)]',
          edge === 'end' ? 'items-end text-right' : 'items-start text-left',
        ),
      })}
    >
      <span className="text-label text-[color:var(--color-text-quaternary)]">{eyebrow}</span>
      <span className="text-body-lg text-[color:var(--color-text-primary)] [word-break:keep-all]">
        {t(`guidePages.${page.titleKey}`)}
      </span>
    </Link>
  );
}

/**
 * The guide's left table of contents, sticky so the next chapter stays in reach while scrolling.
 * The current chapter is marked by surface, not colour.
 */
function GuideSidebar({ activeSegment }: { activeSegment?: string }) {
  const t = useTranslations('gatewayNav');
  return (
    <nav
      aria-label={t('guideNavLabel')}
      data-testid="guide-sidebar"
      className="hidden w-full max-w-[15rem] justify-self-start xl:block"
    >
      <div className="sticky top-24">
        <p className="mb-3 px-2.5 text-label leading-label font-[var(--font-weight-signature)] tracking-wide text-[color:var(--color-text-quaternary)] uppercase">
          {t('onThisGuide')}
        </p>
        <GuideChapterList activeSegment={activeSegment} />
      </div>
    </nav>
  );
}

/**
 * The table of contents below `xl`: a disclosure under the title, so phone readers can move
 * between chapters without scrolling past an open list. The closed line states which chapter of
 * how many; its chevron indicates state, which `.claude/rules/design.md` allows.
 */
function GuideChapterPicker({ activeSegment }: { activeSegment?: string }) {
  const t = useTranslations('gatewayNav');
  const index = GUIDE_PAGES.findIndex((page) => page.segment === activeSegment);
  const current = index >= 0 ? GUIDE_PAGES[index] : GUIDE_PAGES[0];
  return (
    <details
      data-testid="guide-chapter-picker"
      className="group mt-6 w-full max-w-[var(--measure-prose)] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] xl:hidden"
    >
      <summary
        data-testid="guide-chapter-picker-summary"
        className="flex min-h-11 list-none items-center gap-2 px-3 py-2 text-body leading-body text-[color:var(--color-text-secondary)] [&::-webkit-details-marker]:hidden"
      >
        <ChevronRight
          size={ICON_SIZE.sm}
          aria-hidden
          className="shrink-0 transition-transform group-open:rotate-90"
        />
        <span className="font-mono text-label uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
          {t('onThisGuide')}
        </span>
        <span className="min-w-0 truncate text-[color:var(--color-text-primary)]">
          {t(`guidePages.${current.titleKey}`)}
        </span>
        <span className="ms-auto shrink-0 font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]">
          {`${Math.max(index, 0) + 1}/${GUIDE_PAGES.length}`}
        </span>
      </summary>
      <nav aria-label={t('guideNavLabel')} className="border-t border-[color:var(--color-divider)] p-2">
        <GuideChapterList activeSegment={activeSegment} />
      </nav>
    </details>
  );
}

/**
 * The changelog's entry list, date first. Anchors, not routes: the changelog is one flow, and
 * `<a href="#…">` gives back, shareable addresses and no-JS behaviour for free.
 */
function EntrySidebar({ entries }: { entries: DocEntry[] }) {
  const t = useTranslations('gatewayNav');
  if (entries.length === 0) return null;
  return (
    <nav
      aria-label={t('entryNavLabel')}
      data-testid="entry-sidebar"
      className="hidden w-full max-w-[15rem] justify-self-start xl:block"
    >
      <div className="sticky top-24 max-h-[calc(100svh-9rem)] overflow-y-auto pr-1">
        <p className="mb-3 px-2.5 text-label leading-label font-[var(--font-weight-signature)] tracking-wide text-[color:var(--color-text-quaternary)] uppercase">
          {t('entryNavLabel')}
        </p>
        <ul lang="en" className="flex flex-col gap-0.5">
          {entries.map((entry) => (
            <li key={entry.id}>
              <a
                href={`#${entry.id}`}
                data-testid={`entry-nav-${entry.id}`}
                className={controlClass({ shape: "row", size: "sm", className: "block hover:bg-[color:var(--color-elevated)]" })}
              >
                {entry.date ? (
                  <span className="block font-mono text-label leading-label text-[color:var(--color-text-quaternary)]">
                    {entry.date}
                  </span>
                ) : null}
                {/* Titles clamp to two lines, so one near-sentence title cannot eat half the list. */}
                <span className="line-clamp-2 text-body leading-body text-[color:var(--color-text-tertiary)]">
                  {entry.title}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/**
 * The prose map plus `h2` anchor ids taken verbatim from the list's function. `scroll-mt` clears
 * the sticky top bar, or an anchored heading would hide behind it.
 */
function proseComponentsWithAnchors(headingIds: Map<string, string>): Components {
  return {
    ...PROSE_COMPONENTS,
    h2: ({ children, ...rest }) => (
      <h2
        id={headingIds.get(normalizeHeadingKey(flattenText(children)))}
        className="mt-12 mb-3 scroll-mt-24 text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
        {...rest}
      >
        {children}
      </h2>
    ),
  };
}

/** The plain text of ReactMarkdown children, for id matching. */
function flattenText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return flattenText((node as { props?: { children?: React.ReactNode } }).props?.children);
  }
  return '';
}
