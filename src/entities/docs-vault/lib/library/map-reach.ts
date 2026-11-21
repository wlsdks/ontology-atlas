import type { WikiNodeIndex } from '@/shared/lib/library/wiki-page-schema';

import type { LibraryModel } from './vault-library';

/**
 * A `compiled` source reaches a concept when a page that makes it compiled has a `describes:` entry naming a `kind:` node in the
 * folder, resolved as `describes-target-missing` judges them so the count and the page problem never disagree. The total is every
 * source, as in source progress. O(S + P + E + C) for S sources, P pages, E entries, C covering citations; two byte arrays, no object per row.
 */

/** In precedence order: a source takes the first state any of its covering pages gives it. */
export const MAP_REACH_STATES = ['onMap', 'linkBroken', 'notLinked', 'noConcept'] as const;

/**
 * `onMap`: a covering page has an entry that resolves. `linkBroken`: a page has entries and none
 * resolves. `notLinked`: a page has no `describes:`. `noConcept`: every page has `describes: []`.
 */
export type MapReachState = (typeof MAP_REACH_STATES)[number];

const ON_MAP = 1;
const LINK_BROKEN = 2;
const NOT_LINKED = 3;
const NO_CONCEPT = 4;
/** Set on a page code beside its state when at least one entry names no concept. */
const MISSING_ENTRY = 8;
const STATE_BITS = 7;

export interface MapReach {
  total: number;
  /** Sources in `compiled`, the only ones judged; their states sum to it. */
  judged: number;
  onMap: number;
  byState: Readonly<Record<MapReachState, number>>;
  sourceCodes: Uint8Array;
  pageCodes: Uint8Array;
}

function pageCode(describes: readonly string[] | null | undefined, nodes: WikiNodeIndex): number {
  if (describes === null || describes === undefined) return NOT_LINKED;
  if (describes.length === 0) return NO_CONCEPT;
  let resolves = false;
  let missing = false;
  for (const entry of describes) {
    const target = nodes.resolve(entry);
    if (typeof target === 'object' && target.node) resolves = true;
    else missing = true;
  }
  return (resolves ? ON_MAP : LINK_BROKEN) | (missing ? MISSING_ENTRY : 0);
}

/**
 * `nodes` is the folder's node index (`buildWikiNodeIndex` over every document, as the page-write
 * judge builds it); build it once per folder and pass it here.
 */
export function deriveMapReach(
  model: Pick<LibraryModel, 'sources' | 'wikiPages' | 'compiledBy'>,
  nodes: WikiNodeIndex,
): MapReach {
  const pageCodes = new Uint8Array(model.wikiPages.length);
  for (let page = 0; page < pageCodes.length; page += 1) {
    pageCodes[page] = pageCode(model.wikiPages[page]!.describes, nodes);
  }

  const { offsets, pages } = model.compiledBy;
  const sourceCodes = new Uint8Array(model.sources.length);
  const counts = [0, 0, 0, 0, 0];
  for (let row = 0; row < sourceCodes.length; row += 1) {
    if (model.sources[row]!.state !== 'compiled') continue;
    // Codes are numbered in precedence order, so the best page is the smallest code. A compiled
    // source whose covering pages are all unlisted (the shipped template) has no link to read.
    let best = 0;
    const end = offsets[row + 1]!;
    for (let at = offsets[row]!; at < end && best !== ON_MAP; at += 1) {
      const code = pageCodes[pages[at]!]! & STATE_BITS;
      if (best === 0 || code < best) best = code;
    }
    if (best === 0) best = NOT_LINKED;
    sourceCodes[row] = best;
    counts[best]! += 1;
  }

  return {
    total: model.sources.length,
    judged: counts[ON_MAP]! + counts[LINK_BROKEN]! + counts[NOT_LINKED]! + counts[NO_CONCEPT]!,
    onMap: counts[ON_MAP]!,
    byState: {
      onMap: counts[ON_MAP]!,
      linkBroken: counts[LINK_BROKEN]!,
      notLinked: counts[NOT_LINKED]!,
      noConcept: counts[NO_CONCEPT]!,
    },
    sourceCodes,
    pageCodes,
  };
}

export function mapReachOfSource(reach: MapReach, row: number): MapReachState | null {
  const code = reach.sourceCodes[row] ?? 0;
  return code === 0 ? null : MAP_REACH_STATES[code - 1]!;
}

export function mapReachOfPage(reach: MapReach, page: number): MapReachState {
  return MAP_REACH_STATES[((reach.pageCodes[page] ?? NOT_LINKED) & STATE_BITS) - 1]!;
}

/** True when an entry of page `page` names no concept, even if another entry does. */
export function pageHasMissingConcept(reach: MapReach, page: number): boolean {
  return ((reach.pageCodes[page] ?? 0) & MISSING_ENTRY) !== 0;
}
