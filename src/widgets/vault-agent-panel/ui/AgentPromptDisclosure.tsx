'use client';

/**
 * "지침" 열람 — 편집은 불가하되 **열람은 1클릭**.
 *
 * 숨긴 프롬프트는 신뢰 부채다. 사용자가 자기 볼트 내용과 함께 어떤 지시가
 * 나가는지 알아야 한다. 여기 그려지는 문자열은 실제로 전송되는 문자열과
 * **같은 함수의 결과**다 — 다르면 그 열람은 투명성이 아니라 장식이다.
 */
export function AgentPromptDisclosure({
  systemPrompt,
  labels,
}: {
  systemPrompt: string;
  labels: { summary: string; note: string };
}) {
  return (
    <details
      data-testid="agent-prompt-disclosure"
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
          data-testid="agent-prompt-text"
          className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-caption leading-[1.6] text-[color:var(--color-text-tertiary)]"
        >
          {systemPrompt}
        </pre>
      </div>
    </details>
  );
}
