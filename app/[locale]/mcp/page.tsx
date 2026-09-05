import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { McpPage } from '@/views/mcp';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'mcp' });
  return { title: t('title') };
}

export default function Page() {
  return <McpPage />;
}
