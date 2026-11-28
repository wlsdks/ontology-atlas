import { FolderSearch, FolderX } from 'lucide-react';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { useTranslations } from 'use-intl';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import { computeEditAge } from '@/shared/lib/edit-provenance/edit-age';
import { cn } from '@/shared/lib/cn';
import { Button, Dialog } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import type { RecentVaultRow } from '../lib/recent-vault-row';

/**
 * Folders that are gone, as one quiet line at the end of the list that opens a centred review.
 * Nothing leaves the list unless the person presses for it. `wide` follows the page list's columns.
 * With `onReview` the caller owns the dialog: the rail popover unmounts once the dialog takes focus.
 */
export function MissingFolderGroup({
  rows,
  wide,
  divided,
  busy,
  nowMs,
  onReview,
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
  onReview?: (rows: readonly RecentVaultRow[]) => void;
  onForget: (record: LocalFsHandleRecord) => void;
  onForgetAll: (records: readonly LocalFsHandleRecord[]) => void;
  onLocate?: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = useState(false);
  const count = rows.length;
  /* An empty review closes itself during render, so no frame shows it open and empty. */
  if (open && count === 0) setOpen(false);

  return (
    <>
      {count > 0 ? (
        <div
          data-testid="recent-vault-missing-group"
          data-count={count}
          className={cn(divided && 'border-t border-[color:var(--color-border-soft)]')}
        >
          <button
            type="button"
            data-testid="recent-vault-missing-toggle"
            aria-haspopup="dialog"
            onClick={() => (onReview ? onReview(rows) : setOpen(true))}
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
            <span className="shrink-0 text-label text-[color:var(--color-text-quaternary)]">
              {t('missing.review')}
            </span>
          </button>
        </div>
      ) : null}
      {onReview ? null : (
        <MissingFolderReviewDialog
          open={open}
          rows={rows}
          busy={busy}
          nowMs={nowMs}
          onClose={() => setOpen(false)}
          onForget={onForget}
          onForgetAll={onForgetAll}
          onLocate={onLocate}
          t={t}
        />
      )}
    </>
  );
}

/** The centred review of the folders that are gone; it stays mounted one render longer to play its exit. */
export function MissingFolderReviewDialog({
  open,
  rows,
  busy,
  nowMs,
  onClose,
  onForget,
  onForgetAll,
  onLocate,
  t,
}: {
  open: boolean;
  rows: readonly RecentVaultRow[];
  busy: boolean;
  nowMs: number;
  onClose: () => void;
  onForget: (record: LocalFsHandleRecord) => void;
  onForgetAll: (records: readonly LocalFsHandleRecord[]) => void;
  onLocate?: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const titleId = useId();
  const count = rows.length;
  /* After a forget, focus stays on the review it was pressed in, never `<body>`. */
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (count === 0) return;
    document.querySelector<HTMLElement>('[data-testid="recent-vault-missing-review"]')?.focus({ preventScroll: true });
  }, [count]);

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
        onClose();
        onLocate();
      }
    : undefined;

  return (
    <Dialog
      open={open && count > 0}
      onClose={onClose}
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
        <MissingFolderReview rows={rows} busy={busy} nowMs={nowMs} onForget={forgetOne} t={t} />
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
        <Button variant="ghost" className="atlas-touch-floor" onClick={onClose}>
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
  );
}

/** The reason, said once, and the missing folders under it. */
function MissingFolderReview({
  rows,
  busy,
  nowMs,
  onForget,
  t,
}: {
  rows: readonly RecentVaultRow[];
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
      <ul className="grid rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
        {rows.map((row) => (
          <MissingFolderRow key={row.key} row={row} busy={busy} nowMs={nowMs} onForget={onForget} t={t} />
        ))}
      </ul>
    </>
  );
}

function MissingFolderRow({
  row,
  busy,
  nowMs,
  onForget,
  t,
}: {
  row: RecentVaultRow;
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
      className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 border-t border-[color:var(--color-border-soft)] py-2.5 pl-3.5 pr-2 first:border-t-0"
    >
      <FolderX size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
      <div className="min-w-0">
        <p className="flex min-w-0 items-baseline gap-x-1.5">
          <span data-testid="recent-vault-name" className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
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
      <Button
        variant="ghost"
        size="sm"
        data-testid="recent-vault-forget"
        onClick={() => onForget(row.record)}
        disabled={busy}
        aria-label={[t('forgetFolder', { name: row.name }), row.path].filter(Boolean).join(' · ')}
        className="atlas-touch-floor text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
      >
        {t('forget')}
      </Button>
    </li>
  );
}
