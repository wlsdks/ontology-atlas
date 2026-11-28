import { useEffect, useMemo } from 'react';

import { resolveProjectFallbackRoute } from '@/entities/project';
import { useRouter } from '@/i18n/navigation';
import { stringifySearch } from '@/shared/lib/navigation/atlas-search';
import { ProjectDetailPage } from '@/views/project-detail';
import { ProjectEditorPage } from '@/views/project-editor';

/** A project's detail or editor, named by the query of the fallback address; an address that names none returns to the list. */
export function ProjectFallbackScreen({ search }: { search: Record<string, unknown> }) {
  const router = useRouter();
  const query = stringifySearch(search).replace(/^\?/, '');
  const route = useMemo(() => resolveProjectFallbackRoute(query), [query]);

  useEffect(() => {
    if (!route) router.replace('/projects');
  }, [route, router]);

  if (!route) return null;

  if (route.mode === 'edit') {
    return <ProjectEditorPage mode="edit" slug={route.slug} returnTo={route.returnTo} savedNotice={route.savedNotice} />;
  }

  return <ProjectDetailPage slug={route.slug} initialProject={null} initialRelated={[]} />;
}
