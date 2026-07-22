"use client";

import { useEffect, useRef } from "react";
import type { useTranslations } from "next-intl";
import { FileText, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { DocTab } from "../../lib/doc-tabs";

export interface DocsVaultTabStripProps {
  tabs: DocTab[];
  activeSlug: string | null;
  onActivate: (slug: string) => void;
  onClose: (slug: string) => void;
  t: ReturnType<typeof useTranslations<"docsVault">>;
}

/**
 * 헤더 zone-c 의 열린 문서 탭 스트립 — docs-chrome-round 슬라이스 B.
 *
 * 문서 워킹셋(URL `?slug=` 이 활성 진실원, 이 스트립은 열린 목록만 소유)을
 * 나타낸다 — 상위 뷰 전환 탭이 아니라는 것을 구조로 증명하기 위해
 * `view==='doc'` 일 때만 호출부가 렌더한다(`folder-topology` 에선 비움).
 *
 * "한 끗": 활성 탭 배경이 `--color-canvas`(본문과 동일)로 헤더의 1px
 * baseline 을 완전히 덮고, 그 위에 자체 2px 인디고 언더라인을 그린다 —
 * 헤더 쪽 baseline 은 `DocsVaultPage` 가 절대배치 1px 라인(z-0)으로 그리고
 * 이 스트립은 그보다 위(z-10)에서 h-full 로 렌더되므로 활성 탭 칼럼에서는
 * baseline 이 전혀 보이지 않는다(이중선 금지).
 *
 * 표면(활성 canvas / 비활성 hover)은 **탭 칼럼 전체**인 wrapper 가 소유한다.
 * 라벨 버튼에만 배경을 주면 닫기 버튼 폭(20px)+여백(6px) 만큼 헤더 panel 색이
 * 남아 활성 탭 오른쪽에 노치가 생기고, 전폭으로 그려지는 2px 언더라인이 그
 * 26px 만큼 배경 밖으로 튀어나온다(승인 시안 frame1 은 × 까지 canvas).
 *
 * a11y: `role="tablist"/"tab"` 을 쓰지 않는다. 이 스트립은 같은 화면의
 * `tabpanel` 을 토글하는 WAI-ARIA tab 위젯이 아니라 **문서 내비게이션**이다
 * (활성 진실원 = URL `?slug=`). role 만 빌려 쓰면 AT 가 "탭 n/N" 과 화살표키
 * 이동을 약속하지만 roving tabindex·`aria-controls`·`tabpanel` 이 없어 아무
 * 일도 일어나지 않는다. 정직한 계약은 `nav` + `aria-current="page"` 이며,
 * "탭 = 워킹셋이지 상위 모드가 아니다" 라는 소유자 계약도 AT 쪽에서 함께
 * 지켜진다(role=tab 은 모드 전환으로 announce 된다).
 */
export function DocsVaultTabStrip({
  tabs,
  activeSlug,
  onActivate,
  onClose,
  t,
}: DocsVaultTabStripProps) {
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // JS 스크롤 애니메이션은 globals.css 의 reduced-motion base layer 가
    // 끌 수 없다(CSS transition 이 아니라 behavior 인자) — 여기서 직접 존중.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // 검수 Pass B 결함 2 (2026-07-23) — scrollIntoView(inline:"nearest") 는
    // 탭 추가로 스트립 폭이 같은 프레임에 변하면 활성 탭을 절반만 노출한 채
    // 멈출 수 있다(EN 1440 실측: 말줄임 없이 글리프가 스트립 경계에서 잘리고
    // × 도 안 보임 — flaky). 레이아웃 확정 후(rAF) scrollLeft 를 직접 계산해
    // 활성 탭 전체가 항상 뷰포트 안에 오도록 결정론화한다. 탭 개수도 의존성에
    // 포함 — 새 탭이 열려 폭이 변한 프레임에도 재보정된다.
    const frame = requestAnimationFrame(() => {
      const el = activeTabRef.current;
      const strip = el?.closest("nav");
      if (!el || !strip) return;
      const cell = el.parentElement ?? el; // 탭 칼럼(wrapper) 기준 — 닫기 버튼 포함 전폭.
      // Guardian 교정 — offsetLeft 의 offsetParent 는 nav 가 아니라 상위
      // header(relative) 라 zone-l 폭만큼 인플레이트된다. rect 차이로
      // 스크롤러 콘텐츠 좌표를 직접 계산해 중간 탭 활성화에서도 정확히 맞춘다.
      const cellRect = cell.getBoundingClientRect();
      const stripRect = strip.getBoundingClientRect();
      const left = cellRect.left - stripRect.left + strip.scrollLeft;
      const right = left + cellRect.width;
      let target = strip.scrollLeft;
      if (right > strip.scrollLeft + strip.clientWidth) target = right - strip.clientWidth;
      if (left < target) target = left;
      if (target !== strip.scrollLeft) {
        strip.scrollTo({ left: target, behavior: reduced ? "auto" : "smooth" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSlug, tabs.length]);

  if (tabs.length === 0) return null;

  return (
    <nav
      aria-label={t("tabs.stripAriaLabel")}
      className="docs-vault-tab-strip flex h-full min-w-0 flex-1 items-stretch overflow-x-auto"
    >
      {tabs.map((tab) => {
        const active = tab.slug === activeSlug;
        return (
          <div
            key={tab.slug}
            data-token="docs-tab"
            data-active={active ? "true" : undefined}
            className={cn(
              "group relative flex h-full flex-none items-stretch transition-colors",
              active
                ? "bg-[color:var(--color-canvas)]"
                : "hover:bg-[color:var(--color-overlay-2)]",
            )}
            style={{
              minWidth: "var(--docs-tab-min)",
              maxWidth: "var(--docs-tab-max)",
            }}
          >
            <button
              ref={active ? activeTabRef : undefined}
              type="button"
              aria-current={active ? "page" : undefined}
              title={tab.title}
              onClick={() => onActivate(tab.slug)}
              // 가운데 버튼으로 닫기 — 에디터 탭의 보편 관용(계약 §③-3).
              // auxclick 이 기본 붙여넣기/자동스크롤로 새지 않게 막는다.
              onAuxClick={(event) => {
                if (event.button !== 1) return;
                event.preventDefault();
                onClose(tab.slug);
              }}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 pl-3 pr-1 text-body transition-colors",
                active
                  ? "text-[color:var(--color-text-primary)]"
                  : "text-[color:var(--color-text-tertiary)] group-hover:text-[color:var(--color-text-secondary)]",
              )}
            >
              <FileText size={14} aria-hidden className="flex-none" />
              <span className="min-w-0 flex-1 truncate text-left">{tab.title}</span>
            </button>
            <button
              type="button"
              aria-label={t("tabs.closeAria", { title: tab.title })}
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.slug);
              }}
              className={cn(
                "my-auto mr-1.5 flex h-5 w-5 flex-none items-center justify-center rounded-sm text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-3)] hover:text-[color:var(--color-text-primary)]",
                active
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              )}
            >
              <X size={14} aria-hidden />
            </button>
            {active ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[2px] bg-[color:var(--color-indigo-brand)]"
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
