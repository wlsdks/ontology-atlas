import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AutomationsWorkspace } from '@/app-providers/automations-workspace';
import { RouteLoadingFallback } from '@/shared/ui';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'automations' });
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <AutomationsWorkspace />
    </Suspense>
  );
}
