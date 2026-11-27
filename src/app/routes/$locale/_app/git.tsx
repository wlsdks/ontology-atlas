import { createFileRoute } from '@tanstack/react-router';
import { GitPage } from '@/views/git';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/git')({ component: GitRoute });

function GitRoute() {
  return (
    <>
      <PageTitle namespace="atlasGit" messageKey="title" />
      <GitPage />
    </>
  );
}
