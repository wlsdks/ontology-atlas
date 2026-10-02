import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ko', 'ja', 'zh'] as const,
  defaultLocale: 'en',
  // Static export has no server-side negotiation: the URL prefix decides, and root `/`
  // detects on the client in app/page.tsx.
  localePrefix: 'always',
  localeDetection: false,
});
