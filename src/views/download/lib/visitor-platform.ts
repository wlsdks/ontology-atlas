'use client';

import { useSyncExternalStore } from 'react';

/**
 * 방문자의 데스크톱 플랫폼 — 히어로 주 CTA 가 **누구의 파일**을 채운 버튼으로
 * 내밀지 정하는 단 하나의 판정.
 *
 * ## 왜 mac | windows 둘뿐인가
 *
 * 지금 받을 수 있는 데스크톱 파일이 그 둘뿐이라서다(macOS dmg 2종 · Windows
 * exe 1종 — `macos-release.generated.ts`). Linux 는 앱이 없으므로 "감지해서
 * 다른 것을 내밀" 대상이 아니라 macOS 기본값 + 히어로의 브라우저 CTA 로
 * 흡수된다 — 「곧 됩니다」를 만들지 않는 것이 이 저장소의 강등 계약이다.
 *
 * ## 왜 UA 문자열 하나로 끝나나
 *
 * 필요한 판별이 「Windows 인가 아닌가」 하나뿐이라서다. UA 에 `Windows` 가
 * 들어가는 것은 모든 주요 브라우저가 지키는 사실상의 표준이고, 이보다 세밀한
 * 판별(맥의 Apple Silicon/Intel)은 브라우저가 원리적으로 못 한다 —
 * `navigator.platform` 은 Apple Silicon 에서도 `MacIntel` 을 돌려준다
 * (`DownloadPage.tsx` 아키텍처 안내 주석). 그래서 맥 쪽은 감지를 시도하지
 * 않고 다수(2020년 말 이후 = Apple Silicon)를 기본값으로 둔 채 Intel 을 한 단
 * 아래 버튼으로 항상 노출한다.
 *
 * ## 감지 실패가 정상 경로다
 *
 * 정적 export 라 서버 협상이 없고, 첫 페인트는 언제나 macOS 기본이다(SSR
 * 산출물과 hydration 일치). Windows 는 마운트 뒤 effect 에서 한 번 판정되어
 * 승격된다 — 깜빡임 한 프레임은 「모든 방문자가 같은 화면에서 시작한다」의
 * 값이다.
 */
export type VisitorDesktopPlatform = 'mac' | 'windows';

export function detectVisitorDesktopPlatform(userAgent: string): VisitorDesktopPlatform {
  return /Windows/i.test(userAgent) ? 'windows' : 'mac';
}

// UA 는 세션 동안 불변이라 구독할 변화가 없다 — 구독 함수는 no-op 이다.
const subscribeNever = () => () => {};
const clientSnapshot = () => detectVisitorDesktopPlatform(navigator.userAgent);
// 서버(정적 export)의 산출물은 언제나 macOS 기본 — hydration 첫 페인트가
// 이 값과 일치하고, 마운트 직후 클라이언트 스냅샷으로 한 번 갈린다.
const serverSnapshot = (): VisitorDesktopPlatform => 'mac';

export function useVisitorDesktopPlatform(): VisitorDesktopPlatform {
  return useSyncExternalStore(subscribeNever, clientSnapshot, serverSnapshot);
}
