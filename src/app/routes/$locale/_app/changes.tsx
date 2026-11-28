import { createFileRoute } from '@tanstack/react-router';
import { ChangeBriefingPage } from '@/views/change-briefing';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'card',
  path: 'changes',
  title: { namespace: 'changeBriefing', key: 'title' },
  description: { namespace: 'changeBriefing', key: 'intro' },
};

export const Route = createFileRoute('/$locale/_app/changes')({ staticData: { head }, component: ChangesRoute });

function ChangesRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <ChangeBriefingPage />
    </>
  );
}
