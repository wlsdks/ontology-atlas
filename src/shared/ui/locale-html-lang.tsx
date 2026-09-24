'use client';

import { useEffect } from 'react';

/**
 * Keeps `<html lang="...">` equal to the active locale on client-side navigation.
 * The root `app/layout.tsx` ships `lang="en"` in the static HTML; the inline boot
 * script (`accent-boot-script.tsx`, `LANG_BOOT`) already corrects it from the path
 * before the first paint. This effect covers a locale switch without a reload.
 */
export function LocaleHtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
