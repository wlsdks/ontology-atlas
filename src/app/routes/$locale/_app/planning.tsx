import { createFileRoute } from '@tanstack/react-router';
import { PlanningPage } from '@/views/planning';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'card',
  path: 'planning',
  title: { namespace: 'planning', key: 'title' },
  description: { namespace: 'planning', key: 'chooseBody' },
};

export const Route = createFileRoute('/$locale/_app/planning')({ staticData: { head }, component: PlanningRoute });

function PlanningRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <PlanningPage />
    </>
  );
}
