'use client';

import type { ReactNode } from 'react';
import type { useTranslations } from 'next-intl';

import { AGENT_TOOL_LABELS, guideCitation, type AgentTool, type HarnessReport } from '@/entities/agent-files';

import { HarnessDriftDiff } from './HarnessDriftDiff';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';
import { cn } from '@/shared/lib/cn';
import type { SetupItem } from '../model/harness-setup';
import { formatBytes } from './harness-setup-format';

/** The amber pair every failing status on this screen wears. */
export const WARNING_BADGE =
  'border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]';

export const NEUTRAL_BADGE = 'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)]';

const FACT_LABEL = 'text-label text-[color:var(--color-text-quaternary)]';

export type TranslateFn = ReturnType<typeof useTranslations<'harness'>>;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 @min-[26rem]/guide-detail:grid-cols-[6.5rem_minmax(0,1fr)] @min-[26rem]/guide-detail:gap-4">
      <dt className={cn(FACT_LABEL, '@min-[26rem]/guide-detail:pt-px')}>{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function ReadBy({ tools, ruleId, t }: { tools: readonly AgentTool[]; ruleId: string | null; t: TranslateFn }) {
  return (
    <ul className="flex flex-col gap-1">
      {tools.map((tool) => {
        const citation = ruleId ? guideCitation(ruleId, tool) : null;
        const condition = citation?.condition
          ? citation.condition === 'coding-agent'
            ? t('conditionCodingAgent')
            : t('conditionSettingsContext')
          : null;
        return (
          <li key={tool} className="flex min-h-5 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-body text-[color:var(--color-text-primary)]">{AGENT_TOOL_LABELS[tool]}</span>
            {condition ? <span className="text-label text-[color:var(--color-text-quaternary)]">{condition}</span> : null}
            {citation ? (
              /* ↗ prefixes an external destination; a WKWebView has no status bar to show it. */
              <a
                href={citation.source}
                target="_blank"
                rel="noreferrer"
                title={citation.source}
                aria-label={t('toolsSourceFor', { tool: AGENT_TOOL_LABELS[tool], host: new URL(citation.source).host })}
                className={controlClass({
                  shape: 'link',
                  hoverInk: 'secondary',
                  className: 'text-label text-[color:var(--color-text-quaternary)] underline decoration-dotted underline-offset-2',
                })}
              >
                ↗{t('toolsSource')}
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function CodexShare({ report, t }: { report: HarnessReport; t: TranslateFn }) {
  const cap = report.analysis.checks.codexSizeCap;
  if (cap.worstCaseBytes === null) return null;
  const over = cap.status === 'drift';
  return (
    <p className={cn('text-label tabular-nums', over ? 'text-[color:var(--color-amber-source-a90)]' : 'text-[color:var(--color-text-tertiary)]')}>
      {t('capMergedValue', { used: formatBytes(cap.worstCaseBytes), cap: formatBytes(cap.capBytes) })}
      {over ? ` · ${t('capOver')}` : ''}
    </p>
  );
}

interface StatusTag {
  key: 'missing' | 'wired' | 'approval' | 'always' | 'path' | 'allow' | 'ask' | 'deny' | 'copy' | 'imported' | 'unwired';
  warning: boolean;
}

/** Deny first: what a person reads first is what is refused outright. */
const PERMISSION_LISTS = ['deny', 'ask', 'allow'] as const;

const PERMISSION_LABEL = Object.freeze({
  allow: 'permissionAllow',
  ask: 'permissionAsk',
  deny: 'permissionDeny',
} as const);

/**
 * Every status the item carries, in reading order; a warning is something that fails. A command
 * that runs no script file carries none: it is shown as written, not judged.
 */
export function statusTags(item: SetupItem): StatusTag[] {
  const tags: StatusTag[] = [];
  if (item.hookStatus === 'missing') tags.push({ key: 'missing', warning: true });
  if (item.hookStatus === 'wired') tags.push({ key: 'wired', warning: false });
  if (item.approvalGate) tags.push({ key: 'approval', warning: false });
  if (item.loading) tags.push({ key: item.loading, warning: false });
  for (const list of PERMISSION_LISTS) {
    if (item.permissionCounts?.[list]) tags.push({ key: list, warning: false });
  }
  if (item.differsFrom) tags.push({ key: 'copy', warning: false });
  if (item.importedByClaudeMd) tags.push({ key: 'imported', warning: false });
  if (item.unwired) tags.push({ key: 'unwired', warning: false });
  return tags;
}

function tagText(tag: StatusTag, item: SetupItem, t: TranslateFn): { text: string; title?: string } {
  switch (tag.key) {
    case 'missing':
      return { text: t('hookMissing'), title: t('hookMissingHint') };
    case 'wired':
      return { text: t('hookWired'), title: t('hookWiredHint') };
    case 'approval':
      return { text: t('hookApprovalGate'), title: t('hookApprovalGateHint') };
    case 'always':
      return { text: t('loadingAlways') };
    case 'path':
      return { text: t('loadingPath') };
    case 'allow':
    case 'ask':
    case 'deny':
      return { text: t(PERMISSION_LABEL[tag.key], { count: item.permissionCounts?.[tag.key] ?? 0 }) };
    case 'copy':
      return { text: t(item.differsFrom === 'codex' ? 'differsFromCodex' : 'differsFromClaude') };
    case 'imported':
      return { text: t('importedByClaudeMd') };
    case 'unwired':
      return { text: t('hookUnwired') };
  }
}

/** Amber only for what fails; every other status stays neutral. */
export function ItemStatus({ item, t }: { item: SetupItem; t: TranslateFn }) {
  const tags = statusTags(item);
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => {
        const { text, title } = tagText(tag, item, t);
        return (
          <span
            key={tag.key}
            title={title}
            data-harness-status={tag.key}
            className={badgeClass({ shape: 'tag', className: cn('whitespace-nowrap', tag.warning ? WARNING_BADGE : NEUTRAL_BADGE) })}
          >
            {text}
          </span>
        );
      })}
    </span>
  );
}

export function SetupItemDetail({
  item,
  report,
  current,
  headingId,
  t,
}: {
  item: SetupItem;
  report: HarnessReport;
  current: boolean;
  headingId?: string;
  t: TranslateFn;
}) {
  const capped = item.ruleId === 'agents-md' || item.ruleId === 'nested-agents-md';
  /* A hook with no script to show opens the config that names it, where the line to fix is. */
  const shown = item.hasContent ? item.path : item.namedBy && report.contents.has(item.namedBy) ? item.namedBy : null;
  const sides = item.pairPaths ?? (shown ? [shown] : null);
  return (
    <div data-testid={current ? 'harness-item-detail' : undefined} data-harness-item={item.key}>
      <h2 id={headingId} className="break-all font-mono text-body-lg text-[color:var(--color-text-primary)]">
        {item.label}
      </h2>
      <dl className="mt-1 divide-y divide-[color:var(--color-overlay-1)]">
        {item.label !== item.path ? (
          <Fact label={t('detailPath')}>
            <p className="break-all font-mono text-label text-[color:var(--color-text-secondary)]">{item.path}</p>
          </Fact>
        ) : null}
        {item.tools.length > 0 ? (
          <Fact label={t('detailReadBy')}>
            <ReadBy tools={item.tools} ruleId={item.ruleId} t={t} />
          </Fact>
        ) : null}
        {item.bytes !== null ? (
          <Fact label={t('detailSize')}>
            <p className="text-body tabular-nums text-[color:var(--color-text-primary)]">{formatBytes(item.bytes)}</p>
            {capped ? <CodexShare report={report} t={t} /> : null}
          </Fact>
        ) : null}
        {item.events || item.namedBy ? (
          <Fact label={t('detailEvent')}>
            <p className="break-all text-body text-[color:var(--color-text-secondary)]">
              <span className="font-mono">{item.events}</span>
              {item.namedBy ? <span className="text-label text-[color:var(--color-text-tertiary)]"> · {item.namedBy}</span> : null}
            </p>
          </Fact>
        ) : null}
        {statusTags(item).length > 0 ? (
          <Fact label={t('detailStatus')}>
            <ItemStatus item={item} t={t} />
          </Fact>
        ) : null}
        {item.declaration ? (
          <Fact label={t('detailDeclared')}>
            <p className="break-all font-mono text-label text-[color:var(--color-text-secondary)]">{item.declaration}</p>
          </Fact>
        ) : null}
      </dl>
      {sides ? (
        <div className="mt-3">
          <HarnessDriftDiff
            paths={sides}
            texts={sides.map((path) => report.contents.get(path) ?? '')}
            current={current}
            t={t}
          />
        </div>
      ) : null}
    </div>
  );
}
