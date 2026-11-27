import { createFileRoute } from '@tanstack/react-router';

import { AppLocaleLayout } from '@/app-providers/router/AppLocaleLayout';
import type { AppLocale } from '@/i18n/locales';
import { NotFoundScreen } from '@/views/terminal-state';

/** The installed app's screens: the shell, the vault and the workbench's catalog around each. */
export const Route = createFileRoute('/$locale/_app')({
  component: AppRoute,
  notFoundComponent: () => <NotFoundScreen />,
});

function AppRoute() {
  const { locale } = Route.useParams();
  return <AppLocaleLayout locale={locale as AppLocale} />;
}
