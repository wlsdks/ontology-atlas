import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { OntologyEditRedirectPage } from '@/views/ontology-edit-redirect';
import { RouteLoadingFallback } from '@/shared/ui';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/ontology/studio')({ component: OntologyStudioRoute });

function OntologyStudioRoute() {
  return (
    <>
      <PageTitle namespace="metadata" messageKey="pages.topology" />
      <Suspense fallback={<RouteLoadingFallback />}><OntologyEditRedirectPage /></Suspense>
    </>
  );
}
