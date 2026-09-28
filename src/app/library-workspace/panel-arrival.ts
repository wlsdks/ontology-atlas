export type LibraryTab = 'sources' | 'wiki' | 'ontology' | 'rounds';

type FadeToken = '--motion-base' | '--motion-fast';

const LOADING_SELECTOR = '[data-route-loading]';

export function tokenMs(raw: string): number {
  const value = raw.trim();
  const amount = Number.parseFloat(value) || 0;
  return value.endsWith('ms') ? amount : amount * 1000;
}

function isSegment(tab: LibraryTab): boolean {
  return tab === 'sources' || tab === 'wiki';
}

export function tabSwitchFade(from: LibraryTab, to: LibraryTab, reduced: boolean): FadeToken | null {
  if (from === to) return null;
  if (reduced) return '--motion-fast';
  return isSegment(from) && isSegment(to) ? '--motion-base' : null;
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function fadeIn(element: HTMLElement, token: FadeToken): void {
  if (typeof element.animate !== 'function') return;
  const style = getComputedStyle(element);
  const duration = tokenMs(style.getPropertyValue(token));
  if (duration <= 0) return;
  const easing = style.getPropertyValue('--motion-ease').trim() || undefined;
  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
}

export function whenLoaded(host: HTMLElement, onLoaded: () => void): (() => void) | undefined {
  if (!host.querySelector(LOADING_SELECTOR)) return undefined;
  const observer = new MutationObserver(() => {
    if (host.querySelector(LOADING_SELECTOR)) return;
    observer.disconnect();
    onLoaded();
  });
  observer.observe(host, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task);
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 0);
  return () => window.clearTimeout(id);
}
