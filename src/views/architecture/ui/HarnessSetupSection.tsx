'use client';

import { ChevronRight } from 'lucide-react';

import { AGENT_TOOL_LABELS, type AgentTool } from '@/entities/agent-files';
import { cn } from '@/shared/lib/cn';
import { RowButton, RowDisclosure } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import type { CodexSessionSize, SetupGroup, SetupItem, SetupSection } from '../model/harness-setup';
import { ItemStatus, statusTags, type TranslateFn } from './HarnessGuideDetail';
import { formatBytes, shortLabel } from './harness-setup-format';

const COUNT = 'shrink-0 text-label tabular-nums text-[color:var(--color-text-tertiary)]';

function ToolMarks({ tools }: { tools: readonly AgentTool[] }) {
  if (tools.length === 0) return null;
  const names = tools.map((tool) => AGENT_TOOL_LABELS[tool]);
  return (
    <span title={names.join(' · ')} className="shrink-0 whitespace-nowrap text-label text-[color:var(--color-text-tertiary)]">
      {names[0]}
      {names.length > 1 ? ` +${names.length - 1}` : ''}
    </span>
  );
}

function SessionSizes({
  claudeBytes,
  codex,
  t,
}: {
  claudeBytes: number | null;
  codex: CodexSessionSize | null;
  t: TranslateFn;
}) {
  if (claudeBytes === null && codex === null) return null;
  return (
    <div data-testid="harness-session-sizes" className="mt-2 flex flex-col gap-1.5 border-t border-[color:var(--color-overlay-1)] pt-2">
      <p className="text-label text-[color:var(--color-text-quaternary)]">{t('sessionRead')}</p>
      {claudeBytes !== null ? (
        <p className="flex items-baseline justify-between gap-3 text-label">
          <span className="text-[color:var(--color-text-secondary)]">{AGENT_TOOL_LABELS['claude-code']}</span>
          <span className="tabular-nums text-[color:var(--color-text-secondary)]">{formatBytes(claudeBytes)}</span>
        </p>
      ) : null}
      {codex !== null ? (
        <div className="flex flex-col gap-1">
          <p className="flex items-baseline justify-between gap-3 text-label">
            <span className="min-w-0 text-[color:var(--color-text-secondary)]">
              {AGENT_TOOL_LABELS.codex}
              <span className="text-[color:var(--color-text-tertiary)]"> · {t('codexSessionScope')}</span>
            </span>
            <span className={cn('shrink-0 tabular-nums', codex.over ? 'text-[color:var(--color-amber-source-a90)]' : 'text-[color:var(--color-text-secondary)]')}>
              {t('capMergedValue', { used: formatBytes(codex.used), cap: formatBytes(codex.cap) })}
            </span>
          </p>
          <div
            role="img"
            aria-label={t('capMergedValue', { used: formatBytes(codex.used), cap: formatBytes(codex.cap) })}
            className="h-1 w-full overflow-hidden rounded-micro bg-[color:var(--color-overlay-2)]"
          >
            <div
              className={cn('h-full rounded-micro', codex.over ? 'bg-[color:var(--color-amber-source-a90)]' : 'bg-[color:var(--color-indigo-a60)]')}
              style={{ width: `${Math.max(codex.percentValue, 1)}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ItemRow({
  item,
  selected,
  showTools,
  onSelect,
  t,
}: {
  item: SetupItem;
  selected: boolean;
  showTools: boolean;
  onSelect: (key: string) => void;
  t: TranslateFn;
}) {
  const hasMeta = Boolean(item.events) || (showTools && item.tools.length > 0) || statusTags(item).length > 0;
  return (
    <li>
      <RowButton
        data-harness-item={item.key}
        aria-pressed={selected}
        active={selected}
        hoverSurface="lift"
        size="sm"
        onClick={() => onSelect(item.key)}
        className={cn(
          'min-h-8 w-full flex-col items-stretch gap-1 py-1.5 pl-7',
          selected ? 'bg-[color:var(--color-indigo-a16)]' : 'bg-transparent',
        )}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            title={item.label}
            className={cn(
              'min-w-0 flex-1 truncate font-mono text-label',
              selected ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]',
            )}
          >
            {shortLabel(item.label)}
          </span>
          {item.bytes !== null ? <span className={COUNT}>{formatBytes(item.bytes)}</span> : null}
        </span>
        {hasMeta ? (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {item.events ? <span className="font-mono text-label text-[color:var(--color-text-tertiary)]">{item.events}</span> : null}
            {showTools ? <ToolMarks tools={item.tools} /> : null}
            <ItemStatus item={item} t={t} />
          </span>
        ) : null}
      </RowButton>
    </li>
  );
}

function GroupRow({
  section,
  group,
  open,
  selectedKey,
  showTools,
  onToggle,
  onSelect,
  t,
}: {
  section: SetupSection['id'];
  group: SetupGroup;
  open: boolean;
  selectedKey: string | null;
  showTools: boolean;
  onToggle: () => void;
  onSelect: (key: string) => void;
  t: TranslateFn;
}) {
  const listId = `harness-group-${section}-${group.id}`;
  const failing = group.items.some((item) => item.hookStatus === 'missing');
  return (
    <li data-harness-group={group.id}>
      <RowButton
        aria-expanded={open}
        aria-controls={listId}
        hoverSurface="lift"
        size="md"
        onClick={onToggle}
        className="w-full gap-2 bg-transparent"
      >
        <ChevronRight
          size={ICON_SIZE.sm}
          aria-hidden
          className={cn(
            'shrink-0 text-[color:var(--color-text-tertiary)] transition-[rotate] duration-[var(--motion-fast)] ease-[var(--motion-ease)] motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
        <span className="min-w-0 flex-1 truncate text-left text-body text-[color:var(--color-text-primary)]">
          {t(`groups.${group.id}`)}
        </span>
        {failing ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[color:var(--color-amber-source-a90)]" /> : null}
        {group.bytes > 0 ? <span className={COUNT}>{formatBytes(group.bytes)}</span> : null}
        <span data-harness-group-count className="w-7 shrink-0 text-right text-label tabular-nums text-[color:var(--color-text-secondary)]">
          {group.items.length}
        </span>
      </RowButton>
      <RowDisclosure open={open} id={listId}>
        <ul className="flex flex-col gap-0.5 pb-1">
          {group.items.map((item) => (
            <ItemRow
              key={item.key}
              item={item}
              selected={item.key === selectedKey}
              showTools={showTools}
              onSelect={onSelect}
              t={t}
            />
          ))}
        </ul>
      </RowDisclosure>
    </li>
  );
}

export function HarnessSetupSection({
  section,
  isOpen,
  onToggle,
  selectedKey,
  showTools,
  onSelect,
  claudeSessionBytes,
  codexSession,
  t,
}: {
  section: SetupSection;
  isOpen: (group: SetupGroup) => boolean;
  onToggle: (group: SetupGroup) => void;
  selectedKey: string | null;
  showTools: boolean;
  onSelect: (key: string) => void;
  claudeSessionBytes?: number | null;
  codexSession?: CodexSessionSize | null;
  t: TranslateFn;
}) {
  const headingId = `harness-section-${section.id}`;
  return (
    <section
      aria-labelledby={headingId}
      data-harness-section={section.id}
      className="flex min-w-0 flex-col rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2"
    >
      <header className="px-2.5 pb-2 pt-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={headingId} className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {t(`sections.${section.id}.title`)}
          </h2>
          <span data-harness-section-total className="text-label tabular-nums text-[color:var(--color-text-secondary)]">
            {t('sectionTotal', { count: section.total })}
          </span>
        </div>
        <p className="mt-0.5 text-label text-[color:var(--color-text-tertiary)]">{t(`sections.${section.id}.caption`)}</p>
        {section.id === 'context' ? (
          <SessionSizes claudeBytes={claudeSessionBytes ?? null} codex={codexSession ?? null} t={t} />
        ) : null}
      </header>
      {section.groups.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {section.groups.map((group) => (
            <GroupRow
              key={group.id}
              section={section.id}
              group={group}
              open={isOpen(group)}
              selectedKey={selectedKey}
              showTools={showTools}
              onToggle={() => onToggle(group)}
              onSelect={onSelect}
              t={t}
            />
          ))}
        </ul>
      ) : (
        <p className="px-2.5 pb-1.5 text-label text-[color:var(--color-text-quaternary)]">{t('sectionNone')}</p>
      )}
      {section.aside.length > 0 ? (
        <ul data-harness-aside className="mt-1 flex flex-col gap-0.5 border-t border-[color:var(--color-overlay-1)] pt-1">
          {section.aside.map((group) => (
            <GroupRow
              key={group.id}
              section={section.id}
              group={group}
              open={isOpen(group)}
              selectedKey={selectedKey}
              showTools={showTools}
              onToggle={() => onToggle(group)}
              onSelect={onSelect}
              t={t}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
