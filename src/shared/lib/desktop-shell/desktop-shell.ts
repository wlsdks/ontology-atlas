import { isTauriVaultRuntime } from '../vault-folder/native-vault/tauri-vault-runtime';

/**
 * Whether this is the desktop shell (the installed macOS app, a Tauri WebView). The branch happens once
 * at runtime because the website and the app share one static export; under SSR (no window) it is
 * always false. Nothing but the app's own runtime makes it true: a browser cannot pretend to be it.
 */
export function isDesktopShell(): boolean {
  return typeof window !== 'undefined' && isTauriVaultRuntime();
}
