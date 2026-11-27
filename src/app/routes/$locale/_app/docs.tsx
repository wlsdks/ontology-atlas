import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { DocsVaultPage } from '@/views/docs-vault';
import { RouteLoadingFallback } from '@/shared/ui';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/docs')({ component: DocsRoute });

function DocsRoute() {
  return (
    <>
      <PageTitle namespace="metadata" messageKey="pages.docs" />
      <Suspense fallback={<RouteLoadingFallback />}><DocsVaultPage initialCollection="ontology" documentScope="ontology" legacyEntry /></Suspense>
    </>
  );
}
