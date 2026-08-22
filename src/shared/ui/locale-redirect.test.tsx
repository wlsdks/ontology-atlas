import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LocaleRedirect } from './locale-redirect';
import { ROUTE_MEMORY_KEY } from './route-memory';

/**
 * Design-system gate — every colour in the root locale redirect must go through a
 * CSS token; hardcoded hex is forbidden (`.claude/rules/design.md`).
 */
describe('LocaleRedirect — 디자인 토큰 가드', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    window.localStorage.clear();
    // The mount effect calls window.location.replace, so location is stubbed
    // wholesale to avoid jsdom's navigation not-implemented error (replace is
    // non-configurable, so spyOn will not work).
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, replace: vi.fn() },
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
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
    // No #rrggbb / #rgb colour literal may survive in an inline style.
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('배경·텍스트·링크가 CSS 토큰 var() 를 참조한다', () => {
    const { container } = render(<LocaleRedirect />);
    const html = container.innerHTML;
    expect(html).toContain('var(--color-canvas)');
    expect(html).toContain('var(--color-text-secondary)');
    expect(html).toContain('var(--color-indigo-accent)');
  });

  /**
   * **An inverted contract (2026-07-30).** This used to restore the last surface
   * worked on within the same locale; it now decides **the language only**.
   *
   * The test flipped because the job of `/` changed, not because the code did:
   * that address is now the gateway, and a gateway must show **the same face to
   * everyone**. With restoration in place even the owner could not see their own
   * first impression — a cost actually paid, when code working as designed was
   * reported as a defect.
   *
   * The old contract is kept **inverted rather than deleted**, so the next person
   * who thinks "restoring would be convenient" reads here why it is gone.
   */
  it('마지막 작업 surface 를 기억해도 관문으로 보낸다', () => {
    window.localStorage.setItem('ontology-atlas:locale', 'en');
    window.localStorage.setItem(ROUTE_MEMORY_KEY, '/en/topology/');

    render(<LocaleRedirect />);

    expect(window.location.replace).toHaveBeenCalledWith('/en/');
  });

  it('다른 locale 의 기억도 그 사람의 언어 관문으로 보낸다', () => {
    window.localStorage.setItem('ontology-atlas:locale', 'en');
    window.localStorage.setItem(ROUTE_MEMORY_KEY, '/ko/topology/');

    render(<LocaleRedirect />);

    expect(window.location.replace).toHaveBeenCalledWith('/en/');
  });
});
