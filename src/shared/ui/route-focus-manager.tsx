'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from '@/i18n/navigation';

const ROUTE_FOCUS_INTENT_KEY = 'ontology-atlas:route-focus-intent';
const ROUTE_FOCUS_INTENT_MAX_AGE_MS = 10_000;
const ROUTE_FOCUS_QUERY_KEY = 'focus';
const ROUTE_FOCUS_QUERY_VALUE = 'main';

interface RouteFocusIntent {
  surfacePath: string;
  createdAt: number;
}

/** Only a different semantic pathname starts a new page-reading context. */
function normalizeRouteSurfacePath(pathname: string): string {
  const withoutLocale = pathname.replace(/^\/(?:en|ko)(?=\/|$)/, '') || '/';
  if (withoutLocale === '/') return withoutLocale;
  return withoutLocale.replace(/\/+$/, '');
}

export function buildRouteFocusHref(href: string): string {
  const hashIndex = href.indexOf('#');
  const base = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : '';
  const params = new URLSearchParams(base.includes('?') ? base.slice(base.indexOf('?') + 1) : '');
  if (params.get(ROUTE_FOCUS_QUERY_KEY) === ROUTE_FOCUS_QUERY_VALUE) return href;
  const separator = base.includes('?')
    ? base.endsWith('?') || base.endsWith('&')
      ? ''
      : '&'
    : '?';
  return `${base}${separator}${ROUTE_FOCUS_QUERY_KEY}=${ROUTE_FOCUS_QUERY_VALUE}${hash}`;
}

function clearRouteFocusQueryMarker() {
  const url = new URL(window.location.href);
  if (url.searchParams.get(ROUTE_FOCUS_QUERY_KEY) !== ROUTE_FOCUS_QUERY_VALUE) return;
  url.searchParams.delete(ROUTE_FOCUS_QUERY_KEY);
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
  window.dispatchEvent(new Event('app:urlchange'));
}

/**
 * Persists the reading-start intent across a locale-layout or WebView remount; call right
 * before client navigation.
 */
export function rememberRouteFocusIntent(pathname: string) {
  const intent: RouteFocusIntent = {
    surfacePath: normalizeRouteSurfacePath(pathname),
    createdAt: Date.now(),
  };
  try {
    window.sessionStorage.setItem(ROUTE_FOCUS_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // sessionStorage unavailable — a persistent AppShell transition still works.
  }
}

function consumeRouteFocusIntent(surfacePath: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(ROUTE_FOCUS_INTENT_KEY);
    if (!raw) return false;
    const intent = JSON.parse(raw) as Partial<RouteFocusIntent>;
    const age = Date.now() - Number(intent.createdAt);
    if (
      !Number.isFinite(age) ||
      age < 0 ||
      age > ROUTE_FOCUS_INTENT_MAX_AGE_MS
    ) {
      window.sessionStorage.removeItem(ROUTE_FOCUS_INTENT_KEY);
      return false;
    }
    if (intent.surfacePath !== surfacePath) return false;
    window.sessionStorage.removeItem(ROUTE_FOCUS_INTENT_KEY);
    return true;
  } catch {
    try {
      window.sessionStorage.removeItem(ROUTE_FOCUS_INTENT_KEY);
    } catch {
      // sessionStorage unavailable — no intent remains to clean up.
    }
    return false;
  }
}

/**
 * After client navigation, hands focus that is outside the destination to its heading or main
 * landmark, unless the destination already focused something in main or a modal.
 */
export function RouteFocusManager() {
  const pathname = usePathname() ?? '/';
  const surfacePath = normalizeRouteSurfacePath(pathname);
  const previousSurfaceRef = useRef<string | null>(null);
  // Captured during render: a destination may replace the query in its own mount effect.
  const hasUrlFocusIntent =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get(ROUTE_FOCUS_QUERY_KEY) ===
      ROUTE_FOCUS_QUERY_VALUE;

  useEffect(() => {
    const previousSurface = previousSurfaceRef.current;
    previousSurfaceRef.current = surfacePath;
    const hasExplicitIntent =
      consumeRouteFocusIntent(surfacePath) || hasUrlFocusIntent;
    if (
      (previousSurface === null || previousSurface === surfacePath) &&
      !hasExplicitIntent
    ) {
      return;
    }

    const focusDestination = (): boolean => {
      const main = document.querySelector<HTMLElement>('#main');
      // The loading placeholder's `#main` is not the destination: focus would drop to body when
      // the real screen replaces it.
      if (!main || main.dataset.routeLoading === 'true') return false;

      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active !== document.body &&
        active !== document.documentElement &&
        (main.contains(active) ||
          active.closest('[role="dialog"][aria-modal="true"]'))
      ) {
        if (hasUrlFocusIntent) clearRouteFocusQueryMarker();
        return true;
      }

      /*
       * A heading that is itself a control (an in-place editor) is not the title to announce, and
       * setting its `tabIndex` to -1 below would drop it from the tab order; the landmark is the
       * target, as `?focus=main` promises.
       */
      const heading = document.querySelector<HTMLElement>(
        'h1:not([hidden]):not([aria-hidden="true"])',
      );
      const headingIsControl =
        heading !== null &&
        (heading.tabIndex >= 0 ||
          heading.getAttribute('role') === 'button' ||
          heading.getAttribute('role') === 'link');
      const target = heading && !headingIsControl ? heading : main;
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
      if (hasUrlFocusIntent) clearRouteFocusQueryMarker();
      return true;
    };

    let settleTimer: number | null = null;
    let deadlineTimer: number | null = null;
    const observer = new MutationObserver(() => scheduleFocus());
    const stop = () => {
      observer.disconnect();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      if (deadlineTimer !== null) window.clearTimeout(deadlineTimer);
    };
    const scheduleFocus = () => {
      if (!document.querySelector('#main:not([data-route-loading])')) return;
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      // The static-export destination can swap its surface right after first paint, so focus
      // waits until the DOM is quiet enough to own a stable h1.
      settleTimer = window.setTimeout(() => {
        if (focusDestination()) stop();
      }, 120);
    };

    observer.observe(document.body, { childList: true, subtree: true });
    scheduleFocus();
    deadlineTimer = window.setTimeout(() => {
      focusDestination();
      stop();
    }, 2_000);
    return stop;
  }, [hasUrlFocusIntent, surfacePath]);

  return null;
}
