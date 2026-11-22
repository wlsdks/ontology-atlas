'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Track } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { MOTION, MOTION_EASE } from '@/shared/motion';
import { Button, Dialog } from '@/shared/ui';
import { timeAgo } from '../model/format';
import styles from './rooms.module.css';

const CRATE_LIMIT = 8;
const CRATE_DROP_PX = 26;
const EASE_CSS = `cubic-bezier(${MOTION_EASE.join(', ')})`;

type ShelfList = 'merged' | 'untouched';

/** A crate set down on the shelf: it drops from above the shelf's edge as its count goes up. */
function landCrate(element: HTMLElement | null) {
  if (!element || element.dataset.landed) return;
  element.dataset.landed = 'true';
  if (element.dataset.fresh !== 'true') return;
  element.animate(
    [{ opacity: 0, transform: `translateY(-${CRATE_DROP_PX}px)` }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: MOTION.slow.duration * 2000, easing: EASE_CSS, fill: 'backwards' },
  );
}

function Crates({ count, old, freshFrom }: { count: number; old?: boolean; freshFrom: number }) {
  return (
    <span aria-hidden className={styles.crates} data-old={old ?? false}>
      {Array.from({ length: Math.min(count, CRATE_LIMIT) }, (_, index) => (
        <i key={index} ref={landCrate} data-fresh={index >= freshFrom} />
      ))}
    </span>
  );
}

/**
 * The shelf under the building: a crate for each worktree merged into the base branch and a dusty
 * one for each nobody touched for a week. Pressing a count opens the list in a centred dialog.
 */
export function RoomShelf({ merged, untouched, baseBranch, nowMs, inline }: {
  merged: readonly Track[];
  untouched: readonly Track[];
  baseBranch: string;
  nowMs: number;
  inline: boolean;
}) {
  const t = useTranslations('workStatus');
  const locale = useLocale();
  const titleId = useId();
  const [open, setOpen] = useState<ShelfList | null>(null);
  // Crates already on the shelf when it is first drawn arrive with it; only later ones drop in.
  const [seen, setSeen] = useState({ count: merged.length, freshFrom: merged.length });
  if (merged.length !== seen.count) setSeen({ count: merged.length, freshFrom: Math.min(seen.count, merged.length) });
  const freshFrom = merged.length !== seen.count ? Math.min(seen.count, merged.length) : seen.freshFrom;
  const list = open === 'merged' ? merged : open === 'untouched' ? untouched : [];
  const countButton = 'gap-1.5 tabular-nums';
  return (
    <>
      <div className={cn(styles.shelf, 'h-full w-full')} data-inline={inline} data-testid="work-room-shelf">
        <Crates count={merged.length} freshFrom={freshFrom} />
        <Button size="sm" variant="ghost" className={countButton} data-testid="work-shelf-merged" onClick={() => setOpen('merged')} disabled={merged.length === 0}>
          <span className="text-[color:var(--color-text-tertiary)]">{t('shelf.merged', { branch: baseBranch })}</span>
          <strong className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{merged.length}</strong>
        </Button>
        {untouched.length > 0 ? (
          <>
            <Crates count={untouched.length} old freshFrom={CRATE_LIMIT} />
            <Button size="sm" variant="ghost" className={countButton} data-testid="work-shelf-untouched" onClick={() => setOpen('untouched')}>
              <span className="text-[color:var(--color-text-tertiary)]">{t('shelf.untouched')}</span>
              <strong className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{untouched.length}</strong>
            </Button>
          </>
        ) : null}
      </div>
      <Dialog open={open !== null} onClose={() => setOpen(null)} labelledBy={titleId} size="sm" testId="work-shelf-list">
        <h2 id={titleId} className="text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
          {open === 'untouched' ? t('shelf.untouchedList', { count: list.length }) : t('shelf.mergedList', { count: list.length, branch: baseBranch })}
        </h2>
        <ul className="atlas-scroll-quiet mt-4 flex max-h-[min(60vh,28rem)] flex-col overflow-y-auto">
          {list.map(track => (
            <li key={track.key} className="flex h-8 items-center gap-3 px-2.5 text-body leading-body">
              <span className="min-w-0 flex-1 truncate font-mono font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" title={track.path}>
                {track.branch ?? track.title}
              </span>
              {track.lastCommitAt !== null ? (
                <span className="shrink-0 text-label text-[color:var(--color-text-quaternary)]">
                  {t('shelf.lastCommit', { ago: timeAgo(track.lastCommitAt, nowMs, locale) })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={() => setOpen(null)}>{t('shelf.close')}</Button>
        </div>
      </Dialog>
    </>
  );
}
