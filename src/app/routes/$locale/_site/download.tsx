import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { DownloadPage, downloadStructuredData, FAQ_KEYS, faqStructuredData } from '@/views/download';
import { JsonLd } from '@/shared/ui';

import { loadScreenMetadata } from '../../-site/load-screen-metadata';
import { MetadataTags } from '../../-site/metadata-tags';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'page',
  path: 'download',
  title: { namespace: 'metadata', key: 'homeTitle' },
  description: { namespace: 'metadata', key: 'descriptions.home' },
  absoluteTitle: true,
};

export const Route = createFileRoute('/$locale/_site/download')({
  staticData: { head },
  loader: ({ context, params }) => loadScreenMetadata(head, params.locale, context.siteMessages),
  component: DownloadRoute,
});

function DownloadRoute() {
  const { locale } = Route.useParams();
  const resolved = Route.useLoaderData();
  const t = useTranslations('metadata');
  const faq = useTranslations('download.faq');
  const answers = FAQ_KEYS.map((key) => ({ question: faq(`items.${key}.q`), answer: faq(`items.${key}.a`) }));
  return (
    <>
      <MetadataTags resolved={resolved} />
      <DownloadPage />
      {/* After the page root, so the layout slot's first child is the page; search engines read JSON-LD wherever it sits. */}
      <JsonLd data={downloadStructuredData(locale, t('descriptions.download'), { reading: t('brandReading'), keywords: t('keywords') })} />
      <JsonLd data={faqStructuredData(answers)} />
    </>
  );
}
