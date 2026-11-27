import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { OntologyRedirectPage } from '@/views/ontology-redirect';
import { RouteLoadingFallback } from '@/shared/ui';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/ontology/')({ component: OntologyRoute });

function OntologyRoute() {
  return (
    <>
      <PageTitle namespace="metadata" messageKey="pages.ontology" />
      <Suspense fallback={<RouteLoadingFallback />}><OntologyRedirectPage /></Suspense>
    </>
  );
}
