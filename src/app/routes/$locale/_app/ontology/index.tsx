import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { OntologyRedirectPage } from '@/views/ontology-redirect';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../../-site/ScreenTitle';
import type { ScreenHead } from '../../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'title-only',
  title: { namespace: 'metadata', key: 'pages.ontology' },
  follow: true,
};

export const Route = createFileRoute('/$locale/_app/ontology/')({ staticData: { head }, component: OntologyRoute });

function OntologyRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><OntologyRedirectPage /></Suspense>
    </>
  );
}
