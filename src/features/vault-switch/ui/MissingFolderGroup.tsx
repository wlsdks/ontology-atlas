'use client';

import { ChevronDown, FolderX } from 'lucide-react';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { useTranslations } from 'next-intl';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import { computeEditAge } from '@/shared/lib/edit-age';
import { cn } from '@/shared/lib/cn';
import { Button, Chip, Dialog, RowDisclosure } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import type { RecentVaultRow } from '../lib/recent-vault-row';

/**
 * Where the missing folders are reviewed.
 *
 * - `dialog` — the page seats (the launch chooser, the docs chooser). Both centre their content
 *   vertically, so a group that opened in place grew the page and re-centred it: the line moved
 *   up by half the growth and a per-folder "forget" slid under the pointer that had just pressed
 *   "review" (measured at 1512×945: the toggle moved up 129px and a second press at the same spot
 *   landed on a forget chip). A dialog changes nothing behind it.
 * - `inline` — the rail switcher. It is a popover hung from the top, so it grows downward and the
 *   line stays under the pointer; a dialog opened from it would close the popover it came from.
 */
export type MissingFolderReviewMode = 'dialog' | 'inline';

/**
 * **The known folders that are gone, as one quiet line at the end of the list.**
 *
 * Owner inspection, 2026-09-26: after a few QA runs the launch chooser opened on five dead rows,
 * each with a warning and two buttons, above the folders that still exist. A folder that cannot
 * be opened is not an answer to "which folder do you want to work in", so it no longer takes a
 * row in the answer. The line says how many there are and opens onto what they were: each one's
 * name, where it was, when it was last open, and a way to stop listing it. Nothing leaves the
 * list unless the person presses for it — one folder at a time, or all of them at once from the
 * place that lists them.
 *
 * `wide` is the page list's grammar (32px glyph column, text 60px in); otherwise the compact
 * list's (28px, 52px). The line takes the rows' glyph and text columns so it reads as the list's
 * last entry, not as a control bolted under it.
 */
export function MissingFolderGroup({
  rows,
  wide,
  divided,
  busy,
  nowMs,
  review,
  onForget,
  onForgetAll,
  onLocate,
  t,
}: {
  rows: readonly RecentVaultRow[];
  wide: boolean;
  divided: boolean;
  busy: boolean;
  nowMs: number;
  review: MissingFolderReviewMode;
  onForget: (record: LocalFsHandleRecord) => void;
  onForgetAll: (records: readonly LocalFsHandleRecord[]) => void;
  onLocate?: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const titleId = useId();
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const count = rows.length;
  /*
   * A forget inside the review takes the pressed button off the page with its row. While other
   * missing folders remain, focus goes to where the review is read from — the line when it opened
   * in place, the dialog itself when it is a dialog — never to `<body>`. When none remain the list
   * moves focus (see `RecentVaultList`).
   */
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (count === 0) return;
    if (review === 'inline') toggleRef.current?.focus({ preventScroll: true });
    else document.querySelector<HTMLElement>('[data-testid="recent-vault-missing-review"]')?.focus({ preventScroll: true });
  }, [count, review]);
  /*
   * Nothing left to review: the review closes itself (the dialog's exit keeps its last rows on
   * screen), and a folder that goes missing later does not reopen it. Adjusted during render —
   * React's documented pattern for state that follows a prop — so no frame shows an open, empty
   * review.
   */
  if (open && count === 0) setOpen(false);

  const forgetOne = (record: LocalFsHandleRecord) => {
    refocus.current = true;
    onForget(record);
  };
  const forgetAll = () => {
    refocus.current = true;
    onForgetAll(rows.map((row) => row.record));
  };

  const locate = onLocate
    ? () => {
        setOpen(false);
        onLocate();
      }
    : undefined;

  return (
    <>
      {count > 0 ? (
        <div
          data-testid="recent-vault-missing-group"
          data-count={count}
          data-review={review}
          data-state={open ? 'open' : 'closed'}
          className={cn(divided && 'border-t border-[color:var(--color-border-soft)]')}
        >
          <button
            ref={toggleRef}
            type="button"
            data-testid="recent-vault-missing-toggle"
            aria-expanded={review === 'inline' ? open : undefined}
            aria-controls={review === 'inline' ? bodyId : undefined}
            aria-haspopup={review === 'dialog' ? 'dialog' : undefined}
            onClick={() => setOpen((value) => !value)}
            className={controlClass({
              shape: 'row',
              stacked: true,
              hoverSurface: 'lift',
              className: cn(
                'atlas-touch-floor grid w-full items-center border-0 text-left',
                // `pr-8` puts the trailing word on the right edge the rows' "Open" ends at
                // (their button's 16px plus their row's 16px).
                wide
                  ? 'grid-cols-[32px_minmax(0,1fr)_auto] gap-3 py-3 pl-4 pr-8'
                  : 'grid-cols-[28px_minmax(0,1fr)_auto] gap-3 px-3 py-2',
              ),
            })}
          >
            {/*
              The glyph sits in the rows' glyph column, bare: the live rows' tinted chip says
              "this opens", and this line opens no folder.
            */}
            <span className="flex items-center justify-center text-[color:var(--color-text-quaternary)]">
              <FolderX size={wide ? ICON_SIZE.md : ICON_SIZE.sm} aria-hidden />
            </span>
            <span
              className={cn(
                'min-w-0 tabular-nums text-[color:var(--color-text-tertiary)]',
                wide ? 'text-body' : 'text-label',
              )}
            >
              {t('missing.summary', { count })}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-label text-[color:var(--color-text-quaternary)]">
              {review === 'inline' && open ? t('missing.hide') : t('missing.review')}
              {review === 'inline' ? (
                <ChevronDown
                  size={ICON_SIZE.sm}
                  aria-hidden
                  className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-180')}
                />
              ) : null}
            </span>
          </button>
          {review === 'inline' ? (
            <RowDisclosure
              open={open}
              id={bodyId}
              className={cn('grid gap-3', wide ? 'pb-4 pl-[60px] pr-4' : 'pb-2.5 pl-[52px] pr-3')}
            >
              <MissingFolderReview
                rows={rows}
                wide={wide}
                busy={busy}
                nowMs={nowMs}
                onForget={forgetOne}
                t={t}
              />
              {locate || count > 1 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {locate ? (
                    <Chip
                      size={wide ? 'md' : 'xs'}
                      tone="secondary"
                      data-testid="recent-vault-locate"
                      aria-label={t('missing.locateLabel')}
                      onClick={locate}
                      disabled={busy}
                      className="atlas-touch-floor-wide mr-auto justify-center rounded-micro"
                    >
                      {t('missing.locate')}
                    </Chip>
                  ) : null}
                  {count > 1 ? (
                    <Chip
                      size={wide ? 'md' : 'xs'}
                      tone="muted"
                      data-testid="recent-vault-forget-missing"
                      onClick={forgetAll}
                      disabled={busy}
                      className="atlas-touch-floor-wide ml-auto justify-center rounded-micro"
                    >
                      {t('missing.forgetAll', { count })}
                    </Chip>
                  ) : null}
                </div>
              ) : null}
            </RowDisclosure>
          ) : null}
        </div>
      ) : null}
      {review === 'dialog' ? (
        /*
          Mounted while the line is, and one render longer: when the last missing folder is
          forgotten the dialog closes through its own exit, showing the rows it last had, instead
          of vanishing with the line in one frame.
        */
        <Dialog
          open={open && count > 0}
          onClose={() => setOpen(false)}
          labelledBy={titleId}
          size="sm"
          // The first control would be a forget: focus the dialog, not a removal.
          initialFocus="container"
          testId="recent-vault-missing-review"
        >
          <h2
            id={titleId}
            className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
          >
            {t('missing.summary', { count })}
          </h2>
          <div className="mt-3 grid gap-4">
            <MissingFolderReview
              rows={rows}
              wide
              busy={busy}
              nowMs={nowMs}
              onForget={forgetOne}
              t={t}
            />
          </div>
          {/*
            `atlas-touch-floor` on each: a standard button is 40px, and no sweep reaches this
            dialog (it needs gone folders in IndexedDB), so it carries the 44px coarse floor the
            chooser's own help dialog carries.
          */}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {locate ? (
              <Button
                variant="ghost"
                data-testid="recent-vault-locate"
                aria-label={t('missing.locateLabel')}
                onClick={locate}
                disabled={busy}
                className="atlas-touch-floor mr-auto"
              >
                {t('missing.locate')}
              </Button>
            ) : null}
            <Button variant="ghost" className="atlas-touch-floor" onClick={() => setOpen(false)}>
              {t('missing.close')}
            </Button>
            {count > 1 ? (
              <Button
                variant="primary"
                data-testid="recent-vault-forget-missing"
                onClick={forgetAll}
                disabled={busy}
                className="atlas-touch-floor"
              >
                {t('missing.forgetAll', { count })}
              </Button>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

/** The reason, said once, and the missing folders under it — the same in both review modes. */
function MissingFolderReview({
  rows,
  wide,
  busy,
  nowMs,
  onForget,
  t,
}: {
  rows: readonly RecentVaultRow[];
  wide: boolean;
  busy: boolean;
  nowMs: number;
  onForget: (record: LocalFsHandleRecord) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <>
      <p className="text-label leading-body text-[color:var(--color-text-tertiary)]">
        {t('missing.body')}
      </p>
      <ul className="grid">
        {rows.map((row) => (
          <MissingFolderRow
            key={row.key}
            row={row}
            wide={wide}
            busy={busy}
            nowMs={nowMs}
            onForget={onForget}
            t={t}
          />
        ))}
      </ul>
    </>
  );
}

function MissingFolderRow({
  row,
  wide,
  busy,
  nowMs,
  onForget,
  t,
}: {
  row: RecentVaultRow;
  wide: boolean;
  busy: boolean;
  nowMs: number;
  onForget: (record: LocalFsHandleRecord) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const age = computeEditAge(row.lastAccessedAt, nowMs);
  const openedLabel = t('openedAgo', { when: t(`age.${age.key}`, { count: age.count }) });
  return (
    <li
      data-testid="recent-vault-row"
      data-reachability={row.reachability}
      data-current={row.isCurrent ? 'true' : 'false'}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-[color:var(--color-border-soft)] py-2.5 first:border-t-0 first:pt-0 last:pb-0"
    >
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span
            data-testid="recent-vault-name"
            className={cn(
              'min-w-0 text-[color:var(--color-text-secondary)]',
              wide ? 'break-all text-body' : 'truncate text-label',
            )}
          >
            {row.name}
          </span>
          {row.isCurrent ? (
            <span className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
              {t('lastOpenBadge')}
            </span>
          ) : null}
          <span className="shrink-0 tabular-nums text-label text-[color:var(--color-text-quaternary)]">
            {openedLabel}
          </span>
        </p>
        {row.path ? (
          /*
            The whole path, wrapped: it is what tells two missing folders of one name apart, and
            what a person checks before letting one go. It breaks after a slash where it can,
            so a line never ends inside a folder name that fits whole on the next.
          */
          <p className="mt-0.5 break-words font-mono text-label leading-body text-[color:var(--color-text-quaternary)]">
            {row.path.split('/').map((segment, index, segments) => (
              <Fragment key={index}>
                {index < segments.length - 1 ? `${segment}/` : segment}
                {index < segments.length - 1 ? <wbr /> : null}
              </Fragment>
            ))}
          </p>
        ) : null}
      </div>
      <Chip
        size={wide ? 'md' : 'xs'}
        tone="muted"
        data-testid="recent-vault-forget"
        onClick={() => onForget(row.record)}
        disabled={busy}
        aria-label={[t('forgetFolder', { name: row.name }), row.path].filter(Boolean).join(' · ')}
        className="atlas-touch-floor-wide justify-center rounded-micro"
      >
        {t('forget')}
      </Chip>
    </li>
  );
}
