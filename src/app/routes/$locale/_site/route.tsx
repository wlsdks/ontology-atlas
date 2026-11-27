import { createFileRoute } from '@tanstack/react-router';

import { SiteLocaleLayout } from '@/app-providers/router/SiteLocaleLayout';
import type { AppLocale } from '@/i18n/locales';

/** The website's pages, which open no folder and so carry no vault. They read only the paths of `SITE_MESSAGE_PATHS`. */
export const Route = createFileRoute('/$locale/_site')({
  beforeLoad: async ({ context, params }) => ({ siteMessages: await context.buildFacts.siteMessages(params.locale as AppLocale) }),
  component: SiteRoute,
});

function SiteRoute() {
  const { locale } = Route.useParams();
  const { siteMessages } = Route.useRouteContext();
  return <SiteLocaleLayout locale={locale as AppLocale} messages={siteMessages} />;
}
