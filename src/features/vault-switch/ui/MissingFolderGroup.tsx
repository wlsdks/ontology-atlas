'use client';

import { ChevronDown, FolderSearch, FolderX } from 'lucide-react';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { useTranslations } from 'next-intl';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import { computeEditAge } from '@/shared/lib/edit-provenance/edit-age';
import { cn } from '@/shared/lib/cn';
import { Button, Chip, Dialog, RowDisclosure } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import type { RecentVaultRow } from '../lib/recent-vault-row';

/**
 * A dialog on centred page seats, where growing in place re-centres the page under the pointer;
 * inline in the rail popover, which grows downward and would close if a dialog opened.
 */
export type MissingFolderReviewMode = 'dialog' | 'inline';

/**
 * Folders that are gone, as one quiet line at the end of the list that opens onto a review.
 * Nothing leaves the list unless the person presses for it. `wide` follows the page list's columns.
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
  /* After a forget, focus goes to where the review is read from, never `<body>`. */
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (count === 0) return;
    if (review === 'inline') toggleRef.current?.focus({ preventScroll: true });
    else document.querySelector<HTMLElement>('[data-testid="recent-vault-missing-review"]')?.focus({ preventScroll: true });
  }, [count, review]);
  /* An empty review closes itself during render, so no frame shows it open and empty. */
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
                // `pr-8` ends the trailing word where the rows' "Open" ends.
                wide
                  ? 'grid-cols-[32px_minmax(0,1fr)_auto] gap-3 py-3 pl-4 pr-8'
                  : 'grid-cols-[28px_minmax(0,1fr)_auto] gap-3 px-3 py-2',
              ),
            })}
          >
            {/* A bare glyph: the tinted chip means "this opens", and this line opens no folder. */}
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
        /* Mounted one render longer than the line so the dialog plays its exit. */
        <Dialog
          open={open && count > 0}
          onClose={() => setOpen(false)}
          labelledBy={titleId}
          size="md"
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
          <div className="mt-2 grid gap-4">
            <MissingFolderReview
              rows={rows}
              wide
              busy={busy}
              nowMs={nowMs}
              onForget={forgetOne}
              t={t}
            />
          </div>
          {/* 44px coarse floor on each, since no sweep reaches this dialog. */}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {locate ? (
              <Button
                variant="outline"
                data-testid="recent-vault-locate"
                aria-label={t('missing.locateLabel')}
                onClick={locate}
                disabled={busy}
                className="atlas-touch-floor mr-auto gap-2"
              >
                <FolderSearch size={ICON_SIZE.sm} aria-hidden />
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
                className="atlas-touch-floor max-sm:order-first max-sm:w-full"
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
      <ul
        className={cn(
          'grid',
          wide && 'rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]',
        )}
      >
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
      className={cn(
        'grid items-center gap-3 border-t border-[color:var(--color-border-soft)] first:border-t-0',
        wide ? 'grid-cols-[16px_minmax(0,1fr)_auto] py-2.5 pl-3.5 pr-2' : 'grid-cols-[minmax(0,1fr)_auto] py-2.5 first:pt-0 last:pb-0',
      )}
    >
      {wide ? <FolderX size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-text-quaternary)]" /> : null}
      <div className="min-w-0">
        <p className="flex min-w-0 items-baseline gap-x-1.5">
          <span
            data-testid="recent-vault-name"
            className={cn('min-w-0 truncate text-[color:var(--color-text-secondary)]', wide ? 'text-body' : 'text-label')}
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
          /* The whole path, wrapped after slashes, tells two missing folders of one name apart. */
          <p className="mt-0.5 break-words text-label leading-body text-[color:var(--color-text-quaternary)]">
            {row.path.split('/').map((segment, index, segments) => (
              <Fragment key={index}>
                {index < segments.length - 1 ? `${segment}/` : segment}
                {index < segments.length - 1 ? <wbr /> : null}
              </Fragment>
            ))}
          </p>
        ) : null}
      </div>
      {wide ? (
        <Button
          variant="ghost"
          size="sm"
          data-testid="recent-vault-forget"
          onClick={() => onForget(row.record)}
          disabled={busy}
          aria-label={[t('forgetFolder', { name: row.name }), row.path].filter(Boolean).join(' · ')}
          className="atlas-touch-floor text-label text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
        >
          {t('forget')}
        </Button>
      ) : (
        <Chip
          size="xs"
          tone="muted"
          data-testid="recent-vault-forget"
          onClick={() => onForget(row.record)}
          disabled={busy}
          aria-label={[t('forgetFolder', { name: row.name }), row.path].filter(Boolean).join(' · ')}
          className="atlas-touch-floor-wide justify-center rounded-micro"
        >
          {t('forget')}
        </Chip>
      )}
    </li>
  );
}
