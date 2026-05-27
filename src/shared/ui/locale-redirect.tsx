'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'omot:locale';
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

export function LocaleRedirect() {
  useEffect(() => {
    const target = detect();
    window.location.replace(`/${target}/`);
  }, []);

  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      style={{
        minHeight: '60vh',
        background: '#08090a',
        color: '#d0d6e0',
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
        Opening Context Atlas…
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- root redirect fallback must survive failed hydration */}
        <a style={{ color: '#8b97ff' }} href="/en/">
          English
        </a>
        <span aria-hidden="true">·</span>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- root redirect fallback must survive failed hydration */}
        <a style={{ color: '#8b97ff' }} href="/ko/">
          한국어
        </a>
        <noscript>
          JavaScript is required for automatic routing.
        </noscript>
      </p>
    </div>
  );
}
