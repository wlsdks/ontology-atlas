"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import type { UseGuidedTourResult } from "../model/use-guided-tour";
import type { CardPlacement } from "../model/resolve-anchor-rect";

export interface GuidedTourCardProps {
  tour: UseGuidedTourResult;
  placement: CardPlacement;
  width: number;
  onActivateAnchor?: () => void;
  style?: React.CSSProperties;
}

/**
 * 카드 — 진행 점 N/M · 제목 · 본문 · [이전][다음]/[건너뛰기], 7단계(recent)의
 * 2-way 분기, 인터랙티브(4단계) 대기 라벨을 모두 이 한 컴포넌트가 그린다
 * (spec §3-D). 표면은 기존 5단계 패널 토큰만 — `--color-panel` ·
 * `--chrome-border` · `--chrome-shadow` · `--chrome-radius`.
 */
export function GuidedTourCard({
  tour,
  placement,
  width,
  onActivateAnchor,
  style,
}: GuidedTourCardProps) {
  const t = useTranslations("guidedTour");
  const { step, stepIndex, personaSteps, personaStepIndex, back, advance, skip, finishAsDone, chooseDevBranch, hasSelection, devBranchAvailable, isFinalStep } = tour;

  // 포커스 이동 (2026-07-23 Guardian 정정) — role="dialog" 카드가 열리거나
  // 단계가 바뀌면 포커스를 카드로 옮긴다(aria-label 재낭독 + 키보드 사용자의
  // Tab 시작점). 닫힐 때의 트리거 복원은 `useGuidedTour.start()`/`finish()`
  // 가 담당(자식 effect 가 먼저 돌아 activeElement 캡처가 오염되는 문제 회피).
  //
  // Tab 가두기는 **여기가 아니라 `GuidedTourOverlay`** 가 한다
  // (`useDialogFocusTrap`, `initialFocus: "none"`). 오버레이가 카드를 품고
  // 있어 범위가 더 넓고 정확하다. 여기서 또 걸면 window keydown 리스너가 둘이
  // 되어 한 번의 Tab 이 포커스를 두 번 옮긴다 — 2026-07-28 감사에서 실제로
  // 이중으로 걸 뻔했다.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const stepId = step?.id ?? null;
  useEffect(() => {
    if (stepId) cardRef.current?.focus({ preventScroll: true });
  }, [stepId]);

  if (!step) return null;

  // 진행 표시는 순간 해석 가능한 `visibleSteps` 가 아니라 페르소나 고정 여정
  // (`personaSteps`) 기준 — 분모가 같은 투어 안에서 요동치지 않는다(2026-07-23
  // 최종 스윕 P2). 스킵된 단계는 지나친 점으로 보인다. 내비게이션([이전]
  // 활성 여부 포함)은 계속 `visibleSteps` 인덱스를 쓴다.
  const total = personaSteps.length;
  const current = personaStepIndex + 1;
  const isFirst = stepIndex <= 0;
  const isBranchStep = step.id === "recent";
  const isInteractive = Boolean(step.interactive);

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      data-testid="guided-tour-card"
      data-tour-card-side={placement.side}
      role="dialog"
      aria-modal="true"
      aria-label={t(`steps.${step.copyKey}.title`)}
      className={cn(
        "fixed z-[75] rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--color-panel)] p-4 shadow-[var(--chrome-shadow)]",
        "transition-opacity duration-[var(--topology-tour-transition-ms)] ease-out motion-reduce:transition-none",
        // 단계 전환 등장 — 오버레이가 `key={step.id}` 로 remount 시키므로 이
        // 키프레임(불투명도 전용 `panelCrossfadeIn`)이 매 단계 한 번 돈다.
        //
        // 2026-07-28: 인라인 arbitrary `animate-[…] motion-reduce:animate-none`
        // 에서 **이름 있는 클래스로 승격**했다. 인라인이면 globals.css 의
        // reduced-motion 등록부가 가리킬 셀렉터가 없어서, 감속 사용자에게는
        // 전역 kill 규칙만 걸리고 동등물은 하나도 안 왔다 — 단계 전환이 통째로
        // 하드컷이었다. 목록이 곧 사정거리다.
        "guided-tour-card-in",
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
          /* 진행 캡션과 한 줄을 이루는 헤더 행 — 바닥 24 는 램프가 내고,
             coarse 의 44 는 `.touch-hit-expand` 가 낸다(이웃 타깃 원거리). */
          className={controlClass({
            shape: "link",
            className:
              "touch-hit-expand tracking-label hover:text-[color:var(--color-text-secondary)]",
          })}
        >
          {t("skipLabel")}
        </button>
      </div>

      <div className="mb-2 flex items-center gap-1" aria-hidden>
        {personaSteps.map((s, i) => (
          <span
            key={s.id}
            data-testid="guided-tour-dot"
            data-active={i === personaStepIndex ? "true" : "false"}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              i === personaStepIndex
                ? "bg-[color:var(--color-indigo-brand)]"
                : "bg-[color:var(--color-border-strong)]",
            )}
          />
        ))}
      </div>

      <h2 className="mb-1.5 text-body-lg tracking-body-lg font-semibold text-[color:var(--color-text-primary)]">
        {t(`steps.${step.copyKey}.title`)}
      </h2>
      <p className="mb-3 text-body tracking-body leading-body text-[color:var(--color-text-secondary)]">
        {t(`steps.${step.copyKey}.body`)}
      </p>

      {isInteractive ? (
        <button
          type="button"
          onClick={onActivateAnchor}
          disabled={!onActivateAnchor || hasSelection}
          data-testid="guided-tour-activate-target"
          /* `justify-center`/`text-center` 는 폭이 있어야 뜻이 생긴다. 카드가
             flex 컨테이너가 아니라 이 버튼은 shrink-to-fit 이었고, 그래서 두
             중앙 정렬 선언이 **한 번도 적용된 적이 없었다** — 왼쪽에 붙은 채로
             "가운데" 라고 적혀 있던 것이다(2026-07-29 실측). 같은 줄에 선
             「이전」과 왼쪽 끝을 맞추려면 폭을 채우는 쪽이 맞다. */
          className="flex h-8 w-full items-center justify-center rounded-[var(--chrome-radius-inner)] border border-dashed border-[color:var(--chrome-border)] text-center text-body text-[color:var(--color-text-tertiary)]"
        >
          <span data-testid={hasSelection ? "guided-tour-success" : "guided-tour-waiting"}>
            {hasSelection ? t("clickSuccessLabel") : t("waitingForClickLabel")}
          </span>
        </button>
      ) : null}

      {/**
       * **「이전」은 어느 단계에서도 사라지지 않는다** (2026-07-29 도그푸딩).
       *
       * 초안은 back/next 줄 전체를 `!isInteractive` 로 감쌌다. 그래서 4/7
       * (「직접 눌러보세요」)과 마지막 분기 단계에서 **「이전」이 통째로
       * 없어졌다** — 다섯 단계 동안 왼쪽 아래에 있던 컨트롤이 여섯 번째에
       * 말없이 사라진다. 사용자는 그때 투어가 되돌아갈 수 있는 것인지 아닌지를
       * 다시 배워야 한다.
       *
       * 앞으로 가는 방법은 단계마다 다른 게 맞다(다음 · 직접 눌러보기 · 분기
       * 선택). **뒤로 가는 방법이 달라질 이유는 없다.** 그래서 「이전」을
       * 세 갈래 밖으로 꺼내 항상 같은 자리에 세우고, 앞으로 가는 컨트롤만
       * 단계가 고른다.
       */}
      {isBranchStep ? (
        <div className="mt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={finishAsDone}
            data-testid="guided-tour-finish-tour"
            /* 분기 두 버튼은 세로로 붙은 **한 벌**이라 같이 옮긴다. 둘 다
               `chip`/`lg` 로 36 → 34px 이 되어 나란함이 유지된다. */
            className={controlClass({
              shape: "chip",
              size: "lg",
              tone: "strong",
              /* 무게는 값 층이 `onAccent` 에서만 낸다 — 중립 칩의 `font-medium`
                 은 원래 값 그대로 유지한다(무게를 바꾸는 것은 이 라운드의 일이
                 아니다). */
              className: "justify-center font-medium hover:bg-[color:var(--color-overlay-2)]",
            })}
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
              className={controlClass({
                shape: "chip",
                size: "lg",
                tone: "onAccent",
                className: "justify-center hover:bg-[color:var(--color-indigo-brand-hover)]",
              })}
            >
              {t("devBranchAction")}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={back}
          disabled={isFirst}
          data-testid="guided-tour-back"
          className={controlClass({
            shape: "segment",
            size: "lg",
            className: "hover:text-[color:var(--color-text-primary)]",
          })}
        >
          {t("prevLabel")}
        </button>
        {/* 앞으로 가는 컨트롤만 단계가 고른다 — 대화형 단계는 앵커 클릭이,
            분기 단계는 위의 두 선택지가 그 일을 이미 한다. */}
        {!isInteractive && !isBranchStep ? (
          <button
            type="button"
            onClick={isFinalStep ? finishAsDone : advance}
            data-testid={isFinalStep ? "guided-tour-finish" : "guided-tour-next"}
            className={controlClass({
              shape: "segment",
              size: "lg",
              tone: "onAccent",
              className: "hover:bg-[color:var(--color-indigo-brand-hover)]",
            })}
          >
            {isFinalStep ? t("finishLabel") : t("nextLabel")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
