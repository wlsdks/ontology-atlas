import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { InsightsRedirectPage } from '@/views/insights-redirect';
import { RouteLoadingFallback } from '@/shared/ui';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/ontology/insights')({ component: OntologyInsightsRoute });

function OntologyInsightsRoute() {
  return (
    <>
      <PageTitle namespace="metadata" messageKey="pages.ontology" />
      <Suspense fallback={<RouteLoadingFallback />}><InsightsRedirectPage /></Suspense>
    </>
  );
}
