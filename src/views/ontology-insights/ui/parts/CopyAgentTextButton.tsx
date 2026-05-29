import { Check, Clipboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { copyText } from "@/shared/lib/copy-text";

/**
 * 인사이트 페이지 전반에서 쓰이는 "복사" 버튼. 클립보드 복사 + 성공/실패
 * 토스트 톤 + 스크린리더 announce(별도 polite live region — 포커스된 버튼의
 * aria-label 변경은 자동 재낭독되지 않으므로). OntologyInsightsPage 모놀리스
 * 에서 분리해 추출된 패널들이 공용으로 import.
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
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  async function handleCopy() {
    const ok = await copyText(text);
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
    }
    setCopyState(ok ? "copied" : "failed");
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 1500);
  }

  const visibleLabel =
    copyState === "copied"
      ? `${label} · ${copiedLabel}`
      : copyState === "failed"
        ? t("agentCopyFailed")
        : label;
  const toneClass =
    copyState === "failed"
      ? "border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] text-[color:rgba(248,160,160,0.95)] hover:border-[color:rgba(229,72,77,0.48)] hover:bg-[color:rgba(229,72,77,0.12)]"
      : "border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(139,151,255,0.08)] text-[color:rgba(211,215,255,0.96)] hover:border-[color:rgba(139,151,255,0.42)] hover:bg-[color:rgba(139,151,255,0.13)]";

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className={[
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border font-mono text-[10px] transition-colors",
          toneClass,
          compact ? "px-2 py-1" : "px-3 py-2",
        ].join(" ")}
        aria-label={visibleLabel}
      >
        {copyState === "copied" ? <Check size={12} aria-hidden /> : <Clipboard size={12} aria-hidden />}
        {visibleLabel}
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
