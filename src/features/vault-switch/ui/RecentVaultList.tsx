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
 * The known folders, each stating what it holds and whether it opens.
 *
 * **One component, two seats**, and that is the point rather than a convenience: the same
 * list is the launch chooser (`DesktopVaultWelcome`) and the body of the rail's switcher.
 * Two implementations would be two answers to "what does this folder contain", and the
 * whole defect being fixed here is the app being unclear about which folder is which.
 *
 * **Not a list of bare names.** A folder name alone does not distinguish `atlas` from
 * `atlas-old`, which is exactly the moment a person is in when they reach this list. Every
 * row carries what is inside it, when it was last open, and whether it can be opened now.
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
  /**
   * Stops listing several folders in one write — the missing-folder group's "forget all".
   * Without it each folder goes through `onForget`, and the list redraws once per folder.
   */
  onForgetAll?: (records: readonly LocalFsHandleRecord[]) => void;
  /**
   * Opens the folder picker, so a row that cannot be pressed is still not a dead end.
   *
   * A `missing` or `blocked` row states a problem and offers no open. Without this the only
   * action ever offered for it was to throw the folder out of the list, and the control that
   * would actually recover it sat elsewhere on the screen, labelled for folders the list does
   * not hold - which is not what the person is looking at (interaction seat, 2026-09-13).
   * Missing folders offer it once, from their group; a `blocked` row keeps its own.
   */
  onLocate?: () => void;
  /**
   * **This list is the screen's answer, so it takes the screen's one accent stroke.**
   *
   * Set on the launch chooser and nowhere else. Without it the chooser lit the wrong thing:
   * the rows were border-less panels while the "open another folder" and "just start" cards
   * below carried `--color-indigo-brand`, so on a screen asking which of your two folders
   * to open, the only saturated stroke was the door that makes a third (design-lead seat,
   * 2026-09-13, measured by scanning the column at x=547 - the single indigo run sat at
   * y=555-622, below the list entirely). The rail switcher leaves it off: there the list is
   * one part of a popover, not the whole question.
   */
  emphasis?: boolean;
  /** The viewport chooser fills its allocated space; popovers retain their compact cap. */
  scroll?: 'page' | 'contained' | 'viewport';
  /**
   * How the folders that are gone are reviewed: in a dialog on a page (the default), in place in
   * a popover that grows downward. `MissingFolderReviewMode` says why the two differ.
   */
  missingReview?: MissingFolderReviewMode;
  /**
   * A line that belongs under the list — the chooser's release valve. It is drawn by the list,
   * with the list, so it never stands under an empty space for the frames before the list
   * appears and then jumps down by the list's height.
   */
  footnote?: ReactNode;
  className?: string;
}) {
  const t = useTranslations('vaultSwitch');
  const reachability = useRecentVaultReachability(records);
  /*
   * One clock for the whole list, **taken once when the list mounts**. Reading `Date.now()`
   * per row would let two rows drawn in the same paint disagree about what "now" is, and
   * the ladder's boundaries (59 vs 60 minutes) are exactly where that shows.
   *
   * It is mount-time state rather than a read during render because a read during render is
   * impure - the same list would age slightly on every unrelated re-render, which
   * `react-hooks/purity` rejects by name. `DocFrontmatterBlock`'s `viewOpenedAtMs` is the
   * same pattern for the same ladder.
   */
  const [nowMs] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement | null>(null);
  /*
   * **Where focus goes once the last missing folder is forgotten.** The pressed button leaves the
   * page with the group, and focus left on nothing drops to `<body>` (or, from the review dialog,
   * to the page's `<main>`), so the next Tab restarts from the top. It lands on the list's first
   * control instead: the person is back to choosing a folder. While missing folders remain, the
   * group keeps focus itself (`MissingFolderGroup`).
   */
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

  /*
   * Nothing is drawn until the probe has answered (`useRecentVaultReachability`): the first
   * frame of this list is its real shape, not five pressable rows that fold a frame later.
   */
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
   * ⚠️ **The count carries its own age, not the row's.**
   *
   * `lastAccessedAt` and `countedAt` are two clocks and they really do diverge: `openRecent`
   * writes `lastAccessedAt: now` to the recent list *before* it loads the folder
   * (`use-local-vault.ts`), and the counts are written only after a load that succeeds. So a
   * folder that was opened and then refused - permission denied, path gone, the very states
   * this list exists to warn about - showed weeks-old counts beside "opened just now". The
   * type comment and the decision record both claimed the age was labelled while only the
   * opening's age was on screen, which made the cache look audited when it was not (steward
   * and evidence seats, 2026-09-13).
   *
   * Shown only when the two ages differ, so an ordinary row stays one line: on the common
   * path the counts were taken by the load that the opening triggered, and repeating the
   * same age twice would be noise.
   */
  const countedAge = row.counts ? computeEditAge(row.counts.countedAt, nowMs) : null;
  const countedLabel =
    countedAge && countedAge.key !== age.key
      ? t('countedAgo', { when: t(`age.${countedAge.key}`, { count: countedAge.count }) })
      : null;
  const notice = noticeFor(row.reachability, t);
  const openable = canOpenReachability(row.reachability);
  const compactNotice = wrapName && !openable;
  /*
   * The accessible name carries the facts the sighted reader gets from the three lines,
   * because a row whose name is only the folder's name is the bare-name list again for
   * anyone using a screen reader.
   */
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
          {/*
            In the compact popover the row's "Open" wears the same chip face as the "Forget"
            beside it. It was 11px plain text next to a bordered 9.5px chip, so one row spoke two
            grammars for its two actions (inspection, 2026-09-25). It stays a label, not a
            second button - the whole row is the press target - so it is hidden from the
            accessibility tree, which already has the row's own name.
          */}
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

  // The divider is drawn once, by the wrapper. Repeating it on the pressable child put two
  // hairlines on one seam.
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
          // The neutral hover lift comes from the axis, not a hand-written declaration: the
          // hover-axis ratchet counts hand hovers inside `controlClass` and only ever lets
          // that count fall.
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
        /*
         * **A folder that cannot be opened is not a button.** Leaving it pressable and
         * failing afterwards spends the person's press to tell them something the probe
         * already knew, and it teaches that a press here may or may not mean anything. The
         * row keeps its facts, states the reason, and offers the action that is actually
         * available: stop listing it.
         */
        <div className={rowClass}>{body}</div>
      )}
      {/*
        The recovery action, on the rows that need one. It is the same picker the screen
        offers elsewhere, but labelled for the folder in front of the person rather than for
        a folder Atlas has never seen.
      */}
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
            /*
             * `atlas-touch-floor-wide` — `shape: 'chip'` carries only the height half of the
             * touch floor, so this measured 41.5x44 under a coarse pointer, which the repo's
             * own `touch-target-contract.spec.ts` rejects at 42 < 44 (responsive seat,
             * 2026-09-13). No existing sweep reaches this surface, so the floor is applied
             * here rather than discovered later.
             */
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
      {/*
        **Forget is not offered for the folder you were last in.** It is the release valve
        for the launch rule (drop back to one folder and the next launch resumes directly),
        and pointing it at the current folder would make the only obvious way to use it the
        one that throws away where you were.

        It is laid over the row's top-right rather than given a band underneath it. In a band
        the rows that offered it stood taller than the rows that did not, so a list of
        identical folders had ragged heights for a reason that was not about the folders
        (inspection, 2026-09-13). The pressable row reserves the space with `pr-20`, so the
        chip never sits on top of a folder name.
      */}
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
          // The width half of the touch floor; see the note on the locate chip below.
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
