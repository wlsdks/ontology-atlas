import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
import { hasLocale } from 'use-intl';

import { routing } from '@/i18n/routing';

/** The language is the first path segment; any other value is an address no screen has. */
export const Route = createFileRoute('/$locale')({
  beforeLoad: ({ params }) => {
    if (!hasLocale(routing.locales, params.locale)) throw notFound();
  },
  component: Outlet,
});
