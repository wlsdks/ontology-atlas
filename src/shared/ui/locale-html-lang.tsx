'use client';

import { useEffect } from 'react';

/**
 * Updates `<html lang="...">` to match the active locale on the client.
 * The root `app/layout.tsx` ships `lang="en"` by default for static-export
 * SEO; this component switches it to "ko" when the user lands on a `/ko/*`
 * route. No-op during SSG since useEffect only runs in the browser.
 */
export function LocaleHtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
