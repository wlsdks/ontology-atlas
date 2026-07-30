import '@testing-library/jest-dom/vitest';

/**
 * jsdom 에는 `ResizeObserver` 가 없다 — 이건 제품의 사정이 아니라 **환경의
 * 구멍**이라, 이걸 쓰는 컴포넌트마다 각자 스텁을 심는 것은 같은 파일을 세
 * 벌 쓰는 일이다(실제로 3벌이 있었다). 여기 한 번만 둔다.
 *
 * **관측을 흉내 내지 않는다** — 콜백을 부르지 않는 빈 스텁이다. 실제 크기
 * 변화에 무엇이 일어나는지는 레이아웃이 있는 곳(브라우저 e2e)에서 재고,
 * 여기서는 "관측을 구독한 컴포넌트가 렌더된다" 까지만 성립시킨다. 가짜
 * 콜백을 부르면 단위 테스트가 실제로는 확인할 수 없는 치수를 확인한다고
 * 주장하게 된다.
 */
if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

/**
 * `window.matchMedia` — **jsdom 에 없는 브라우저 API**. 위 ResizeObserver 스텁과
 * 같은 부류의 환경 심이다.
 *
 * ## 왜 공용 setup 에 두나
 *
 * 실패 모드가 **엉뚱한 자리에서 터진다.** `/download` 의 시연 절이 켜지자
 * `DownloadPage.test.tsx` 의 **무관한 테스트 둘**(「다운로드 마디를 지운다」·
 * 「지도로 돌아가기를 지운다」)이 빨개졌다 — 그 절이 `prefers-reduced-motion` 을
 * 읽는 자식을 렌더하기 때문이다. 테스트마다 스텁을 복제하면 다음 사람이 같은
 * 벽에 다시 부딪히고, 그때도 원인이 자기 변경처럼 보인다.
 *
 * **제품에는 위험이 없다.** 소비처는 `useSyncExternalStore` 의 서버 스냅샷을
 * `() => false` 로 주므로 프리렌더는 이 경로를 지나지 않고, 실제 브라우저는
 * `matchMedia` 를 예외 없이 가진다. 구멍은 jsdom 하나다.
 *
 * 기본값은 **"줄이지 않음"** — 애니메이션을 켠 쪽이 검증 대상이라 그쪽이 기본이다.
 * 감소 모션을 검사하려면 그 테스트가 이 스텁을 덮어쓴다(기존 두 자리가 이미 그렇다).
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
