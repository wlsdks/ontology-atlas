import { screenSearch, type ScreenSearch } from '@/shared/lib/navigation/search-text';

/** The Library's tab and ontology view, the round a retired link named, and the document open in it. */
export const librarySearch = screenSearch<readonly ['tab', 'ontologyView', 'round', 'slug']>();

export type LibrarySearch = ScreenSearch<readonly ['tab', 'ontologyView', 'round', 'slug']>;
