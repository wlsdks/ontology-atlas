import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LocaleRedirect } from './locale-redirect';

/**
 * 디자인 시스템 가드 — 루트 locale redirect 의 색은 모두 CSS 토큰을 거쳐야
 * 한다 (hardcoded hex 금지, .claude/rules/design.md). 다크 hex 를 박으면
 * data-theme="light" 사용자가 루트 진입 시 다크 배경이 깜빡이는 회귀가 난다.
 */
describe('LocaleRedirect — 디자인 토큰 가드', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // mount useEffect 가 window.location.replace 를 호출 — jsdom navigation
    // not-implemented 에러를 피하려고 location 을 통째로 stub (replace 는
    // non-configurable 이라 spyOn 불가).
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, replace: vi.fn() },
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it('인라인 스타일에 raw hex 색이 없다', () => {
    const { container } = render(<LocaleRedirect />);
    const html = container.innerHTML;
    // #rrggbb / #rgb 형태의 색 리터럴이 인라인 style 에 남아있지 않아야 한다.
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('배경·텍스트·링크가 CSS 토큰 var() 를 참조한다', () => {
    const { container } = render(<LocaleRedirect />);
    const html = container.innerHTML;
    expect(html).toContain('var(--color-canvas)');
    expect(html).toContain('var(--color-text-secondary)');
    expect(html).toContain('var(--color-indigo-accent)');
  });
});
