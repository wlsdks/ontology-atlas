'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { fieldClass } from '@/shared/ui/control-class';
import { MOTION } from "@/shared/motion";
import { Link } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  Clock,
  ExternalLink,
  FileText,
  Hash,
  Pin,
  Search,
  Terminal,
  X,
} from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { buildDocsVaultHref, type VaultDoc } from '@/entities/docs-vault';
import { IconButton, LiveAnnouncer, controlClass } from '@/shared/ui';
import { searchDocs, type DocsSearchMatch } from '../lib/search';
import type { DocsBodyIndex } from '../lib/body-index';
import { githubBlobUrl } from '../lib/resolve-doc-link';
import type { VaultCommand } from '../model/command';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';

// Canonical document shortcuts offered when title, tag, excerpt and body all return
// zero. These gateway documents live outside the vault (in the repo), so they open as
// GitHub blob external links — reusing the same handling as DocsVaultViewer's
// vault-external links (resolve-doc-link.githubBlobUrl).
const CANONICAL_DOC_LINKS: Array<{ labelKey: string; repoPath: string }> = [
  { labelKey: 'canonicalMcp', repoPath: 'mcp/README.md' },
  { labelKey: 'canonicalCli', repoPath: 'cli/README.md' },
  { labelKey: 'canonicalReadme', repoPath: 'README.md' },
];

interface Props {
  onClose: () => void;
  docs: VaultDoc[];
  recentSlugs: string[];
  pinnedSlugs: string[];
  commands: VaultCommand[];
  tagCounts: Array<{ tag: string; count: number }>;
  /** Document selection handler. The second argument, query, is for match highlighting. */
  onDocSelect: (slug: string, query?: string) => void;
  /** Tag selection handler — applied to the tree filter immediately. */
  onTagSelect: (tag: string) => void;
  /** The initial query — `> ` (commands) / `#` (tags) / '' (default). */
  initialQuery?: string;
  getDocHref?: (slug: string) => string;
  /** The body search index (`use-docs-body-index`). Without it the body tier is off. */
  bodyIndex?: DocsBodyIndex;
  /** Whether the body index is still building — adds a "coming shortly" hint to the zero-result notice. */
  bodyIndexing?: boolean;
}

// The option id a combobox's aria-activedescendant points at — the listbox option li
// and the input's active descendant are bound by the same rule so a screen reader
// reads the active item on arrow-key movement (the WAI-ARIA combobox pattern).
const PALETTE_LISTBOX_ID = 'docs-vault-palette-listbox';
const paletteOptionId = (idx: number) => `docs-vault-palette-option-${idx}`;

type ResultKind = 'doc' | 'command' | 'tag';

interface PaletteRow {
  kind: ResultKind;
  key: string;
  label: React.ReactNode;
  hint?: string;
  /** Supporting text shown on the right — shortcut, slug or count. */
  meta?: string;
  /** A second line below the label — a body hit snippet, for instance. */
  sub?: React.ReactNode;
  icon: React.ReactNode;
  onRun: () => void;
}

function Highlight({
  text,
  hit,
}: {
  text: string;
  hit: { start: number; end: number } | null;
}) {
  if (!hit) return <>{text}</>;
  return (
    <>
      {text.slice(0, hit.start)}
      <mark className="rounded-micro bg-[color:var(--color-indigo-line-a22)] px-0.5 text-[color:var(--color-search-mark-text)]">
        {text.slice(hit.start, hit.end)}
      </mark>
      {text.slice(hit.end)}
    </>
  );
}

/**
 * The unified palette — VSCode/Spotlight convention plus Obsidian's multi-section.
 *
 *  - empty query: three sections, pinned → recent → suggested commands
 *  - starts with `>`: fuzzy command matching
 *  - starts with `#`: tag matching
 *  - a plain query: mixed search over document title/slug/tags/excerpt (plus
 *    well-matching commands)
 *
 * This one palette replaced the previous three (SearchPalette for full text,
 * QuickSwitcher for titles, CommandPalette for commands).
 */
export function DocsVaultUnifiedPalette({
  onClose,
  docs,
  recentSlugs,
  pinnedSlugs,
  commands,
  tagCounts,
  onDocSelect,
  onTagSelect,
  initialQuery = '',
  getDocHref = (slug) => buildDocsVaultHref({ slug }),
  bodyIndex,
  bodyIndexing = false,
}: Props) {
  const t = useTranslations('vaultWidgets.palette');
  const locale = useLocale();
  const [query, setQuery] = useState(initialQuery);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const bySlug = useMemo(() => {
    const m = new Map<string, VaultDoc>();
    for (const d of docs) m.set(d.slug, d);
    return m;
  }, [docs]);

  // On mount, focus the input, put the caret after the prefix, and restore focus to
  // the trigger on unmount. The same a11y pattern as the other modals (SearchPalette /
  // ProjectDrawer / DocsQuickDrawer / ShortcutSheet) — a keyboard user opening with ⌘K
  // and closing with Esc returns to the element they were working in.
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const handle = requestAnimationFrame(() => {
      inputRef.current?.focus();
      // With a `> ` prefix injected, put the caret after it.
      const ql = initialQuery.length;
      inputRef.current?.setSelectionRange(ql, ql);
    });
    return () => {
      cancelAnimationFrame(handle);
      previousFocusRef.current?.focus?.();
    };
  }, [initialQuery]);

  // Scroll the list to follow activeIdx.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // ─ Build results ─────────────────────────────────────────────────────
  const { rows, sections } = useMemo(() => {
    const trimmed = query.trim();
    const mode: 'commands' | 'tags' | 'mixed' | 'empty' =
      trimmed.startsWith('>')
        ? 'commands'
        : trimmed.startsWith('#')
          ? 'tags'
          : trimmed === ''
            ? 'empty'
            : 'mixed';

    const out: PaletteRow[] = [];
    const sections: Array<{ title: string; icon: React.ReactNode; size: number }> = [];

    if (mode === 'empty') {
      // Pinned
      const pinnedRows: PaletteRow[] = [];
      for (const slug of pinnedSlugs) {
        const d = bySlug.get(slug);
        if (!d) continue;
        pinnedRows.push({
          kind: 'doc',
          key: `pin:${slug}`,
          label: d.title,
          icon: (
            <Pin
              size={ICON_SIZE.sm}
              className="text-[color:var(--color-amber-docs-a85)]"
              aria-hidden
              fill="currentColor"
            />
          ),
          meta: slug,
          onRun: () => onDocSelect(slug),
        });
      }
      if (pinnedRows.length > 0) {
        sections.push({ title: t('secPinned'), icon: <Pin size={ICON_SIZE.sm} aria-hidden />, size: pinnedRows.length });
        out.push(...pinnedRows);
      }
      // Recent
      const recentRows: PaletteRow[] = [];
      for (const slug of recentSlugs) {
        if (pinnedSlugs.includes(slug)) continue;
        const d = bySlug.get(slug);
        if (!d) continue;
        recentRows.push({
          kind: 'doc',
          key: `rec:${slug}`,
          label: d.title,
          icon: (
            <Clock
              size={ICON_SIZE.sm}
              className="text-[color:var(--color-text-quaternary)]"
              aria-hidden
            />
          ),
          meta: slug,
          onRun: () => onDocSelect(slug),
        });
      }
      if (recentRows.length > 0) {
        sections.push({ title: t('secRecent'), icon: <Clock size={ICON_SIZE.sm} aria-hidden />, size: recentRows.length });
        out.push(...recentRows);
      }
      // Suggested commands (top 5 visible)
      const cmdRows: PaletteRow[] = commands
        .filter((c) => c.visible !== false)
        .slice(0, 5)
        .map((c) => ({
          kind: 'command' as const,
          key: `cmd:${c.id}`,
          label: c.label,
          icon: (
            <span
              aria-hidden
              className="flex h-4 w-4 items-center justify-center"
            >
              {c.icon}
            </span>
          ),
          meta: c.shortcut,
          onRun: () => void c.onRun(),
        }));
      if (cmdRows.length > 0) {
        sections.push({
          title: t('secCommonCommands'),
          icon: <Terminal size={ICON_SIZE.sm} aria-hidden />,
          size: cmdRows.length,
        });
        out.push(...cmdRows);
      }
      return { rows: out, sections };
    }

    if (mode === 'commands') {
      const q = trimmed.slice(1).trim().toLowerCase();
      const cmdRows: PaletteRow[] = commands
        .filter((c) => c.visible !== false)
        .filter((c) => !q || c.label.toLowerCase().includes(q))
        .slice(0, 30)
        .map((c) => {
          const idx = q ? c.label.toLowerCase().indexOf(q) : -1;
          const hit = idx >= 0 ? { start: idx, end: idx + q.length } : null;
          return {
            kind: 'command' as const,
            key: `cmd:${c.id}`,
            label: <Highlight text={c.label} hit={hit} />,
            icon: (
              <span
                aria-hidden
                className="flex h-4 w-4 items-center justify-center"
              >
                {c.icon}
              </span>
            ),
            meta: c.shortcut,
            onRun: () => void c.onRun(),
          };
        });
      if (cmdRows.length > 0) {
        sections.push({
          title: t('secCommands'),
          icon: <Terminal size={ICON_SIZE.sm} aria-hidden />,
          size: cmdRows.length,
        });
        out.push(...cmdRows);
      }
      return { rows: out, sections };
    }

    if (mode === 'tags') {
      const q = trimmed.slice(1).trim().toLowerCase();
      const tagRows: PaletteRow[] = tagCounts
        .filter((tagItem) => !q || tagItem.tag.toLowerCase().includes(q))
        .slice(0, 20)
        .map((tagItem) => {
          const idx = q ? tagItem.tag.toLowerCase().indexOf(q) : -1;
          const hit = idx >= 0 ? { start: idx, end: idx + q.length } : null;
          return {
            kind: 'tag' as const,
            key: `tag:${tagItem.tag}`,
            label: <Highlight text={`#${tagItem.tag}`} hit={hit ? { start: hit.start + 1, end: hit.end + 1 } : null} />,
            icon: (
              <Hash
                size={ICON_SIZE.sm}
                className="text-[color:var(--color-text-quaternary)]"
                aria-hidden
              />
            ),
            meta: t('tagMeta', { count: tagItem.count }),
            onRun: () => onTagSelect(tagItem.tag),
          };
        });
      if (tagRows.length > 0) {
        sections.push({
          title: t('secTags'),
          icon: <Hash size={ICON_SIZE.sm} aria-hidden />,
          size: tagRows.length,
        });
        out.push(...tagRows);
      }
      return { rows: out, sections };
    }

    // Mixed mode — documents first, commands as support. With a bodyIndex, search the
    // body tier too (a title hit is always above it — the lowest-tier score contract in search.ts).
    const docMatches: DocsSearchMatch[] = searchDocs(trimmed, docs, 15, bodyIndex);
    const docRows: PaletteRow[] = docMatches.map((m) => {
      // Draw the name in the screen's language — the same rule as the map popover. If
      // the display name differs from the canonical title the highlight offsets are
      // wrong, so that row alone drops the emphasis: the right name matters more.
      const displayTitle = resolveLocaleDisplayName(m.doc.frontmatter, locale, m.doc.title);
      const sameAsTitle = displayTitle === m.doc.title;
      return {
      kind: 'doc' as const,
      key: `doc:${m.doc.slug}`,
      label: sameAsTitle ? <Highlight text={m.doc.title} hit={m.titleHit} /> : displayTitle,
      // Body hit snippet — not shown on a row whose title already shows the match.
      sub:
        m.bodyHit && !m.titleHit ? (
          <Highlight text={m.bodyHit.text} hit={m.bodyHit.hit} />
        ) : undefined,
      icon: (
        <FileText
          size={ICON_SIZE.sm}
          className="text-[color:var(--color-text-quaternary)]"
          aria-hidden
        />
      ),
      meta: m.doc.slug,
      onRun: () => onDocSelect(m.doc.slug, trimmed),
      };
    });
    if (docRows.length > 0) {
      sections.push({
        title: t('secDocs'),
        icon: <FileText size={ICON_SIZE.sm} aria-hidden />,
        size: docRows.length,
      });
      out.push(...docRows);
    }
    // Commands with a partial match are shown after (up to 5).
    const qLc = trimmed.toLowerCase();
    const cmdMatches = commands
      .filter((c) => c.visible !== false)
      .filter((c) => c.label.toLowerCase().includes(qLc))
      .slice(0, 5);
    if (cmdMatches.length > 0) {
      sections.push({
        title: t('secCommands'),
        icon: <Terminal size={ICON_SIZE.sm} aria-hidden />,
        size: cmdMatches.length,
      });
      out.push(
        ...cmdMatches.map((c) => {
          const idx = c.label.toLowerCase().indexOf(qLc);
          const hit = idx >= 0 ? { start: idx, end: idx + qLc.length } : null;
          return {
            kind: 'command' as const,
            key: `cmd:${c.id}`,
            label: <Highlight text={c.label} hit={hit} />,
            icon: (
              <span
                aria-hidden
                className="flex h-4 w-4 items-center justify-center"
              >
                {c.icon}
              </span>
            ),
            meta: c.shortcut,
            onRun: () => void c.onRun(),
          };
        }),
      );
    }
    return { rows: out, sections };
  }, [
    query,
    commands,
    docs,
    bodyIndex,
    bySlug,
    pinnedSlugs,
    recentSlugs,
    tagCounts,
    onDocSelect,
    onTagSelect,
    locale,
    t,
  ]);

    // Per-section start indices — where to insert headers at render time.
  const sectionOffsets = useMemo(() => {
    const offsets = new Map<number, { title: string; icon: React.ReactNode }>();
    let offset = 0;
    for (const s of sections) {
      offsets.set(offset, { title: s.title, icon: s.icon });
      offset += s.size;
    }
    return offsets;
  }, [sections]);

  // Announce the result count to screen readers only while a query is present
  // (standard combobox practice). aria-activedescendant alone does not convey "how
  // many results", so a polite live region announces the 0/N change while typing. The
  // empty query (the default recent/pinned view) stays silent to avoid noise on first open.
  const resultAnnouncement =
    query.trim() === ''
      ? ''
      : rows.length === 0
        ? t('noMatches')
        : t('resultsAnnounce', { count: rows.length });

  // The extended notice (how far the search reached, plus canonical document
  // shortcuts) appears only on zero results in document (mixed) mode. While the body
  // index is still building, a "may be filled in shortly" hint is added. Zero results
  // in command (`>`) and tag (`#`) modes are served well enough by the existing noMatches.
  const trimmedQuery = query.trim();
  const isDocSearchZero =
    trimmedQuery !== '' &&
    !trimmedQuery.startsWith('>') &&
    !trimmedQuery.startsWith('#') &&
    rows.length === 0;

  const handleQueryChange = (next: string) => {
    setQuery(next);
    setActiveIdx(0);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rows.length === 0) return;
      setActiveIdx((i) => (i + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length === 0) return;
      setActiveIdx((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[activeIdx];
      if (!row) return;
      row.onRun();
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      // Tab cycles the prefix — '' → '>' → '#' → ''
      e.preventDefault();
      const t = query.trim();
      if (t.startsWith('>')) setQuery('#');
      else if (t.startsWith('#')) setQuery('');
      else setQuery('> ');
      setActiveIdx(0);
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;
        const len = input.value.length;
        input.setSelectionRange(len, len);
      });
    }
  };

  return (
    <motion.div
      key="unified-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={MOTION.fast}
      className="fixed inset-0 z-50 flex items-start justify-center bg-[color:var(--color-scrim-a50)] p-4 pt-[12vh]"
      onClick={onClose}
    >
      <motion.div
        key="unified-palette"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
      // 0.14 with an unnamed easing curve → the ramp's "movement" step (2026-07-28).
        transition={MOTION.base}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('dialogAriaLabel')}
        className="w-full max-w-[560px] overflow-hidden rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-surface-deep-a98)] shadow-[var(--shadow-elevation-2)]"
      >
        <div className="flex items-center gap-2 border-b border-[color:var(--color-overlay-2)] px-3 py-2">
          <Search
            size={ICON_SIZE.md}
            className="text-[color:var(--color-text-quaternary)]"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('inputPlaceholder')}
            aria-label={t('inputAriaLabel')}
            role="combobox"
            aria-expanded
            aria-controls={PALETTE_LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              rows.length > 0 ? paletteOptionId(activeIdx) : undefined
            }
            className={fieldClass({ frame: "bare", className: "min-w-0 flex-1" })}
          />
          <IconButton
            label={t('closeAriaLabel')}
            size="sm"
            tone="muted"
            onClick={onClose}
            className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            <X size={ICON_SIZE.sm} />
          </IconButton>
        </div>
        <ul
          ref={listRef}
          id={PALETTE_LISTBOX_ID}
          className="max-h-[56vh] overflow-auto py-1"
          role="listbox"
        >
          {rows.length === 0 ? (
            isDocSearchZero ? (
              <li className="px-3 py-6">
                <p className="text-body text-[color:var(--color-text-secondary)]">
                  {t('noBodySearchTitle')}
                </p>
                <p className="mt-1 text-caption text-[color:var(--color-text-tertiary)]">
                  {t('noBodySearchHint')}
                </p>
                {bodyIndexing ? (
                  <p className="mt-1 text-caption text-[color:var(--color-text-quaternary)]">
                    {t('bodyIndexingNotice')}
                  </p>
                ) : null}
                <p className="mt-4 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
                  {t('canonicalDocsLabel')}
                </p>
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {CANONICAL_DOC_LINKS.map((link) => (
                    <li key={link.repoPath}>
                      <a
                        href={githubBlobUrl(link.repoPath)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={controlClass({ shape: "link", className: "gap-1.5 rounded-micro py-1 text-[color:var(--color-indigo-line-a90)] underline underline-offset-2 decoration-[color:var(--color-indigo-line-a32)] hover:decoration-[color:var(--color-indigo-accent)]" })}
                      >
                        <FileText size={ICON_SIZE.sm} aria-hidden />
                        {t(link.labelKey)}
                        <ExternalLink size={ICON_SIZE.sm} className="opacity-60" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ) : (
              <li className="px-3 py-8 text-center text-body text-[color:var(--color-text-tertiary)]">
                {t('noMatches')}
              </li>
            )
          ) : (
            rows.map((row, idx) => {
              const active = idx === activeIdx;
              const sectionHeader = sectionOffsets.get(idx);
              return (
                <Fragment key={row.key}>
                  {sectionHeader ? (
                    <li
                      key={`h-${sectionHeader.title}`}
                      className="mb-0.5 mt-1.5 flex items-center gap-1.5 px-3 pb-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]"
                    >
                      {sectionHeader.icon}
                      {sectionHeader.title}
                    </li>
                  ) : null}
                  <li
                    key={row.key}
                    id={paletteOptionId(idx)}
                    data-idx={idx}
                    role="option"
                    aria-selected={active}
                  >
                    <ResultRow
                      row={row}
                      active={active}
                      onHover={() => setActiveIdx(idx)}
                      onClose={onClose}
                      getDocHref={getDocHref}
                    />
                  </li>
                </Fragment>
              );
            })
          )}
        </ul>
        <LiveAnnouncer message={resultAnnouncement} />
        <div className="flex items-center gap-3 border-t border-[color:var(--color-overlay-2)] px-3 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
          <span>
            <kbd className="rounded-micro border border-[color:var(--color-divider)] px-1">
              ↑↓
            </kbd>{' '}
            {t('footerMove')}
          </span>
          <span>
            <kbd className="rounded-micro border border-[color:var(--color-divider)] px-1">
              ↵
            </kbd>{' '}
            {t('footerRun')}
          </span>
          <span>
            <kbd className="rounded-micro border border-[color:var(--color-divider)] px-1">
              Tab
            </kbd>{' '}
            {t('footerSwitch')}
          </span>
          <span>
            <kbd className="rounded-micro border border-[color:var(--color-divider)] px-1">
              Esc
            </kbd>{' '}
            {t('footerClose')}
          </span>
          <span className="ml-auto opacity-80">{t('footerLegend')}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ResultRow({
  row,
  active,
  onHover,
  onClose,
  getDocHref,
}: {
  row: PaletteRow;
  active: boolean;
  onHover: () => void;
  onClose: () => void;
  getDocHref: (slug: string) => string;
}) {
  // The same row renders as <Link> for a document and <button> otherwise — both must
  // pass through the same value layer so row heights do not diverge inside the palette.
  const base = controlClass({
    shape: 'row',
    active,
    className:
      'group relative hover:bg-[color:var(--color-overlay-1)]',
  });
  const inner = (
    <>
      {active ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full bg-[color:var(--color-indigo-accent)]"
        />
      ) : null}
      <span className="flex h-5 w-5 flex-none items-center justify-center text-[color:var(--color-text-quaternary)]">
        {row.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-[color:var(--color-text-primary)]">
          {row.label}
        </span>
        {row.sub ? (
          <span className="block truncate text-caption text-[color:var(--color-text-tertiary)]">
            {row.sub}
          </span>
        ) : null}
      </span>
      {row.meta ? (
        <span className="truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
          {row.meta}
        </span>
      ) : null}
    </>
  );
  // Document rows render as Link — new-tab capable plus prefetch.
  if (row.kind === 'doc' && typeof row.meta === 'string') {
    return (
      <Link
        href={getDocHref(row.meta)}
        className={base}
        onMouseEnter={onHover}
        onClick={(e) => {
  // Modifier clicks (⌘ click and friends) keep Link's default behaviour (new tab);
  // only a plain click runs the internal handler and closes the palette.
          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          row.onRun();
          onClose();
        }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={() => {
        row.onRun();
        onClose();
      }}
      className={controlClass({
        shape: 'row',
        active,
        className:
          'group relative hover:bg-[color:var(--color-overlay-1)]',
      })}
    >
      {inner}
    </button>
  );
}
