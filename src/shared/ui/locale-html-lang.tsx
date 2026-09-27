'use client';

import { useEffect } from 'react';

/**
 * Keeps `<html lang>` equal to the locale on a client-side switch; `LANG_BOOT`
 * in `accent-boot-script.tsx` sets it before the first paint.
 */
export function LocaleHtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
