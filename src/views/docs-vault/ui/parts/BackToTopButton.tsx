import { ArrowUp } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";

/**
 * 아티클 스크롤 컨테이너 좌하단에 뜨는 "맨 위로" floating pill.
 *
 * 목차 레일(`DocReadingOutlineRail`)이 2026-07 GitHub 관례 정리로 우측으로
 * 옮기면서(본문 오른쪽 "on this page") 같은 우하단 모서리에서 겹치지 않도록
 * 이 버튼을 좌측으로 이동했다 — 두 표면 모두 `bottom-6` 라인을 공유하므로
 * 좌/우로 나눠 충돌을 피한다.
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
      // --motion-base 명시: 색 확인이 아니라 떠 있는 컨트롤의 **등장/퇴장**이라
      // 램프의 "이동" 스텝이 맞다. 기본(--motion-fast)에 맡기면 120ms 로
      // 나타나 페이드가 아니라 깜빡임에 가까워진다.
      className={`absolute bottom-6 left-7 z-10 inline-flex h-[var(--chrome-tile-size)] items-center gap-2 rounded-full border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-4 font-mono text-body text-[color:var(--color-text-secondary)] shadow-[var(--chrome-shadow)] transition-opacity duration-[var(--motion-base)] ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <ArrowUp
        size={ICON_SIZE.md}
        className="text-[color:var(--color-indigo-accent)]"
        aria-hidden
      />
      {t("backToTop")}
    </button>
  );
}
