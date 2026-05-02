'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'omot:locale';
const SUPPORTED = ['en', 'ko'] as const;
type Supported = (typeof SUPPORTED)[number];

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

export function LocaleRedirect() {
  useEffect(() => {
    const target = detect();
    window.location.replace(`/${target}/`);
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-[color:var(--color-text-tertiary)]">
        Loading…{' '}
        <noscript>
          JavaScript is required.{' '}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional cross-locale fallback when JS is disabled */}
          <a href="/en/">Continue in English</a>
          {' · '}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional cross-locale fallback */}
          <a href="/ko/">한국어</a>
        </noscript>
      </p>
    </div>
  );
}
