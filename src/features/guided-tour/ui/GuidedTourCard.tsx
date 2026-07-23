"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/cn";
import type { UseGuidedTourResult } from "../model/use-guided-tour";
import type { CardPlacement } from "../model/resolve-anchor-rect";

export interface GuidedTourCardProps {
  tour: UseGuidedTourResult;
  placement: CardPlacement;
  width: number;
  style?: React.CSSProperties;
}

/**
 * 카드 — 진행 점 N/M · 제목 · 본문 · [이전][다음]/[건너뛰기], 7단계(recent)의
 * 2-way 분기, 인터랙티브(4단계) 대기 라벨을 모두 이 한 컴포넌트가 그린다
 * (spec §3-D). 표면은 기존 5단계 패널 토큰만 — `--color-panel` ·
 * `--chrome-border` · `--chrome-shadow` · `--chrome-radius`.
 */
export function GuidedTourCard({ tour, placement, width, style }: GuidedTourCardProps) {
  const t = useTranslations("guidedTour");
  const { step, stepIndex, visibleSteps, back, advance, skip, finishAsDone, chooseDevBranch, hasSelection, devBranchAvailable } = tour;

  // 포커스 이동 (2026-07-23 Guardian 정정) — role="dialog" 카드가 열리거나
  // 단계가 바뀌면 포커스를 카드로 옮긴다(aria-label 재낭독 + 키보드 사용자의
  // Tab 시작점). 닫힐 때의 트리거 복원은 `useGuidedTour.start()`/`finish()`
  // 가 담당(자식 effect 가 먼저 돌아 activeElement 캡처가 오염되는 문제 회피).
  const cardRef = useRef<HTMLDivElement | null>(null);
  const stepId = step?.id ?? null;
  useEffect(() => {
    if (stepId) cardRef.current?.focus({ preventScroll: true });
  }, [stepId]);

  if (!step) return null;

  const total = visibleSteps.length;
  const current = stepIndex + 1;
  const isFirst = stepIndex <= 0;
  const isBranchStep = step.id === "recent";
  const isDevFinalStep = step.id === "agent";
  const isInteractive = Boolean(step.interactive);

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      data-testid="guided-tour-card"
      data-tour-card-side={placement.side}
      role="dialog"
      aria-modal="false"
      aria-label={t(`steps.${step.copyKey}.title`)}
      className={cn(
        "fixed z-[75] rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--color-panel)] p-4 shadow-[var(--chrome-shadow)]",
        "transition-opacity duration-[var(--topology-tour-transition-ms)] ease-out motion-reduce:transition-none",
        "focus:outline-none",
      )}
      style={{ width, ...style }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p
          data-testid="guided-tour-progress"
          className="font-mono text-caption tracking-caption text-[color:var(--color-text-quaternary)]"
        >
          {t("progressLabel", { current, total })}
        </p>
        <button
          type="button"
          onClick={skip}
          data-testid="guided-tour-skip"
          className="text-label tracking-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
        >
          {t("skipLabel")}
        </button>
      </div>

      <div className="mb-2 flex items-center gap-1" aria-hidden>
        {visibleSteps.map((s, i) => (
          <span
            key={s.id}
            data-testid="guided-tour-dot"
            data-active={i === stepIndex ? "true" : "false"}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              i === stepIndex
                ? "bg-[color:var(--color-indigo-brand)]"
                : "bg-[color:var(--color-border-strong)]",
            )}
          />
        ))}
      </div>

      <h2 className="mb-1.5 text-body-lg tracking-body-lg font-semibold text-[color:var(--color-text-primary)]">
        {t(`steps.${step.copyKey}.title`)}
      </h2>
      <p className="mb-3 text-body tracking-body leading-[1.6] text-[color:var(--color-text-secondary)]">
        {t(`steps.${step.copyKey}.body`)}
      </p>

      {isInteractive ? (
        <div
          data-testid={hasSelection ? "guided-tour-success" : "guided-tour-waiting"}
          className="flex h-8 items-center justify-center rounded-[var(--chrome-radius-inner)] border border-dashed border-[color:var(--chrome-border)] text-center text-body text-[color:var(--color-text-tertiary)]"
        >
          {hasSelection ? t("clickSuccessLabel") : t("waitingForClickLabel")}
        </div>
      ) : null}

      {isBranchStep ? (
        <div className="mt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={finishAsDone}
            data-testid="guided-tour-finish-tour"
            className="h-9 rounded-[var(--chrome-radius-inner)] border border-[color:var(--chrome-border)] text-body font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
          >
            {t("finishTourAction")}
          </button>
          {/* 8단계 앵커(첫 실행 카드)가 이미 dismiss 돼 해석 불가면 분기
              버튼을 숨긴다 — 눌러도 갈 곳이 없는 버튼은 welcome 리셋
              루프였다(2026-07-23 Guardian 실측 정정). */}
          {devBranchAvailable ? (
            <button
              type="button"
              onClick={chooseDevBranch}
              data-testid="guided-tour-dev-branch"
              className="h-9 rounded-[var(--chrome-radius-inner)] bg-[color:var(--color-indigo-brand)] text-body font-semibold text-white transition-colors hover:bg-[color:var(--color-indigo-accent)]"
            >
              {t("devBranchAction")}
            </button>
          ) : null}
        </div>
      ) : !isInteractive ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={back}
            disabled={isFirst}
            data-testid="guided-tour-back"
            className="h-8 rounded-[var(--chrome-radius-inner)] px-3 text-body text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] disabled:opacity-40"
          >
            {t("prevLabel")}
          </button>
          <button
            type="button"
            onClick={isDevFinalStep ? finishAsDone : advance}
            data-testid={isDevFinalStep ? "guided-tour-finish" : "guided-tour-next"}
            className="h-8 rounded-[var(--chrome-radius-inner)] bg-[color:var(--color-indigo-brand)] px-3 text-body font-medium text-white transition-colors hover:bg-[color:var(--color-indigo-accent)]"
          >
            {isDevFinalStep ? t("finishLabel") : t("nextLabel")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
