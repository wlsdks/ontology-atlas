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

/**
 * Query/hash changes stay inside one surface and locale changes keep the same
 * task. Only a different semantic pathname starts a new page-reading context.
 */
export function normalizeRouteSurfacePath(pathname: string): string {
  const withoutLocale = pathname.replace(/^\/(?:en|ko)(?=\/|$)/, '') || '/';
  if (withoutLocale === '/') return withoutLocale;
  return withoutLocale.replace(/\/+$/, '');
}

/** Add a native-navigation-safe focus marker without disturbing query or hash. */
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
 * Persist the destination reading-start intent across a possible locale-layout
 * or WebView shell remount. Call immediately before client navigation.
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
 * Persistent AppShell means client navigation can remove the focused control
 * without a document reload. When that leaves focus outside the destination
 * task, hand it to the new page heading (or main landmark). A destination that
 * already focused something inside main or an aria-modal dialog keeps ownership.
 */
export function RouteFocusManager() {
  const pathname = usePathname() ?? '/';
  const surfacePath = normalizeRouteSurfacePath(pathname);
  const previousSurfaceRef = useRef<string | null>(null);
  // Capture during render: a destination child may replace query state in its
  // own mount effect before this passive effect runs.
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
      // 로딩 자리표시자의 `#main` 은 목적지가 아니다. 여기에 포커스를 두면
      // 실제 화면이 그 노드를 교체하는 순간 포커스가 body 로 떨어진다 —
      // 관측자를 계속 돌려 진짜 목적지가 오기를 기다린다.
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

      const target =
        document.querySelector<HTMLElement>('h1:not([hidden]):not([aria-hidden="true"])') ??
        main;
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
      // The static-export destination can replace a Suspense/welcome surface
      // with the loaded vault immediately after first paint. Focus only after
      // the task DOM has been quiet long enough to own a stable h1.
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
