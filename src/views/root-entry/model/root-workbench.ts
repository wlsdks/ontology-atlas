import { useSyncExternalStore, type ComponentType } from 'react';
import type { AppLocale } from '@/i18n/locales';
import {
  loadWorkbenchCatalog,
  readWorkbenchCatalog,
  subscribeWorkbenchCatalog,
} from '@/i18n/workbench-catalog';

/**
 * What `/` needs beyond the gateway once a visitor turns out to have a folder, or is in the
 * installed app: the map and the first-run screen, and the whole message catalog they read. A
 * first-time web visitor never fetches any of it, so `/` costs about what `/download` does.
 */
export interface RootWorkbenchViews {
  HomePage: ComponentType;
  FirstRunPage: ComponentType;
}

let views: RootWorkbenchViews | null = null;
let pending: Promise<RootWorkbenchViews> | null = null;
const listeners = new Set<() => void>();

function loadViews(): Promise<RootWorkbenchViews> {
  if (!pending) {
    pending = Promise.all([import('@/views/home'), import('@/views/first-run')]).then(
      ([home, firstRun]) => {
        views = { HomePage: home.HomePage, FirstRunPage: firstRun.FirstRunPage };
        listeners.forEach((listener) => listener());
        return views;
      },
    );
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}

export function requestRootWorkbench(locale: AppLocale): void {
  void loadWorkbenchCatalog(locale).catch(() => undefined);
  void loadViews().catch(() => undefined);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const leaveCatalog = subscribeWorkbenchCatalog(listener);
  return () => {
    listeners.delete(listener);
    leaveCatalog();
  };
}

export function useRootWorkbenchViews(locale: AppLocale): RootWorkbenchViews | null {
  return useSyncExternalStore(
    subscribe,
    () => (views && readWorkbenchCatalog(locale) ? views : null),
    () => null,
  );
}
