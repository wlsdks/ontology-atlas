import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DownloadPage, downloadStructuredData, FAQ_KEYS, faqStructuredData } from '@/views/download';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';
import { JsonLd } from '@/shared/ui';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return buildPageMetadata({
    locale,
    path: 'download',
    title: t('homeTitle'),
    description: t('descriptions.home'),
    absoluteTitle: true,
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const faq = await getTranslations({ locale, namespace: 'download.faq' });
  const answers = FAQ_KEYS.map((key) => ({ question: faq(`items.${key}.q`), answer: faq(`items.${key}.a`) }));

  return (
    <>
      <DownloadPage />
      {/*
       * After the page root, not before it: the slot's first child is the page. JSON-LD is read
       * by search engines wherever it sits in the document, so the ordering costs nothing.
       */}
      <JsonLd data={downloadStructuredData(locale, t('descriptions.download'), { reading: t('brandReading'), keywords: t('keywords') })} />
      <JsonLd data={faqStructuredData(answers)} />
    </>
  );
}
