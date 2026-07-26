'use client';

import { useEffect, useState } from 'react';

/**
 * 경계 카드 — "여기서 못 하는 일" 을 정직하게 말하고, 할 수 있는 곳으로
 * 넘겨준다.
 *
 * 이 도우미는 문서 폴더만 본다. 코드가 답을 정하는 질문(이 개념이 실제
 * 구현과 맞나 · 이 경로가 아직 있나)은 **사용자 자신의 터미널**에서 여는 AI
 * 가 낫다 — 앱 안 터미널이 아니라. 그래서 카드가 주는 것은 그 자리로 가는
 * 두 줄이다: 볼트로 이동하는 `cd` 와, 붙여넣으면 바로 일이 시작되는 문장.
 *
 * 지고 있는 싸움을 이기려 하지 않고 넘기는 것이 이 표면의 경계다.
 */
export function AgentHandoffCard({
  vaultPath,
  focusedSlug,
  labels,
}: {
  vaultPath: string;
  focusedSlug: string | null;
  labels: {
    summary: string;
    note: string;
    copy: string;
    copied: string;
  };
}) {
  const [copied, setCopied] = useState(false);
  // 확인 문구는 **방금** 복사했다는 뜻이라야 한다. 한 번 눌러 영구히 "복사됨"
  // 으로 남으면 나중에 본 사람에게 거짓이 된다 — 눌렀을 때만 잠깐 참이다.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  // 개념 이름은 화면이 부르는 이름 그대로 — 붙여넣는 즉시 볼트에서 풀려야
  // 한다. (호출부가 `resolveNodeAgentTarget` 결과를 넘긴다.)
  const packet = [
    `cd ${vaultPath}`,
    '',
    focusedSlug
      ? `Check whether the concept "${focusedSlug}" still matches the code, using the ontology-atlas MCP tools plus the repository source. Report what drifted.`
      : 'Check whether this vault still matches the code, using the ontology-atlas MCP tools plus the repository source. Report what drifted.',
  ].join('\n');

  return (
    <details
      data-testid="agent-handoff-card"
      className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]"
    >
      <summary className="cursor-pointer list-none px-2.5 py-1.5 text-label tracking-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]">
        {labels.summary}
      </summary>
      <div className="border-t border-[color:var(--color-divider)] p-2.5">
        <p className="mb-2 text-label tracking-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
          {labels.note}
        </p>
        <pre
          data-testid="agent-handoff-packet"
          className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-chip bg-[color:var(--color-overlay-1)] p-2 text-caption leading-[1.55] text-[color:var(--color-text-secondary)]"
        >
          {packet}
        </pre>
        <button
          type="button"
          data-testid="agent-handoff-copy"
          onClick={() => {
            void navigator.clipboard?.writeText(packet);
            setCopied(true);
          }}
          className="mt-2 h-7 rounded-chip border border-[color:var(--color-border-soft)] px-2.5 text-label tracking-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
        >
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
    </details>
  );
}
