import { createFileRoute } from '@tanstack/react-router';
import { PlanningPage } from '@/views/planning';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/planning')({ component: PlanningRoute });

function PlanningRoute() {
  return (
    <>
      <PageTitle namespace="planning" messageKey="title" />
      <PlanningPage />
    </>
  );
}
