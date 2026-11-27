import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { OntologyEditRedirectPage } from '@/views/ontology-edit-redirect';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../../-site/ScreenTitle';
import type { ScreenHead } from '../../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'title-only',
  title: { namespace: 'metadata', key: 'pages.topology' },
  description: { namespace: 'metadata', key: 'descriptions.topology' },
  follow: true,
};

export const Route = createFileRoute('/$locale/_app/ontology/studio')({ staticData: { head }, component: OntologyStudioRoute });

function OntologyStudioRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><OntologyEditRedirectPage /></Suspense>
    </>
  );
}
