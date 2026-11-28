import { useEffect } from 'react';
import { htmlLangOf } from '@/i18n/locales';

/**
 * Keeps `<html lang>` equal to the locale on a client-side switch; the boot script
 * in `src/i18n/boot-script.ts` sets it before the first paint.
 */
export function LocaleHtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = htmlLangOf(locale);
  }, [locale]);
  return null;
}
