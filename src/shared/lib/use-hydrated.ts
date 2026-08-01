'use client';

import { useSyncExternalStore } from 'react';

/**
 * **하이드레이션이 끝났는가** — 서버가 구운 HTML 을 브라우저만 아는 사실로
 * 고쳐야 할 때 쓴다.
 *
 * ## 왜 필요한가 (2026-08-01 실측)
 *
 * 이 앱은 정적 export 다. 프리렌더 시점에는 `window` 가 없으므로 `isTauri()` ·
 * `localStorage` · 뷰포트 같은 **브라우저 전용 신호가 전부 "아니오"** 로 굳는다.
 * 그 값이 클래스나 속성에 들어가면 그대로 HTML 에 구워지는데, **React 의
 * 하이드레이션은 속성 불일치를 고쳐 주지 않는다** — 첫 렌더가 다른 값을 내도
 * 서버가 쓴 속성이 DOM 에 남는다. 그래서 렌더 함수는 옳은데 화면은 틀린다.
 *
 * 실제 사고: 설치된 macOS 앱의 **좌측 레일(LNB)이 아예 안 보였다.** 셸이
 * `isGatewaySurface(pathname, { desktop: isDesktopShell(), … })` 로 레일을 감추는데,
 * 프리렌더에서 `desktop=false` 라 `/` 가 「관문」으로 판정돼 `lg:hidden` 이 HTML 에
 * 박혔다. 앱은 언제나 `/` 를 그 HTML 로 열기 때문에 영구히 숨었다. 웹에서는 그
 * 판정이 마침 옳아서(볼트 없는 방문자 = 관문) 아무도 못 봤고, 같은 주소도
 * **클라이언트 내비게이션으로 들어가면 정상**이었다 — 그때는 진짜 리렌더가 돈다.
 *
 * ## 왜 `useEffect + useState` 가 아니라 `useSyncExternalStore` 인가
 *
 * 셋 다 리렌더를 한 번 만들지만, 이 훅은 **서버 스냅샷과 클라이언트 스냅샷이
 * 다르다는 것을 React 에게 명시적으로 말한다**. `useEffect` 판은 "마운트됐다"는
 * 사실을 상태로 흉내 내는 것이고, 린트가 불필요한 상태로 오해하기 쉽고, 다음
 * 사람이 지우기도 쉽다. 여기서는 그 리렌더가 **정확성의 일부**라 지워지면 안 된다.
 *
 * ## 쓰는 규율
 *
 * `false` 를 **서버가 아는 만큼만 아는 상태**로 다뤄라. 하이드레이션 전에는
 * 브라우저 전용 신호를 "모른다" 로 두고, 모를 때의 기본값이 **덜 해로운 쪽**이어야
 * 한다. 위 사고에서는 「숨김」이 기본값이라 데스크톱이 한 프레임 늦게 레일을
 * 얻는다 — 반대로 기본값을 「보임」으로 두면 웹 관문에서 레일이 떴다 사라지는
 * 깜빡임이 생기고, 그건 `AppShell` 주석이 이미 거절한 형태다.
 */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
