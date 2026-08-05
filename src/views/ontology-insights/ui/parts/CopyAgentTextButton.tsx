import { Check, Clipboard } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";

/**
 * 인사이트 페이지 전반에서 쓰이는 "복사" 버튼. 클립보드 복사 + 성공/실패
 * 토스트 톤 + 스크린리더 announce(별도 polite live region — 포커스된 버튼의
 * aria-label 변경은 자동 재낭독되지 않으므로). OntologyInsightsPage 모놀리스
 * 에서 분리해 추출된 패널들이 공용으로 import. 복사 상태 로직은 공용
 * useCopyFeedback 훅(16+곳 중복 제거) 사용.
 */
export function CopyAgentTextButton({
  label,
  copiedLabel,
  text,
  compact = false,
}: {
  label: string;
  copiedLabel: string;
  text: string;
  compact?: boolean;
}) {
  const t = useTranslations("ontologyPages.insights");
  const { state: copyState, copy } = useCopyFeedback();

  function handleCopy() {
    void copy(text);
  }

  const statusLabel = copyState === "copied" ? copiedLabel : copyState === "failed" ? t("agentCopyFailed") : "";
  const ariaLabel = statusLabel ? `${label} · ${statusLabel}` : label;
  // 텍스트 색은 indigo-accent / status-danger 토큰으로 — 앱은 다크 단일이라
  // (design.md, 2026-07-19) light-on-dark 회귀 우려 없음. border/bg 의
  // 인디고·레드 alpha 는 은은하게 유지.
  // 잉크가 `accent`(#7170ff)가 아니라 `accentOnTint` 계열인 이유: 이 버튼은
  // 인디고 틴트를 지고 있고, 호버에서 틴트가 한 단 올라간다(a06 → a13).
  // 실측 — accent 잉크는 쉴 때 4.56 으로 겨우 통과하다가 **호버에서 4.41 로
  // AA 를 깼다**(2026-08-05). `--color-indigo-text-soft` 로 바꾸면 8.92 / 8.66.
  // design.md 「틴트를 지는 컨트롤의 잉크는 accentOnTint 다」가 이미 처방해 둔
  // 규칙이고, 기존 lint 셀렉터는 **쉬는 상태의 짝만** 봐서 이 자리를 못 봤다.
  const toneClass =
    copyState === "failed"
      ? "border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] text-[color:var(--color-status-danger)] hover:border-[color:var(--color-danger-a50)] hover:bg-[color:var(--color-danger-a12)]"
      : "border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-indigo-line-a06)] text-[color:var(--color-indigo-text-soft)] hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a13)]";

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className={[
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-chip border font-mono text-caption transition-[background-color,border-color,color,transform] duration-[var(--motion-base)] ease-[var(--motion-ease)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none",
          toneClass,
          compact ? "min-h-8 px-2.5 py-1.5" : "min-h-9 px-3 py-2",
        ].join(" ")}
        aria-label={ariaLabel}
      >
        {copyState === "copied" ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
        {label}
      </button>
      {/* 복사 성공/실패를 스크린리더에 announce — 포커스된 버튼의 aria-label
          변경은 자동 재낭독되지 않으므로 별도 polite live region 사용
          (CopyProjectLinkButton 과 동일 패턴). idle 엔 비워 reset 소음 방지. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {copyState === "copied"
          ? copiedLabel
          : copyState === "failed"
            ? t("agentCopyFailed")
            : ""}
      </span>
    </>
  );
}
