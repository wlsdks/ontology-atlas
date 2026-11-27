import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { readSampleCensus, SampleMapPage } from '@/views/sample-map';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return buildPageMetadata({
    locale,
    path: 'sample',
    title: t('pages.sample'),
    description: t('descriptions.sample'),
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <SampleMapPage locale={locale} census={readSampleCensus(locale)} />;
}
