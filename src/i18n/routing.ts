import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ko'] as const,
  defaultLocale: 'en',
  // Static export limitation: server-side locale negotiation is not available.
  // The locale is determined solely by the URL prefix (/en/..., /ko/...).
  // Root `/` is handled separately by app/page.tsx (client-side detection).
  localePrefix: 'always',
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
