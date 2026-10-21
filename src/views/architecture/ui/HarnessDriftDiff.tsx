'use client';

import type { CSSProperties } from 'react';

import { AGENT_TOOL_LABELS } from '@/entities/agent-files';
import { cn } from '@/shared/lib/cn';

import { alignLinesQuadratic, type AlignedLine, type AlignedRow } from '../lib/align-lines';
import type { TranslateFn } from './HarnessGuideDetail';

const MARKED_TEXT = 'text-[color:var(--color-text-primary)]';
const PLAIN_TEXT = 'text-[color:var(--color-text-secondary)]';

function LegacyFile({ path, lines, other }: { path: string; lines: string[]; other: ReadonlySet<string> | null }) {
  return (
    <div className="flex min-w-0 flex-col">
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
        {lines.map((line, index) => {
          const only = other !== null && !other.has(line);
          return (
            <span
              key={index}
              data-harness-drift-line={only ? 'only-here' : undefined}
              className={cn('block px-3', only && 'bg-[color:var(--color-overlay-3)] text-[color:var(--color-text-primary)]')}
            >
              {line === '' ? ' ' : line}
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
        className={cn('hidden bg-[color:var(--color-overlay-1)]', '@min-[40rem]/guide-detail:block', edge)}
      />
    );
  }
  return (
    <div
      className={cn(
        'grid grid-cols-[2.5rem_1ch_minmax(0,1fr)] gap-x-2 px-2 font-mono text-label',
        marked && 'bg-[color:var(--color-indigo-a10)]',
        edge,
      )}
    >
      <span aria-hidden className="select-none text-right tabular-nums text-[color:var(--color-text-quaternary)]">
        {line.no}
      </span>
      <span aria-hidden className="select-none text-[color:var(--color-indigo-text-soft)]">
        {marked ? '+' : ''}
      </span>
      <span
        data-harness-drift-line={marked ? 'only-here' : undefined}
        className={cn('whitespace-pre-wrap [overflow-wrap:anywhere]', marked ? MARKED_TEXT : PLAIN_TEXT)}
      >
        {line.text === '' ? ' ' : line.text}
      </span>
    </div>
  );
}

function SideHeader({ tool, path, count, t }: { tool: string; path: string; count: number; t: TranslateFn }) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5 border-b border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-3 py-2',
        '@min-[40rem]/guide-detail:sticky @min-[40rem]/guide-detail:top-0 @min-[40rem]/guide-detail:z-10',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{tool}</span>
        <span className="shrink-0 text-label text-[color:var(--color-text-secondary)]">
          {count > 0 ? t('driftSideMarked', { count }) : t('driftSideShared')}
        </span>
      </div>
      <p className="truncate font-mono text-label text-[color:var(--color-text-tertiary)]" title={path}>
        {path}
      </p>
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
    { path: paths[0], tool: AGENT_TOOL_LABELS['claude-code'], cells: rows.map((row) => row.left) },
    { path: paths[1], tool: AGENT_TOOL_LABELS.codex, cells: rows.map((row) => row.right) },
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
        '@min-[48rem]/harness:max-h-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
      )}
    >
      {sides.map((side, index) => {
        const marked = rows.map((row, at) => row.kind !== 'same' && side.cells[at] !== null);
        return (
          <div key={side.path} className={cn('flex min-w-0 flex-col', '@min-[40rem]/guide-detail:contents')}>
            <SideHeader tool={side.tool} path={side.path} count={marked.filter(Boolean).length} t={t} />
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
  twin,
  current,
  t,
}: {
  paths: readonly string[];
  texts: readonly string[];
  twin: boolean;
  current: boolean;
  t: TranslateFn;
}) {
  const lines = texts.map((text) => text.split('\n'));
  const rows = twin ? alignLinesQuadratic(lines[0]!, lines[1]!) : null;
  if (rows) return <AlignedDiff paths={[paths[0]!, paths[1]!]} rows={rows} current={current} t={t} />;
  const sets = twin ? lines.map((side) => new Set(side)) : null;
  return (
    <div
      className={cn('mt-2 grid gap-3', twin && '@min-[40rem]/guide-detail:grid-cols-2')}
      data-testid={current ? 'harness-drift-diff' : undefined}
    >
      {paths.map((path, side) => (
        <LegacyFile key={path} path={path} lines={lines[side]!} other={sets ? sets[1 - side]! : null} />
      ))}
    </div>
  );
}
