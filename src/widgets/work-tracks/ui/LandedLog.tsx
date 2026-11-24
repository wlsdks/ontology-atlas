'use client';

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import type { LandedChange } from '@/shared/lib/work-status/tauri-work-status';
import { MOTION, STAGGER } from '@/shared/motion';
import { landedDays, landedWithin, readSubject, type LandedDay } from '../model/landed-change';
import { timeAgo } from '../model/format';

/** Rows that settle in one after another on the first reading; later rows arrive alone. */
const STAGGERED_ROWS = 12;
/** A change of this many changed lines fills its bar; the bar grows with the logarithm below it. */
const FULL_BAR_LINES = 4000;

export function landedRowId(hash: string): string {
  return `work-landed-${hash.slice(0, 12)}`;
}

/** The time of day alone: the day heading above already names the date. */
function hourOf(epochMs: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(epochMs);
}

function barShare(lines: number): number {
  return lines <= 0 ? 0 : Math.min(1, Math.log10(lines + 1) / Math.log10(FULL_BAR_LINES + 1));
}

/** How much a change moved: a bar as long as the logarithm of its lines, its added share drawn brighter. */
function ChurnBar({ insertions, deletions }: { insertions: number; deletions: number }) {
  const total = insertions + deletions;
  const share = barShare(total);
  return (
    <span aria-hidden className="relative hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)] sm:block">
      <span className="absolute inset-y-0 left-0 flex overflow-hidden rounded-full" style={{ width: `${share * 100}%` }}>
        <span className="h-full bg-[color:var(--color-text-secondary)]" style={{ width: `${total ? (insertions / total) * 100 : 0}%` }} />
        <span className="h-full flex-1 bg-[color:var(--color-text-quaternary)]" />
      </span>
    </span>
  );
}

function DayHeading({ day, locale }: { day: LandedDay; locale: string }) {
  const t = useTranslations('workStatus.landed');
  const label = day.daysAgo === 0
    ? t('today')
    : day.daysAgo === 1
      ? t('yesterday')
      : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', weekday: 'short' }).format(day.atMs);
  return (
    <div className="flex items-baseline gap-2 pb-2 pl-7">
      <h3 className="text-label leading-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">{label}</h3>
      <span className="text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">{t('dayCount', { count: day.changes.length })}</span>
    </div>
  );
}

/**
 * What the base branch took in, newest first and grouped by day, on the rail every room's screen
 * ends at: the record of finished work, read from Git, so it stays after its worktree is removed.
 * A row opens the change beside the building; pressing it again closes it.
 */
export function LandedLog({ changes, baseBranch, nowMs, selectedHash, onSelect, panelId }: {
  changes: readonly LandedChange[] | null;
  baseBranch: string;
  nowMs: number;
  selectedHash: string | null;
  onSelect: (hash: string) => void;
  panelId: string;
}) {
  const t = useTranslations('workStatus.landed');
  const locale = useLocale();
  const days = useMemo(() => (changes ? landedDays(changes, nowMs) : []), [changes, nowMs]);
  if (changes === null) return null;
  const today = landedWithin(changes, nowMs, 1);
  const week = landedWithin(changes, nowMs, 7);
  let row = 0;
  return (
    <section data-testid="work-landed" aria-labelledby="work-landed-title" className="px-10 pb-12 pt-8">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-[color:var(--color-border-soft)] pt-6">
        <div className="min-w-0">
          <h2 id="work-landed-title" className="text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {t.rich('title', { branch: baseBranch, code: chunks => <code className="font-mono">{chunks}</code> })}
          </h2>
          <p className="mt-1 text-body leading-body text-[color:var(--color-text-tertiary)]">{t('note')}</p>
        </div>
        {changes.length > 0 ? (
          <p className="shrink-0 text-body leading-body tabular-nums text-[color:var(--color-text-tertiary)]" data-testid="work-landed-summary">
            {t('summary', { today, week })}
          </p>
        ) : null}
      </header>
      {changes.length === 0 ? (
        <p className="mt-6 text-body leading-body text-[color:var(--color-text-tertiary)]">{t('none', { branch: baseBranch })}</p>
      ) : (
        <div className="mt-6 grid gap-x-10 gap-y-6 2xl:grid-cols-2">
          {days.map(day => (
            <div key={day.key} className="min-w-0">
              <DayHeading day={day} locale={locale} />
              <ol className="relative">
                {/* The base branch's rail runs through the day; each change is a stop on it. */}
                <i aria-hidden className="absolute bottom-3 left-[0.6875rem] top-3 w-px bg-[color:var(--color-border-strong)]" />
                <AnimatePresence initial={false}>
                  {day.changes.map(change => {
                    const index = row++;
                    const read = readSubject(change.subject);
                    const pressed = selectedHash === change.hash;
                    const lines = (change.insertions ?? 0) + (change.deletions ?? 0);
                    return (
                      <motion.li
                        key={change.hash}
                        layout="position"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0, transition: { ...MOTION.settle, delay: index < STAGGERED_ROWS ? index * STAGGER : 0 } }}
                        exit={{ opacity: 0 }}
                      >
                        <button
                          type="button"
                          id={landedRowId(change.hash)}
                          data-testid="work-landed-row"
                          aria-expanded={pressed}
                          aria-controls={panelId}
                          onClick={() => onSelect(change.hash)}
                          className={cn(
                            'group relative flex w-full min-w-0 items-center gap-3 rounded-chip py-1.5 pl-7 pr-2 text-left',
                            'hover:bg-[color:var(--color-overlay-2)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
                            pressed && 'bg-[color:var(--color-overlay-3)]',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'absolute left-[0.4375rem] top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-[color:var(--color-text-tertiary)] bg-[color:var(--color-canvas)] transition-colors',
                              change.merge ? '' : 'bg-[color:var(--color-text-tertiary)]',
                              (pressed || index === 0) && 'border-[color:var(--color-text-primary)]',
                              pressed && 'bg-[color:var(--color-text-primary)]',
                            )}
                          />
                          {read.kind ? (
                            <span className="w-14 shrink-0 truncate rounded-micro border border-[color:var(--color-border-soft)] px-1 text-center text-label leading-label text-[color:var(--color-text-tertiary)]">
                              {t(`kind.${read.kind}`)}
                            </span>
                          ) : null}
                          <span className={cn('min-w-0 flex-1 truncate text-body leading-body', pressed ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)] group-hover:text-[color:var(--color-text-primary)]')}>
                            {read.title}
                          </span>
                          {read.pullRequest !== null ? (
                            <span className="hidden shrink-0 font-mono text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)] md:inline">#{read.pullRequest}</span>
                          ) : null}
                          {change.files !== null ? (
                            <span className="hidden shrink-0 text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)] lg:inline">{t('files', { count: change.files })}</span>
                          ) : null}
                          <ChurnBar insertions={change.insertions ?? 0} deletions={change.deletions ?? 0} />
                          <span className="w-16 shrink-0 text-right text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">
                            {change.at === null ? '' : day.daysAgo === 0 ? timeAgo(change.at, nowMs, locale) : hourOf(change.at * 1000, locale)}
                          </span>
                          <span className="sr-only">{lines > 0 ? t('linesSr', { insertions: change.insertions ?? 0, deletions: change.deletions ?? 0 }) : ''}</span>
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
