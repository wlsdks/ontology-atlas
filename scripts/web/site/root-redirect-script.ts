import { LOCALE_META } from '@/i18n/locales';
import { BASE_PATH } from '@/shared/lib/public-pages/base-path';

/**
 * Sends `/` to the language's root. The boot script has already set `<html lang>` to the language it chose
 * (the stored choice, else the system list), so this only turns that back into the address segment; query
 * and hash carry deep links such as `/?p=…` and are kept as they came.
 */
export function rootRedirectScript(): string {
  const localeOfHtmlLang = Object.fromEntries(Object.entries(LOCALE_META).map(([locale, meta]) => [meta.htmlLang, locale]));
  return [
    'try{',
    `var c=${JSON.stringify(localeOfHtmlLang)}[document.documentElement.lang];`,
    `if(c)location.replace(${JSON.stringify(BASE_PATH)}+"/"+c+"/"+location.search+location.hash);`,
    '}catch(e){}',
  ].join('');
}
