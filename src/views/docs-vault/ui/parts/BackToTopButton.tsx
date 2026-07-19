import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * 아티클 스크롤 컨테이너 우하단에 뜨는 "맨 위로" floating pill.
 *
 * 기존 chrome floating 타일 언어(`--chrome-tile-size`/`--chrome-surface`/
 * `--chrome-shadow`/`--chrome-border`, 지형도 미니맵과 동일 표면)를 재사용 —
 * 신규 시각 언어를 만들지 않는다. 표시 임계는 `use-back-to-top.ts` 가 판정.
 */
export function BackToTopButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("docsVault.readingAids");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("backToTopAria")}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      data-testid="back-to-top-button"
      className={`absolute bottom-6 right-7 z-10 inline-flex h-[var(--chrome-tile-size)] items-center gap-2 rounded-full border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-4 font-mono text-[12px] text-[color:var(--color-text-secondary)] shadow-[var(--chrome-shadow)] transition-opacity duration-150 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <ArrowUp
        size={14}
        className="text-[color:var(--color-indigo-accent)]"
        aria-hidden
      />
      {t("backToTop")}
    </button>
  );
}
