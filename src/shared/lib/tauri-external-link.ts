import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/**
 * The one place that actually opens links pointing **outside** the app.
 *
 * **Why it exists** (caught in the 2026-08-20 walkthrough). Inside the app,
 * `<a target="_blank">` **did nothing**: the Tauri WebView opens no new window
 * and this app carried no plugin to handle it. So pressing "↗ install
 * instructions" in settings silently did nothing — and that was the **only next
 * step** we offered someone with no tooling at all.
 *
 * The owner reported it as: *"눌러도 반응이없음 설치방법은!"* (pressing "install
 * instructions" does nothing).
 *
 * **Why intercept instead of fixing each link.** Outbound links are scattered
 * across **10 files**. Fixing them one by one misses the eleventh, and that link
 * then dies **silently** — no error at all. So the click is intercepted in one
 * place, which covers new links automatically.
 *
 * **On the web it does nothing.** Browsers already open `target="_blank"`
 * correctly, and outside Tauri this interceptor is never installed.
 */

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  try {
    return isTauri() ? (tauriInvoke as TauriInvoke) : null;
  } catch {
    return null;
  }
}

/** Can the app open this URL? Same rule as `is_openable_url` on the Rust side. */
export function isExternalHttpUrl(href: string): boolean {
  const value = href.trim().toLowerCase();
  return (
    (value.startsWith('https://') || value.startsWith('http://')) && !/\s/.test(href)
  );
}

/**
 * Intercepts clicks on outbound links and hands them to the OS. Returns a
 * detach function.
 *
 * Listens in the capture phase, so this sees the click first even when another
 * handler wrapping the link would otherwise swallow it.
 */
export function installExternalLinkOpener(doc: Document = document): () => void {
  const invoke = getInvoke();
  if (!invoke) return () => undefined;

  const onClick = (event: MouseEvent) => {
    // Leave modifier combinations meaning "new tab/window" alone — that is the
    // user following browser convention, and in the app the result is the same.
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;

    const href = anchor.getAttribute('href') ?? '';
    if (!isExternalHttpUrl(href)) return;

    event.preventDefault();
    void invoke('open_external_url', { url: href }).catch(() => {
      // A failure to open must not halt the app. The honest thing to do here is
      // nothing, which leaves the state exactly as it was before this fix.
    });
  };

  doc.addEventListener('click', onClick, true);
  return () => doc.removeEventListener('click', onClick, true);
}
