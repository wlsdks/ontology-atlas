import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LocaleRedirect } from './locale-redirect';
import { ROUTE_MEMORY_KEY } from './route-memory';

/** Every colour goes through a CSS token (`.claude/rules/design.md`). */
describe('LocaleRedirect', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    window.localStorage.clear();
    // `replace` is non-configurable, so location is stubbed wholesale to avoid jsdom's
    // unimplemented navigation.
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
   * The root `/` decides the language only, so the gateway shows everyone the same face. Kept
   * as the inverted form of the old restore contract.
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

  /* Deciding the language changes only the path; the query and hash carry deep links. */
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
