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
