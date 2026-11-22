'use client';

import { Fragment, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, FileText } from 'lucide-react';

import { AGENT_TOOL_LABELS, type HarnessReport } from '@/entities/agent-files';
import { ReachGrid, ReachMark, ScopePath } from '@/entities/agent-scopes';
import { cn } from '@/shared/lib/cn';
import type { HarnessScopes, PickOutcome, ScopePlatform, ScopeTool } from '@/shared/lib/harness-scopes/tauri-harness-scopes';
import { Button, CloseButton, Dialog, RowButton, TabBar } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import {
  combineKeys,
  CONFIG_VARIABLE,
  describedPath,
  guessPlatform,
  projectListed,
  settingsFileName,
  whatKey,
  WHERE_KINDS,
  whereKindTabs,
  whereRows,
  type MessageRef,
  type WhereCount,
  type WhereKind,
  type WhereRow,
} from '../model/where-settings';

type Say = (key: string, values?: Record<string, string | number>) => string;

/** What the popup opens on; anything left out falls back to Claude Code, hooks and Project. */
export interface WhereSettingsRequest {
  tool?: ScopeTool;
  kind?: WhereKind;
  /** A stack row: a scope name, or a picked file's id. */
  row?: string;
}

const TOOLS: readonly ScopeTool[] = ['claude-code', 'codex'];

const TITLE_ID = 'where-settings-title';

function useSay(): (message: MessageRef) => string {
  const t = useTranslations('harness') as unknown as Say;
  return useMemo(() => {
    const say = (message: MessageRef): string => {
      const values: Record<string, string | number> = {};
      for (const [name, value] of Object.entries(message.values ?? {})) {
        values[name] =
          typeof value === 'string' || typeof value === 'number' ? value
          : Array.isArray(value) ? value.map(say).join(' · ')
          : say(value as MessageRef);
      }
      return t(message.key, values);
    };
    return say;
  }, [t]);
}

function CountText({ count, say }: { count: WhereCount | null; say: (message: MessageRef) => string }) {
  if (!count) return null;
  const none = count.kind === 'message' && /count\.(none|unread)$/.test(count.message.key);
  return (
    <span
      data-where-count
      className={cn(
        'shrink-0 whitespace-nowrap text-label tabular-nums',
        none ? 'text-[color:var(--color-text-quaternary)]' : 'text-[color:var(--color-text-secondary)]',
      )}
    >
      {count.kind === 'number' ? say({ key: 'scopes.count.total', values: { count: count.value } }) : say(count.message)}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 py-2.5 [&+&]:border-t [&+&]:border-[color:var(--color-overlay-1)]">
      <dt className="pt-px text-label text-[color:var(--color-text-quaternary)]">{label}</dt>
      <dd className="min-w-0 text-pretty text-body text-[color:var(--color-text-primary)]">{children}</dd>
    </div>
  );
}

function PickAnswer({ outcome, say }: { outcome: PickOutcome | null; say: (message: MessageRef) => string }) {
  if (!outcome || outcome.outcome === 'held' || outcome.outcome === 'cancelled') return null;
  const message: MessageRef =
    outcome.outcome === 'already-listed' ? { key: 'scopes.pick.alreadyListed', values: { file: outcome.path } }
    : outcome.reason === 'in-repository' ?
      { key: 'scopes.pick.inRepository', values: { file: outcome.path, repository: outcome.repository ?? '' } }
    : { key: `scopes.pick.${outcome.reason.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}` };
  return (
    <p
      role="status"
      data-testid="where-settings-pick-answer"
      data-pick-outcome={outcome.outcome === 'refused' ? outcome.reason : outcome.outcome}
      className="mt-2.5 flex gap-2 rounded-chip border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a08)] px-2.5 py-2 text-label text-[color:var(--color-amber-source-text-a95)]"
    >
      <AlertTriangle size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-amber-source-a90)]" />
      <span className="min-w-0 break-words">{say(message)}</span>
    </p>
  );
}

function ScopeDetail({
  row,
  kind,
  tool,
  pickOutcome,
  onPick,
  say,
}: {
  row: WhereRow;
  kind: WhereKind;
  tool: ScopeTool;
  pickOutcome: PickOutcome | null;
  onPick?: () => void;
  say: (message: MessageRef) => string;
}) {
  const described = row.fullPath === '' ? describedPath(kind) : null;
  return (
    <div data-testid="where-settings-detail" data-where-row={row.key} className="min-w-0">
      <div className="flex min-h-6 items-center gap-2 pb-0.5">
        <h3 className="text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{row.name}</h3>
        {row.picked ? (
          <span className="rounded-chip border border-[color:var(--color-indigo-line-a35)] px-1.5 text-label text-[color:var(--color-text-secondary)]">
            {say({ key: 'scopes.picked' })}
          </span>
        ) : null}
      </div>
      <dl className="flex flex-col">
        <Fact label={say({ key: 'scopes.label.file' })}>
          {described ? (
            <span>{say(described)}</span>
          ) : (
            <span className="block break-all font-mono text-label text-[color:var(--color-text-secondary)]">{row.fullPath}</span>
          )}
          {row.fileNote ? <span className="mt-1 block text-label text-[color:var(--color-text-tertiary)]">{say(row.fileNote)}</span> : null}
        </Fact>
        <Fact label={say({ key: 'scopes.label.affects' })}>
          <span className="flex flex-col items-start gap-2.5">
            <span className="min-w-0">{say(row.affects)}</span>
            <ReachGrid
              reach={row.reach}
              label={say(row.affects)}
              labels={{
                me: say({ key: 'scopes.grid.me' }),
                others: say({ key: 'scopes.grid.others' }),
                here: say({ key: 'scopes.grid.thisRepository' }),
                elsewhere: say({ key: 'scopes.grid.otherProjects' }),
              }}
            />
          </span>
        </Fact>
        <Fact label={say({ key: 'scopes.label.git' })}>{say(row.git)}</Fact>
        {row.now ? <Fact label={say({ key: 'scopes.label.now' })}>{say(row.now)}</Fact> : null}
        <Fact label={say({ key: `scopes.label.${row.differsLabel}` })}>{say(row.differs)}</Fact>
      </dl>
      {row.canPickAnother && onPick ? (
        <div className="mt-3 border-t border-[color:var(--color-overlay-1)] pt-3">
          <p className="mb-2 max-w-[60ch] text-pretty text-label text-[color:var(--color-text-tertiary)]">
            {say({
              key: 'scopes.another.note',
              values: { variable: CONFIG_VARIABLE[tool], fileName: settingsFileName(tool) },
            })}
          </p>
          <Button variant="outline" size="sm" data-testid="where-settings-pick" onClick={onPick}>
            <FileText size={ICON_SIZE.sm} aria-hidden />
            {say({ key: 'scopes.another.action' })}
          </Button>
          <PickAnswer outcome={pickOutcome} say={say} />
        </div>
      ) : null}
    </div>
  );
}

function SumLine({ rows, say }: { rows: readonly WhereRow[]; say: (message: MessageRef) => string }) {
  const counted = rows.filter((row) => row.hookCount !== null);
  if (counted.length === 0) return null;
  const total = counted.reduce((sum, row) => sum + (row.hookCount ?? 0), 0);
  return (
    <p data-testid="where-settings-sum" className="mt-3.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 px-0.5 text-label text-[color:var(--color-text-tertiary)]">
      {counted.map((row, index) => (
        <Fragment key={row.key}>
          {index > 0 ? <span aria-hidden className="text-[color:var(--color-text-quaternary)]">+</span> : null}
          <span className="inline-flex items-baseline gap-1.5">
            {row.name}
            <b className="font-mono font-normal tabular-nums text-[color:var(--color-text-secondary)]">{row.hookCount}</b>
          </span>
        </Fragment>
      ))}
      <span aria-hidden className="text-[color:var(--color-text-quaternary)]">=</span>
      <b className="text-body font-[var(--font-weight-signature)] tabular-nums text-[color:var(--color-text-primary)]">
        {say({ key: 'scopes.count.total', values: { count: total } })}
      </b>
    </p>
  );
}

function WhereSettingsBody({
  request,
  scopes,
  report,
  pickOutcome,
  onPick,
  onClose,
  inApp,
}: {
  request: WhereSettingsRequest;
  inApp: boolean;
  scopes: HarnessScopes | null;
  report: HarnessReport | null;
  pickOutcome: PickOutcome | null;
  onPick?: (dialogTitle: string) => void;
  onClose: () => void;
}) {
  const say = useSay();
  const stackId = useId();
  const [tool, setTool] = useState<ScopeTool>(request.tool ?? 'claude-code');
  const [kind, setKind] = useState<WhereKind>(request.kind ?? 'hooks');
  const [chosenRow, setChosenRow] = useState<string | null>(request.row ?? null);
  const shownKind = WHERE_KINDS[tool].includes(kind) ? kind : 'hooks';
  const platform: ScopePlatform =
    scopes?.platform ?? (typeof navigator === 'undefined' ? 'macos' : guessPlatform(navigator.userAgent));
  const listed = useMemo(() => (report && scopes ? projectListed(report, tool) : null), [report, scopes, tool]);
  const rows = whereRows({
    tool,
    kind: shownKind,
    platform,
    scopes,
    listed,
    repositoryWord: say({ key: 'scopes.repository' }),
  });
  const row = rows.find((entry) => entry.key === chosenRow) ?? rows.find((entry) => entry.scope === 'project') ?? rows[0]!;
  const tabs = whereKindTabs(tool, scopes);
  const combine = combineKeys(tool, shownKind);

  const moveInStack = (event: KeyboardEvent<HTMLElement>) => {
    const index = rows.findIndex((entry) => entry.key === row.key);
    const next =
      event.key === 'ArrowDown' ? Math.min(index + 1, rows.length - 1)
      : event.key === 'ArrowUp' ? Math.max(index - 1, 0)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? rows.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    const target = rows[next]!;
    setChosenRow(target.key);
    event.currentTarget.querySelector<HTMLElement>(`[data-where-row="${CSS.escape(target.key)}"]`)?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-4 px-6 pt-5">
        <h2 id={TITLE_ID} className="min-w-0 flex-1 text-title font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
          {say({ key: 'scopes.title', values: { tool: AGENT_TOOL_LABELS[tool] } })}
        </h2>
        <SegmentedControl<ScopeTool>
          ariaLabel={say({ key: 'scopes.toolAria' })}
          testId="where-settings-tool"
          size="md"
          value={tool}
          options={TOOLS.map((entry) => ({ value: entry, label: <span className="whitespace-nowrap">{AGENT_TOOL_LABELS[entry]}</span> }))}
          onChange={(next) => {
            setTool(next);
            setChosenRow(null);
          }}
        />
        <CloseButton label={say({ key: 'close' })} onClick={onClose} data-testid="where-settings-close" className="-mr-2 shrink-0" />
      </header>
      <p className="min-h-[calc(2lh+0.375rem)] max-w-[80ch] text-pretty px-6 pt-1.5 text-body text-[color:var(--color-text-secondary)]">{say({ key: whatKey(tool, shownKind) })}</p>
      <div className="mt-3 px-6">
        <TabBar
          ariaLabel={say({ key: 'scopes.kindsAria' })}
          idPrefix="where-settings"
          testId="where-settings-kinds"
          activeKey={shownKind}
          onSelect={(key) => {
            setKind(key as WhereKind);
            setChosenRow(null);
          }}
          items={tabs.map((tab) => ({
            key: tab.kind,
            label: say({ key: `scopes.kind.${tab.kind}` }),
            count: tab.count ?? undefined,
            testId: `where-settings-kind-${tab.kind}`,
          }))}
        />
      </div>
      <div
        role="tabpanel"
        id={`where-settings-tabpanel-${shownKind}`}
        aria-labelledby={`where-settings-tab-${shownKind}`}
        className="grid min-h-0 flex-1 grid-cols-1 gap-x-8 gap-y-6 overflow-y-auto overscroll-contain border-t border-[color:var(--color-border-soft)] px-6 pb-5 pt-[1.125rem] min-[1008px]:grid-cols-[24.5rem_minmax(0,1fr)] min-[1008px]:content-start"
      >
        <div className="min-w-0">
          <p id={stackId} className="px-0.5 pb-2 text-label text-[color:var(--color-text-tertiary)]">{say({ key: 'scopes.order' })}</p>
          <ul
            role="listbox"
            aria-labelledby={stackId}
            data-testid="where-settings-stack"
            onKeyDown={moveInStack}
            className="flex flex-col overflow-hidden rounded-card border border-[color:var(--color-border-soft)]"
          >
            {rows.map((entry) => {
              const selected = entry.key === row.key;
              return (
                <li role="none" key={entry.key} className="[&+&]:border-t [&+&]:border-[color:var(--color-border-soft)]">
                  <RowButton
                    role="option"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    data-where-row={entry.key}
                    active={selected}
                    size="md"
                    onClick={() => setChosenRow(entry.key)}
                    className="grid h-14 w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-none px-3.5 text-left"
                  >
                    <ReachMark reach={entry.reach} size="md" active={selected} />
                    <span className="flex min-w-0 flex-col">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className={cn('shrink-0 text-body', selected ? 'font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]')}>
                          {entry.name}
                        </span>
                        {entry.picked ? (
                          <span className="shrink-0 rounded-chip border border-[color:var(--color-indigo-line-a35)] px-1.5 text-label text-[color:var(--color-text-secondary)]">
                            {say({ key: 'scopes.picked' })}
                          </span>
                        ) : null}
                        {entry.pathIsCode && !entry.picked ? (
                          <span className={cn('min-w-0 truncate font-mono text-label', selected ? 'text-[color:var(--color-text-tertiary)]' : 'text-[color:var(--color-text-quaternary)]')}>
                            {entry.shortPath}
                          </span>
                        ) : null}
                      </span>
                      {entry.picked ? (
                        <ScopePath path={entry.shortPath} className="text-label text-[color:var(--color-text-quaternary)]" />
                      ) : (
                        <span className="min-w-0 truncate text-label text-[color:var(--color-text-tertiary)]">{say(entry.caption)}</span>
                      )}
                    </span>
                    <CountText count={entry.count} say={say} />
                  </RowButton>
                </li>
              );
            })}
          </ul>
          {shownKind === 'hooks' && scopes ? <SumLine rows={rows} say={say} /> : null}
          <p data-testid="where-settings-combine" className="mt-2 text-pretty px-0.5 text-body text-[color:var(--color-text-tertiary)]">
            <b className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{say({ key: combine.lead })}</b>{' '}
            {say({ key: combine.body })}
          </p>
        </div>
        <ScopeDetail
          row={row}
          kind={shownKind}
          tool={tool}
          pickOutcome={pickOutcome}
          onPick={onPick ? () => onPick(say({ key: 'scopes.another.action' })) : undefined}
          say={say}
        />
      </div>
      <footer className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 border-t border-[color:var(--color-border-soft)] px-6 pb-4 pt-3 text-label text-[color:var(--color-text-tertiary)]">
        <span className="text-[color:var(--color-text-quaternary)]">{say({ key: inApp ? 'scopes.label.notRead' : 'scopes.label.web' })}</span>
        <span className="text-pretty">{say({ key: inApp ? `scopes.notRead.${tool === 'codex' ? 'codex' : 'claude'}` : 'scopes.webNote' })}</span>
      </footer>
    </div>
  );
}

/**
 * Where each agent setting lives, for Claude Code and Codex: every scope from the widest reach to
 * the narrowest, what each holds now in the app, and how the scopes combine. Escape closes it.
 */
export function WhereSettingsDialog({
  request,
  onClose,
  scopes,
  inApp = false,
  report = null,
  pickOutcome = null,
  onPick,
}: {
  /** `null` closes the popup. */
  request: WhereSettingsRequest | null;
  onClose: () => void;
  /** The installed app: the foot names what Atlas does not read instead of what a browser cannot. */
  inApp?: boolean;
  /** `null` on the web and wherever the app has not read the files. */
  scopes: HarnessScopes | null;
  report?: HarnessReport | null;
  pickOutcome?: PickOutcome | null;
  onPick?: (dialogTitle: string) => void;
}) {
  /* The last request stays mounted through the exit motion; each new opening starts fresh. */
  const [shown, setShown] = useState<{ request: WhereSettingsRequest; opening: number } | null>(null);
  if (request && request !== shown?.request) setShown({ request, opening: (shown?.opening ?? 0) + 1 });
  return (
    <Dialog open={request !== null} onClose={onClose} size="lg" labelledBy={TITLE_ID} testId="where-settings" className="h-[min(46rem,calc(100dvh-var(--chrome-inset)*2))] p-0">
      {shown ? (
        <WhereSettingsBody
          key={shown.opening}
          request={shown.request}
          scopes={scopes}
          report={report}
          pickOutcome={pickOutcome}
          onPick={onPick}
          onClose={onClose}
          inApp={inApp}
        />
      ) : null}
    </Dialog>
  );
}
