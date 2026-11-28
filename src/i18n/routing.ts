/** The URL prefix decides the language; there is no server-side negotiation, and `/` picks one in the browser. */
export const routing = {
  locales: ['en', 'ko', 'ja', 'zh'],
  defaultLocale: 'en',
} as const;
