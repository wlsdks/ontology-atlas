import { screenSearch, type ScreenSearch } from '@/shared/lib/navigation/search-text';

/** What the new-project address may name: a project to copy, a starting category and status, and where to return. */
export const projectNewSearch = screenSearch(['from', 'category', 'status', 'returnTo'] as const);

export type ProjectNewSearch = ScreenSearch<readonly ['from', 'category', 'status', 'returnTo']>;
