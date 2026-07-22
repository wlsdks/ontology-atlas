import { Check, Clipboard } from "lucide-react";
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
  const toneClass =
    copyState === "failed"
      ? "border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] text-[color:var(--color-status-danger)] hover:border-[color:var(--color-danger-a50)] hover:bg-[color:var(--color-danger-a12)]"
      : "border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-indigo-line-a06)] text-[color:var(--color-indigo-accent)] hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a13)]";

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className={[
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border font-mono text-caption transition-[background-color,border-color,color,transform] duration-180 ease-out active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none",
          toneClass,
          compact ? "min-h-8 px-2.5 py-1.5" : "min-h-9 px-3 py-2",
        ].join(" ")}
        aria-label={ariaLabel}
      >
        {copyState === "copied" ? <Check size={13} aria-hidden /> : <Clipboard size={13} aria-hidden />}
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
