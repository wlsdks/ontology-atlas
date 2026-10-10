import type { KnownRelations } from '@/features/acp-session';

export const EMPTY_KNOWN_SLUGS: ReadonlySet<string> = new Set();
export const EMPTY_KNOWN_RELATIONS: KnownRelations = new Set<string>();

/** Keeps a picker's chevron from standing without its word. */
export const PICKER_MIN_WIDTH_CLASS = 'min-w-[3rem]';
/** A picker alone on a row must not take the whole composer width. */
export const PICKER_MAX_WIDTH_CLASS = 'max-w-[16rem]';
/** Retry on the error card and Connect again are the same act, so the same chip. */
export const RETRY_CHIP_CLASS =
  'shrink-0 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]';
