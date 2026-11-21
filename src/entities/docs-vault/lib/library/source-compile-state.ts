import type { WikiCitation } from './wiki-page-facts';

/** `stale`: hash mismatch or missing hash; `partial`: the matching page read only part of the file; `checking`: until hashed; `unreadable`: could not be opened to hash, so never provably compiled. */
export type SourceCompileState =
  | 'not-compiled'
  | 'compiled'
  | 'partial'
  | 'stale'
  | 'checking'
  | 'unreadable';

/**
 * `actualHash` is undefined until hashed; only cited files are hashed. Any matching page makes it
 * `compiled`; `partial` needs every matching page truncated; `stale` outranks `partial`. A file
 * that could not be hashed is `unreadable` where it would otherwise wait in `checking`.
 */
export function judgeSource(
  citations: readonly WikiCitation[] | undefined,
  actualHash: string | undefined,
  unreadable: boolean,
): SourceCompileState {
  if (!citations || citations.length === 0) return 'not-compiled';
  const hashed = citations.filter((citation) => citation.sourceHash !== null);
  // A citation without a hash cannot prove coverage, so it is stale.
  if (hashed.length === 0) return 'stale';
  if (actualHash === undefined) return unreadable ? 'unreadable' : 'checking';
  const matching = hashed.filter((citation) => citation.sourceHash === actualHash);
  if (matching.length === 0) return 'stale';
  return matching.some((citation) => !citation.truncated) ? 'compiled' : 'partial';
}

export function earliestCoveredDay(citations: readonly WikiCitation[], actualHash: string): number {
  let earliest = -1;
  for (const citation of citations) {
    if (citation.sourceHash !== actualHash || citation.truncated || citation.compiledDay < 0) continue;
    if (earliest < 0 || citation.compiledDay < earliest) earliest = citation.compiledDay;
  }
  return earliest;
}

export function pushCoveringPages(out: number[], citations: readonly WikiCitation[], actualHash: string): void {
  let last = -1;
  for (const citation of citations) {
    if (citation.sourceHash !== actualHash || citation.truncated || citation.page < 0 || citation.page === last) continue;
    out.push(citation.page);
    last = citation.page;
  }
}

/**
 * `unchecked`: a hash was recorded but the file is not measured; permanent when hashing is
 * impossible, so it must not collapse into `behind`.
 */
export type WriteUpFreshness = 'current' | 'partial' | 'behind' | 'unchecked';

export function writeUpFreshness(citation: WikiCitation, actualHash: string | undefined): WriteUpFreshness {
  if (citation.sourceHash === null) return 'behind';
  if (actualHash === undefined) return 'unchecked';
  if (citation.sourceHash !== actualHash) return 'behind';
  return citation.truncated ? 'partial' : 'current';
}
