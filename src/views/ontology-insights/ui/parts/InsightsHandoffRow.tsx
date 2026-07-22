import { CopyAgentTextButton } from "./CopyAgentTextButton";

/**
 * 페이지 하단 고정 1행 — 탭마다 다음에 실행할 만한 query_ontology/CLI 체인을
 * 그대로 보여주고 복사만 하면 되게. insights-final.html `.handoff` — 예전
 * 4-tab 시스템의 거대한 agent 협업 콕핏(readiness/query-recipes/collaborator
 * brief 등)을 대체하는 단일 행. 세부 탐색은 각 탭의 핸드오프 값을 agent 가
 * 직접 실행하며 이어간다.
 */
export function InsightsHandoffRow({
  label,
  payload,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  payload: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <section
      aria-label={label}
      className="mt-[var(--section-gap)] flex items-center gap-3.5 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-3"
    >
      <span className="flex-none text-body font-medium text-[color:var(--color-text-primary)]">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-body text-[color:var(--color-text-tertiary)]">
        {payload}
      </span>
      <CopyAgentTextButton label={copyLabel} copiedLabel={copiedLabel} text={payload} compact />
    </section>
  );
}
