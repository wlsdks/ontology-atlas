import { isTauriVaultRuntime } from '../vault-folder/native-vault/tauri-vault-runtime';

/**
 * Decides whether this is the desktop shell (the installed macOS app, a Tauri WebView): `/` in the app
 * must be the local work entry (FirstRun), not the marketing gateway. The branch happens once at
 * runtime because web and desktop share one static export; under SSR (no window) it is always false.
 * `resolveDesktopShell` is pure to give tests a seam.
 */
export interface DesktopShellSignals {
  hasWindow: boolean;
  tauriRuntime: boolean;
  isDevBuild: boolean;
  /**
   * The dev-only override (`?shell=desktop` query or the `dev:desktop-shell`
   * localStorage key). Ignored in production builds — it is a seam for verifying
   * and screenshotting the FirstRun surface in a browser, not a feature.
   */
  devOverride: string | null;
}

export function resolveDesktopShell(signals: DesktopShellSignals): boolean {
  if (!signals.hasWindow) return false;
  if (signals.tauriRuntime) return true;
  return signals.isDevBuild && signals.devOverride === 'desktop';
}

const DESKTOP_SHELL_DEV_OVERRIDE_KEY = 'dev:desktop-shell';

function readDevOverride(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('shell');
    if (fromQuery) return fromQuery;
    return window.localStorage.getItem(DESKTOP_SHELL_DEV_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

export function isDesktopShell(): boolean {
  const hasWindow = typeof window !== 'undefined';
  return resolveDesktopShell({
    hasWindow,
    tauriRuntime: hasWindow ? isTauriVaultRuntime() : false,
    isDevBuild: process.env.NODE_ENV !== 'production',
    devOverride: hasWindow ? readDevOverride() : null,
  });
}
