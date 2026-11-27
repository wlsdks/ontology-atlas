import { createFileRoute } from '@tanstack/react-router';

import type { AppLocale } from '@/i18n/locales';
import { SampleMapPage } from '@/views/sample-map';

import { loadScreenMetadata } from '../../-site/load-screen-metadata';
import { MetadataTags } from '../../-site/metadata-tags';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'page',
  path: 'sample',
  title: { namespace: 'metadata', key: 'pages.sample' },
  description: { namespace: 'metadata', key: 'descriptions.sample' },
};

export const Route = createFileRoute('/$locale/_site/sample')({
  staticData: { head },
  loader: async ({ context, params }) => ({
    resolved: loadScreenMetadata(head, params.locale, context.siteMessages),
    census: await context.buildFacts.sampleCensus(params.locale as AppLocale),
  }),
  component: SampleRoute,
});

function SampleRoute() {
  const { locale } = Route.useParams();
  const { resolved, census } = Route.useLoaderData();
  return (
    <>
      <MetadataTags resolved={resolved} />
      <SampleMapPage locale={locale} census={census} />
    </>
  );
}
