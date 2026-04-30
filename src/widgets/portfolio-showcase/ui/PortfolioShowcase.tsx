"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MOTION } from "@/shared/motion";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  Compass,
  Layers3,
  X,
} from "lucide-react";
import { getProjectDetailHref } from "@/entities/project";
import { cn } from "@/shared/lib/cn";
import { formatDate } from "@/shared/lib/format-date";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { Button, buttonVariants } from "@/shared/ui";
import type { PortfolioChapter } from "../model/chapters";

interface Props {
  open: boolean;
  chapters: PortfolioChapter[];
  activeSlug: string | null;
  onClose: () => void;
  onChangeChapter: (chapter: PortfolioChapter) => void;
  onOpenGuide: () => void;
}

export function PortfolioShowcase({
  open,
  chapters,
  activeSlug,
  onClose,
  onChangeChapter,
  onOpenGuide,
}: Props) {
  const [mobileRailExpanded, setMobileRailExpanded] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();

  useBodyScrollLock(open);
  const index = useMemo(() => {
    if (!activeSlug) return 0;
    const resolvedIndex = chapters.findIndex(
      (chapter) => chapter.slug === activeSlug,
    );
    return resolvedIndex >= 0 ? resolvedIndex : 0;
  }, [activeSlug, chapters]);

  useEffect(() => {
    if (!open) return;
    const chapter = chapters[index];
    if (chapter) {
      onChangeChapter(chapter);
    }
  }, [chapters, index, onChangeChapter, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        const nextChapter = chapters[Math.min(chapters.length - 1, index + 1)];
        if (nextChapter) {
          onChangeChapter(nextChapter);
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        const previousChapter = chapters[Math.max(0, index - 1)];
        if (previousChapter) {
          onChangeChapter(previousChapter);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chapters, index, onChangeChapter, onClose, open]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables[0]?.focus();

    const trapHandler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", trapHandler);
    return () => {
      window.removeEventListener("keydown", trapHandler);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  const chapter = chapters[index] ?? null;
  const previousChapter = chapters[index - 1] ?? null;
  const nextChapter = chapters[index + 1] ?? null;

  const handlePreviousChapter = useCallback(() => {
    if (previousChapter) {
      onChangeChapter(previousChapter);
    }
  }, [onChangeChapter, previousChapter]);

  const handleNextChapter = useCallback(() => {
    if (nextChapter) {
      onChangeChapter(nextChapter);
    }
  }, [nextChapter, onChangeChapter]);

  if (!open) return null;
  // chapters 0개 / chapter 해석 실패 시엔 모달을 띄워 empty state 를 명시하고
  // 닫기 버튼을 노출. 이전엔 silently null 반환 → "포트폴리오 열기" 눌러도
  // 아무 일도 없는 것처럼 보였음.
  if (chapters.length === 0 || !chapter) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-backdrop-strong)] px-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="포트폴리오 비어 있음 안내"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-[24px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-6 py-6 text-center shadow-[0_24px_48px_rgba(0,0,0,0.5)]"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            Portfolio
          </p>
          <h2 className="mt-3 text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            아직 큐레이션된 포트폴리오가 없습니다
          </h2>
          <p className="mt-3 text-sm leading-6 text-[color:var(--color-text-secondary)]">
            Featured path 를 만들거나 프로젝트가 쌓이면 대표 서사를 여기서
            순서대로 훑을 수 있습니다.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 inline-flex h-9 items-center rounded-md border border-[color:var(--color-divider)] px-4 text-sm text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

  const chapterPositionLabel = `${String(index + 1).padStart(2, "0")} / ${String(
    chapters.length,
  ).padStart(2, "0")}`;
  const chapterListId = "portfolio-showcase-chapter-list";
  const contentTransition = reducedMotion
    ? { duration: 0 }
    : MOTION.medium;
  const hasScreenshot = Boolean(chapter.screenshot);
  const detailItems = [
    { label: "경로", value: chapter.pathLabel },
    { label: "담당", value: chapter.owner ?? "공용 내부 시스템" },
    { label: "업데이트", value: formatDate(chapter.updatedAt) },
  ];
  const sceneKeywords = [...chapter.tags, ...chapter.stack].slice(0, 6);
  const chapterMonogram = (() => {
    if (chapter.icon) return chapter.icon;

    const words = chapter.title.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      const single = words[0];
      if (/^[A-Z0-9]{2,4}$/.test(single)) {
        return single;
      }
      return Array.from(single).slice(0, 2).join("").toUpperCase();
    }

    return words
      .slice(0, 2)
      .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
      .join("");
  })();

  return (
    <AnimatePresence>
      <motion.section
        data-interactive-overlay="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={contentTransition}
        className="pointer-events-auto fixed inset-0 z-40 overflow-y-auto overscroll-y-contain bg-[radial-gradient(circle_at_top,rgba(94,106,210,0.05),transparent_22%),linear-gradient(180deg,rgba(7,8,9,0.985)_0%,rgba(9,10,12,0.985)_100%)] xl:overflow-hidden"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="포트폴리오 모드"
          aria-describedby="portfolio-showcase-intro"
          className="mx-auto flex min-h-full max-w-[1440px] flex-col gap-2.5 px-[max(0.75rem,env(safe-area-inset-left))] py-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] xl:h-[calc(100dvh-3rem)] xl:min-h-0 xl:flex-row xl:gap-4 xl:px-7 xl:py-6"
        >
          <p id="portfolio-showcase-intro" className="sr-only">
            핵심 시스템을 장면 순서로 훑고, 필요한 시점에 상세 페이지로 이동할 수 있는 포트폴리오 모드입니다.
          </p>
          <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-[26px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] xl:h-full xl:max-w-[248px]">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border-soft)] px-4 py-3 lg:px-5 lg:py-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
                  포트폴리오 모드
                </p>
                <p className="mt-2 hidden text-[13px] leading-6 text-[color:var(--color-text-secondary)] xl:block xl:text-[13px]">
                  핵심 시스템을 장면 순서로 훑고, 필요한 시점에 상세 페이지로 들어갑니다.
                </p>
                <button
                  type="button"
                  onClick={onOpenGuide}
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3.5 py-1.5 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.36)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                >
                  <Compass size={13} />
                  가이드 투어
                  <ArrowUpRight size={12} />
                </button>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                aria-label="포트폴리오 모드 닫기"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="border-b border-[color:var(--color-border-soft)] px-4 py-3 xl:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    현재 흐름
                  </p>
                  <p className="mt-1 truncate text-sm text-[color:var(--color-text-primary)]">
                    {chapter.pathLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileRailExpanded((current) => !current)}
                  aria-expanded={mobileRailExpanded}
                  aria-controls={chapterListId}
                  aria-label={mobileRailExpanded ? "장면 목록 닫기" : "장면 목록 열기"}
                  className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                >
                  {mobileRailExpanded ? "목록 닫기" : "장면 목록"}
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[color:var(--color-text-tertiary)]">
                <span>추천 경로</span>
                <span className="font-mono tabular-nums">{chapterPositionLabel}</span>
              </div>
            </div>

            <div
              id={chapterListId}
              className={cn(
                "overflow-hidden border-b border-[color:var(--color-border-soft)] transition-[max-height,opacity] duration-300 ease-out xl:max-h-none xl:flex-1 xl:border-b-0",
                mobileRailExpanded ? "max-h-[340px] opacity-100" : "max-h-0 opacity-0 xl:opacity-100",
              )}
            >
              <div className="max-h-[340px] overflow-y-auto px-3 py-3 xl:max-h-none xl:h-full xl:py-4">
                <div className="hidden px-2 pb-2 xl:block">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    전체 장면
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--color-text-tertiary)]">
                    현재 흐름 안에서 원하는 장면으로 바로 이동합니다.
                  </p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 xl:block xl:space-y-2 xl:overflow-visible">
                  {chapters.map((item) => {
                    const itemIndex = chapters.findIndex(
                      (candidate) => candidate.slug === item.slug,
                    );
                    const active = item.slug === chapter.slug;
                    return (
                      <button
                        key={item.slug}
                        type="button"
                        onClick={() => {
                          onChangeChapter(item);
                          setMobileRailExpanded(false);
                        }}
                        aria-pressed={active}
                        className={cn(
                          "min-w-[188px] shrink-0 rounded-2xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)] xl:min-w-0 xl:w-full xl:px-4",
                          active
                            ? "border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.12)]"
                            : "border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-border-strong)]",
                        )}
                      >
                        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                          {String(itemIndex + 1).padStart(2, "0")} · {item.pathLabel}
                        </p>
                        <p className="mt-2 text-[14px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] xl:text-sm">
                          {item.title}
                        </p>
                        <p className="mt-1.5 line-clamp-2 min-w-0 text-[11px] leading-5 text-[color:var(--color-text-tertiary)] xl:text-xs">
                          {item.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="hidden border-t border-[color:var(--color-border-soft)] px-5 py-4 xl:block">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    현재 진행
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                    {chapterPositionLabel} 장면
                  </p>
                </div>
                <p className="text-right text-xs text-[color:var(--color-text-tertiary)]">
                  {chapter.pathLabel}
                </p>
              </div>
            </div>
          </aside>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-[color:var(--color-divider)] bg-[linear-gradient(180deg,var(--color-overlay-1)_0%,rgba(255,255,255,0)_100%)] xl:h-full">
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-4 py-3 lg:px-7 lg:py-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  시스템 스토리
                </p>
                <p className="mt-1 hidden max-w-[210px] text-[13px] leading-6 text-[color:var(--color-text-secondary)] lg:max-w-none lg:text-sm xl:block">
                  추천 장면과 토폴로지 강조가 함께 움직입니다.
                </p>
              </div>
              <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-divider)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                <Layers3 size={13} aria-hidden="true" />
                {chapter.pathLabel}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={chapter.slug}
                initial={{ opacity: 0, x: reducedMotion ? 0 : 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reducedMotion ? 0 : -24 }}
                transition={contentTransition}
                className={cn(
                  "grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-y-contain p-3 pb-24 xl:h-full xl:overflow-hidden xl:gap-4 xl:p-5",
                  hasScreenshot
                    ? "xl:grid-cols-[minmax(0,1fr)_minmax(340px,396px)]"
                    : "xl:grid-cols-[minmax(0,0.92fr)_minmax(340px,396px)]",
                )}
              >
                <div
                  className={cn(
                    "overflow-hidden rounded-[26px] border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)]",
                    hasScreenshot && "xl:h-full",
                  )}
                >
                  {chapter.screenshot ? (
                    <div className="relative h-full min-h-[188px] sm:min-h-[280px]">
                      <Image
                        src={chapter.screenshot}
                        alt={`${chapter.title} 화면 미리보기`}
                        width={1600}
                        height={900}
                        sizes="(min-width: 1280px) 50vw, 100vw"
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                      <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                              {chapter.eyebrow}
                            </p>
                            <p className="mt-2 text-xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                              {chapter.title}
                            </p>
                            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                              {chapter.pathLabel} 경로
                            </p>
                          </div>
                          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                            {chapterPositionLabel}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[12px] leading-6 text-[color:var(--color-text-secondary)]">
                          {chapter.pathSummary}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex min-h-[360px] flex-col justify-between overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(94,106,210,0.16),transparent_40%),linear-gradient(180deg,var(--color-overlay-1)_0%,rgba(255,255,255,0)_100%)] p-4 sm:min-h-[440px] sm:p-6 xl:h-full xl:min-h-0">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute right-4 bottom-6 font-mono text-[84px] leading-none font-semibold tracking-[-0.08em] text-[color:rgba(255,255,255,0.035)] sm:text-[120px] xl:right-6 xl:bottom-8 xl:text-[168px]"
                      >
                        {chapterMonogram}
                      </div>
                      <div className="relative z-10 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                            {chapter.eyebrow}
                          </p>
                          <h2 className="mt-2 text-[28px] leading-[1.02] text-pretty font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] sm:text-[34px]">
                            {chapter.title}
                          </h2>
                          <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
                            {chapter.pathLabel} 경로
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {chapter.icon && (
                            <span className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-3xl">
                              {chapter.icon}
                            </span>
                          )}
                          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                            {chapterPositionLabel}
                          </span>
                        </div>
                      </div>
                      <div className="relative z-10 mt-6 grid flex-1 content-center gap-6 xl:grid-cols-[minmax(0,1.34fr)_minmax(220px,0.66fr)] xl:gap-8">
                        <div className="px-1 sm:px-2">
                          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                            이 장면이 보여주는 것
                          </p>
                          <p className="mt-4 text-[28px] leading-[1.28] text-pretty font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] sm:text-[34px] sm:leading-[1.22]">
                            {chapter.pathSummary}
                          </p>
                          <p className="mt-5 max-w-[42rem] text-sm leading-7 text-[color:var(--color-text-secondary)]">
                            {chapter.description}
                          </p>
                        </div>
                        <div className="border-t border-[color:var(--color-divider)] px-1 pt-4 xl:border-t-0 xl:border-l xl:px-6 xl:pt-0">
                          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                            장면 포지션
                          </p>
                          <div className="mt-4 space-y-4 text-sm text-[color:var(--color-text-secondary)]">
                            <div className="border-b border-[color:var(--color-border-soft)] pb-4">
                              <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
                                흐름
                              </p>
                              <p className="mt-1 font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                                {chapter.pathLabel}
                              </p>
                            </div>
                            <div className="border-b border-[color:var(--color-border-soft)] pb-4">
                              <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
                                장면 번호
                              </p>
                              <p className="mt-1 font-mono tabular-nums text-[color:var(--color-text-primary)]">
                                {chapterPositionLabel}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
                                장면 성격
                              </p>
                              <p className="mt-1 font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                                {chapter.isHub ? "허브 장면" : "서비스 장면"}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-[color:var(--color-divider)] pt-4 xl:col-span-2 xl:pt-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[color:rgba(94,106,210,0.14)] px-3 py-1 text-[11px] text-[color:var(--color-text-secondary)]">
                              추천 장면
                            </span>
                            <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-[11px] text-[color:var(--color-text-tertiary)]">
                              {chapter.isHub ? "허브" : "서비스"}
                            </span>
                            {chapter.tags.slice(0, 2).map((tag) => (
                              <span
                                key={`visual-tag-${tag}`}
                                className="rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-[11px] text-[color:var(--color-text-tertiary)]"
                              >
                                {tag}
                              </span>
                            ))}
                            {chapter.stack.slice(0, 2).map((item) => (
                              <span
                                key={`visual-stack-${item}`}
                                className="rounded-full bg-[color:var(--color-elevated)] px-3 py-1 font-mono text-[11px] text-[color:var(--color-text-secondary)]"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex min-h-0 flex-col rounded-[26px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-4 xl:p-5">
                  <div className="min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-y-contain xl:pr-1">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                          큐레이터 노트
                        </p>
                        <p className="mt-1 text-xs text-[color:var(--color-text-tertiary)]">
                          {chapter.title}
                        </p>
                      </div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                        {chapterPositionLabel}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 xl:hidden">
                      <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-[11px] text-[color:var(--color-text-tertiary)]">
                        {chapter.pathLabel}
                      </span>
                      <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-[11px] text-[color:var(--color-text-tertiary)]">
                        {formatDate(chapter.updatedAt)}
                      </span>
                      {chapter.owner && (
                        <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-[11px] text-[color:var(--color-text-tertiary)]">
                          {chapter.owner}
                        </span>
                      )}
                    </div>

                    <dl className="mt-4 hidden border-y border-[color:var(--color-divider)] xl:block">
                      {detailItems.map((item, itemIndex) => (
                        <div
                          key={item.label}
                          className={cn(
                            "flex items-start justify-between gap-4 px-1 py-3.5",
                            itemIndex > 0 &&
                              "border-t border-[color:var(--color-border-soft)]",
                          )}
                        >
                          <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                            {item.label}
                          </dt>
                          <dd className="max-w-[65%] break-words text-right text-sm leading-6 tabular-nums text-[color:var(--color-text-secondary)]">
                            {item.value}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    <div className="mt-4 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
                      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                        {reducedMotion ? "요약" : "이 장면에서 읽어야 할 점"}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-[color:var(--color-text-secondary)]">
                        {chapter.narrative}
                      </p>
                    </div>

                    {sceneKeywords.length > 0 && (
                      <div className="mt-4 border-t border-[color:var(--color-divider)] pt-4">
                        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                          핵심 키워드
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {sceneKeywords.slice(0, 3).map((item) => (
                            <span
                              key={`scene-keyword-${item}`}
                              className="rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-[11px] text-[color:var(--color-text-tertiary)]"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 shrink-0 border-t border-[color:var(--color-border-soft)] pt-4">
                    <div className="hidden xl:block">
                      <div className="min-w-0">
                        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                          액션
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                          {nextChapter
                            ? `${nextChapter.title} 장면으로 이어서 볼 수 있습니다.`
                            : "이 장면에서 포트폴리오 흐름이 끝납니다."}
                        </p>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="lg"
                          onClick={handlePreviousChapter}
                          disabled={!previousChapter}
                          className="w-full justify-center"
                        >
                          <ChevronLeft size={15} aria-hidden="true" />
                          이전 장면
                        </Button>
                        <Link
                          href={getProjectDetailHref(chapter.slug)}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "lg" }),
                            "w-full justify-center border-[color:rgba(94,106,210,0.38)] bg-[color:rgba(94,106,210,0.12)] hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.16)]",
                          )}
                        >
                          상세 페이지
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </Link>
                        <Button
                          type="button"
                          size="lg"
                          onClick={handleNextChapter}
                          disabled={!nextChapter}
                          className="w-full justify-center"
                        >
                          다음 장면
                          <ArrowRight size={15} aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mt-auto grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 rounded-[22px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-2 shadow-2xl xl:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePreviousChapter}
              disabled={!previousChapter}
              className="justify-center"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              이전
            </Button>
            <Link
              href={getProjectDetailHref(chapter.slug)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "border-[color:rgba(94,106,210,0.38)] bg-[color:rgba(94,106,210,0.12)] px-3 hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.16)]",
              )}
            >
              상세
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <Button
              type="button"
              size="sm"
              onClick={handleNextChapter}
              disabled={!nextChapter}
              className="justify-center"
            >
              다음
              <ArrowRight size={14} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </motion.section>
    </AnimatePresence>
  );
}
