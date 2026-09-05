import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LibraryPage } from '@/views/library';
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

/**
 * `/library` — the project documents gathered into this folder, and the wiki pages
 * written from them.
 *
 * The two lists shipped inside the Docs sidebar on 2026-09-05 and became a destination of
 * their own the next day; `src/views/library/ui/LibraryPage.tsx` carries the reason. Docs
 * is the ontology's Markdown again.
 *
 * The `Suspense` boundary matches every other route view here: the page below reads the
 * local folder on the client, and this fallback is what a static export prerenders in its
 * place rather than a blank frame.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <LibraryPage />
    </Suspense>
  );
}
