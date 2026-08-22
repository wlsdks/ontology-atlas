'use client';

import type { ToolCallRecord } from '@/features/vault-agent';

/**
 * One line per tool round trip — **this row is the progress indicator.**
 *
 * No fake progress bar, no decorative spinner. Only round trips that really
 * happened are appended, one row each, and each row states from measurement what
 * was read and how many characters went out. Rows appearing is the progress; no row
 * means nothing has happened yet.
 *
 * The height is fixed at one row — an arriving answer does not push the content
 * above it (dimension regularity).
 */
export function AgentToolLine({
  call,
  charsLabel,
}: {
  call: ToolCallRecord;
  charsLabel: (chars: number) => string;
}) {
  const failed = call.outcome === 'error' || call.outcome === 'unknown-tool';
  return (
    <li
      data-testid="agent-tool-line"
      data-tool-outcome={call.outcome}
      className="flex h-6 items-center gap-2 text-label tracking-label text-[color:var(--color-text-tertiary)]"
    >
      <span
        aria-hidden="true"
        data-testid="agent-tool-line-dot"
        className={[
          'size-1 shrink-0 rounded-full',
          failed
            ? 'bg-[color:var(--color-status-warning)]'
            : 'bg-[color:var(--color-text-quaternary)]',
        ].join(' ')}
      />
      <span className="min-w-0 flex-1 truncate" title={call.summary}>
        {call.summary}
      </span>
      <span className="shrink-0 tabular-nums text-[color:var(--color-text-quaternary)]">
        {charsLabel(call.sentChars)}
      </span>
    </li>
  );
}
