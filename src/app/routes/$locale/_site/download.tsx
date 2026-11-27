import { createFileRoute } from '@tanstack/react-router';

import { PageTitle } from '@/app-providers/router/PageTitle';
import { DownloadPage } from '@/views/download';

export const Route = createFileRoute('/$locale/_site/download')({ component: DownloadRoute });

function DownloadRoute() {
  return (
    <>
      <PageTitle namespace="metadata" messageKey="homeTitle" absolute />
      <DownloadPage />
    </>
  );
}
