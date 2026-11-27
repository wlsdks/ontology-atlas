import { createFileRoute } from '@tanstack/react-router';
import { WorkStatusPage } from '@/views/work-status';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'card',
  path: 'work-status',
  title: { namespace: 'workStatus', key: 'title' },
  description: { namespace: 'metadata', key: 'descriptions.workStatus' },
};

export const Route = createFileRoute('/$locale/_app/work-status')({ staticData: { head }, component: WorkStatusRoute });

function WorkStatusRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <WorkStatusPage />
    </>
  );
}
