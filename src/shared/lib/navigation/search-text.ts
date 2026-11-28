/** One query value as the router hands it over: text, or a list of text for a key written twice. */
export type SearchText = string | string[] | undefined;

/** The first value of a key: what a reader that takes one value used to get from `URLSearchParams.get`. */
export function firstSearchText(value: SearchText | readonly string[]): string | undefined {
  return typeof value === 'string' || value === undefined ? value : value[0];
}

export type ScreenSearch<Keys extends readonly string[]> = Partial<Record<Keys[number], SearchText>>;

/**
 * A screen's query: every string and list of strings the address carries, copied onto an object with no
 * prototype, typed by the keys the screen reads. Another screen or script owns the other keys, so they
 * survive untouched, and nothing is defaulted, or arriving on an address would rewrite it. The copy has no
 * prototype so that a key named `constructor` or `toString` is only a key: the installed app freezes
 * `Object.prototype`, and a write through an inherited name would throw there.
 */
export function screenSearch<Keys extends readonly string[]>() {
  return (search: Record<string, unknown>): ScreenSearch<Keys> => {
    const copy: Record<string, SearchText> = Object.create(null);
    for (const [key, value] of Object.entries(search)) {
      if (typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'))) copy[key] = value;
    }
    return copy as ScreenSearch<Keys>;
  };
}
