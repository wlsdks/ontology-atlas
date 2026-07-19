'use client';

import { useEffect } from 'react';
import { isRestorableRoute, ROUTE_MEMORY_KEY } from './route-memory';

const STORAGE_KEY = 'ontology-atlas:locale';
type Supported = 'en' | 'ko';

function detect(): Supported {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ko') return stored;
  } catch {
    // localStorage unavailable — fall through to browser hint
  }
  const lang = (navigator.language || 'en').toLowerCase();
  return lang.startsWith('ko') ? 'ko' : 'en';
}

function restoreTarget(locale: Supported): string {
  try {
    const lastRoute = window.localStorage.getItem(ROUTE_MEMORY_KEY);
    if (isRestorableRoute(lastRoute) && lastRoute.startsWith(`/${locale}/`)) {
      return lastRoute;
    }
  } catch {
    // localStorage unavailable — fall through to locale home.
  }
  return `/${locale}/`;
}

export function LocaleRedirect() {
  useEffect(() => {
    window.location.replace(restoreTarget(detect()));
  }, []);

  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      style={{
        minHeight: '60vh',
        // 디자인 토큰 참조 — hardcoded hex 대신 var() 를 써서 토큰 변경이
        // 이 redirect 화면에도 자동 반영되게 한다 (design.md 토큰 규율).
        background: 'var(--color-canvas)',
        color: 'var(--color-text-secondary)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <p
        className="text-sm text-[color:var(--color-text-tertiary)]"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          margin: 0,
          fontSize: '0.875rem',
        }}
      >
        Opening Ontology Atlas…
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- root redirect fallback must survive failed hydration */}
        <a style={{ color: 'var(--color-indigo-accent)' }} href="/en/">
          English
        </a>
        <span aria-hidden="true">·</span>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- root redirect fallback must survive failed hydration */}
        <a style={{ color: 'var(--color-indigo-accent)' }} href="/ko/">
          한국어
        </a>
        <noscript>
          JavaScript is required for automatic routing.
        </noscript>
      </p>
    </div>
  );
}
