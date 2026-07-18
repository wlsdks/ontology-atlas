import { describe, expect, it } from 'vitest';
import { resolveDesktopShell } from './desktop-shell';

describe('resolveDesktopShell', () => {
  it('is false on SSR regardless of other signals', () => {
    expect(
      resolveDesktopShell({
        hasWindow: false,
        tauriRuntime: true,
        isDevBuild: true,
        devOverride: 'desktop',
      }),
    ).toBe(false);
  });

  it('is true when the Tauri runtime bridge exists', () => {
    expect(
      resolveDesktopShell({
        hasWindow: true,
        tauriRuntime: true,
        isDevBuild: false,
        devOverride: null,
      }),
    ).toBe(true);
  });

  it('is false on the plain web with no override', () => {
    expect(
      resolveDesktopShell({
        hasWindow: true,
        tauriRuntime: false,
        isDevBuild: false,
        devOverride: null,
      }),
    ).toBe(false);
  });

  it('honors the desktop dev override only in dev builds', () => {
    expect(
      resolveDesktopShell({
        hasWindow: true,
        tauriRuntime: false,
        isDevBuild: true,
        devOverride: 'desktop',
      }),
    ).toBe(true);
    expect(
      resolveDesktopShell({
        hasWindow: true,
        tauriRuntime: false,
        isDevBuild: false,
        devOverride: 'desktop',
      }),
    ).toBe(false);
  });

  it('ignores non-desktop override values', () => {
    expect(
      resolveDesktopShell({
        hasWindow: true,
        tauriRuntime: false,
        isDevBuild: true,
        devOverride: 'web',
      }),
    ).toBe(false);
  });
});
