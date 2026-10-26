'use client';

import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { CITATIONS_REVIEWED, type HarnessReport, type HookConfigFacts } from '@/entities/agent-files';
import { ChevronRight } from 'lucide-react';

import { EmptyState, RowDisclosure } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';
import { useSurfaceSwap, useSwapHeight } from '@/shared/lib/render-timing/use-presence';
import { useSlidingIndicator } from '@/shared/motion/use-sliding-indicator';
import { cn } from '@/shared/lib/cn';
import { GuideSelectionDetail, PAIR_DRIFT_BADGE, WARNING_BADGE } from './HarnessGuideDetail';
import { buildRows, differingCount, formatBytes, mergedShare, type GuideRow, type Selection } from './harness-guide-rows';

/**
 * The guide inventory with each fact's limits said out loud: measured here or read from a tool's docs
 * (source URL and date, or their absence). No invented conformance, no verified hooks, and the change
 * date is a filesystem mtime, not a commit date.
 */

const ROW_CLASS = 'min-w-0 flex-1 flex-wrap gap-x-2 gap-y-1';
const ROW_NAME = 'flex min-w-0 max-w-full items-baseline gap-2';
const ROW_STATUS = 'ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2';

function hookRowStatus(group: HookConfigFacts) {
  const missing = group.hooks.some((hook) => hook.status === 'missing');
  const unresolved = group.hooks.some((hook) => hook.status === 'unresolved');
  const wired = group.hooks.length > 0 && group.hooks.every((hook) => hook.status === 'wired');
  return { missing, unresolved, wired };
}

export function HarnessGuidesView({
  report,
  locale,
  sourceRoot,
}: {
  report: HarnessReport;
  locale: string;
  sourceRoot: string;
}) {
  const t = useTranslations('harness');
  const rows = useMemo(() => buildRows(report, t('nestedLabel')), [report, t]);
  const checks = report.analysis.checks;
  const comparedPairs = [checks.skillCopy, checks.agentCopy].filter(
    (check) => check.status !== 'not-applicable',
  ).length;

  const selections = useMemo(() => {
    const map = new Map<string, Selection>();
    for (const row of rows) {
      map.set(row.key, { kind: 'guide', row });
      for (const file of row.driftFiles) map.set(file.key, { kind: 'drift', row, file });
    }
    for (const group of report.hookGroups) map.set(`hooks:${group.configPath}`, { kind: 'hooks', group });
    return map;
  }, [rows, report.hookGroups]);
  /* The first difference is the likeliest question; with none, the first file. */
  const listed = rows.flatMap((row) => row.driftFiles);
  const firstKey = listed.find((file) => file.twin)?.key ?? listed[0]?.key ?? rows[0]?.key ?? '';

  const [chosen, setChosen] = useState<string | null>(null);
  const selectedKey = chosen !== null && selections.has(chosen) ? chosen : firstKey;
  const [folderOpen, setFolderOpen] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const isOpen = (row: GuideRow) => folderOpen.get(row.key) ??
    (row.key === selectedKey || row.driftFiles.some((file) => file.key === selectedKey));

  const { leaving } = useSurfaceSwap(selectedKey);
  const { hostRef, capture } = useSwapHeight(selectedKey);
  const { containerRef, itemRef, indicatorStyle, placed, animated } = useSlidingIndicator(selectedKey, 'surface-y');
  const listRef = useRef<HTMLDivElement | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const setList = useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      containerRef(node);
    },
    [containerRef],
  );

  const select = useCallback(
    (key: string, reveal: boolean) => {
      if (key === selectedKey) return;
      capture();
      setChosen(key);
      const pane = paneRef.current;
      if (!pane) return;
      pane.scrollTop = 0;
      /* Stacked, the detail sits below the list; a click there must show what it changed. */
      if (reveal && pane.getBoundingClientRect().top > window.innerHeight * 0.6) {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        pane.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      }
    },
    [capture, selectedKey],
  );

  const setOpen = useCallback(
    (row: GuideRow, open: boolean) => {
      setFolderOpen((current) => new Map(current).set(row.key, open));
      /* A collapsed folder hides its files, so a selection inside it moves up to the folder. */
      if (!open && row.driftFiles.some((file) => file.key === selectedKey)) select(row.key, false);
    },
    [select, selectedKey],
  );

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const key = target.dataset.guideItem;
    const list = listRef.current;
    if (!key || !list) return;
    const items = [...list.querySelectorAll<HTMLButtonElement>('[data-guide-item]')].filter(
      (item) => !item.closest('[inert]'),
    );
    const index = items.indexOf(target as HTMLButtonElement);
    const selection = selections.get(key);
    let next: HTMLButtonElement | undefined;
    if (event.key === 'ArrowDown') next = items[index + 1];
    else if (event.key === 'ArrowUp') next = items[index - 1];
    else if (event.key === 'Home') next = items[0];
    else if (event.key === 'End') next = items[items.length - 1];
    else if (event.key === 'ArrowRight' && selection?.kind === 'guide' && selection.row.driftFiles.length > 0) {
      if (!isOpen(selection.row)) setOpen(selection.row, true);
      else next = items[index + 1];
    } else if (event.key === 'ArrowLeft' && selection?.kind === 'drift') {
      next = items.find((item) => item.dataset.guideItem === selection.row.key);
    } else if (event.key === 'ArrowLeft' && selection?.kind === 'guide' && isOpen(selection.row)) {
      if (selection.row.driftFiles.length > 0) setOpen(selection.row, false);
    } else return;
    event.preventDefault();
    if (!next) return;
    next.focus();
    select(next.dataset.guideItem!, false);
  };

  if (rows.length === 0) {
    return <EmptyState title={t('empty')} description={t('emptyBody')} />;
  }

  const renderDetail = (key: string, current: boolean) => {
    const selection = selections.get(key);
    return selection ? (
      <GuideSelectionDetail selection={selection} report={report} locale={locale} current={current} t={t} />
    ) : null;
  };

  const rowButton = (key: string, children: ReactNode, size: 'md' | 'sm', ref?: (node: HTMLElement | null) => void) => {
    const selected = key === selectedKey;
    return (
      <button
        ref={ref}
        type="button"
        data-guide-item={key}
        aria-pressed={selected}
        onClick={() => select(key, true)}
        className={controlClass({
          shape: 'row',
          size,
          hoverSurface: 'lift',
          active: selected,
          className: cn(ROW_CLASS, 'bg-transparent', size === 'sm' && 'min-h-8 py-1'),
        })}
      >
        {children}
      </button>
    );
  };

  const hooksHeading = 'harness-guide-hooks-heading';
  const guidesHeading = 'harness-guide-files-heading';

  return (
    <div className={cn('flex flex-1 flex-col gap-3', '@min-[48rem]/harness:min-h-0')} data-testid="harness-guides">
      <div
        className={cn(
          'grid flex-1 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]',
          '@min-[48rem]/harness:min-h-80 @min-[48rem]/harness:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)] @min-[48rem]/harness:grid-rows-[minmax(0,1fr)]',
          '@min-[68rem]/harness:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)]',
        )}
      >
        <div
          data-testid="harness-guide-list-pane"
          className={cn(
            'min-w-0 border-b border-[color:var(--color-border-soft)] p-2 overscroll-contain',
            '@min-[48rem]/harness:min-h-0 @min-[48rem]/harness:overflow-y-auto @min-[48rem]/harness:border-b-0 @min-[48rem]/harness:border-r',
          )}
        >
          <div ref={setList} className="relative flex flex-col gap-4" onKeyDown={onListKeyDown}>
            <span
              aria-hidden
              data-selection-indicator="surface-y"
              data-placed={placed ? 'true' : 'false'}
              data-animated={animated ? 'true' : 'false'}
              className="motion-indicator z-0 rounded-chip bg-[color:var(--color-indigo-a14)]"
              style={indicatorStyle ?? { opacity: 0 }}
            />
            <section aria-labelledby={guidesHeading}>
              <header className="px-2.5 pb-2 pt-1.5">
                {/* A section head on the same step as the one below; the thesis above is the only step over body. */}
                <h2 id={guidesHeading} className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                  {t('guidesTitle')}
                </h2>
                <p className="mt-0.5 text-label text-[color:var(--color-text-tertiary)]">{t('guidesCaption')}</p>
              </header>
              <ul className="flex flex-col gap-0.5">
                {rows.map((row) => {
                  const share = mergedShare(row, report);
                  const differing = differingCount(row);
                  const open = isOpen(row);
                  const childrenId = `harness-guide-files-${row.key}`;
                  return (
                    <li key={row.key} data-testid={`harness-guide-row-${row.ruleId}`}>
                      <div ref={itemRef(row.key)} className="relative flex items-stretch">
                        {row.driftFiles.length > 0 ? (
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={childrenId}
                            aria-label={t('driftFilesIn', { path: row.label })}
                            onClick={() => setOpen(row, !open)}
                            className={controlClass({
                              shape: 'icon',
                              size: 'sm',
                              tone: 'muted',
                              hoverInk: 'strong',
                              className: 'shrink-0 self-center',
                            })}
                          >
                            <ChevronRight
                              size={ICON_SIZE.sm}
                              aria-hidden
                              className={cn(
                                'transition-[rotate] duration-[var(--motion-fast)] ease-[var(--motion-ease)] motion-reduce:transition-none',
                                open && 'rotate-90',
                              )}
                            />
                          </button>
                        ) : (
                          <span aria-hidden className="w-6 shrink-0" />
                        )}
                        {rowButton(
                          row.key,
                          <>
                            <span className={ROW_NAME}>
                              <span
                                className={cn(
                                  'min-w-0 truncate text-body text-[color:var(--color-text-primary)]',
                                  row.ruleId !== 'nested-agents-md' && 'font-mono',
                                )}
                              >
                                {row.label}
                              </span>
                              {row.fileCount > 1 ? (
                                <span className="shrink-0 text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                                  {t('fileCount', { count: row.fileCount })}
                                </span>
                              ) : null}
                            </span>
                            <span className={ROW_STATUS}>
                              {differing > 0 ? (
                                <span className={badgeClass({ shape: 'tag', className: cn('whitespace-nowrap', PAIR_DRIFT_BADGE) })}>
                                  {t('driftTitle', { count: differing })}
                                </span>
                              ) : null}
                              {row.driftFiles.length > differing ? (
                                <span className={badgeClass({ shape: 'tag', className: cn('whitespace-nowrap', PAIR_DRIFT_BADGE) })}>
                                  {t('pairFilesNoTwin', { count: row.driftFiles.length - differing })}
                                </span>
                              ) : null}
                              {row.missingFiles.length > 0 ? (
                                <span className={badgeClass({ shape: 'tag', className: cn('whitespace-nowrap', PAIR_DRIFT_BADGE) })}>
                                  {t('pairFilesMissing', { count: row.missingFiles.length })}
                                </span>
                              ) : null}
                              <span
                                className={cn(
                                  'text-label tabular-nums',
                                  share?.over ? 'text-[color:var(--color-amber-source-a90)]' : 'text-[color:var(--color-text-tertiary)]',
                                )}
                              >
                                {share ? `${formatBytes(share.used)} · ${share.percent}%` : formatBytes(row.bytes)}
                              </span>
                            </span>
                          </>,
                          'md',
                        )}
                      </div>
                      {row.driftFiles.length > 0 ? (
                        <RowDisclosure open={open} id={childrenId}>
                          <ul className="flex flex-col gap-0.5 pt-0.5">
                            {row.driftFiles.map((file) => (
                              <li key={file.key}>
                                <div className="relative flex items-stretch pl-6">
                                  <span aria-hidden className="ml-2 w-2.5 shrink-0 border-l border-[color:var(--color-border-soft)]" />
                                  {rowButton(
                                    file.key,
                                    <span className="flex min-w-0 items-center gap-2">
                                      <span title={file.path} className="min-w-0 truncate font-mono text-label text-[color:var(--color-text-secondary)]">
                                        {file.label}
                                      </span>
                                      {!file.twin ? (
                                        <span className="ml-auto shrink-0 text-label text-[color:var(--color-text-tertiary)]">
                                          {t('driftOneSided')}
                                        </span>
                                      ) : null}
                                    </span>,
                                    'sm',
                                    itemRef(file.key),
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </RowDisclosure>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>

            {report.hookGroups.length > 0 ? (
              <section aria-labelledby={hooksHeading}>
                <h2
                  id={hooksHeading}
                  className="px-2.5 pb-2 text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]"
                >
                  {t('hooksTitle')}
                </h2>
                <ul className="flex flex-col gap-0.5">
                  {report.hookGroups.map((group) => {
                    const key = `hooks:${group.configPath}`;
                    const status = hookRowStatus(group);
                    return (
                      <li key={key}>
                        <div ref={itemRef(key)} className="relative flex items-stretch">
                          <span aria-hidden className="w-6 shrink-0" />
                          {rowButton(
                            key,
                            <>
                              <span className={ROW_NAME}>
                                <span className="min-w-0 truncate font-mono text-body text-[color:var(--color-text-primary)]">
                                  {group.configPath}
                                </span>
                              </span>
                              <span className={ROW_STATUS} data-testid="harness-hook-row-status">
                                {status.missing ? (
                                  <span className={badgeClass({ shape: 'tag', className: WARNING_BADGE })}>{t('hookMissing')}</span>
                                ) : null}
                                {status.unresolved ? (
                                  <span
                                    className={badgeClass({
                                      shape: 'tag',
                                      className: 'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)]',
                                    })}
                                  >
                                    {t('hookUnresolved')}
                                  </span>
                                ) : null}
                                {group.approvalGate ? (
                                  /* Never green: Codex refuses a new or changed hook until a person trusts it in /hooks, session state in no file. */
                                  <span
                                    title={t('hookApprovalGateHint')}
                                    data-testid="harness-hook-approval-gate"
                                    className={badgeClass({ shape: 'tag', className: WARNING_BADGE })}
                                  >
                                    {t('hookApprovalGate')}
                                  </span>
                                ) : null}
                                {status.wired && !group.approvalGate ? (
                                  <span className="text-label text-[color:var(--color-text-tertiary)]">{t('hookWired')}</span>
                                ) : null}
                                <span className="text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                                  {t('hookScripts', { count: group.hooks.length })}
                                </span>
                              </span>
                            </>,
                            'md',
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </div>
        </div>

        <section
          ref={paneRef}
          tabIndex={0}
          role="region"
          aria-labelledby="harness-guide-detail-title"
          data-testid="harness-guide-detail-pane"
          className={cn(
            '@container/guide-detail min-w-0 overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
            '@min-[48rem]/harness:min-h-0 @min-[48rem]/harness:overflow-y-auto',
          )}
        >
          <div ref={hostRef} className="grid px-5 py-4 md:px-6 md:py-5">
            {leaving !== null && selections.has(leaving) ? (
              <div
                key={`out:${leaving}`}
                aria-hidden
                inert
                className="motion-swap-out pointer-events-none col-start-1 row-start-1 min-w-0"
              >
                {renderDetail(leaving, false)}
              </div>
            ) : null}
            <div
              key={selectedKey}
              data-testid="harness-guide-detail"
              className={cn('col-start-1 row-start-1 min-w-0', leaving !== null && 'motion-swap-in')}
            >
              {renderDetail(selectedKey, true)}
            </div>
          </div>
        </section>
      </div>

      {/* Never a bare zero: the declared pairs match and nothing else was compared, said together. */}
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-label text-[color:var(--color-text-quaternary)]">
        <p>
          {t('pairCompared', { count: comparedPairs })} · {t('pairNotMeasured')} ·{' '}
          {t('reviewedOn', { date: CITATIONS_REVIEWED })}
        </p>
        <p>{t('sourceRoot', { path: sourceRoot })}</p>
      </div>
    </div>
  );
}
