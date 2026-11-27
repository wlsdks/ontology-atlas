import { createFileRoute } from '@tanstack/react-router';
import { ChangeBriefingPage } from '@/views/change-briefing';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/changes')({ component: ChangesRoute });

function ChangesRoute() {
  return (
    <>
      <PageTitle namespace="changeBriefing" messageKey="title" />
      <ChangeBriefingPage />
    </>
  );
}
