'use client';

import type { ReactNode } from 'react';

import { RowButton } from '@/shared/ui/controls';
import { Surface } from '@/shared/ui/surface';

/**
 * 「내 에이전트 연결」의 한 단계 — **한 번에 하나만 펼친다.**
 *
 * ## 왜 이 컴포넌트가 생겼나 (2026-08-04, 소유자 지시)
 *
 * 소유자: *"지금은 이상해 푸른 박스에 너무 길고 보기 안좋고 분리를 하든 차라리"*.
 * 실측이 그 말을 숫자로 갖는다 — 고급 접기를 펴면 이 탭의 내용이 **2,581px**
 * (617px 창의 **4.18장**)이었고, 「연결하기」·「제대로 됐나」·「고장 났을 때」·
 * 「고급 검증」이 전부 **같은 무게로 평평하게** 쌓여 있었다.
 *
 * 갈래는 소유자가 골랐다(B — 단계 진행형): 지금 단계만 펼치고, 끝난 단계는
 * 한 줄로 접고, 안 온 단계는 물러난다. **접는 것이지 지우는 것이 아니다** —
 * 접힌 것에는 전부 도달할 수 있어야 한다.
 *
 * ## 왜 `StepRow`(features)를 안 쓰나
 *
 * `StepRow` 는 **항상 펼쳐진** 문법이다. 지도 시트는 세 단계가 한 화면에 다
 * 보이는 것이 맞고(거기서는 그게 전부다), 여기는 그 셋 뒤에 검증·수리·명령이
 * 더 붙어서 같은 문법이면 4장이 된다. 같은 이름 아래 두 행동을 넣는 대신 —
 * 그게 `StepCard`/`StepRow` 가 갈라졌던 원인이다 — 소비처가 하나인 이 문법은
 * 소비처 옆에 둔다. 두 번째 소비처가 생기면 그때 `features` 로 내린다.
 *
 * ## 접히고 펴지는 것은 `<Surface>` 다
 *
 * 하드컷 래칫의 기준선이 **0** 이다(`surface-motion-ratchet`). `{open && …}` 로
 * 그리면 닫을 때 1프레임에 사라지고, 그 결함은 값 lint 를 무결점 통과한다 —
 * 전환이 아예 없는 원소는 리터럴도 안 남기기 때문이다.
 */

export type AgentSetupStepState = 'done' | 'now' | 'todo';

export interface AgentSetupStepProps {
  n: number;
  title: string;
  /** 펼쳤을 때만 보이는 한 줄 설명. */
  desc?: string;
  state: AgentSetupStepState;
  /** 접힌 줄의 오른쪽 — 이 단계가 지금 무엇인지 한 마디. */
  trailing?: string;
  open: boolean;
  onToggle: () => void;
  testId: string;
  children?: ReactNode;
}

/**
 * 번호 배지의 채움이 상태를 진다 — **글리프를 바꾸지 않는다.**
 *
 * 완료에서 번호를 체크 글리프로 갈아끼우면 「지금 몇 번째인가」를 세는 축이
 * 중간에 끊긴다. 이 화면에는 한때 번호 체계가 **네 벌**(단계 3 · 흐름 6 ·
 * 증거 4 · 명령 6) 있었고 그래서 아무 번호도 「지금 할 일」을 못 가리켰다.
 * 번호는 한 벌만 남기고, 그 한 벌은 끝까지 번호로 남는다.
 */
const BADGE: Record<AgentSetupStepState, string> = {
  done: 'bg-[color:var(--color-success-a12)] text-[color:var(--color-success-text-a90)]',
  now: 'bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-text-soft)]',
  todo: 'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-quaternary)]',
};

const TRAILING_INK: Record<AgentSetupStepState, string> = {
  done: 'text-[color:var(--color-success-text-a90)]',
  now: 'text-[color:var(--color-text-tertiary)]',
  todo: 'text-[color:var(--color-text-quaternary)]',
};

export function AgentSetupStep({
  n,
  title,
  desc,
  state,
  trailing,
  open,
  onToggle,
  testId,
  children,
}: AgentSetupStepProps) {
  const bodyId = `${testId}-body`;
  return (
    <li className="min-w-0" data-testid={testId} data-step-state={state}>
      <RowButton
        size="md"
        tone={state === 'todo' ? 'muted' : 'strong'}
        data-testid={`${testId}-toggle`}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        /* 전폭 행이라 반경을 뺀다 — 목록 컨테이너가 이미 자기 반경을 갖는다. */
        className="gap-2.5 rounded-none"
      >
        <span
          aria-hidden
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-label font-medium ${BADGE[state]}`}
        >
          {n}
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-medium">{title}</span>
        {trailing ? (
          <span className={`shrink-0 text-label ${TRAILING_INK[state]}`}>{trailing}</span>
        ) : null}
      </RowButton>
      <Surface open={open} id={bodyId} className="px-3 pb-3">
        {desc ? (
          <p className="break-keep text-label text-[color:var(--color-text-tertiary)]">
            {desc}
          </p>
        ) : null}
        {children ? <div className="mt-2 flex flex-col gap-2">{children}</div> : null}
      </Surface>
    </li>
  );
}
