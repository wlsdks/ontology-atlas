'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { usePanelPresence } from '@/shared/lib/use-presence';

/**
 * 조건부로 나타나는 표면 — **등장과 퇴장이 기본으로 딸려 온다.**
 *
 * ## 왜 이게 필요한가 — 실측이 정한다
 *
 * 2026-08-03 전수: 조건부로 나타나는 표면 **20개 중 10개가 하드컷**이었다.
 * 그리고 그 10개는 무작위가 아니라 **전부 「인라인 패널」 계열**이다:
 *
 * | 계열 | 개수 | 등장/퇴장 |
 * |---|---:|---|
 * | 모달(scrim + `aria-modal` + fixed) | 10 | 대부분 있음 |
 * | **인라인 패널**(scrim 없음) | 10 | **전부 없음** |
 *
 * 이유가 분명하다 — 모달은 `AgentConnectSheet` 의 `AnimatePresence` 패턴을
 * 베껴 쓸 수 있었고, 인라인 패널은 **베낄 패턴이 없었다.** 규율의 문제가
 * 아니라 자산의 문제다. 컨트롤이 419개 중 1개만 프리미티브에 맞던 것과 같은
 * 모양의 구멍이다.
 *
 * 문법 자체는 이미 있었다 — `app/globals.css` 의 **「모션 헌법」**
 * (`topology-chrome-in`/`out`: opacity 0→1 + translateY 3px→0 + scale 0.98→1,
 * 퇴장은 등장의 2/3). 없던 것은 **그걸 자동으로 입히는 자리**다.
 *
 * ## 이 프리미티브가 대신 기억해 주는 것
 *
 * 넷 다 이 저장소가 **실측으로 아프게 배운** 것들이라 손으로 매번 다시 챙길
 * 대상이 아니다:
 *
 * 1. **퇴장 창** — `open=false` 에 즉시 언마운트하면 1프레임에 소멸한다.
 *    `usePanelPresence` 가 창을 열어 준다(`EXIT_WINDOW_MS`).
 * 2. **퇴장은 자기 이름으로 앞으로 재생한다** — 등장 키프레임을 `reverse` 로
 *    되감으면 같은 원소에서 **재생되지 않는다**(`animation-name` 이 그대로면
 *    재시작하지 않는다). 그래서 `-out` 클래스가 따로 있다.
 * 3. **나가는 프레임은 못 눌린다** — `inert` + `pointer-events-none`. 없으면
 *    사라지는 중인 표면이 클릭을 먹는다.
 * 4. **reduced-motion** — 전역 base 레이어 규칙이 duration 을 0.01ms 로 깎아
 *    자동 무력화된다. 여기서 따로 분기하지 않는다(레이어 밖에서 `!important`
 *    로 덮으면 오히려 진다 — 2026-07-28 실측).
 *
 * ## 이 프리미티브가 하지 않는 것
 *
 * **모달이 아니다.** scrim · 포커스 트랩 · `aria-modal` 은 여기 없다 — 그건
 * 「뒤를 막는다」는 별개의 결정이고, `design.md` 가 모달에 **모달성 증명**을
 * 요구한다. 모달이 필요하면 이 표면 위에 그 계약을 따로 쌓는다.
 */
export interface SurfaceProps {
  /** 열려 있는가. `false` 로 바뀌면 퇴장 창 동안 남았다가 사라진다. */
  open: boolean;
  children: ReactNode;
  className?: string;
  /**
   * 등장이 어디서 자라나는가 — `transform-origin`. 트리거 방향으로 지정하면
   * 표면이 **누른 자리에서 태어난다**(중앙에서 태어나는 팝오버는 모션석의
   * 반려 사유다).
   */
  origin?: string;
  /** 감싸는 태그. 의미가 있는 자리에서는 `section`/`aside` 를 쓴다. */
  as?: 'div' | 'section' | 'aside';
  /** 퇴장이 **끝난 뒤** 한 번. 포커스 복귀처럼 언마운트에 붙는 일에 쓴다. */
  onExited?: () => void;
  /**
   * `data-*` 통과 — **밖에서 이 표면을 집을 수 있어야** 계기와 테스트가 산다.
   *
   * ⚠️ 이걸 안 받으면 **타입이 조용히 통과시킨다.** TypeScript 는 하이픈이 든 JSX
   * 속성을 검사하지 않아서, `data-testid` 를 넘겨도 `tsc` 는 아무 말 없고 값은
   * 그냥 버려진다. 2026-08-03 에 엣지 패널을 전환하면서 실제로 그럴 뻔했다.
   */
  [dataAttribute: `data-${string}`]: unknown;
}

export function Surface({
  open,
  children,
  className,
  origin,
  as: Tag = 'div',
  onExited,
  ...rest
}: SurfaceProps) {
  const { mounted, exiting } = usePanelPresence(open);
  const wasMounted = useRef(mounted);

  useEffect(() => {
    if (wasMounted.current && !mounted) onExited?.();
    wasMounted.current = mounted;
  }, [mounted, onExited]);

  if (!mounted) return null;

  return (
    <Tag
      // ★ 나가는 프레임은 **못 눌린다.** 없으면 사라지는 중인 표면이 클릭을 먹고,
      //   사용자는 「눌렀는데 엉뚱한 게 됐다」를 겪는다.
      // React 19 는 `inert` 를 불리언 속성으로 안다 — 빈 문자열을 넣으면 false 로
      // 읽혀 조용히 안 붙는다(이 테스트가 그걸 잡았다).
      {...rest}
      inert={exiting}
      data-surface-state={exiting ? 'exiting' : 'entered'}
      style={origin ? { transformOrigin: origin } : undefined}
      className={cn(
        exiting ? 'topology-chrome-out pointer-events-none' : 'topology-chrome-in',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
