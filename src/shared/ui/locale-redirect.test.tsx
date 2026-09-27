import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LocaleRedirect } from './locale-redirect';
import { ROUTE_MEMORY_KEY } from './route-memory';

/**
 * Design-system gate — every colour in the root locale redirect must go through a
 * CSS token; hardcoded hex is forbidden (`.claude/rules/design.md`).
 */
describe('LocaleRedirect', () => {
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

  it('has no raw hex colour in its inline styles', () => {
    const { container } = render(<LocaleRedirect />);
    const html = container.innerHTML;
    // No #rrggbb / #rgb colour literal may survive in an inline style.
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('takes background, text and link colours from CSS tokens', () => {
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
  it('sends to the gateway even when a last work surface is remembered', () => {
    window.localStorage.setItem('ontology-atlas:locale', 'en');
    window.localStorage.setItem(ROUTE_MEMORY_KEY, '/en/topology/');

    render(<LocaleRedirect />);

    expect(window.location.replace).toHaveBeenCalledWith('/en/');
  });

  it('sends a remembered route in another locale to the stored language gateway', () => {
    window.localStorage.setItem('ontology-atlas:locale', 'en');
    window.localStorage.setItem(ROUTE_MEMORY_KEY, '/ko/topology/');

    render(<LocaleRedirect />);

    expect(window.location.replace).toHaveBeenCalledWith('/en/');
  });

  /*
   * Bug sweep 2026-09-01: the locale hop dropped the query string and hash, so
   * any shared, bookmarked, or agent-emitted deep link addressed to `/`
   * (`/?p=…`, `/?realm=…`) opened an unselected map — the clicked project was
   * silently lost. Deciding the language only means changing the PATH only.
   */
  it('keeps the query and hash across the locale hop', () => {
    window.localStorage.setItem('ontology-atlas:locale', 'en');
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        search: '?p=projects%2Fatlas&realm=web',
        hash: '#detail',
        replace: vi.fn(),
      },
    });

    render(<LocaleRedirect />);

    expect(window.location.replace).toHaveBeenCalledWith(
      '/en/?p=projects%2Fatlas&realm=web#detail',
    );
  });
});
