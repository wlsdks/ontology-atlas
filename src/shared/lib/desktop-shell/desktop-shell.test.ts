import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDesktopShell } from './desktop-shell';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('isDesktopShell', () => {
  it('is true when the app runtime bridge exists', () => {
    vi.stubGlobal('isTauri', true);
    expect(isDesktopShell()).toBe(true);
  });

  it('is false in a plain browser, whatever the address or storage asks for', () => {
    window.history.replaceState(null, '', '/?shell=desktop');
    window.localStorage.setItem('dev:desktop-shell', 'desktop');
    expect(isDesktopShell()).toBe(false);
    window.localStorage.removeItem('dev:desktop-shell');
  });
});
