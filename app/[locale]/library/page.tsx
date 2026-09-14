import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LibraryWorkspace } from '@/app-providers/library-workspace';
import { RouteLoadingFallback } from '@/shared/ui';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'library' });
  return { title: t('title') };
}

/** Library composes Sources, Wiki, and the existing ontology editor. The
 * Suspense boundary permits query-based tab selection in the static export. */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <LibraryWorkspace />
    </Suspense>
  );
}
