'use client';

import type { KeyboardEvent } from 'react';

import { AGENT_TOOL_LABELS, type AgentTool } from '@/entities/agent-files';
import { cn } from '@/shared/lib/cn';
import { RowButton } from '@/shared/ui';

import type { CodexSessionSize, SetupGroupId, SetupItem, SetupSectionId } from '../model/harness-setup';
import { ItemStatus, type TranslateFn } from './HarnessGuideDetail';
import { formatBytes, shortLabel } from './harness-setup-format';

const COUNT = 'shrink-0 text-label tabular-nums text-[color:var(--color-text-tertiary)]';

const WARNING_INK = 'text-[color:var(--color-amber-source-a90)]';

/** One category of pane 1: its items under the tool filter, and how many of them hold a problem. */
export interface SetupCategory {
  key: string;
  id: SetupGroupId;
  items: readonly SetupItem[];
  bytes: number;
  problems: number;
  /** Hooks from every settings file, when the app read them; the items count otherwise. */
  count?: number;
}

export function categorySize(category: SetupCategory): number {
  return category.count ?? category.items.length;
}

export interface SetupArea {
  id: SetupSectionId;
  total: number;
  problems: number;
  categories: readonly SetupCategory[];
  /** Verification's hooks on other events and unwired scripts: listed, never counted as checks. */
  aside: readonly SetupCategory[];
}

/**
 * Arrow keys, Home and End move the selection inside one pane; the pane's options may span several
 * listboxes, as pane 1's three areas do, so Tab still reaches the pane once.
 */
export function moveInPane(event: KeyboardEvent<HTMLElement>, onMove: (key: string) => void) {
  const target = event.target as HTMLElement;
  if (target.getAttribute('role') !== 'option') return;
  const options = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]:not(:disabled)')];
  const index = options.indexOf(target);
  const last = options.length - 1;
  const next =
    event.key === 'ArrowDown' ? Math.min(index + 1, last)
    : event.key === 'ArrowUp' ? Math.max(index - 1, 0)
    : event.key === 'Home' ? 0
    : event.key === 'End' ? last
    : null;
  if (next === null || index < 0) return;
  event.preventDefault();
  const option = options[next];
  const key = option?.dataset.optionKey;
  if (!option || !key) return;
  onMove(key);
  option.focus();
}

function ProblemMark({ count, t }: { count: number; t: TranslateFn }) {
  if (count === 0) return null;
  return (
    <span data-harness-problem-count={count} className={cn('flex shrink-0 items-center gap-1 text-label tabular-nums', WARNING_INK)}>
      <span aria-hidden className="size-1.5 rounded-full bg-[color:var(--color-amber-source-a90)]" />
      <span aria-hidden>{count}</span>
      <span className="sr-only">{t('problemCount', { count })}</span>
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
    <div data-testid="harness-session-sizes" className="flex flex-col gap-2 pb-1 pt-3">
      <p className="text-label text-[color:var(--color-text-tertiary)]">{t('sessionRead')}</p>
      {claudeBytes !== null ? (
        <p className="flex items-baseline justify-between gap-3 text-body">
          <span className="text-[color:var(--color-text-secondary)]">{AGENT_TOOL_LABELS['claude-code']}</span>
          <span className="tabular-nums text-[color:var(--color-text-primary)]">{formatBytes(claudeBytes)}</span>
        </p>
      ) : null}
      {codex !== null ? (
        <div className="flex flex-col gap-1">
          <p className="flex items-baseline justify-between gap-3 text-body">
            <span className="text-[color:var(--color-text-secondary)]">{AGENT_TOOL_LABELS.codex}</span>
            <span className={cn('shrink-0 tabular-nums', codex.over ? WARNING_INK : 'text-[color:var(--color-text-primary)]')}>
              {formatBytes(codex.used)}
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
          <p className="flex items-baseline justify-between gap-3 text-label text-[color:var(--color-text-tertiary)]">
            <span className="min-w-0">{t('codexSessionScope')}</span>
            <span className="shrink-0 tabular-nums">{t('capLimit', { cap: formatBytes(codex.cap) })}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CategoryOption({
  category,
  selected,
  focusable,
  onSelect,
  t,
}: {
  category: SetupCategory;
  selected: boolean;
  focusable: boolean;
  onSelect: (key: string) => void;
  t: TranslateFn;
}) {
  const empty = categorySize(category) === 0;
  return (
    <li role="none">
      <RowButton
        role="option"
        aria-selected={selected}
        tabIndex={focusable ? 0 : -1}
        disabled={empty}
        data-option-key={category.key}
        data-harness-group={category.id}
        active={selected}
        hoverSurface="lift"
        size="md"
        onClick={() => onSelect(category.key)}
        className="w-full gap-2.5"
      >
        <span className={cn('min-w-0 flex-1 truncate', selected ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]')}>
          {t(`groups.${category.id}`)}
        </span>
        <ProblemMark count={category.problems} t={t} />
        {category.bytes > 0 ? <span className={COUNT}>{formatBytes(category.bytes)}</span> : null}
        <span data-harness-group-count className="w-6 shrink-0 text-right text-label tabular-nums text-[color:var(--color-text-secondary)]">
          {categorySize(category)}
        </span>
      </RowButton>
    </li>
  );
}

/** One area of pane 1: its heading, what it means, and its categories as a listbox. */
export function HarnessSetupSection({
  area,
  selectedKey,
  focusKey,
  onSelect,
  claudeSessionBytes,
  codexSession,
  t,
}: {
  area: SetupArea;
  selectedKey: string | null;
  /** The one option of pane 1 that Tab reaches. */
  focusKey: string | null;
  onSelect: (key: string) => void;
  claudeSessionBytes?: number | null;
  codexSession?: CodexSessionSize | null;
  t: TranslateFn;
}) {
  const headingId = `harness-section-${area.id}`;
  const option = (category: SetupCategory) => (
    <CategoryOption
      key={category.key}
      category={category}
      selected={category.key === selectedKey}
      focusable={category.key === focusKey}
      onSelect={onSelect}
      t={t}
    />
  );
  return (
    <section aria-labelledby={headingId} data-harness-section={area.id} className="flex flex-col">
      <header className="px-2.5 pb-2">
        <div className="flex items-baseline gap-2.5">
          <h2 id={headingId} className="min-w-0 flex-1 text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {t(`sections.${area.id}.title`)}
          </h2>
          <ProblemMark count={area.problems} t={t} />
          <span data-harness-section-total className="shrink-0 text-label tabular-nums text-[color:var(--color-text-secondary)]">
            {t('sectionTotal', { count: area.total })}
          </span>
        </div>
        <p className="mt-0.5 text-label text-[color:var(--color-text-tertiary)]">{t(`sections.${area.id}.caption`)}</p>
        {area.id === 'context' ? (
          <SessionSizes claudeBytes={claudeSessionBytes ?? null} codex={codexSession ?? null} t={t} />
        ) : null}
      </header>
      {area.categories.length + area.aside.length > 0 ? (
        <ul role="listbox" aria-labelledby={headingId} className="flex flex-col gap-0.5">
          {area.categories.map(option)}
          {area.aside.length > 0 ? (
            <li role="none" data-harness-aside className="mx-2.5 my-1 border-t border-[color:var(--color-overlay-1)]" />
          ) : null}
          {area.aside.map(option)}
        </ul>
      ) : (
        <p className="px-2.5 text-label text-[color:var(--color-text-quaternary)]">{t('sectionNone')}</p>
      )}
    </section>
  );
}

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

/** Long names lose their middle, so the folder's start and the file's own name both stay readable. */
function MiddleTruncated({ label, className }: { label: string; className: string }) {
  const tail = middleTail(label);
  return (
    <span title={label} className={cn('flex min-w-0 flex-1 font-mono', className)}>
      <span className="min-w-0 truncate">{label.slice(0, label.length - tail.length)}</span>
      <span className="shrink-0 whitespace-pre">{tail}</span>
    </span>
  );
}

const MIDDLE_TAIL_MAX = 20;

/** The end that always stays: from the last separator that leaves at most `MIDDLE_TAIL_MAX` characters. */
function middleTail(label: string): string {
  const from = Math.max(0, label.length - MIDDLE_TAIL_MAX);
  const separator = label.slice(from).search(/[/\-_.]/);
  return separator < 0 ? label.slice(from) : label.slice(from + separator);
}

export interface ItemOption {
  item: SetupItem;
  /** The skill directory a file belongs to; its rows read from below it. */
  parent: SetupItem | null;
}

/** Pane 2: the selected category's items, a skill's files listed under it rather than folded. */
export function HarnessItemList({
  labelledBy,
  options,
  selectedKey,
  problemKeys,
  showTools,
  onSelect,
  t,
}: {
  labelledBy: string;
  options: readonly ItemOption[];
  selectedKey: string | null;
  problemKeys: ReadonlySet<string>;
  showTools: boolean;
  onSelect: (key: string) => void;
  t: TranslateFn;
}) {
  return (
    <ul role="listbox" aria-labelledby={labelledBy} className="flex flex-col gap-0.5">
      {options.map(({ item, parent }) => {
        const selected = item.key === selectedKey;
        const label = parent ? item.path.slice(parent.label.length + 1) : shortLabel(item.label);
        return (
          <li role="none" key={item.key}>
            <RowButton
              role="option"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              data-option-key={item.key}
              data-harness-item={item.key}
              data-harness-problem-item={problemKeys.has(item.key) || undefined}
              active={selected}
              hoverSurface="lift"
              size="md"
              onClick={() => onSelect(item.key)}
              className={cn('h-13 w-full flex-col items-stretch justify-center gap-0.5 py-1.5', parent && 'pl-7')}
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <MiddleTruncated
                  label={label}
                  className={cn('text-body', selected ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]')}
                />
                {item.bytes !== null ? <span className={COUNT}>{formatBytes(item.bytes)}</span> : null}
              </span>
              <span className="flex min-w-0 items-center gap-x-2 overflow-hidden">
                {item.events ? <span className="shrink-0 font-mono text-label text-[color:var(--color-text-tertiary)]">{item.events}</span> : null}
                {showTools && !parent ? <ToolMarks tools={item.tools} /> : null}
                <ItemStatus item={item} oneLine t={t} />
              </span>
            </RowButton>
          </li>
        );
      })}
    </ul>
  );
}
