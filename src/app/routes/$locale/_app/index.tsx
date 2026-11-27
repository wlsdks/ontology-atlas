import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';

import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';
import { RouteLoadingFallback } from '@/shared/ui';
import { RootEntryPage } from '@/views/root-entry';

const head: ScreenHead = {
  kind: 'page',
  path: 'download',
  title: { namespace: 'metadata', key: 'homeTitle' },
  description: { namespace: 'metadata', key: 'descriptions.home' },
  absoluteTitle: true,
};

export const Route = createFileRoute('/$locale/_app/')({ staticData: { head }, component: LocaleRootRoute });

function LocaleRootRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}>
        <RootEntryPage />
      </Suspense>
    </>
  );
}
