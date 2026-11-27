import { createFileRoute } from '@tanstack/react-router';
import { WorkStatusPage } from '@/views/work-status';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/work-status')({ component: WorkStatusRoute });

function WorkStatusRoute() {
  return (
    <>
      <PageTitle namespace="workStatus" messageKey="title" />
      <WorkStatusPage />
    </>
  );
}
