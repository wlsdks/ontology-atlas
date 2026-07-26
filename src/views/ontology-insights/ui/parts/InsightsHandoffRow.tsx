import { CopyAgentTextButton } from "./CopyAgentTextButton";

/**
 * 페이지 하단 고정 1행 — 탭마다 다음에 실행할 만한 query_ontology/CLI 체인을
 * **에이전트에게 넘길 수 있게** 복사만 하면 되는 행. insights-final.html
 * `.handoff` — 예전 4-tab 시스템의 거대한 agent 협업 콕핏을 대체한다.
 *
 * H1 B3-③/B5 (비개발자 언어 레이어) — 예전엔 `query_ontology({...})` 코드
 * 문자열을 표면에 그대로 노출해, 사람이 "내가 읽어야 하나?"를 고민하게 했다.
 * 이제 코드 문자열은 표면에서 제거하고(복사 패킷 내용은 불변 — 버튼이 그대로
 * 복사) "AI 에이전트용" 캡션으로 대상을 명시한다. 캡션/라벨은 mono·quaternary
 * 로 낮춰 사람 시선의 attention winner 가 되지 않게 한다.
 */
export function InsightsHandoffRow({
  label,
  caption,
  payload,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  /** "AI 에이전트용" — 이 행이 사람이 아닌 에이전트를 위한 것임을 명시. */
  caption: string;
  /** 복사될 실제 페이로드(코드 체인) — 표면엔 노출하지 않고 버튼이 복사만 한다. */
  payload: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <section
      aria-label={label}
      data-insights-handoff="tab-query"
      data-testid="insights-handoff-row"
      className="mt-[var(--section-gap)] flex items-center gap-3 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-2.5"
    >
      <span className="flex-none font-mono text-caption uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
        {caption}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
        {label}
      </span>
      <CopyAgentTextButton label={copyLabel} copiedLabel={copiedLabel} text={payload} compact />
    </section>
  );
}
