/**
 * The query of every Atlas address, as the router reads and writes it.
 *
 * TanStack's default turns `"1"` into the number 1 and re-encodes what it reads, so `?p=a%20b` would
 * come back as `?p=a+b` and `?p=1` as a number. Here every value is a string, or a list of strings
 * for a repeated key, and a query nobody changed is written back as the bytes it arrived as.
 */
export type AtlasSearch = Record<string, string | string[]>;

/** Enough for the addresses open in one window; the oldest entry goes first. */
const REMEMBERED_QUERIES = 64;

const arrivedAs = new Map<string, string>();

function canonical(search: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === 'string') query.append(key, value);
    else if (Array.isArray(value)) for (const item of value) if (typeof item === 'string') query.append(key, item);
  }
  return query.toString();
}

export function parseSearch(searchString: string): AtlasSearch {
  const raw = searchString.startsWith('?') ? searchString.slice(1) : searchString;
  // No prototype: a key named `constructor` must not meet the frozen `Object.prototype` of the WebView.
  const search: AtlasSearch = Object.create(null);
  for (const [key, value] of new URLSearchParams(raw)) {
    const earlier = search[key];
    if (earlier === undefined) search[key] = value;
    else search[key] = Array.isArray(earlier) ? [...earlier, value] : [earlier, value];
  }
  const rebuilt = canonical(search);
  if (rebuilt !== raw && rebuilt !== '') {
    arrivedAs.delete(rebuilt);
    arrivedAs.set(rebuilt, raw);
    if (arrivedAs.size > REMEMBERED_QUERIES) arrivedAs.delete(arrivedAs.keys().next().value as string);
  }
  return search;
}

export function stringifySearch(search: Record<string, unknown>): string {
  const rebuilt = canonical(search);
  if (rebuilt === '') return '';
  return `?${arrivedAs.get(rebuilt) ?? rebuilt}`;
}
