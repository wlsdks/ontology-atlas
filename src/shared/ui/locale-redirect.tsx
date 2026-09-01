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
    // localStorage unavailable — fall through to browser hint
  }
  const lang = (navigator.language || 'en').toLowerCase();
  return lang.startsWith('ko') ? 'ko' : 'en';
}

/**
 * **`/` decides the locale and nothing else** — it does not restore the last
 * route visited (owner decision, 2026-07-30).
 *
 * Route restoration is a virtue in an **app** (return to where you were working)
 * and a vice on the **gateway**: the site's face would depend on the visitor's
 * history, so not even the owner could see their own first impression.
 *
 * That cost was paid for real. Opening `/` kept landing the owner on
 * `/ko/topology/`, reported as a defect — *"Is this page still redirecting to the map?"* (is this page still redirecting to the map?) — while the code was
 * behaving exactly as designed; that browser simply remembered `/ko/topology/`.
 * A screen that looks like a defect is one. And a shared link would show the
 * recipient something the sender could not predict.
 *
 * **App users lose nothing:** in the app `/` has a vault, so `isGatewaySurface()`
 * sends it to the map anyway.
 *
 * Falsifier: if users are observed re-navigating to the map on every entry, the
 * fix is the gateway's path to the map, not bringing restoration back.
 */
export function LocaleRedirect() {
  useEffect(() => {
    // Deciding the language changes the PATH only. Dropping the query and hash
    // here (bug sweep 2026-09-01) made every deep link addressed to `/` —
    // shared `/?p=…` links included — open an unselected map: the locale hop
    // was the root cause that turned those links into silent data loss.
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
        {/* raw <a>, not next/link — this root redirect fallback must survive failed hydration */}
        <a style={{ color: 'var(--color-indigo-accent)' }} href={withBasePath('/en/')}>
          English
        </a>
        <span aria-hidden="true">·</span>
        {/* raw <a>, not next/link — this root redirect fallback must survive failed hydration */}
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
