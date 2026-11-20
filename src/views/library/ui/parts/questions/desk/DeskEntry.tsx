'use client';

import { useMemo, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BookOpen, BookText, FileText } from 'lucide-react';

import type { LibrarySourceRow, VaultDoc } from '@/entities/docs-vault';
import { formatSourceBytes } from '@/entities/docs-vault';
import { answerObservation, newestDeskQuestions, recentDeskPages } from '@/features/library';
import { RowButton } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { StateBadge } from '../../index-column/StateBadge';

const SAVED_ROWS = 3;
const RECENT_ROWS = 5;
const ORIGINAL_ROWS = 3;

function formatDay(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

function EntryRow({ glyph, title, meta, trailing = null, onPress, testId }: {
  glyph: ReactNode;
  title: string;
  meta: ReactNode;
  trailing?: ReactNode;
  onPress: () => void;
  testId: string;
}) {
  return <li>
    <RowButton size="lg" tone="muted" hoverInk="strong" hoverSurface="lift" className="w-full justify-start gap-3"
      onClick={onPress} data-testid={testId}>
      <span className="flex-none text-[color:var(--color-text-tertiary)]">{glyph}</span>
      <span className="min-w-0 flex-1 space-y-1 text-left">
        <span className="block truncate text-body-lg leading-body-lg text-[color:var(--color-text-primary)]">{title}</span>
        <span className="flex min-w-0 items-center gap-2 text-label leading-label text-[color:var(--color-text-tertiary)]">{meta}</span>
      </span>
      {trailing ? <span className="flex-none text-label leading-label text-[color:var(--color-text-tertiary)]">{trailing}</span> : null}
    </RowButton>
  </li>;
}

function EntrySection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section aria-labelledby={`${id}-title`} data-testid={id} className="mt-7 first:mt-0">
    <h3 id={`${id}-title`} className="mb-2 text-body font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]">{title}</h3>
    <ul className="divide-y divide-[color:var(--color-border-soft)]">{children}</ul>
  </section>;
}

/**
 * What the person can return to before a question: their saved questions, then the pages written
 * most recently. Only a folder with neither falls back to its first three sources.
 */
export function DeskEntry({ docs, listingVersion, sources, hashes, onOpenWiki, onOpenSource }: {
  docs: readonly VaultDoc[];
  /** Changes whenever a page or source is added, removed or rewritten; the lists recompute only then. */
  listingVersion: string;
  sources: readonly LibrarySourceRow[];
  hashes: ReadonlyMap<string, string>;
  onOpenWiki: (slug: string) => void;
  onOpenSource: (path: string) => void;
}) {
  const t = useTranslations('library');
  const locale = useLocale();
  /* eslint-disable react-hooks/exhaustive-deps -- `listingVersion` stands for `docs`: a new array of the same files must not re-scan a large wiki. */
  const saved = useMemo(() => newestDeskQuestions(docs, SAVED_ROWS), [listingVersion]);
  const recent = useMemo(() => recentDeskPages(docs, RECENT_ROWS), [listingVersion]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const known = useMemo(() => new Set(sources.map((source) => source.path)), [sources]);
  const originals = useMemo(() => saved.length || recent.length ? []
    : [...sources].sort((a, b) => a.path.localeCompare(b.path)).slice(0, ORIGINAL_ROWS), [recent.length, saved.length, sources]);

  if (!saved.length && !recent.length) {
    return <div data-testid="question-desk-entry">
      <p className="text-reading leading-prose text-[color:var(--color-text-secondary)]">{t('questionDesk.intro')}</p>
      {originals.length ? <section className="mt-7 border-t border-[color:var(--color-border-soft)] pt-5" data-testid="question-desk-originals" aria-labelledby="question-desk-originals-title">
        <h3 id="question-desk-originals-title" className="mb-3 text-body font-[var(--font-weight-strong)] leading-body">{t('questionDesk.originalsTitle')}</h3>
        <ul className="divide-y divide-[color:var(--color-border-soft)]">
          {originals.map((source) => <EntryRow key={source.path} testId={`question-desk-original-${source.path}`}
            glyph={<FileText size={ICON_SIZE.lg} aria-hidden />} title={source.name} trailing={t('questionDesk.readOriginal')}
            meta={t('questionDesk.originalMeta', { format: source.format.toUpperCase() || 'FILE', size: formatSourceBytes(source.bytes), pages: source.citedBy.length })}
            onPress={() => onOpenSource(source.path)} />)}
        </ul>
        {sources.length > originals.length ? <p className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('questionDesk.otherOriginals', { count: sources.length - originals.length })}</p> : null}
      </section> : null}
    </div>;
  }

  return <div data-testid="question-desk-entry">
    {saved.length ? <EntrySection id="question-desk-saved" title={t('answers.title')}>
      {saved.map(({ head, savedAt }) => {
        const state = answerObservation(head.frontmatter, known, hashes).state;
        return <EntryRow key={head.slug} testId={`question-desk-saved-${head.slug}`}
          glyph={<BookOpen size={ICON_SIZE.lg} aria-hidden />} title={head.title}
          meta={<>
            {state === 'changed' || state === 'missing' ? <StateBadge tone="warning">{t(`answers.state.${state}`)}</StateBadge> : null}
            <span className="truncate">{formatDay(savedAt, locale)}</span>
          </>}
          onPress={() => onOpenWiki(head.slug)} />;
      })}
    </EntrySection> : null}
    {recent.length ? <EntrySection id="question-desk-recent" title={t('questionDesk.recentTitle')}>
      {recent.map((page) => <EntryRow key={page.slug} testId={`question-desk-recent-${page.slug}`}
        glyph={<BookText size={ICON_SIZE.lg} aria-hidden />} title={page.title}
        meta={<span className="truncate">{t('questionDesk.recentMeta', { date: formatDay(page.updatedAt, locale), count: page.sources })}</span>}
        onPress={() => onOpenWiki(page.slug)} />)}
    </EntrySection> : null}
  </div>;
}
