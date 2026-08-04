'use client';

import type { ReactNode } from 'react';

import { ChevronDown } from 'lucide-react';

import { RowButton } from '@/shared/ui/controls';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';

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
 * ## 접히고 펴지는 것은 목록 행 펼침 문법(`.ai-row-disclosure`)이다
 *
 * 첫 판(2026-08-04 오전)은 `Surface`(chrome 문법)로 감쌌고, **그날 저녁 소유자가 설치
 * 앱에서 결함을 잡았다** — *"버벅이면서 이상하게 열리는데?"*. 프레임 실측:
 * 1단계에서 3단계로 옮길 때 아래 형제가 **+254px 을 1프레임에** 밀렸다가
 * (여는 본문이 즉시 전고 마운트) 140ms 뒤 **−352px 을 또 1프레임에** 튀었다
 * (닫히는 본문이 퇴장 창 동안 자리를 점유하다 한 번에 소멸). 전환 프레임 0장.
 *
 * 원인은 문법 선택이다. `Surface(chrome)` 는 **떠서 아래를 가리는 표면**의
 * 것이라(스케일+페이드, 퇴장 창 동안 레이아웃 점유) 흐름 안 원소에 입히면
 * 주변이 두 번 튄다. 흐름 안 접기의 문법은 앱에 이미 있다 —
 * `.ai-row-disclosure`(높이 전이, `--motion-base`) + `useRowDisclosure`.
 * 형제가 자리를 **연속으로** 내주고 받는 것까지가 그 문법의 일이다.
 * 새 키프레임 0 · 새 토큰 0. 하드컷 래칫(`surface-motion-ratchet`) 기준선
 * 0 은 그대로다: 상자는 늘 그려 두고 내용만 접힘에서 빠지므로 조건부 등장
 * 표면 자체가 아니다(`AgentSetupStep.test.tsx` 가 문법을 계약으로 고정).
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
 *
 * ## 사실과 상호작용은 채널을 나눠 갖는다 (2026-08-04 설치 앱 실측)
 *
 * 배지 채움은 **흐름의 사실**(done/now/todo)만 진다. 그래서 사용자가 3단계를
 * 미리 열면 「지금」 배지는 1단계에, 펼친 본문은 3단계에 있게 되는데 — 종전에는
 * 펼친 행의 머리에 아무 신호가 없어 두 행이 서로 다른 주장을 하는 것으로
 * 읽혔다(소유자 첨부 화면). 처방은 배지를 따라가게 하는 것이 아니라(사실이
 * 상호작용에 오염된다) **펼침에 자기 채널을 주는 것**이다: 행 오른끝의 셰브론
 * 회전 — 바로 아래 「잘 안 되나요?」 토글이 이미 쓰는 그 채널이라 새 문법이
 * 아니다. 회전은 상태 확인이므로 기본 전이(`--motion-fast`)를 그대로 탄다.
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
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
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
        {/* 펼침 채널 — 색은 행 톤을 상속한다(새 잉크 결정 0). */}
        <ChevronDown
          size={12}
          aria-hidden
          className="shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </RowButton>
      {/* 상자는 늘 그려 둔다 — 열릴 때 마운트하면 전이의 출발 높이가 없어
          하드컷이 된다. 내용만 접힘에서 빠져 스크린 리더·탭 순서에 남지
          않는다(`TopologyIndexTreeRow` 와 같은 계약). `id` 가 상자에 있어
          `aria-controls` 대상이 접힘 중에도 실재한다. */}
      <div
        ref={boxRef}
        id={bodyId}
        data-state={open ? 'open' : 'closed'}
        className="ai-row-disclosure"
        inert={!open}
      >
        {mounted ? (
          <div ref={contentRef} className="ai-row-disclosure-body px-3 pb-3">
            {desc ? (
              <p className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                {desc}
              </p>
            ) : null}
            {children ? <div className="mt-2 flex flex-col gap-2">{children}</div> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
