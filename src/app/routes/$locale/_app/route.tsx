import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import { AppLocaleLayout } from '@/app-providers/router/AppLocaleLayout';
import type { AppLocale } from '@/i18n/locales';

const StandaloneNotFound = lazy(() => import('@/app-providers/router/StandaloneNotFound'));

/** The installed app's screens: the shell, the vault and the workbench's catalog around each. */
export const Route = createFileRoute('/$locale/_app')({
  component: AppRoute,
  // TanStack renders this in the screen's place, before the workbench's messages have arrived, so it
  // carries its own words (`StandaloneNotFound`) instead of reading the workbench's.
  notFoundComponent: () => (
    <Suspense fallback={null}>
      <StandaloneNotFound />
    </Suspense>
  ),
});

function AppRoute() {
  const { locale } = Route.useParams();
  return <AppLocaleLayout locale={locale as AppLocale} />;
}
