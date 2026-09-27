'use client';

import { AlertTriangle, Folder, HardDrive, KeyRound, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import { computeEditAge } from '@/shared/lib/edit-age';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { MOTION } from '@/shared/motion';
import {
  buildRecentVaultRows,
  canOpenReachability,
  partitionRecentVaultRows,
  type RecentVaultReachability,
  type RecentVaultRow,
} from '../lib/recent-vault-row';
import { useRecentVaultReachability } from '../model/use-recent-vault-reachability';
import { MissingFolderGroup, type MissingFolderReviewMode } from './MissingFolderGroup';

/**
 * The known folders, each stating what it holds and whether it opens. One component for the
 * launch chooser and the rail switcher, so both answer "which folder is which" the same way.
 */
export function RecentVaultList({
  records,
  currentKey,
  busy,
  onOpen,
  onForget,
  onForgetAll,
  onLocate,
  emphasis = false,
  scroll = 'contained',
  missingReview = 'dialog',
  footnote,
  className,
}: {
  records: ReadonlyArray<LocalFsHandleRecord>;
  /** Key of the folder the last session had open, so one row can be marked as such. */
  currentKey: string | null;
  busy: boolean;
  onOpen: (record: LocalFsHandleRecord) => void;
  onForget: (record: LocalFsHandleRecord) => void;
  /** Forgets several folders in one write, so the list redraws once. */
  onForgetAll?: (records: readonly LocalFsHandleRecord[]) => void;
  /** Opens the folder picker, so a row that cannot be pressed is still not a dead end. */
  onLocate?: () => void;
  /** The chooser's one accent stroke; the rail switcher leaves it off. */
  emphasis?: boolean;
  /** The viewport chooser fills its allocated space; popovers retain their compact cap. */
  scroll?: 'page' | 'contained' | 'viewport';
  /**
   * How the folders that are gone are reviewed: in a dialog on a page (the default), in place in
   * a popover that grows downward. `MissingFolderReviewMode` says why the two differ.
   */
  missingReview?: MissingFolderReviewMode;
  /** A line under the list, drawn with it so it never jumps down when the list appears. */
  footnote?: ReactNode;
  className?: string;
}) {
  const t = useTranslations('vaultSwitch');
  const reachability = useRecentVaultReachability(records);
  /*
   * One clock for the whole list, taken at mount: per-row reads disagree at ladder boundaries,
   * and a read during render is impure (`react-hooks/purity`).
   */
  const [nowMs] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement | null>(null);
  /* After the last missing folder is forgotten, focus lands on the list's first control. */
  const refocusAfterForget = useRef(false);
  const rows = reachability ? buildRecentVaultRows({ records, reachability, currentKey }) : [];
  const { listed, missing } = partitionRecentVaultRows(rows);
  useEffect(() => {
    if (!refocusAfterForget.current) return;
    refocusAfterForget.current = false;
    if (missing.length > 0) return;
    listRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus({ preventScroll: true });
  }, [missing.length]);
  const forgetMissing = useCallback(
    (record: LocalFsHandleRecord) => {
      refocusAfterForget.current = true;
      onForget(record);
    },
    [onForget],
  );
  const forgetAllMissing = useCallback(
    (all: readonly LocalFsHandleRecord[]) => {
      refocusAfterForget.current = true;
      if (onForgetAll) onForgetAll(all);
      else for (const record of all) onForget(record);
    },
    [onForget, onForgetAll],
  );

  /* Nothing is drawn until the probe answers, so the first frame is the real shape. */
  if (!reachability || rows.length === 0) return null;
  const wide = scroll !== 'contained';

  return (
    <>
      <div
        ref={listRef}
        data-testid="recent-vault-list"
        className={cn(
          'grid border bg-[color:var(--color-panel)]',
          scroll !== 'contained' ? 'rounded-card' : 'rounded-chip',
          scroll === 'contained' && 'max-h-[var(--recent-vault-list-max-h)] overflow-y-auto overscroll-contain',
          scroll === 'viewport' && 'min-h-0 auto-rows-max overflow-y-auto overscroll-contain',
          emphasis
            ? 'border-[color:var(--color-indigo-line-a32)]'
            : 'border-[color:var(--color-border-soft)]',
          className,
        )}
      >
        {listed.map((row, index) => (
          <RecentVaultRowView
            key={row.key}
            row={row}
            nowMs={nowMs}
            busy={busy}
            divided={index > 0}
            wrapName={wide}
            onOpen={onOpen}
            onForget={onForget}
            onLocate={onLocate}
            t={t}
          />
        ))}
        {/*
          Mounted with no missing folders too: it then draws nothing in the list, and its review
          dialog can still leave through its exit after the last one is forgotten.
        */}
        <MissingFolderGroup
          rows={missing}
          wide={wide}
          divided={listed.length > 0}
          busy={busy}
          nowMs={nowMs}
          review={missingReview}
          onForget={forgetMissing}
          onForgetAll={forgetAllMissing}
          onLocate={onLocate}
          t={t}
        />
      </div>
      {footnote}
    </>
  );
}

/** The caution each unreachable or gesture-requiring state owes the person before a press. */
function noticeFor(
  state: RecentVaultReachability,
  t: ReturnType<typeof useTranslations>,
): { text: string; Icon: typeof AlertTriangle; danger: boolean } | null {
  switch (state) {
    case 'missing':
      return { text: t('state.missing'), Icon: AlertTriangle, danger: true };
    case 'blocked':
      return { text: t('state.blocked'), Icon: AlertTriangle, danger: true };
    case 'needs-permission':
      return { text: t('state.needsPermission'), Icon: KeyRound, danger: false };
    case 'unknown':
      return { text: t('state.unknown'), Icon: Search, danger: false };
    case 'ready':
      return null;
  }
}

function RecentVaultRowView({
  row,
  nowMs,
  busy,
  divided,
  wrapName,
  onOpen,
  onForget,
  onLocate,
  t,
}: {
  row: RecentVaultRow;
  nowMs: number;
  busy: boolean;
  divided: boolean;
  wrapName: boolean;
  onOpen: (record: LocalFsHandleRecord) => void;
  onForget: (record: LocalFsHandleRecord) => void;
  onLocate?: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const reducedMotion = useReducedMotion();
  const age = computeEditAge(row.lastAccessedAt, nowMs);
  const openedLabel = t('openedAgo', { when: t(`age.${age.key}`, { count: age.count }) });
  const contents = row.counts
    ? t('contents', {
        docs: row.counts.docCount,
        concepts: row.counts.conceptCount,
      })
    : t('contentsUncounted');
  /*
   * The count carries its own age: `openRecent` writes `lastAccessedAt` before loading, so a
   * refused folder can show old counts beside "opened just now". Shown only when the ages differ.
   */
  const countedAge = row.counts ? computeEditAge(row.counts.countedAt, nowMs) : null;
  const countedLabel =
    countedAge && countedAge.key !== age.key
      ? t('countedAgo', { when: t(`age.${countedAge.key}`, { count: countedAge.count }) })
      : null;
  const notice = noticeFor(row.reachability, t);
  const openable = canOpenReachability(row.reachability);
  const compactNotice = wrapName && !openable;
  /* The accessible name carries the facts, or a screen reader hears only the bare name. */
  const openAriaLabel = [
    t('openFolder', { name: row.name }),
    row.path,
    contents,
    countedLabel,
    openedLabel,
    notice?.text,
  ]
    .filter(Boolean)
    .join(' · ');

  const body = (
    <>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-chip',
          wrapName ? 'h-8 w-8' : 'h-7 w-7',
          wrapName
            ? openable
              ? 'bg-[color:var(--color-indigo-a08)] text-[color:var(--color-indigo-text-soft)]'
              : 'text-[color:var(--color-text-tertiary)]'
            : notice?.danger
            ? 'border-[color:var(--color-danger-a32)] text-[color:var(--color-danger-text)]'
            : 'border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]',
          !wrapName && 'border',
        )}
      >
        {wrapName ? <Folder size={ICON_SIZE.md} aria-hidden /> : <HardDrive size={ICON_SIZE.sm} aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span data-testid="recent-vault-name" className={cn("min-w-0 text-[color:var(--color-text-primary)]", wrapName ? "break-all text-body-lg font-[var(--font-weight-emphasis)]" : "truncate text-body font-[var(--font-weight-signature)]")}>
            {row.name}
          </span>
          {row.isCurrent ? (
            <span className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
              {t('lastOpenBadge')}
            </span>
          ) : null}
          {/* The compact "Open" wears the chip face; it is a label, hidden from the accessibility tree. */}
          {openable ? (
            <span
              aria-hidden={wrapName ? undefined : true}
              className={
                wrapName
                  ? 'ml-auto shrink-0 text-label text-[color:var(--color-text-tertiary)]'
                  : controlClass({
                      shape: 'chip',
                      size: 'xs',
                      tone: 'muted',
                      className: 'pointer-events-none ml-auto shrink-0 justify-center rounded-micro',
                    })
              }
            >
              {t('open')}
            </span>
          ) : null}
        </span>
        {/* What is inside, and when it was last open - the two facts a name cannot carry. */}
        <span className="mt-0.5 block truncate text-label leading-body text-[color:var(--color-text-tertiary)]">
          <span className="tabular-nums">{contents}</span>
          {countedLabel ? (
            <>
              {' '}
              <span className="tabular-nums text-[color:var(--color-text-quaternary)]">
                ({countedLabel})
              </span>
            </>
          ) : null}
          {' · '}
          <span className="tabular-nums">{openedLabel}</span>
        </span>
        {row.path ? (
          <span title={row.path} className={cn('mt-1 block text-label text-[color:var(--color-text-tertiary)]', wrapName ? 'truncate' : 'break-words font-mono leading-body')}>
            {row.path}
          </span>
        ) : null}
        {notice ? (
          <span
            data-testid={`recent-vault-notice-${row.reachability}`}
            title={compactNotice ? notice.text : undefined}
            className={cn(
              'mt-1 flex items-start gap-1.5 text-label leading-body',
              compactNotice
                ? 'text-[color:var(--color-text-secondary)]'
                : notice.danger
                ? 'text-[color:var(--color-danger-text)]'
                : 'text-[color:var(--color-amber-source-text-a85)]',
            )}
          >
            <notice.Icon size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0" />
            <span className="min-w-0">{compactNotice ? t(`state.${row.reachability}Short`) : notice.text}</span>
          </span>
        ) : null}
      </span>
    </>
  );

  // The wrapper draws the divider; repeating it here doubles the hairline.
  const rowClass = cn(
    'grid min-w-0 gap-3',
    wrapName
      ? 'w-full grid-cols-[32px_minmax(0,1fr)] items-center px-4 py-4 sm:w-auto sm:flex-1'
      : 'grid-cols-[28px_1fr] px-3 py-2.5',
    // Space kept clear for the action chip laid over the top-right corner. The token binds
    // the reserve to the chip's promoted touch width so the two cannot drift apart.
    !wrapName && (!row.isCurrent || !openable) && 'pr-[var(--recent-vault-action-reserve)]',
  );

  return (
    <motion.div
      layout={wrapName && !reducedMotion ? 'position' : false}
      initial={false}
      transition={MOTION.settle}
      data-testid="recent-vault-row"
      data-reachability={row.reachability}
      data-current={row.isCurrent ? 'true' : 'false'}
      className={cn('relative', wrapName && 'flex min-w-0 flex-wrap items-center gap-x-2 pr-4', divided && 'border-t border-[color:var(--color-border-soft)]')}
    >
      {openable ? (
        <button
          type="button"
          data-testid="recent-vault-open"
          onClick={() => onOpen(row.record)}
          disabled={busy}
          aria-label={openAriaLabel}
          // Hover comes from the axis; the hover-axis ratchet only lets hand hovers fall.
          className={controlClass({
            shape: 'row',
            stacked: true,
            hoverSurface: 'lift',
            className: cn(rowClass, 'border-0'),
          })}
        >
          {body}
        </button>
      ) : (
        /* A folder that cannot be opened is not a button; the row states why and offers forget. */
        <div className={rowClass}>{body}</div>
      )}
      {!openable && onLocate ? (
        <div className={wrapName ? 'mb-3 ml-15 flex shrink-0 sm:mb-0 sm:ml-0' : 'flex justify-start px-3 pb-2.5 pl-[52px]'}>
          <button
            type="button"
            data-testid="recent-vault-locate"
            onClick={onLocate}
            disabled={busy}
            aria-label={[t('locateFolder', { name: row.name }), row.path]
              .filter(Boolean)
              .join(' · ')}
            /* `shape: 'chip'` carries only the height half of the touch floor; 44 is the floor. */
            className={controlClass({
              shape: 'chip',
              size: wrapName ? 'md' : 'xs',
              tone: 'secondary',
              className: 'atlas-touch-floor-wide justify-center rounded-micro',
            })}
          >
            {t('locate')}
          </button>
        </div>
      ) : null}
      {/* No forget on the current folder; laid over the corner so rows keep equal height, clear of the name via the row's action reserve. */}
      {row.isCurrent && openable ? null : (
      <div className={wrapName ? 'mb-3 flex shrink-0 sm:mb-0' : 'absolute right-2 top-2'}>
        <button
          type="button"
          data-testid="recent-vault-forget"
          onClick={() => onForget(row.record)}
          disabled={busy}
          aria-label={[t('forgetFolder', { name: row.name }), row.path]
            .filter(Boolean)
            .join(' · ')}
          // The width half of the touch floor; see the note on the locate chip above.
          className={controlClass({
            shape: 'chip',
            size: wrapName ? 'md' : 'xs',
            tone: 'muted',
            className: 'atlas-touch-floor-wide justify-center rounded-micro',
          })}
        >
          {t('forget')}
        </button>
      </div>
      )}
    </motion.div>
  );
}
