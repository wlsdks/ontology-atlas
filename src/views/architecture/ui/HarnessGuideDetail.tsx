'use client';

import type { ReactNode } from 'react';
import type { useTranslations } from 'next-intl';

import { AGENT_TOOL_LABELS, guideCitation, type HarnessReport, type HookConfigFacts } from '@/entities/agent-files';

import { PlacedInfoHint } from './PlacedInfoHint';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';
import { cn } from '@/shared/lib/cn';
import {
  comparedTwin,
  differingCount,
  formatBytes,
  formatWhen,
  insideFolder,
  mergedShare,
  TREE_RULES,
  type DriftFile,
  type GuideRow,
  type Selection,
} from './harness-guide-rows';

/** The amber pair every unresolved-state badge on this screen wears. */
export const WARNING_BADGE =
  'border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]';

/** Only a difference wears a tag; "same content" is plain text and "not applicable" is the dash. */
export const PAIR_DRIFT_BADGE =
  'border border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-secondary)]';

const FACT_LABEL =
  'text-label font-[var(--font-weight-signature)] uppercase tracking-[var(--tracking-label)] text-[color:var(--color-text-quaternary)]';

export type TranslateFn = ReturnType<typeof useTranslations<'harness'>>;

function ToolsFact({ row, t }: { row: GuideRow; t: TranslateFn }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {row.tools.map((tool) => {
        const citation = guideCitation(row.ruleId, tool);
        const condition = citation?.condition
          ? citation.condition === 'coding-agent'
            ? t('conditionCodingAgent')
            : t('conditionSettingsContext')
          : null;
        return (
          <li key={tool} className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-body text-[color:var(--color-text-primary)]">
              {AGENT_TOOL_LABELS[tool] ?? tool}
            </span>
            {condition ? (
              <span className="text-label text-[color:var(--color-text-quaternary)]">{condition}</span>
            ) : null}
            {citation ? (
              /* The screen's one arrow: ↗ prefixes an external destination. */
              <a
                href={citation.source}
                target="_blank"
                rel="noreferrer"
                title={citation.source}
                /* Names whose document it is and where it lives: a WKWebView has no status bar to show the destination. */
                aria-label={t('toolsSourceFor', {
                  tool: AGENT_TOOL_LABELS[tool] ?? tool,
                  host: new URL(citation.source).host,
                })}
                className={controlClass({
                  shape: 'link',
                  hoverInk: 'secondary',
                  className:
                    'text-label text-[color:var(--color-text-quaternary)] underline decoration-dotted underline-offset-2',
                })}
              >
                ↗{t('toolsSource')}
              </a>
            ) : (
              <span
                title={t('toolsUncitedHint')}
                className={badgeClass({ shape: 'tag', className: WARNING_BADGE })}
              >
                {t('toolsUncited')}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SizeFact({ row, report, t }: { row: GuideRow; report: HarnessReport; t: TranslateFn }) {
  const share = mergedShare(row, report);
  if (!share) {
    return (
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-body tabular-nums text-[color:var(--color-text-primary)]">{formatBytes(row.bytes)}</span>
        <span className="text-label text-[color:var(--color-text-quaternary)]">{t('capNone')}</span>
      </p>
    );
  }
  const caption = t('capMergedShare', { percent: share.percent, cap: formatBytes(share.cap) });
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-body tabular-nums text-[color:var(--color-text-primary)]">{formatBytes(share.used)}</span>
        <span
          className={cn(
            'text-label tabular-nums',
            share.over ? 'text-[color:var(--color-amber-source-a90)]' : 'text-[color:var(--color-text-quaternary)]',
          )}
        >
          {share.over ? `${t('capOver')} · ${caption}` : caption}
        </span>
      </p>
      {share.ratio >= 0.05 ? (
        <div
          className="h-1 w-full max-w-60 overflow-hidden rounded-micro bg-[color:var(--color-overlay-2)]"
          role="img"
          aria-label={t('capMergedValue', { used: formatBytes(share.used), cap: formatBytes(share.cap) })}
        >
          <div
            className={cn(
              'h-full rounded-micro',
              share.over ? 'bg-[color:var(--color-amber-source-a90)]' : 'bg-[color:var(--color-indigo-a60)]',
            )}
            style={{ width: `${share.percentValue}%` }}
          />
        </div>
      ) : null}
      <p className="max-w-prose text-label text-[color:var(--color-text-tertiary)]">{t('capMerged')}</p>
    </div>
  );
}

/** The named reference comparison only, never a demand that tool guidance be identical. */
function PairFact({ row, twin, t }: { row: GuideRow; twin: string; t: TranslateFn }) {
  const differing = differingCount(row);
  const oneSided = row.driftFiles.length - differing;
  const missing = row.missingFiles.length;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {differing > 0 ? (
          <span className={badgeClass({ shape: 'tag', className: PAIR_DRIFT_BADGE })}>
            {t('driftTitle', { count: differing })}
          </span>
        ) : null}
        {oneSided > 0 ? (
          <span className={badgeClass({ shape: 'tag', className: PAIR_DRIFT_BADGE })}>
            {t('pairFilesNoTwin', { count: oneSided })}
          </span>
        ) : null}
        {missing > 0 ? (
          <span className={badgeClass({ shape: 'tag', className: PAIR_DRIFT_BADGE })}>
            {t('pairFilesMissing', { count: missing })}
          </span>
        ) : null}
        {row.driftFiles.length === 0 && missing === 0 ? (
          <span className="text-body text-[color:var(--color-text-secondary)]">{t('pairMatchesTwin')}</span>
        ) : null}
        <span className="font-mono text-label text-[color:var(--color-text-tertiary)]">{twin}/</span>
      </p>
      {missing > 0 ? (
        <div data-testid="harness-pair-missing">
          <ul className="flex flex-col">
            {row.missingFiles.map((label) => (
              <li
                key={label}
                title={`${twin}/${label}`}
                className="flex min-h-6 items-center truncate font-mono text-label text-[color:var(--color-text-secondary)]"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 py-3 @min-[34rem]/guide-detail:grid-cols-[8rem_minmax(0,1fr)] @min-[34rem]/guide-detail:gap-4">
      <dt className={cn(FACT_LABEL, 'flex items-center gap-1 self-start @min-[34rem]/guide-detail:min-h-5')}>
        {label}
        {hint ? <PlacedInfoHint label={label}>{hint}</PlacedInfoHint> : null}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function DetailHead({
  folder,
  title,
  titleIsPath = true,
  aside,
  id,
}: {
  folder?: string;
  title: string;
  titleIsPath?: boolean;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <header className="flex flex-col gap-1 pb-2">
      {folder ? <p className="font-mono text-label text-[color:var(--color-text-tertiary)]">{folder}</p> : null}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          id={id}
          className={cn('break-all text-body-lg text-[color:var(--color-text-primary)]', titleIsPath && 'font-mono')}
        >
          {title}
        </h2>
        {aside}
      </div>
    </header>
  );
}

function GuideDetail({
  row,
  report,
  locale,
  headingId,
  t,
}: {
  row: GuideRow;
  report: HarnessReport;
  locale: string;
  headingId?: string;
  t: TranslateFn;
}) {
  const folder = TREE_RULES[row.ruleId];
  const twin = comparedTwin(row, report);
  return (
    <>
      <DetailHead
        id={headingId}
        title={row.label}
        titleIsPath={row.ruleId !== 'nested-agents-md'}
        aside={
          row.fileCount > 1 ? (
            <span className="text-label tabular-nums text-[color:var(--color-text-tertiary)]">
              {t('fileCount', { count: row.fileCount })}
            </span>
          ) : null
        }
      />
      <dl className="divide-y divide-[color:var(--color-overlay-1)]">
        <Fact label={t('columnTools')}>
          <ToolsFact row={row} t={t} />
        </Fact>
        <Fact label={t('columnSize')}>
          <SizeFact row={row} report={report} t={t} />
        </Fact>
        {twin !== null ? (
          <Fact label={t('columnPair')} hint={t('pairHint')}>
            <PairFact row={row} twin={twin} t={t} />
          </Fact>
        ) : null}
        <Fact label={t('columnChanged')} hint={t('columnChangedHint')}>
          <p className="text-body tabular-nums text-[color:var(--color-text-secondary)]">
            {formatWhen(row.lastModified, locale)}
          </p>
        </Fact>
        {row.fileCount > 1 ? (
          <Fact label={t('columnFile')}>
            <ul className="flex flex-col">
              {row.files.map((file) => (
                <li key={file.path} className="flex min-h-7 items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-mono text-label text-[color:var(--color-text-secondary)]" title={file.path}>
                    {folder ? insideFolder(file.path, folder) : file.path}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {file.drifting ? (
                      <span aria-hidden className="size-1.5 rounded-full bg-[color:var(--color-text-tertiary)]" />
                    ) : null}
                    <span className="text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                      {formatBytes(file.bytes)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Fact>
        ) : null}
      </dl>
    </>
  );
}

function DriftDetail({
  row,
  file,
  contentByPath,
  current,
  headingId,
  t,
}: {
  row: GuideRow;
  file: DriftFile;
  contentByPath: ReadonlyMap<string, string>;
  current: boolean;
  headingId?: string;
  t: TranslateFn;
}) {
  const detail = file.finding?.detail;
  const left = typeof detail?.claudePath === 'string' ? detail.claudePath : null;
  const right = typeof detail?.agentsPath === 'string' ? detail.agentsPath : null;
  const sides = file.twin && left && right ? [left, right] : [file.path];
  const texts = sides.map((path) => (contentByPath.get(path) ?? '').replace(/\n$/, ''));
  const lineSets = sides.length === 2 ? texts.map((text) => new Set(text.split('\n'))) : null;
  return (
    <div data-testid={current ? 'harness-drift' : undefined}>
      <DetailHead
        id={headingId}
        folder={row.label}
        title={file.label}
        aside={
          file.twin || !file.onlyIn ? (
            <span className={badgeClass({ shape: 'tag', className: PAIR_DRIFT_BADGE })}>
              {file.twin ? t('driftTitle', { count: 1 }) : t('driftOneSided')}
            </span>
          ) : undefined
        }
      />
      {file.onlyIn ? (
        <p className="pb-2 text-body text-[color:var(--color-text-tertiary)]">
          {t('driftOnlyIn', { dir: file.onlyIn })}
        </p>
      ) : null}
      {lineSets ? <p className="pb-1 text-label text-[color:var(--color-text-tertiary)]">{t('driftLineMark')}</p> : null}
      <div
        className={cn('mt-2 grid gap-3', sides.length === 2 && '@min-[40rem]/guide-detail:grid-cols-2')}
        data-testid={current ? 'harness-drift-diff' : undefined}
      >
        {sides.map((path, side) => (
          <div key={path} className="flex min-w-0 flex-col">
            <p className="truncate font-mono text-label text-[color:var(--color-text-tertiary)]" title={path}>
              {path}
            </p>
            {/* Focusable and named: a bare `<pre>` is not in a WKWebView's tab order. */}
            <pre
              tabIndex={0}
              role="group"
              aria-label={path}
              className={cn(
                'mt-1 max-h-96 flex-1 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-chip bg-[color:var(--color-overlay-1)] py-3 font-mono text-label text-[color:var(--color-text-secondary)]',
                '@min-[48rem]/harness:max-h-none',
              )}
            >
              {texts[side]!.split('\n').map((line, index) => (
                <span
                  key={index}
                  data-harness-drift-line={lineSets && !lineSets[1 - side]!.has(line) ? 'only-here' : undefined}
                  className={cn(
                    'block px-3',
                    lineSets && !lineSets[1 - side]!.has(line) && 'bg-[color:var(--color-overlay-3)] text-[color:var(--color-text-primary)]',
                  )}
                >
                  {line === '' ? '\u00a0' : line}
                </span>
              ))}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

const HOOK_STATUS = {
  wired: { label: 'hookWired', hint: 'hookWiredHint' },
  missing: { label: 'hookMissing', hint: 'hookMissingHint' },
  unresolved: { label: 'hookUnresolved', hint: 'hookUnresolvedHint' },
} as const;

function HookDetail({ group, headingId, t }: { group: HookConfigFacts; headingId?: string; t: TranslateFn }) {
  return (
    <>
      <DetailHead id={headingId} title={group.configPath} />
      <p className="pb-3 text-body text-[color:var(--color-text-tertiary)]">{t('hooksCaption')}</p>
      <ul className="divide-y divide-[color:var(--color-overlay-1)] border-t border-[color:var(--color-overlay-1)]">
        {group.hooks.map((hook) => (
          <li
            key={hook.ref.path ?? hook.ref.command}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5"
          >
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="break-all font-mono text-body text-[color:var(--color-text-secondary)]">
                {hook.ref.path ?? hook.ref.command}
              </span>
              <span className="text-label text-[color:var(--color-text-quaternary)]">{hook.events}</span>
            </span>
            <span
              title={t(HOOK_STATUS[hook.status].hint)}
              data-harness-hook-status={hook.status}
              className={badgeClass({
                shape: 'tag',
                className:
                  hook.status === 'missing'
                    ? WARNING_BADGE
                    : 'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)]',
              })}
            >
              {t(HOOK_STATUS[hook.status].label)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function GuideSelectionDetail({
  selection,
  report,
  locale,
  current,
  t,
}: {
  selection: Selection;
  report: HarnessReport;
  locale: string;
  current: boolean;
  t: TranslateFn;
}) {
  const headingId = current ? 'harness-guide-detail-title' : undefined;
  if (selection.kind === 'hooks') return <HookDetail group={selection.group} headingId={headingId} t={t} />;
  if (selection.kind === 'drift') {
    return (
      <DriftDetail
        row={selection.row}
        file={selection.file}
        contentByPath={report.contents}
        current={current}
        headingId={headingId}
        t={t}
      />
    );
  }
  return <GuideDetail row={selection.row} report={report} locale={locale} headingId={headingId} t={t} />;
}
