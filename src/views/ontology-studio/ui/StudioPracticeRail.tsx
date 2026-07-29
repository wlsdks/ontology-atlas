"use client";

import { practiceStepIndex, PRACTICE_STEP_ORDER, type PracticeStep } from "../lib/studio-practice-guide";

/**
 * 실습 안내 띠 — 나침 무대 **위에 얹는 한 줄**이다.
 *
 * ## 왜 모달이 아닌가
 *
 * 안내가 화면을 덮으면 사용자는 안내를 읽고 닫은 뒤 **기억으로** 작업한다.
 * 그러면 가르치려던 대상(무대)과 가르치는 도구(안내)가 한 번도 같은 화면에
 * 있지 못한다. 이 띠는 무대를 가리지 않고 상주하며, 손이 무대 위에서 움직이는
 * 동안 문장이 따라 바뀐다 — 읽기와 하기가 같은 프레임에 있다.
 *
 * ## 왜 진행 점이 네 개뿐인가
 *
 * 실습의 약속이 "하나를 끝까지" 라서다. 점이 늘어나면 그건 실습이 아니라
 * 과정이 되고, 사용자는 끝을 못 보고 이탈한다.
 *
 * 헌장 준수 — 무채색 + 단일 인디고, glow/particle 없음. 전이는 색뿐이라
 * `--motion-fast`(확인) 단이고 Tailwind 기본이 그 토큰을 타므로 duration
 * 클래스를 쓰지 않는다.
 */
export interface StudioPracticeRailLabels {
  /** 지금 할 일 한 문장 — 단계별로 호출부가 고른다. */
  instruction: string;
  /** 「N번째 / 4」 같은 진행 캡션. */
  progress: string;
  /** 실습 자체를 그만두는 라벨. */
  quit: string;
  /** 진행 점의 스크린리더 이름. */
  progressAria: string;
}

export function StudioPracticeRail({
  step,
  labels,
  onQuit,
}: {
  step: PracticeStep;
  labels: StudioPracticeRailLabels;
  onQuit: () => void;
}) {
  const current = practiceStepIndex(step);

  return (
    <div
      data-testid="studio-practice-rail"
      data-step={step}
      /**
       * 손이 이미 움직이고 있다는 선언 — 첫 방문 투어가 이 위에 겹쳐 뜨지
       * 않게 한다(`auto-start-guard`). 실습 띠는 모달이 아니라 비차단 띠라
       * modality 마커로는 잡히지 않고, 실제로 설치 앱에서 투어가 실습의
       * 1단계를 덮었다(2026-07-29 실측).
       */
      data-surface-role="hands-on-guide"
      className="pointer-events-auto mx-auto flex w-full max-w-[640px] items-center gap-3 rounded-panel border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a06)] px-4 py-2.5"
    >
      <span
        aria-label={labels.progressAria}
        role="img"
        className="flex flex-none items-center gap-1.5"
      >
        {PRACTICE_STEP_ORDER.map((name, index) => (
          <span
            key={name}
            aria-hidden
            data-filled={index < current ? "true" : "false"}
            className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-border-strong)] transition-colors data-[filled=true]:bg-[color:var(--color-indigo-brand)]"
          />
        ))}
      </span>
      <p className="min-w-0 flex-1 text-caption leading-caption text-[color:var(--color-text-secondary)] [word-break:keep-all]">
        {labels.instruction}
      </p>
      <span className="flex-none text-label text-[color:var(--color-text-quaternary)] tabular-nums">
        {labels.progress}
      </span>
      <button
        type="button"
        data-testid="studio-practice-quit"
        onClick={onQuit}
        className="flex-none rounded-chip px-2 py-1 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]"
      >
        {labels.quit}
      </button>
    </div>
  );
}
