import { screenSearch, type ScreenSearch } from '@/shared/lib/navigation/search-text';

/** The lane (`kind`), the round open in it and the run that just landed. */
export const automationsSearch = screenSearch(['kind', 'round', 'run'] as const);

export type AutomationsSearch = ScreenSearch<readonly ['kind', 'round', 'run']>;
