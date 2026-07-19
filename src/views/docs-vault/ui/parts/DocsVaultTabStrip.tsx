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
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "nearest",
      block: "nearest",
    });
  }, [activeSlug]);

  if (tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label={t("tabs.stripAriaLabel")}
      className="docs-vault-tab-strip flex h-full min-w-0 flex-1 items-stretch overflow-x-auto"
    >
      {tabs.map((tab) => {
        const active = tab.slug === activeSlug;
        return (
          <div
            key={tab.slug}
            data-token="docs-tab"
            className="group relative flex h-full flex-none items-stretch"
            style={{
              minWidth: "var(--docs-tab-min)",
              maxWidth: "var(--docs-tab-max)",
            }}
          >
            <button
              ref={active ? activeTabRef : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              title={tab.title}
              onClick={() => onActivate(tab.slug)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 pl-3 pr-1 text-[12px] transition-colors",
                active
                  ? "bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]"
                  : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-secondary)]",
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
    </div>
  );
}
