import { z } from 'zod';

/** One query value as the router hands it over: text, or a list of text for a key written twice. */
export const searchText = z.union([z.string(), z.array(z.string())]).optional();

export type SearchText = z.infer<typeof searchText>;

/** The first value of a key: what a reader that takes one value used to get from `URLSearchParams.get`. */
export function firstSearchText(value: SearchText | readonly string[]): string | undefined {
  return typeof value === 'string' || value === undefined ? value : value[0];
}

/**
 * A screen's query: the keys it reads are typed text; every other key survives untouched, because
 * another screen or script owns it. Nothing is defaulted, or arriving on an address would rewrite it.
 */
export function screenSearch<const Keys extends readonly string[]>(keys: Keys) {
  const shape = Object.fromEntries(keys.map((key) => [key, searchText])) as Record<Keys[number], typeof searchText>;
  return z.looseObject(shape);
}

export type ScreenSearch<Keys extends readonly string[]> = Partial<Record<Keys[number], SearchText>>;
