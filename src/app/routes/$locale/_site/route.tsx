import { createFileRoute } from '@tanstack/react-router';

import { SiteLocaleLayout } from '@/app-providers/router/SiteLocaleLayout';
import type { AppLocale } from '@/i18n/locales';

/** The website's pages, which open no folder and so carry no vault. */
export const Route = createFileRoute('/$locale/_site')({ component: SiteRoute });

function SiteRoute() {
  const { locale } = Route.useParams();
  return <SiteLocaleLayout locale={locale as AppLocale} />;
}
