import { firstSearchText } from '@/shared/lib/navigation/search-text';
import { ProjectEditorPage } from '@/views/project-editor';

import type { ProjectNewSearch } from './project-new-search';

/** The editor on a blank project, or on a copy of one, as the query names it. */
export function ProjectNewScreen({ search }: { search: ProjectNewSearch }) {
  const duplicateFromSlug = firstSearchText(search.from);
  const initialCategoryId = firstSearchText(search.category);
  const initialStatusId = firstSearchText(search.status);
  const returnTo = firstSearchText(search.returnTo);

  return (
    <ProjectEditorPage
      key={`${duplicateFromSlug ?? '__new__'}:${initialCategoryId ?? ''}:${initialStatusId ?? ''}:${returnTo ?? ''}`}
      mode="create"
      duplicateFromSlug={duplicateFromSlug}
      initialCategoryId={initialCategoryId}
      initialStatusId={initialStatusId}
      returnTo={returnTo}
    />
  );
}
