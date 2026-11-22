/** The one order every vault list uses: Korean collation, then code units, so it is total. */

/** One collator for every sort: `localeCompare(x, 'ko')` resolves the locale per comparison. */
const KO_COLLATOR = new Intl.Collator('ko');

/**
 * Korean collation, then code units where the collator calls two names equal, so the order is
 * total and does not depend on the order a walk happened to list files in.
 */
export function compareCollated(a: string, b: string): number {
  return KO_COLLATOR.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}
