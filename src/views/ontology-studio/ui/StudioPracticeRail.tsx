"use client";

import { practiceStepIndex, PRACTICE_STEP_ORDER, type PracticeStep } from "../lib/studio-practice-guide";
import { controlClass } from "@/shared/ui";

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
        /**
         * **숫자는 점이 이미 말하고 있었다.** 초안은 같은 띠 안에 점 네 개와
         * 「2 / 4」를 나란히 뒀는데, 그 아래 바닥 바에는 **다른 척도의 4**
         * (「4개 중 0개 채웠어요 · 4군데 남음」 — 소켓 수)가 있었다. 같은 모양의
         * 숫자 둘이 서로 다른 것을 세면 화면은 어느 쪽을 따라야 하는지 말하지
         * 않는다. 눈에는 점만 남기고, 숫자는 스크린리더가 가져간다.
         */
        aria-label={`${labels.progressAria} ${labels.progress}`}
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
      {/* **가르치는 문장은 본문 무게다.** 초안에서 `text-caption`(9.5px —
          램프 주석의 역할은 "마이크로 라벨·범례·타임스탬프")을 썼더니, 배우는
          사람이 읽어야 할 주 지시문이 화면에서 가장 작은 글자가 됐다. 카운슬
          두 자리가 서로 못 본 채 같은 지점을 짚었다(2026-07-29). */}
      {/* **같은 띠가 다음 문장이 된다.** 프레임 실측: 이 자리가 화면에서 잉크
          변화가 가장 큰데(diff 21.1) 전이가 **없어서 98.6% 하드컷**이었고,
          이징을 받는 건 잉크가 가장 작은 진행 점(6px)뿐이었다 — 값 lint 는
          무결점 통과하면서 화면에선 1프레임인 그 유형이다.

          `key` 를 단계에 묶어 **앞으로 재생**시킨다(퇴장을 reverse 로 되감으면
          같은 원소에서 재생되지 않는다는 계약). 새 어휘를 만들지 않고 도크의
          상태 교체와 같은 문법을 쓴다 — "같은 박스가 다른 상태가 된다". */}
      {/* **띠의 높이는 문장 길이가 정하지 않는다.** 실측(2026-07-29): 1단계
          46px → 2단계 62px 로, 사용자가 읽고 있는 바로 그 띠가 진행할 때마다
          16px 씩 자랐다 — `design.md` 「치수 규칙성」이 금지하는, 컨테이너
          치수가 내용물의 부산물이 되는 형태다.

          예약을 px 가 아니라 **줄 수(`2lh`)로 적는다.** px 로 적으면 타입
          램프나 행간이 바뀔 때 그 숫자가 조용히 어긋나지만, "두 줄" 은 램프가
          바뀌어도 두 줄이다. 가장 긴 단계 문장이 640px 폭에서 두 줄이다. */}
      <p
        key={step}
        className="practice-step-crossfade flex min-h-[2lh] min-w-0 flex-1 items-center text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]"
      >
        {labels.instruction}
      </p>
      <button
        type="button"
        data-testid="studio-practice-quit"
        onClick={onQuit}
        className={controlClass({
          shape: "link",
          className:
            "touch-hit-expand flex-none px-2 hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]",
        })}
      >
        {labels.quit}
      </button>
    </div>
  );
}
