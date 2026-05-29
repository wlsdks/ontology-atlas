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
        // 디자인 토큰 참조 — globals.css 가 static <link> 로 항상 로드되고
        // data-theme 스크립트가 render 전 동기 실행되므로, 라이트 모드 사용자가
        // 루트 redirect 진입 시 다크 hex 가 깜빡이던 회귀를 제거한다.
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
        Opening Context Atlas…
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
