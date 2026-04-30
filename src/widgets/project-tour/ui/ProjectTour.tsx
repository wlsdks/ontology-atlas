"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Compass, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/shared/ui";
import { MOTION } from "@/shared/motion";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import type { ProjectTourStep } from "../model/steps";

interface Props {
  open: boolean;
  step: ProjectTourStep | null;
  stepIndex: number;
  stepDirection?: 1 | -1;
  totalSteps: number;
  launcherHidden?: boolean;
  drawerOpen?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function ProjectTour({
  open,
  step,
  stepIndex,
  stepDirection = 1,
  totalSteps,
  launcherHidden = false,
  drawerOpen = false,
  onOpen,
  onClose,
  onPrevious,
  onNext,
}: Props) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useBodyScrollLock(open);

  // 투어 키보드 내비게이션: ESC 닫기, ← 이전, → 다음.
  // 드로어가 열려 있으면 ESC 는 드로어가 먼저 닫히게 양보한다.
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;
      if (event.key === "Escape" && !drawerOpen) {
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      } else if (event.key === "ArrowLeft" && stepIndex > 0) {
        event.preventDefault();
        onPrevious();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, drawerOpen, stepIndex, onClose, onNext, onPrevious]);

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

  if (!step || totalSteps === 0) {
    return null;
  }

  return (
    <>
      {!open && !launcherHidden && (
        <div
          data-interactive-overlay="true"
          className="pointer-events-auto fixed bottom-[calc(max(0.85rem,env(safe-area-inset-bottom))+4.45rem)] left-[calc(max(1rem,env(safe-area-inset-left))+4.75rem)] z-20 md:absolute md:hidden"
        >
          <button
            type="button"
            onClick={onOpen}
            className="flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)] active:bg-[color:var(--color-overlay-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
          >
            <Compass size={13} />
            가이드
          </button>
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.aside
            ref={dialogRef}
            data-interactive-overlay="true"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={MOTION.medium}
            role="dialog"
            aria-modal="true"
            aria-label="프로젝트 가이드 투어"
            aria-describedby="project-tour-help"
            // 모바일에서는 문서 스크롤과 분리된 fixed 시트가 더 안정적으로 눌린다.
            className="pointer-events-auto fixed bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.75rem)] left-1/2 z-40 w-[calc(100vw-max(2rem,env(safe-area-inset-left)+env(safe-area-inset-right)))] max-w-[360px] -translate-x-1/2 overflow-hidden rounded-[22px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-2xl md:absolute md:bottom-10 md:left-40 md:translate-x-0"
          >
            <div className="border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    가이드 투어
                  </p>
                  <p className="mt-2 text-xs text-[color:var(--color-text-tertiary)]">
                    {stepIndex + 1} / {totalSteps} 단계
                  </p>
                  <p id="project-tour-help" className="sr-only">
                    좌우 화살표로 단계를 이동하고 ESC로 닫을 수 있는 프로젝트 가이드 투어입니다.
                  </p>
                  <div className="mt-3 flex gap-1">
                    {Array.from({ length: totalSteps }).map((_, index) => (
                      <span
                        key={index}
                        aria-hidden="true"
                        className={
                          index === stepIndex
                            ? "h-1.5 w-8 rounded-full bg-[color:var(--color-indigo-brand)]"
                            : "h-1.5 w-4 rounded-full bg-[color:var(--color-divider)]"
                        }
                      />
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                  aria-label="가이드 닫기"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="relative min-h-[214px] overflow-hidden px-5 py-5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: 18 * stepDirection, y: 6 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, x: -14 * stepDirection, y: -4 }}
                  transition={MOTION.medium}
                  className="absolute inset-0 px-5 py-5"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                    {step.eyebrow}
                  </p>
                  <h2 className="mt-2 text-[26px] leading-[1.08] tracking-[var(--tracking-section)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {step.title}
                  </h2>
                  <p className="mt-4 text-[15px] leading-7 text-[color:var(--color-text-secondary)]">
                    {step.description}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[color:var(--color-divider)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                      {stepIndex + 1} / {totalSteps} 단계
                    </span>
                    <span className="rounded-full border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.1)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)]">
                      {step.slug}
                    </span>
                  </div>
                  <p className="sr-only" aria-live="polite">
                    가이드 {stepIndex + 1}단계, {step.title}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[color:var(--color-border-soft)] px-5 py-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onPrevious}
                disabled={stepIndex === 0}
              >
                <ChevronLeft size={14} />
                이전
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                >
                  건너뛰기
                </Button>
                <Button type="button" size="sm" onClick={onNext}>
                  {stepIndex === totalSteps - 1 ? "마침" : "다음"}
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
