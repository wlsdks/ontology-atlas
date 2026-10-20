'use client';

import { useTranslations } from 'next-intl';

import {
  AGENT_TOOL_LABELS,
  type AgentTool,
  type CoverageColumn,
  type ScopeDeclaration,
} from '@/entities/agent-files';
import { getTopologyFocusHref } from '@/entities/project';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { useSurfaceSwap } from '@/shared/lib/render-timing/use-presence';
import { badgeClass } from '@/shared/ui/badge-class';
import { Button } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';

import { WARNING_BADGE } from './HarnessGuideDetail';
import type { HarnessOverview, OverviewTarget } from '../model/harness-overview';

export type TranslateFn = ReturnType<typeof useTranslations<'harness'>>;

export const COLUMN_KEYS: Readonly<Record<CoverageColumn, { head: string; hint: string; empty: string }>> = {
  told: { head: 'coverageColumnTold', hint: 'coverageColumnToldHint', empty: 'coverageEmptyTold' },
  gated: { head: 'coverageColumnGated', hint: 'coverageColumnGatedHint', empty: 'coverageEmptyGated' },
  watched: { head: 'coverageColumnWatched', hint: 'coverageColumnWatchedHint', empty: 'coverageEmptyWatched' },
};

const ORIGIN_LABEL: Readonly<Record<ScopeDeclaration['origin'], string>> = {
  root: 'coverageKindRoot',
  rule: 'coverageKindRule',
  'nested-agents': 'coverageKindNested',
  hook: 'coverageKindHook',
  'git-hook': 'coverageKindGitHook',
  permissions: 'coverageKindPermissions',
  exclusion: 'coverageKindExclusion',
  script: 'coverageKindScript',
  workflow: 'coverageKindWorkflow',
};

const ORIGIN_ORDER = Object.keys(ORIGIN_LABEL) as ReadonlyArray<ScopeDeclaration['origin']>;

const EPOCH_SEPARATOR = '~';

function groupByOrigin(
  entries: readonly ScopeDeclaration[],
): Array<[ScopeDeclaration['origin'], ScopeDeclaration[]]> {
  const grouped = new Map<ScopeDeclaration['origin'], ScopeDeclaration[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.origin) ?? [];
    list.push(entry);
    grouped.set(entry.origin, list);
  }
  return ORIGIN_ORDER.filter((origin) => grouped.has(origin)).map((origin) => [origin, grouped.get(origin)!]);
}

function ToolAttribution({ tools }: { tools: readonly AgentTool[] }) {
  if (tools.length === 0) return null;
  return (
    <span className="text-label text-[color:var(--color-text-tertiary)]">
      {tools.map((tool) => AGENT_TOOL_LABELS[tool] ?? tool).join(' · ')}
    </span>
  );
}

function EntryList({
  entries,
  trustGatedConfigs,
  t,
}: {
  entries: readonly ScopeDeclaration[];
  trustGatedConfigs: ReadonlySet<string>;
  t: TranslateFn;
}) {
  return (
    <div className="flex flex-col gap-3">
      {groupByOrigin(entries).map(([origin, list]) => (
        <div key={origin} className="flex flex-col gap-1">
          <p className="text-label uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
            {t(ORIGIN_LABEL[origin])}
          </p>
          <ul className="flex flex-col gap-2">
            {list.map((entry) => (
              <li
                key={entry.id}
                data-testid="harness-overview-entry"
                data-entry-id={entry.id}
                data-entry-origin={entry.origin}
                className="flex flex-col gap-0.5"
              >
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="break-all font-mono text-label text-[color:var(--color-text-primary)]">
                    {entry.origin === 'permissions' ? entry.label : entry.id}
                  </span>
                  <ToolAttribution tools={entry.tools} />
                  {entry.namedBy && trustGatedConfigs.has(entry.namedBy) ? (
                    <span
                      data-testid="harness-overview-trust"
                      title={t('hookApprovalGateHint')}
                      className={badgeClass({ shape: 'tag', className: WARNING_BADGE })}
                    >
                      {t('hookApprovalGate')}
                    </span>
                  ) : null}
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
        </div>
      ))}
    </div>
  );
}

function PathList({ paths, t }: { paths: readonly string[]; t: TranslateFn }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-label uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
        {t('coveragePathCount', { count: paths.length })}
      </p>
      <ul className="flex flex-col gap-0.5">
        {paths.map((path) => (
          <li key={path} className="break-all font-mono text-label text-[color:var(--color-text-tertiary)]">
            {path}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PanelBody({
  target,
  overview,
  t,
}: {
  target: OverviewTarget;
  overview: HarnessOverview;
  t: TranslateFn;
}) {
  const mapT = useTranslations('agentActivity');
  if (target.kind === 'no-path') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{t('overviewNoPathBody')}</p>
        <Link
          href={getTopologyFocusHref(target.row.slug)}
          data-testid="harness-overview-map-link"
          className={controlClass({ shape: 'link', size: 'sm', tone: 'muted', hoverInk: 'strong', className: 'self-start' })}
        >
          {mapT('openOnMap', { name: target.row.title })}
        </Link>
      </div>
    );
  }
  const { cell } = target;
  if (target.kind === 'everywhere') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-label text-[color:var(--color-text-quaternary)]">
          {t('coverageEverywhereBody', { areas: overview.pathedDomainCount })}
        </p>
        <EntryList entries={cell.entries} trustGatedConfigs={overview.trustGatedConfigs} t={t} />
      </div>
    );
  }
  const { row } = target;
  const everywhereCount = overview.everywhere.find((entry) => entry.column === cell.column)?.entries.length ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <p className="border-b border-[color:var(--color-border-soft)] pb-3 text-body leading-body text-[color:var(--color-text-secondary)]">
        {row.purpose}
      </p>
      {cell.gap ? (
        <div className="flex flex-col gap-2">
          <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-amber-source-a90)]">
            {t(COLUMN_KEYS[cell.column].empty)}
          </p>
          <p className="text-body text-[color:var(--color-text-secondary)]">
            {t('overviewEverywhereApplies', { count: everywhereCount })}
          </p>
          {cell.column === 'watched' ? (
            <p
              data-testid="harness-overview-discovered-tests"
              className="text-body tabular-nums text-[color:var(--color-text-secondary)]"
            >
              {t('coverageDiscoveredTests', { count: row.discoveredTests })}
            </p>
          ) : null}
          <PathList paths={row.paths} t={t} />
        </div>
      ) : (
        <EntryList entries={cell.entries} trustGatedConfigs={overview.trustGatedConfigs} t={t} />
      )}
      <p className="text-label text-[color:var(--color-text-quaternary)]">{t(COLUMN_KEYS[cell.column].hint)}</p>
    </div>
  );
}

function panelTitle(target: OverviewTarget, t: TranslateFn): string {
  if (target.kind === 'no-path') return target.row.title;
  const domain = target.kind === 'everywhere' ? t('coverageEverywhereTitle') : target.row.title;
  return t('overviewPanelTitle', { domain, column: t(COLUMN_KEYS[target.cell.column].head) });
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

  const renderContent = (key: string, live: boolean) => {
    const target = overview.targets.get(key);
    if (!target) return null;
    return (
      <>
        <div
          className={cn(
            'flex items-start justify-between gap-3',
            placement === 'beside' && 'sticky top-0 z-10 bg-[color:var(--color-elevated)] pb-3 pt-[var(--card-pad)]',
          )}
        >
          <h2
            id={live ? titleId : undefined}
            className="min-w-0 text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]"
          >
            {panelTitle(target, t)}
          </h2>
          <Button variant="ghost" size="sm" className="atlas-touch-floor shrink-0" onClick={onClose}>
            {t('coverageCloseNames')}
          </Button>
        </div>
        <div className={placement === 'below' ? 'mt-3' : undefined}>
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
        placement === 'below'
          ? 'rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-[var(--card-pad)] shadow-[var(--shadow-elevation-1)]'
          : 'px-[var(--card-pad)] pb-[var(--card-pad)]',
      )}
    >
      {leavingKey !== null && overview.targets.has(leavingKey) ? (
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
