import { createFileRoute } from '@tanstack/react-router';
import { GitPage } from '@/views/git';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'card',
  path: 'git',
  title: { namespace: 'atlasGit', key: 'title' },
  description: { namespace: 'metadata', key: 'descriptions.git' },
};

export const Route = createFileRoute('/$locale/_app/git')({ staticData: { head }, component: GitRoute });

function GitRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <GitPage />
    </>
  );
}
