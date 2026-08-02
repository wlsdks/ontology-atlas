'use client';

/**
 * 번호 배지 + 제목 + 설명 + 내용 — 「연결 3단계」의 단일 문법.
 *
 * ## 왜 이 파일이 생겼나 (2026-08-02, 디자인 카운슬 S3)
 *
 * 같은 개념이 두 이름으로 갈라져 있었다. 지도 시트의 `StepRow`(보더 없음)와
 * 설정 패널의 `StepCard`(카드 크롬 있음)인데, **번호 원 배지 클래스는 두
 * 컴포넌트가 바이트 동일**했다. 다른 것은 `StepCard` 가
 * `rounded-md border ... bg-[...] px-2.5 py-2.5` 를 한 겹 더 두른 것뿐이다.
 *
 * 그 한 겹이 설정 패널에서 **보더 4단 중첩**을 만들었다:
 *
 * ```
 * app-settings-popover       1px rgba(255,255,255,0.06)  r12
 *  └ section (인디고 패널)    1px rgba(139,151,255,0.22)  r6
 *     └ agent-setup-step-N   1px rgba(255,255,255,0.06)  r6   ← 이 겹
 *        └ agent-client-…    1px rgba(139,151,255,0.54)  r6
 * ```
 *
 * 카드 크롬을 뺀 쪽으로 합치면 3단이 되고, 「2단계가 내용 한 줄인데 카드
 * 크롬을 다 갖는다」는 결함도 함께 사라진다 — 보더/배경이 없으면 「내용 0줄
 * 카드」라는 사고 자체가 성립하지 않는다.
 *
 * `features` 에 사는 이유: 소비처가 `widgets/agent-connect` 와
 * `widgets/app-settings-menu` 둘이라, 같은 층 cross-import 대신 한 단 아래로
 * 내린다(FSD import 방향).
 */

export interface StepRowProps {
  n: number;
  title: string;
  desc?: string;
  /**
   * 표면별 마커. 두 소비처가 각자의 이름을 이미 갖고 있어서(지도 시트 =
   * `agent-connect-step-N`, 설정 = `agent-setup-step-N`) 합치는 김에 하나로
   * 바꾸면 e2e·검증기·계약 테스트가 조용히 다른 표면을 재게 된다.
   */
  testId?: string;
  children?: React.ReactNode;
}

export function StepRow({ n, title, desc, testId, children }: StepRowProps) {
  return (
    <section className="flex gap-3" data-testid={testId ?? `agent-connect-step-${n}`}>
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-indigo-a16)] font-mono text-caption font-medium text-[color:var(--color-indigo-accent)]"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-[color:var(--color-text-primary)]">{title}</p>
        {desc ? (
          <p className="mt-0.5 text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
            {desc}
          </p>
        ) : null}
        {/*
         * ⚠️ **자식이 둘 이상일 수 있다 — 그래서 여기가 `flex-col gap` 이다.**
         *
         * 예전엔 `mt-2.5` 만 있는 평범한 div 였다. 각 자식이 자기 안에서
         * `gap-2.5` 를 쓰므로 대부분의 화면에서는 멀쩡해 보였는데, ① 단계처럼
         * **자식이 둘**(`AgentConnectAction` + `AgentClientButtons`)인 자리에서만
         * 그 둘 사이가 0 이 됐다 — 「무엇을 만들지 먼저 보기」와 「Claude Code에
         * 연결」이 서로 붙어 한 덩어리로 읽혔다(소유자 실보고 2026-07-29).
         *
         * 컨테이너가 자식 사이의 간격을 책임지지 않고 자식에게 맡기면, 자식이
         * 하나일 때는 티가 안 나고 둘이 되는 순간 조용히 깨진다.
         */}
        {children ? <div className="mt-2.5 flex flex-col gap-2.5">{children}</div> : null}
      </div>
    </section>
  );
}
