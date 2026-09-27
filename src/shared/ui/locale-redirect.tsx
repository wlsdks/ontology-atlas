'use client';

import { useEffect } from 'react';
import { withBasePath } from '../lib/base-path';

const STORAGE_KEY = 'ontology-atlas:locale';
type Supported = 'en' | 'ko';

function detect(): Supported {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ko') return stored;
  } catch {
    // localStorage unavailable: fall through to the browser hint.
  }
  const lang = (navigator.language || 'en').toLowerCase();
  return lang.startsWith('ko') ? 'ko' : 'en';
}

/**
 * The root `/` decides the locale and nothing else. Restoring the last route would make the
 * gateway's face depend on each visitor's history; in the app `/` has a vault and goes to the
 * map anyway. Falsifier: people re-navigating to the map on every entry calls for a better
 * gateway path to the map, not restoration.
 */
export function LocaleRedirect() {
  useEffect(() => {
    // Only the path changes: the query and hash carry deep links such as `/?p=…`.
    const { search, hash } = window.location;
    window.location.replace(withBasePath(`/${detect()}/${search}${hash}`));
  }, []);

  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      style={{
        minHeight: '60vh',
        background: 'var(--color-canvas)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <p
        className="text-body-lg text-[color:var(--color-text-tertiary)]"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          margin: 0,
        }}
      >
        Opening Ontology Atlas…
        {/* A raw `<a>`: this fallback must survive failed hydration. */}
        <a style={{ color: 'var(--color-indigo-accent)' }} href={withBasePath('/en/')}>
          English
        </a>
        <span aria-hidden="true">·</span>
        {/* A raw `<a>`: this fallback must survive failed hydration. */}
        <a style={{ color: 'var(--color-indigo-accent)' }} href={withBasePath('/ko/')}>
          한국어
        </a>
        <noscript>
          JavaScript is required for automatic routing.
        </noscript>
      </p>
    </div>
  );
}
