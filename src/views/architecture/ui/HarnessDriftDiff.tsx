'use client';

import { useMemo, type CSSProperties } from 'react';

import { AGENT_TOOL_LABELS } from '@/entities/agent-files';
import { AGENT_CLIENTS, type AgentClientId } from '@/entities/vault-session';
import { cn } from '@/shared/lib/cn';
import { VendorMark } from '@/shared/ui/marks/vendor-mark';

import {
  alignLinesQuadratic,
  differsOnlyInvisibly,
  visibleLines,
  type AlignedLine,
  type AlignedRow,
} from '../lib/align-lines';
import type { TranslateFn } from './HarnessGuideDetail';

const MARKED_TEXT = 'text-[color:var(--color-text-primary)]';
const PLAIN_TEXT = 'text-[color:var(--color-text-secondary)]';

function LegacyFile({
  path,
  lines,
  other,
  tool,
  otherTool,
  t,
}: {
  path: string;
  lines: string[];
  other: ReadonlySet<string> | null;
  tool: AgentClientId | null;
  otherTool: AgentClientId | null;
  t: TranslateFn;
}) {
  const lacking = other ? lines.filter((line) => !other.has(line)).length : 0;
  return (
    <div className="flex min-w-0 flex-col">
      {tool && otherTool ? (
        <SideHeader
          tool={tool}
          path={path}
          label={
            lacking > 0
              ? t('driftSideLacks', { count: lacking, other: AGENT_TOOL_LABELS[otherTool] })
              : t('driftSideShared', { other: AGENT_TOOL_LABELS[otherTool] })
          }
          stacked={false}
          pinned={false}
        />
      ) : (
        <p className="truncate font-mono text-label text-[color:var(--color-text-tertiary)]" title={path}>
          {path}
        </p>
      )}
      <pre
        tabIndex={0}
        role="group"
        aria-label={path}
        className={cn(
          'mt-1 max-h-96 flex-1 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-chip bg-[color:var(--color-overlay-1)] py-3 font-mono text-label text-[color:var(--color-text-secondary)]',
          '@min-[48rem]/harness:max-h-none',
        )}
      >
        {lines.map((line, index) => {
          const only = other !== null && !other.has(line);
          return (
            <span
              key={index}
              data-harness-drift-line={only ? 'only-here' : undefined}
              className={cn('block px-3', only && 'bg-[color:var(--color-overlay-3)] text-[color:var(--color-text-primary)]')}
            >
              {line === '' ? '\u00a0' : line}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

function Cell({ line, marked, divided }: { line: AlignedLine | null; marked: boolean; divided: boolean }) {
  const edge = divided && '@min-[40rem]/guide-detail:border-l @min-[40rem]/guide-detail:border-[color:var(--color-overlay-2)]';
  if (!line) {
    return (
      <div
        aria-hidden
        data-harness-drift-gap
        className={cn(
          'hidden bg-[repeating-linear-gradient(135deg,var(--color-overlay-2)_0_1px,transparent_1px_6px)]',
          '@min-[40rem]/guide-detail:block',
          edge,
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        'grid grid-cols-[2.5rem_1ch_minmax(0,1fr)] gap-x-2 px-2 font-mono text-label',
        marked && 'bg-[color:var(--color-overlay-3)]',
        edge,
      )}
    >
      <span aria-hidden className="select-none text-right tabular-nums text-[color:var(--color-text-tertiary)]">
        {line.no}
      </span>
      <span className={cn('select-none', MARKED_TEXT)}>
        {marked ? '+' : ''}
      </span>
      <span
        data-harness-drift-line={marked ? 'only-here' : undefined}
        className={cn('whitespace-pre-wrap [overflow-wrap:anywhere]', marked ? MARKED_TEXT : PLAIN_TEXT)}
      >
        {line.text === '' ? '\u00a0' : line.text}
      </span>
    </div>
  );
}

function SideHeader({
  tool,
  path,
  label,
  stacked,
  pinned,
}: {
  tool: AgentClientId;
  path: string;
  label: string;
  stacked: boolean;
  pinned: boolean;
}) {
  const client = AGENT_CLIENTS.find((entry) => entry.id === tool);
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 border-b border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-3 py-2.5',
        stacked && 'border-t @min-[40rem]/guide-detail:border-t-0',
        pinned && '@min-[40rem]/guide-detail:sticky @min-[40rem]/guide-detail:top-0 @min-[40rem]/guide-detail:z-10',
      )}
    >
      <VendorMark src={client?.icon ?? null} ink={client?.brandInk ?? null} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {AGENT_TOOL_LABELS[tool]}
          </span>
          <span className="shrink-0 text-label text-[color:var(--color-text-secondary)]">{label}</span>
        </div>
        <p className="truncate font-mono text-label text-[color:var(--color-text-tertiary)]" title={path}>
          {path}
        </p>
      </div>
    </div>
  );
}

function AlignedDiff({
  paths,
  rows,
  current,
  t,
}: {
  paths: readonly [string, string];
  rows: readonly AlignedRow[];
  current: boolean;
  t: TranslateFn;
}) {
  const sides = [
    { path: paths[0], tool: 'claude-code' as const, other: 'codex' as const, cells: rows.map((row) => row.left) },
    { path: paths[1], tool: 'codex' as const, other: 'claude-code' as const, cells: rows.map((row) => row.right) },
  ];
  return (
    <div
      tabIndex={0}
      role="group"
      aria-label={`${paths[0]} · ${paths[1]}`}
      data-testid={current ? 'harness-drift-diff' : undefined}
      style={{ '--drift-rows': `repeat(${rows.length + 1}, auto)` } as CSSProperties}
      className={cn(
        'mt-2 grid max-h-none overflow-auto rounded-chip border border-[color:var(--color-overlay-2)]',
        '@min-[40rem]/guide-detail:max-h-96 @min-[40rem]/guide-detail:grid-flow-col @min-[40rem]/guide-detail:grid-cols-2 @min-[40rem]/guide-detail:[grid-template-rows:var(--drift-rows)]',
        '@min-[48rem]/harness:max-h-none @min-[48rem]/harness:overflow-visible',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
      )}
    >
      {sides.map((side, index) => {
        const marked = rows.map((row, at) => row.kind !== 'same' && side.cells[at] !== null);
        const count = marked.filter(Boolean).length;
        const other = AGENT_TOOL_LABELS[side.other];
        return (
          <div key={side.path} className={cn('flex min-w-0 flex-col', '@min-[40rem]/guide-detail:contents')}>
            <SideHeader
              tool={side.tool}
              path={side.path}
              label={count > 0 ? t('driftSideMarked', { count, other }) : t('driftSideShared', { other })}
              stacked={index === 1}
              pinned
            />
            {rows.map((row, at) => (
              <Cell key={at} line={side.cells[at]!} marked={marked[at]!} divided={index === 1} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function HarnessDriftDiff({
  paths,
  texts,
  current,
  t,
}: {
  paths: readonly string[];
  texts: readonly string[];
  current: boolean;
  t: TranslateFn;
}) {
  const twin = paths.length === 2;
  const first = texts[0] ?? '';
  const second = texts[1] ?? '';
  const aligned = useMemo(() => {
    if (!twin) return null;
    return alignLinesQuadratic(visibleLines(first), visibleLines(second));
  }, [twin, first, second]);
  const invisible = twin && differsOnlyInvisibly(first, second);
  const caption = invisible ? t('driftInvisibleOnly') : aligned ? t('driftLineMark') : t('driftLineMarkUnaligned');
  if (aligned) {
    return (
      <>
        <Caption>{caption}</Caption>
        <AlignedDiff paths={[paths[0]!, paths[1]!]} rows={aligned} current={current} t={t} />
      </>
    );
  }
  const lines = texts.map(visibleLines);
  const sets = twin ? lines.map((side) => new Set(side)) : null;
  const tools = ['claude-code', 'codex'] as const;
  return (
    <>
      {twin ? <Caption>{caption}</Caption> : null}
      <div
        className={cn('mt-2 grid gap-3', twin && '@min-[40rem]/guide-detail:grid-cols-2')}
        data-testid={current ? 'harness-drift-diff' : undefined}
      >
        {paths.map((path, side) => (
          <LegacyFile
            key={path}
            path={path}
            lines={lines[side]!}
            other={sets ? sets[1 - side]! : null}
            tool={twin ? tools[side]! : null}
            otherTool={twin ? tools[1 - side]! : null}
            t={t}
          />
        ))}
      </div>
    </>
  );
}

function Caption({ children }: { children: string }) {
  return <p className="pb-1 text-label text-[color:var(--color-text-tertiary)]">{children}</p>;
}

