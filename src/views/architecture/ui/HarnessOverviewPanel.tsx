'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MousePointerClick } from 'lucide-react';

import { AGENT_TOOL_LABELS, type ScopeDeclaration } from '@/entities/agent-files';
import { getTopologyFocusHref } from '@/entities/project';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { useSurfaceSwap } from '@/shared/lib/render-timing/use-presence';
import { badgeClass } from '@/shared/ui/badge-class';
import { CloseButton } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';

import { WARNING_BADGE } from './HarnessGuideDetail';
import { COLUMN_KEYS, ORIGIN_LABEL, type TranslateFn } from './harness-overview-labels';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { ORIGIN_ORDER, OVERVIEW_COLUMNS, type HarnessOverview, type OverviewTarget } from '../model/harness-overview';

const EPOCH_SEPARATOR = '~';

/** Paths shown before the rest fold behind a toggle. */
const PATHS_SHOWN = 5;

const AMBER_INK = 'text-[color:var(--color-amber-source-text-a95)]';

const SECTION_HEADING = 'flex items-baseline justify-between gap-3 text-label text-[color:var(--color-text-tertiary)]';

function groupByOrigin(entries: readonly ScopeDeclaration[]): ScopeDeclaration[] {
  return [...entries].sort((a, b) => ORIGIN_ORDER.indexOf(a.origin) - ORIGIN_ORDER.indexOf(b.origin));
}

function splitPath(path: string): { folder: string; name: string } {
  const cut = path.replace(/\/$/, '').lastIndexOf('/');
  return { folder: path.slice(0, cut + 1), name: path.slice(cut + 1) };
}

function EntryCards({
  entries,
  trustGatedConfigs,
  t,
}: {
  entries: readonly ScopeDeclaration[];
  trustGatedConfigs: ReadonlySet<string>;
  t: TranslateFn;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {groupByOrigin(entries).map((entry) => (
        <li
          key={entry.id}
          data-testid="harness-overview-entry"
          data-entry-id={entry.id}
          data-entry-origin={entry.origin}
          className="flex flex-col gap-1.5 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3"
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={badgeClass({
                shape: 'tag',
                className:
                  'h-5 bg-[color:var(--color-overlay-2)] px-2 font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]',
              })}
            >
              {t(ORIGIN_LABEL[entry.origin])}
            </span>
            {entry.namedBy && trustGatedConfigs.has(entry.namedBy) ? (
              <span
                data-testid="harness-overview-trust"
                title={t('hookApprovalGateHint')}
                className={badgeClass({ shape: 'tag', className: cn('h-5 px-2', WARNING_BADGE) })}
              >
                {t('hookApprovalGate')}
              </span>
            ) : null}
            {entry.tools.length > 0 ? (
              <span className="ml-auto text-label text-[color:var(--color-text-tertiary)]">
                {entry.tools.map((tool) => AGENT_TOOL_LABELS[tool] ?? tool).join(' · ')}
              </span>
            ) : null}
          </span>
          <span className="break-all font-mono text-body text-[color:var(--color-text-primary)]">
            {entry.origin === 'permissions' ? entry.label : entry.id}
          </span>
          {entry.declaration ? (
            <span className="break-all font-mono text-label text-[color:var(--color-text-tertiary)]">
              {t('coverageDeclaredAs', { declaration: entry.declaration })}
            </span>
          ) : null}
          {entry.namedBy ? (
            <span className="break-all font-mono text-label text-[color:var(--color-text-quaternary)]">
              {t('coverageNamedBy', { config: entry.namedBy })}
            </span>
          ) : null}
          {entry.denyAndAskRuleCount ? (
            <span className="text-label tabular-nums text-[color:var(--color-text-tertiary)]">
              {t('overviewPermissions', { count: entry.denyAndAskRuleCount, config: entry.label })}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function RecordedPaths({ paths, t }: { paths: readonly string[]; t: TranslateFn }) {
  const [all, setAll] = useState(false);
  const shown = all ? paths : paths.slice(0, PATHS_SHOWN);
  const hidden = paths.length - shown.length;
  return (
    <section className="flex flex-col gap-2">
      <h3 className={SECTION_HEADING}>
        <span>{t('overviewRecordedPaths')}</span>
        <span className="tabular-nums">{t('overviewRecordedCount', { count: paths.length })}</span>
      </h3>
      <ul className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] p-3 font-mono text-body leading-prose">
        {shown.map((path) => {
          const { folder, name } = splitPath(path);
          return (
            <li key={path} title={path} className="flex min-w-0 whitespace-nowrap">
              <span className="min-w-0 truncate text-[color:var(--color-text-quaternary)]">{folder}</span>
              <span className="shrink-0 text-[color:var(--color-text-primary)]">{name}</span>
            </li>
          );
        })}
      </ul>
      {paths.length > PATHS_SHOWN ? (
        <button
          type="button"
          data-testid="harness-overview-paths-toggle"
          aria-expanded={all}
          onClick={() => setAll((value) => !value)}
          className={controlClass({ shape: 'link', size: 'md', tone: 'default', hoverInk: 'strong', className: 'self-start' })}
        >
          {all ? t('overviewPathsLess') : t('overviewPathsMore', { count: hidden })}
        </button>
      ) : null}
    </section>
  );
}

function GapBody({
  target,
  overview,
  t,
}: {
  target: Extract<OverviewTarget, { kind: 'cell' }>;
  overview: HarnessOverview;
  t: TranslateFn;
}) {
  const { row, cell } = target;
  const everywhereCount = overview.everywhere.find((entry) => entry.column === cell.column)?.entries.length ?? 0;
  return (
    <>
      <div className="flex flex-col gap-1 rounded-card border border-[color:var(--color-amber-signal-a28)] bg-[color:var(--color-amber-signal-a07)] p-[var(--card-pad)]">
        <p className={cn('text-body-lg font-[var(--font-weight-emphasis)]', AMBER_INK)}>
          {t(COLUMN_KEYS[cell.column].empty)}
        </p>
        <p className="text-body text-[color:var(--color-text-secondary)]">
          {t('overviewEverywhereApplies', { count: everywhereCount })}
          {cell.column === 'watched' ? (
            <>
              {' '}
              <span data-testid="harness-overview-discovered-tests" className="tabular-nums">
                {t('coverageDiscoveredTests', { count: row.discoveredTests })}
              </span>
            </>
          ) : null}
        </p>
      </div>
      <RecordedPaths paths={row.paths} t={t} />
      <section className="flex flex-col gap-2">
        <h3 className={SECTION_HEADING}>{t('overviewFillsHeading')}</h3>
        <p className="text-body text-[color:var(--color-text-tertiary)]">
          {t(COLUMN_KEYS[cell.column].hint)}
        </p>
      </section>
    </>
  );
}

function PanelBody({ target, overview, t }: { target: OverviewTarget; overview: HarnessOverview; t: TranslateFn }) {
  const mapT = useTranslations('agentActivity');
  if (target.kind === 'no-path') {
    return (
      <>
        <p className="text-body text-[color:var(--color-text-secondary)]">{t('overviewNoPathBody')}</p>
        <Link
          href={getTopologyFocusHref(target.row.slug)}
          data-testid="harness-overview-map-link"
          className={controlClass({ shape: 'link', size: 'sm', tone: 'muted', hoverInk: 'strong', className: 'self-start' })}
        >
          {mapT('openOnMap', { name: target.row.title })}
        </Link>
      </>
    );
  }
  if (target.kind === 'everywhere') {
    return (
      <>
        <p className="text-label text-[color:var(--color-text-quaternary)]">
          {t('coverageEverywhereBody', { areas: overview.pathedDomainCount })}
        </p>
        <EntryCards entries={target.cell.entries} trustGatedConfigs={overview.trustGatedConfigs} t={t} />
      </>
    );
  }
  if (target.cell.gap) return <GapBody target={target} overview={overview} t={t} />;
  return (
    <>
      <EntryCards entries={target.cell.entries} trustGatedConfigs={overview.trustGatedConfigs} t={t} />
      <p className="text-label text-[color:var(--color-text-quaternary)]">
        {t(COLUMN_KEYS[target.cell.column].hint)}
      </p>
    </>
  );
}

function panelHead(target: OverviewTarget, t: TranslateFn) {
  if (target.kind === 'no-path') {
    return { eyebrow: null, title: target.row.title, purpose: target.row.purpose, gap: false };
  }
  const eyebrow = t(COLUMN_KEYS[target.cell.column].head);
  if (target.kind === 'everywhere') {
    return { eyebrow, title: t('coverageEverywhereTitle'), purpose: t('overviewEverywhereGloss'), gap: false };
  }
  return { eyebrow, title: target.row.title, purpose: target.row.purpose, gap: target.cell.gap };
}

export function HarnessOverviewPanel({
  overview,
  targetKey,
  epoch,
  placement,
  onClose,
  titleId,
}: {
  overview: HarnessOverview;
  /** Empty when nothing is selected, which draws the invitation instead of a blank. */
  targetKey: string;
  /** Changes whenever the panel opens from closed, so a stale outgoing copy is never drawn. */
  epoch: number;
  placement: 'beside' | 'below';
  onClose: () => void;
  titleId: string;
}) {
  const t = useTranslations('harness');
  const swapId = `${epoch}${EPOCH_SEPARATOR}${targetKey}`;
  const { leaving } = useSurfaceSwap(swapId);
  const leavingKey =
    leaving !== null && leaving.startsWith(`${epoch}${EPOCH_SEPARATOR}`)
      ? leaving.slice(String(epoch).length + 1)
      : null;
  const beside = placement === 'beside';

  const renderContent = (key: string, live: boolean) => {
    const target = overview.targets.get(key);
    if (!target) {
      return (
        <div data-testid="harness-overview-panel-empty" className="flex flex-col items-start gap-4 px-6 py-6">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-card bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-tertiary)]"
          >
            <MousePointerClick size={ICON_SIZE.md} />
          </span>
          <p className="text-body-lg text-[color:var(--color-text-secondary)]">{t('overviewPanelEmpty')}</p>
          <ul className="flex flex-col gap-2.5">
            {OVERVIEW_COLUMNS.map((column) => (
              <li key={column} className="flex flex-col">
                <span className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">
                  {t(COLUMN_KEYS[column].head)}
                </span>
                <span className="text-label text-[color:var(--color-text-quaternary)]">{t(COLUMN_KEYS[column].gloss)}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    const head = panelHead(target, t);
    return (
      <>
        <div
          className={cn(
            'relative border-b border-[color:var(--color-divider)] px-6 pb-4.5 pt-5 pr-14',
            beside && 'sticky top-0 z-10 bg-[color:var(--color-panel)]',
          )}
        >
          {head.eyebrow ? (
            <p className="flex items-center gap-2 text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">
              {head.eyebrow}
              {head.gap ? (
                <span
                  className={cn(
                    badgeClass({ shape: 'tag', className: 'h-5 px-2 font-[var(--font-weight-strong)]' }),
                    'bg-[color:var(--color-amber-signal-a16)]',
                    AMBER_INK,
                  )}
                >
                  {t('overviewGapPill')}
                </span>
              ) : null}
            </p>
          ) : null}
          <h2
            id={live ? titleId : undefined}
            className={cn(
              'text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]',
              head.eyebrow && 'mt-2.5',
            )}
          >
            {head.title}
          </h2>
          <p className="mt-1.5 text-body text-[color:var(--color-text-tertiary)]">{head.purpose}</p>
          <CloseButton
            label={t('coverageCloseNames')}
            onClick={onClose}
            className="absolute right-4 top-4 size-[var(--control-h-sm)] border border-[color:var(--color-border-soft)]"
          />
        </div>
        <div className="flex flex-col gap-5 px-6 py-5">
          <PanelBody target={target} overview={overview} t={t} />
        </div>
      </>
    );
  };

  return (
    <div
      data-testid="harness-overview-panel"
      data-panel-placement={placement}
      data-panel-cell={targetKey}
      className={cn(
        'grid w-full',
        beside && 'h-full grid-rows-[minmax(min-content,1fr)]',
        !beside && 'overflow-clip rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)]',
      )}
    >
      {leavingKey !== null ? (
        <div aria-hidden inert className="motion-swap-out pointer-events-none col-start-1 row-start-1 min-w-0">
          {renderContent(leavingKey, false)}
        </div>
      ) : null}
      <div
        key={targetKey}
        className={cn('col-start-1 row-start-1 min-w-0', leavingKey !== null && 'motion-swap-in')}
      >
        {renderContent(targetKey, true)}
      </div>
    </div>
  );
}
