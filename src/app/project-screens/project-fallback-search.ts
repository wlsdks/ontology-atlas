import { screenSearch } from '@/shared/lib/navigation/search-text';

/** The project, the mode, the return address and the saved notice a fallback address carries. */
export const projectFallbackSearch = screenSearch(['slug', 'mode', 'returnTo', 'saved'] as const);
