'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { GatewayNav, GatewayReadingLinks } from '@/widgets/gateway-chrome';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { ChevronRight } from 'lucide-react';
import { GithubMark } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import {
  extractEntries,
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
 * **One page of gateway reading material** — `/guide` and `/changelog` share this view.
 *
 * This is where someone reads who wants to judge before downloading. The gateway itself has to
 * earn trust in five seconds, so its sentences are short, and until this page there was nowhere
 * for anyone who wanted more.
 *
 * **Why "like a blog" is the right call for prose.** The map, the docs surface, and the editor are
 * **work surfaces** — dense, with a lot of chrome. This is a **reading surface**, so three things
 * change:
 *
 * 1. **65–75 characters per line** (`--measure-prose`). The workbench's full-width column makes the
 *    eye lose the first character of the next line in prose.
 * 2. **`leading-prose` for the body** — the pair for text a person wrote (`.claude/rules/design.md`
 *    「행간도 크기의 짝이다」, line height is the pair of size). UI text's tight leading is
 *    suffocating in a paragraph.
 * 3. **Large gaps between sections** — this is read in order rather than scanned, so rhythm carries
 *    the hierarchy in place of a table of contents.
 *
 * The palette is unchanged: neutrals plus a single indigo. "Pretty like a blog" does not open a new
 * colour or a gradient — the charter applies to this surface too.
 */
export interface GatewayDocPageProps {
  /** Vault slug — `GUIDE` or `CHANGELOG`. */
  slug: string;
  /** The screen title, used instead of the vault document's `# H1` because it must be translated. */
  title: string;
  /**
   * One line under the title. **Not drawn when absent.**
   *
   * The guide's subtitle introduces the guide **as a whole**, so repeating it on every chapter makes
   * it ink competing with each chapter's own title — it is given only on the first chapter.
   */
  lead?: string;
  /**
   * How many `## ` sections to draw; the whole document when omitted.
   *
   * Given only for documents that keep growing, such as CHANGELOG — the guide is read whole and must
   * not be truncated.
   */
  recentSectionLimit?: number;
  /** The source file's repo-relative path — used for "the rest is here" when truncated. */
  sourcePath: string;
  /**
   * One line of notice above the body. **Not drawn when absent.**
   *
   * Its only caller today is the guide's unknown-segment fallback: static export makes 404 routing
   * limited, so the first chapter is drawn instead, and **not saying that a substitution happened**
   * turns it into a misdelivery pretending to be that address's document (measured in a 2026-08-14
   * walkthrough). The page passes the translated string — this view does not know the locale.
   */
  notice?: string;
  /**
   * Whether to draw the table of contents on the left — true only for documents that are **several
   * chapters as one set**, such as the guide.
   *
   * The changelog is a single page, so it has no table of contents. A list with one item is ink,
   * not a guide.
   */
  sidebar?: boolean;
  /** Which chapter is current in the table of contents — used only when `sidebar` is true. */
  activeSegment?: string;
  /**
   * Whether to draw **this document's own `## ` entries** on the left (for the changelog).
   *
   * A different thing from the guide's `sidebar`: that one lists **several documents** while this
   * lists entries **inside one document**, so its links are anchors rather than routes. Folding both
   * into one flag would make "table of contents" mean two things.
   */
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

  const { body, omittedSections } = useMemo(() => {
    const raw = readVaultDoc(slug);
    if (raw === null) return { body: '', omittedSections: 0 };
    /*
     * Strip the vault document's leading `# H1` — the screen title already occupies that slot, and a
     * translated title standing beside the original says the same thing twice.
     */
    const withoutH1 = raw.replace(/^#\s+.*(\r?\n)+/, '');
    /*
     * Strip the changelog's (entryNav) leading blockquote too — it is meta addressed to repository
     * contributors about how to use this file, and the screen's lead already says the same thing in
     * the user's language (measured 2026-08-13: the first paragraph of the KO page was an English
     * maintenance note). The trailing `---` rule is part of the same chunk. With no blockquote,
     * nothing is stripped.
     */
    const withoutPreamble = entryNav
      ? withoutH1.replace(/^(?:>.*(?:\r?\n)+)+(?:---(?:\r?\n)+)?/, '')
      : withoutH1;
    /*
     * The folded-section count is the sum of two truncations — at bundle time (the full text was too
     * large, so only the gateway-changelog.json preview shipped) and at screen time
     * (`recentSectionLimit`). Without adding the bundle side it would say "showing 12, folded 4" when
     * more than 200 were actually folded.
     */
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

  /**
   * The entry list and the body headings get their ids from **the same function** — two places
   * generating them means a slightly different rule silently sends the anchor nowhere.
   */
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
       * **A reading page centres its prose column** (2026-07-31, owner: *"왼쪽에 다 몰려있고"* —
       * everything is bunched on the left).
       *
       * ⚠️ At first this applied the gateway's "every element on one x" verdict (2026-07-29 ③) and
       * left-aligned to the origin (200). **That was applying the rule outside its range.** That
       * verdict exists because the gateway has **a map on the right** and the panel must not cover
       * it — this page has nothing on the right. With the rule kept and its reason gone, the same
       * rule produces **a page skewed to one side with 1053px empty** at 1920.
       *
       * ⚠️⚠️ `mx-auto` was once a **rejected pattern** (verdict ③). The rejection was not "centring
       * is bad" but **that it creates a second origin** — the wrapper centres against the viewport
       * while the map camera's reserve width stands against a token, and on wide screens the two
       * diverged. **This page has no camera.** With no second consumer to compete, that reason does
       * not hold. Recorded here so the next auditor does not read `mx-auto` alone as "it came back".
       *
       * The chrome (top bar) still uses the origin — that frame is shared by every gateway surface,
       * and a logo standing at a different x per page would be worse.
       */}
      <main
        className={cn(
          PAGE_GUTTER,
          'w-full flex-1 pt-10 md:pt-16',
          /*
           * Bottom reserve — below `lg` there is a tab bar and this page is a scrolling document.
           * The previous `pb-20` (80px) happened to fit only because the last ink was the end of the
           * body; once the reading-material row was placed at the bottom it had **23px of slack** and
           * was occluded by the tab bar (caught by `scroll-end-gap` at 390×844).
           *
           * Written as an unconditional base plus an `lg:` override — a `max-lg:` variant can appear
           * before other variants in the stylesheet and silently lose (`.claude/rules/design.md`, the
           * CSS-order trap).
           */
          'pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] lg:pb-20',
        )}
      >
        <div className={cn(PAGE_COLUMN, 'mx-auto')}>
          {/*
           * Two columns only when there is a table of contents; otherwise one centred column.
           *
           * ⚠️ The table of contents **folds below `lg`**. Keeping the sidebar at narrow widths lets
           * the list take width from the prose column, so what someone came to read becomes unreadable.
           * The chrome's "guide" chip stands in for the folded slot — the way back to the guide
           * survives without the list.
           */}
          <div
            className={cn(
              sidebar || entryNav
                ? 'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_15rem] lg:gap-12'
                : 'flex flex-col items-center',
            )}
          >
            {sidebar ? <GuideSidebar activeSegment={activeSegment} /> : null}
            {entryNav ? <EntrySidebar entries={entries} /> : null}
            <div className="flex min-w-0 flex-col items-center">
          {/*
           * The notice stands **before** the title — that this screen is not the document for the
           * requested address is something to know before reading the title. Same panel grammar as
           * the truncation notice (`gateway-doc-truncated`): panel surface plus tertiary text.
           */}
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
               * The top of the ramp (`--text-hero-lg`, 34px) — the same step as the gateway headline.
               * These pages are gateway surfaces too and this line is their headline, so it belongs
               * at the same step. No new step was created (a size outside the ramp is silently
               * dropped without registration in `TYPE_RAMP_STEPS` in `cn.ts`).
               *
               * The line height is that size's **pair** (`--leading-hero-lg`, 38px). The previously
               * used `leading-display-tight` (1.06) is for names and figures, and gave 23px text a
               * 24.4px line — suffocating for a page title.
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
          </header>

          {sidebar ? <GuideChapterPicker activeSegment={activeSegment} /> : null}

          <article
            data-testid="gateway-doc-body"
            className="mt-10 w-full max-w-[var(--measure-prose)]"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {body}
            </ReactMarkdown>
          </article>

          {/*
           * The two reading destinations the chrome folds at narrow widths belong here. These two
           * routes have no footer, so getting from the guide to the changelog (or back) was zero
           * paths at 390.
           */}
          {/*
           * Prev/next at the end of a chapter — thirteen ordered chapters, yet where the body ended
           * there were zero paths to the next one (measured 2026-08-13: someone who finished reading
           * had to go back to the table of contents on the left and find the chapter they had just
           * read). The order's single source is `GUIDE_PAGES`. The changelog (no sidebar) is not a
           * chapter, so it has none.
           */}
          {sidebar ? <GuidePager activeSegment={activeSegment} /> : null}

          <GatewayReadingLinks className="mt-12 w-full max-w-[var(--measure-prose)]" />

          {/*
           * When truncated, say **how many were hidden and where to read the rest**. Silent
           * truncation is the same as saying "this is all of it".
           */}
          {omittedSections > 0 ? (
            <aside
              data-testid="gateway-doc-truncated"
              className="mt-12 w-full max-w-[var(--measure-prose)] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4"
            >
              <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">
                {t('truncatedNote', { count: omittedSections })}
              </p>
              <a
                href={`${GITHUB_REPO_URL}/blob/main/${sourcePath}`}
                target="_blank"
                rel="noreferrer noopener"
                className={controlClass({ shape: "link", tone: "secondary", className: "mt-3 gap-2 text-body leading-body underline underline-offset-2 decoration-[color:var(--color-indigo-line-a32)] hover:decoration-[color:var(--color-indigo-accent)]" })}
              >
                <GithubMark size={13} aria-hidden />
                {t('readFullSource')}
              </a>
            </aside>
          ) : null}
            </div>
            {/*
             * **The empty column on the right** — the same width as the sidebar (15rem).
             *
             * Without it the body column takes everything right of the sidebar, and centring inside
             * that still leaves it **pushed right relative to the screen**. Left-aligning instead
             * produces the skew the owner pointed out twice (measured at 1894: body 480–1150, 744px
             * empty on the right).
             *
             * Reserving a slot of the same width on the right puts the centre column at the true
             * centre of the page column, and since the page column is itself `mx-auto` the result is
             * **the true centre of the screen**. The sidebar then floats in that text's left margin,
             * which is right: a table of contents guides, it does not compete with the body for width.
             *
             * It gets neither `aria-hidden` nor a `role` — an empty grid cell puts nothing into the
             * accessibility tree in the first place.
             */}
            {sidebar || entryNav ? <div className="hidden lg:block" /> : null}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * The prose component map.
 *
 * **Deliberately not shared** with the docs viewer (`widgets/docs-vault`) — that one carries work-surface
 * machinery (search highlighting, wikilinks, vault-internal anchors) that is all dead weight on this
 * surface. They use the same ramp tokens, so the visual grain is already one set.
 */
/** Segments that exist as guide chapters — the test separating a slug from a route. */
const GUIDE_SEGMENTS = new Set(GUIDE_PAGES.map((page) => page.segment));

/**
 * Resolves a prose link's `href` to **the real address for this locale**.
 *
 * The markdown source does not know the locale — one copy serves both `/ko` and `/en`, so writing
 * `/ko/…` into the source would drag an English reader into Korean. Attaching the locale is
 * therefore **the screen's job**.
 *
 * ⚠️ **Internal links in guide bodies point only at guide chapters.** Resolving links to vault
 * documents as `?slug=` here was tried and reverted: a web visitor who has not chosen a vault sees
 * the **sample vault (112 documents)**, while the documents the guide pointed at exist only in the
 * dogfood vault (153). Those addresses become a silent dead end that **returns 200 and opens
 * nothing** — harder to notice than a 404. Vault documents are sent to GitHub instead. That
 * discipline is held by `tests/contract/guide-inbody-links.contract.test.ts`.
 */
function resolveProseHref(href: string, locale: string): string {
  if (!href.startsWith('/')) return href;
  const path = href.split('?')[0];
  const segment = /^\/guide\/([^/]+)\/?$/.exec(path)?.[1];
  if (segment && GUIDE_SEGMENTS.has(segment)) return `/${locale}/guide/${segment}`;
  // The contract above blocks root-absolute links that are not guide chapters. If one still leaks
  // through, only the locale is attached so the 404 happens *inside that locale* — a 404 that lost
  // its locale fell to the English screen, hiding which journey had broken.
  return `/${locale}${path}`;
}

/**
 * Body links — **a root-absolute link is a vault slug, and it is resolved to a route here.**
 *
 * ## Why (usability audit, 2026-08-07)
 *
 * The `href` used to be put straight onto the `<a>`. Guide bodies are markdown, and the internal
 * links written there have **no locale prefix** — `[지도 읽는 법](/guide/reading-the-map)` — because
 * one copy of the markdown serves both `/ko` and `/en` and the locale cannot be baked into the
 * source. So the address being clicked became `/guide/…`, and no such route exists.
 *
 * Measured: **all 34** internal body links across the guide's 13 chapters were 404s (11 distinct
 * targets, both `/ko` and `/en`, both dev and static export). The landing screen was an English 404
 * in the middle of a Korean journey, and its primary button was "Find by project search" — useless
 * to a first-time visitor with no vault.
 *
 * **Why it went unnoticed**: the table of contents on the same screen (`GuideSidebar`) used `Link`
 * from the start. Links that got a locale and links that did not coexisted on one screen, and the
 * one people mostly clicked was the working one.
 *
 * ## Why `<a>` + `useLocale()` rather than `Link`
 *
 * Using `Link` here was blocked by three gates at once — the anchor adoption ratchet (hand anchors
 * bypassing the value layer, 0 → 1), the tag inventory (`Link 17 → 18`), and `prose-link` usage
 * (6 → 5). This repository's rule is **"a link inside prose is prose, not a control"**
 * (`.claude/rules/design.md`, `prose-link.contract`), and those contracts require a prose link to be
 * an `<a>` carrying `.prose-link`. So the tag stays and **only the address** is resolved.
 *
 * `docs:links` cannot see this class of defect in principle — that check asks whether the **target
 * a document points at exists**, resolving it as a **vault slug** (which is why `/ONTOLOGY-QUALITY`
 * passed). It never opens the route. That layer is split between
 * `tests/contract/guide-inbody-links.contract.test.ts` (where the source points) and
 * `tests/e2e/guide-inbody-links.spec.ts` (whether it really returns 200).
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
  // A wide table scrolls horizontally **inside its own box**, not in the page body — a body that
  // flows horizontally ruins the line length of every paragraph.
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

/**
 * The guide's table of contents on the left.
 *
 * **Why `sticky`.** The guide is read while scrolling, and a table of contents that scrolls away
 * forces anyone heading for the next chapter to scroll back up. If the list's job is to guide, it
 * has to stay visible while the path is being walked.
 *
 * **The current chapter is marked by surface, not colour** — the same grammar as the chrome's
 * reading chips: a filled surface plus strong text. That is how "you are here" is said within
 * neutrals, without opening a new colour.
 */
/**
 * The guide's chapter list — **one copy shared by two widths.**
 *
 * At `lg` and above the left table of contents (`GuideSidebar`) calls this; below that, the
 * disclosure under the title (`GuideChapterPicker`) does. Writing the list twice means only one side
 * grows when a chapter is added.
 */
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

/**
 * Prev/next at the end of a chapter. No arrow glyphs — direction is already stated by the
 * "previous chapter / next chapter" eyebrow and by the alignment (left/right), and an arrow at the
 * end of a label is decoration by the charter (the `label-decoration` gate).
 */
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

function GuideSidebar({ activeSegment }: { activeSegment?: string }) {
  const t = useTranslations('gatewayNav');
  return (
    <nav
      aria-label={t('guideNavLabel')}
      data-testid="guide-sidebar"
      className="hidden lg:block"
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
 * The table of contents below `lg` — a disclosure directly under the title.
 *
 * ## Why it is needed (measured 2026-08-07)
 *
 * At this width there used to be **no table of contents anywhere**. Two code comments promised a
 * substitute and **neither was true**:
 *
 * | What the comment said | Reality |
 * |---|---|
 * | *"the chrome's guide chip stands in for the folded slot"* | that chip also folds below `sm` — zero at 390 |
 * | *"these two meet again in the footer when you scroll"* | the gateway footer has zero links at any width |
 *
 * On top of that `/guide` draws **chapter 1**, not an index — pressing the chip to go back finds no
 * list there either. Result: visible guide-chapter links numbered **1 at 768 and 0 at 390**, so for
 * someone who opened a chapter from a link on their phone the 13 chapters were **13 dead ends with
 * no path between them**. Two of those chapters are "connect an agent" and "CLI", so what was
 * blocked was not reading material but **the path to attaching an agent**.
 *
 * ## Why a disclosure (`<details>`)
 *
 * Leaving the list open at narrow widths takes not width but **the first screen** from the prose
 * column — someone who came to read has to scroll past a table of contents first. A closed
 * disclosure is one line, and that line also states **which chapter of how many** this is. The
 * chevron is an exception to the decorative-arrow ban (`.claude/rules/design.md`: indicating an
 * expanded state is information).
 */
function GuideChapterPicker({ activeSegment }: { activeSegment?: string }) {
  const t = useTranslations('gatewayNav');
  const index = GUIDE_PAGES.findIndex((page) => page.segment === activeSegment);
  const current = index >= 0 ? GUIDE_PAGES[index] : GUIDE_PAGES[0];
  return (
    <details
      data-testid="guide-chapter-picker"
      className="group mt-6 w-full max-w-[var(--measure-prose)] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] lg:hidden"
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
 * The changelog's entry list on the left — the date leads and the title follows.
 *
 * **Why anchors rather than routes.** The guide's chapters are separate pieces of writing, so
 * separate addresses are right. The changelog is **one flow**, normally read straight down, and
 * carving an address per entry would mean opening a new page every time to see "what came next".
 * The list exists for **skipping**, not for splitting.
 *
 * **Why the links are `<a href="#…">`.** The browser already does anchors well — back undoes them,
 * copying the address points at that entry, and it works without JS. Moving the scroll by hand means
 * rebuilding all three.
 */
function EntrySidebar({ entries }: { entries: DocEntry[] }) {
  const t = useTranslations('gatewayNav');
  if (entries.length === 0) return null;
  return (
    <nav aria-label={t('entryNavLabel')} data-testid="entry-sidebar" className="hidden lg:block">
      <div className="sticky top-24 max-h-[calc(100svh-9rem)] overflow-y-auto pr-1">
        <p className="mb-3 px-2.5 text-label leading-label font-[var(--font-weight-signature)] tracking-wide text-[color:var(--color-text-quaternary)] uppercase">
          {t('entryNavLabel')}
        </p>
        <ul className="flex flex-col gap-0.5">
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
                {/*
                 * Titles are clamped to two lines — this repository's changelog titles run close to
                 * a full sentence, and unclamped a single entry eats half the list. The whole
                 * sentence is at the destination.
                 */}
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
 * The prose component map, **plus anchor ids on `h2`**.
 *
 * The body has to own the place the list points at. The ids are taken verbatim from the same
 * function the list used — recomputing them here would create a second source of truth the moment
 * it happens.
 *
 * `scroll-mt` covers the sticky chrome (top bar) height — without it a heading reached by anchor
 * hides behind the bar and reads as "nothing moved".
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

/** Concatenates only the plain text out of the children ReactMarkdown passes (for id matching). */
function flattenText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return flattenText((node as { props?: { children?: React.ReactNode } }).props?.children);
  }
  return '';
}
