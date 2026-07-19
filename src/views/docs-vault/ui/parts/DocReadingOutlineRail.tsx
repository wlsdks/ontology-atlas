import { useTranslations } from "next-intl";
import type { OutlineHeading } from "./DocsVaultDocOutlinePanel";

export interface DocReadingOutlineRailProps {
  headings: OutlineHeading[];
  activeHeadingSlug: string | null;
  onHeadingClick: (slug: string) => void;
}

/**
 * 좌측 빈 띠(사이드바–본문 사이)에 상시 렌더하는 읽기 전용 목차 레일.
 *
 * `DocsVaultDocOutlinePanel` 의 목차 부분과 별개 표면 — 그 패널은 공유·출력·
 * 파일관리 조작 chrome 전용으로 남기고, 이 레일은 순수 읽기 보조
 * (pin/edit/공유 없음, 클릭 = 스크롤 점프만). 아티클 스크롤 컨테이너 밖의
 * `position:relative` 래퍼 안에 절대 위치로 얹혀 스크롤 중에도 화면상 같은
 * 위치를 유지하고, 본문 max-w-760 은 침범하지 않는다(빈 띠만 소비 —
 * `.claude/rules/design.md`).
 *
 * 표시 여부(`shouldShowOutlineRail`)와 뷰포트 게이트(`hidden lg:flex`)는
 * caller/CSS 가 결정 — 이 컴포넌트는 항상 렌더된 것을 전제로 한 순수 표시.
 */
export function DocReadingOutlineRail({
  headings,
  activeHeadingSlug,
  onHeadingClick,
}: DocReadingOutlineRailProps) {
  const t = useTranslations("vaultWidgets.parts.outline");
  return (
    <nav
      aria-label={t("railAria")}
      data-testid="doc-reading-outline-rail"
      className="absolute bottom-6 left-6 top-6 hidden w-[168px] flex-col overflow-y-auto min-[1440px]:w-[200px] lg:flex"
    >
      <span className="mb-2 flex-none font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {t("railLabel")} · {headings.length}
      </span>
      <ul className="flex flex-col gap-0.5 text-[12.5px]">
        {headings.map((heading, index) => {
          const isActive = activeHeadingSlug === heading.slug;
          return (
            <li key={`${heading.slug}:${index}`}>
              <a
                href={`#${heading.slug}`}
                onClick={(event) => {
                  event.preventDefault();
                  onHeadingClick(heading.slug);
                }}
                aria-current={isActive ? "true" : undefined}
                className={`block truncate border-l-2 py-1.5 pl-2.5 leading-[1.4] transition-colors ${
                  isActive
                    ? "border-[color:var(--color-indigo-accent)] text-[color:var(--color-text-primary)]"
                    : "border-transparent text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]"
                }`}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
