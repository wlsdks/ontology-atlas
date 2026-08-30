import { isTauriVaultRuntime } from './tauri-vault-fs';

/**
 * Decides whether this is the desktop shell (the installed macOS app, a Tauri
 * WebView).
 *
 * It exists for one product-identity branch: `/` in the installed app must be the
 * local work entry (FirstRun), not the marketing gateway. The branch happens once
 * at runtime with no build split — web and desktop share the same static export.
 *
 * The decision is isolated in the pure `resolveDesktopShell` to give tests a
 * seam. Under SSR (no window) it is always false, so the web's first HTML never
 * takes the desktop branch.
 */
export interface DesktopShellSignals {
  /** `typeof window !== 'undefined'` — false under SSR. */
  hasWindow: boolean;
  /** Whether the real Tauri invoke bridge exists (`isTauriVaultRuntime`). */
  tauriRuntime: boolean;
  /** Whether this is a dev build — the dev override only applies there. */
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

/** The localStorage key holding the dev-only override. */
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
