'use client';

import { Fragment, useEffect } from 'react';
import { detectLocale } from '@/i18n/detect-locale';
import type { AppLocale } from '@/i18n/locales';
import { routing } from '@/i18n/routing';
import { withBasePath } from '../lib/base-path';

const STORAGE_KEY = 'ontology-atlas:locale';

const NATIVE_NAME: Record<AppLocale, string> = {
  en: 'English',
  ko: '한국어',
};

function detect(): AppLocale {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return detectLocale(languages, stored);
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
        {routing.locales.map((locale, index) => (
          <Fragment key={locale}>
            {index > 0 && <span aria-hidden="true">·</span>}
            {/* A raw `<a>`: this fallback must survive failed hydration. */}
            <a style={{ color: 'var(--color-indigo-accent)' }} href={withBasePath(`/${locale}/`)}>
              {NATIVE_NAME[locale] ?? locale}
            </a>
          </Fragment>
        ))}
        <noscript>
          JavaScript is required for automatic routing.
        </noscript>
      </p>
    </div>
  );
}
