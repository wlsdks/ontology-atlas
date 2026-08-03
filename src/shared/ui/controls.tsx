import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { controlClass, type ControlSize, type ControlTone } from './control-class';

/**
 * 컨트롤 컴포넌트 — **값 위에 행동을 얹는 층.**
 *
 * ## 왜 함수만으로 안 되는가
 *
 * `controlClass()` 는 **값**(모양·크기·색)의 단일 출처다. 그런데 컨트롤이
 * 지켜야 하는 것 중에는 **문자열이 원리적으로 나를 수 없는 것**이 있다:
 *
 * | 지켜야 하는 것 | className 이 할 수 있나 |
 * |---|---|
 * | `type="button"` 기본값 (없으면 폼 안에서 submit 이 된다) | ✗ |
 * | 아이콘 컨트롤의 **접근 이름 강제** | ✗ |
 * | 행 컨트롤이 `<button>` 이라는 것(div+onClick 금지) | ✗ |
 *
 * 그래서 층이 둘이다. 이건 shadcn/ui 가 `cva` + 컴포넌트로 하는 것과 같은
 * 구조이고, 업계 표준(Carbon · Fluent · Material · Polaris)이 컴포넌트를 내는
 * 이유이기도 하다.
 *
 * ## 이 파일이 게이트를 갖고 태어난 이유
 *
 * 이 저장소에는 **3개월간 사용처 0이던 프리미티브 셋**이 있었다(`Card` ·
 * `Badge` · `DetailCard`, 2026-08-03 삭제). 열어 보니 `CardTitle` 이 타입 램프에
 * 없는 `text-lg` 를 쓰고 있었다 — 자기가 인코딩해야 할 시스템을 스스로 위반하는
 * 프리미티브였다. 실패한 것은 컴포넌트가 아니라 **게이트 없는 컴포넌트**다.
 *
 * 그래서 여기 셋은 전부 `controlClass()` 를 통과해 값을 받고
 * (`controls.test.tsx` 가 그걸 단언한다), 램프 밖 값을 낼 방법이 없다.
 *
 * ## 밖에서 질의 가능하다 — `data-control`
 *
 * 셋 다 `data-control="chip|icon|row"` 를 낸다. **밖에서 구분할 수 없는 것은
 * 밖에서 검사할 수 없다**(지도 훅이 여섯 번 틀리고 배운 그것). 이 한 속성이
 * 없으면 「이 화면의 모든 아이콘 컨트롤이 44px 히트 영역을 갖는가」 같은 질문에
 * 테스트가 **셀렉터를 손으로 나열**해야 하고, 그 목록은 화면이 바뀌면 조용히
 * 낡는다. 실제 소비처:
 *
 * - `tests/e2e/touch-target-contract.spec.ts` — 아이콘 컨트롤 전수 히트 영역
 * - `scripts/measure-contrast.mjs` — 컨트롤만 좁혀 대비 측정
 * - `/design-audit` — 화면당 컨트롤 센서스
 *
 * `data-testid` 와 역할이 다르다: testid 는 **한 자리**를 가리키고, 이건
 * **한 부류**를 가리킨다.
 */

type BaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'type'> & {
  size?: ControlSize;
  tone?: ControlTone;
  active?: boolean;
  /** 이 **한 자리**에만 참인 것(자리잡기 · 폭 · 순서). 모양·크기·색은 위 prop 으로. */
  className?: string;
};

/**
 * 라벨을 가진 작은 알약형 컨트롤 — 이 앱에서 가장 많다(전수 128).
 *
 * `aria-pressed` 는 소비처가 준다. `active` 는 **보이는 상태**이고 `aria-pressed`
 * 는 **말해지는 상태**라, 둘을 자동으로 묶으면 토글이 아닌 칩(필터 이동 등)이
 * 스크린리더에 토글로 읽힌다.
 */
export const Chip = forwardRef<HTMLButtonElement, BaseProps>(
  ({ size, tone, active, className, ...rest }, ref) => (
    <button
      ref={ref}
      // ★ 폼 안에서 `<button>` 의 기본은 `submit` 이다. 칩 하나가 폼을 보내는
      //   사고는 className 으로는 막을 수 없다 — 이 줄이 이 컴포넌트의 존재 이유다.
      type="button"
      data-control="chip"
      className={controlClass({ shape: 'chip', size, tone, active, className })}
      {...rest}
    />
  ),
);
Chip.displayName = 'Chip';

export interface IconButtonProps extends BaseProps {
  /**
   * ★ **필수다.** 아이콘 컨트롤에는 읽을 글자가 없으므로 이름이 없으면
   * 스크린리더에 「버튼」으로만 읽힌다. 타입으로 강제하는 것이 이 자리에서
   * 가능한 가장 강한 게이트다 — lint 도 계약 테스트도 「빠뜨렸다」를 나중에
   * 알려 주지만, 타입은 **쓰는 순간** 막는다.
   */
  label: string;
  children: ReactNode;
}

/** 정사각 아이콘 컨트롤 — 전수 36. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size, tone, active, className, children, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      data-control="icon"
      className={controlClass({ shape: 'icon', size, tone, active, className })}
      {...rest}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';

/**
 * 목록의 한 줄 전체가 눌리는 것 — 전수 39.
 *
 * **`<div onClick>` 이 아니라 `<button>` 인 것이 요점이다.** 목록 행은 넓어서
 * div 로 만들고 싶어지는 자리인데, 그러면 키보드로 못 가고 스크린리더가
 * 컨트롤로 안 읽는다. 이 컴포넌트를 쓰면 그 선택지가 없다.
 */
export const RowButton = forwardRef<HTMLButtonElement, BaseProps>(
  ({ size, tone, active, className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      data-control="row"
      className={controlClass({ shape: 'row', size, tone, active, className })}
      {...rest}
    />
  ),
);
RowButton.displayName = 'RowButton';
