'use client';

import type { ToolCallRecord } from '@/features/vault-agent';

/**
 * 도구 왕복 한 줄 — **진행 표시가 곧 이 행이다.**
 *
 * 가짜 진행바도 장식 스피너도 없다. 실제로 일어난 왕복만 한 줄씩 붙고,
 * 각 행은 무엇을 읽었고 몇 자가 나갔는지 실측으로 말한다. 행이 붙는 것이
 * 진행이고, 안 붙으면 아직 아무 일도 안 일어난 것이다.
 *
 * 높이는 1행 고정이다 — 답이 와도 위 내용이 밀리지 않는다(치수 규칙성).
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
