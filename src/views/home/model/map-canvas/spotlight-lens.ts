import { RECENT_SPOTLIGHT_REVEAL_MAX } from '@/widgets/ontology-map';
import { deriveDeeplinkAncestorExpansion } from '../route-state/url-state';

export interface SpotlightLens {
  expandedParents: ReadonlySet<string> | null;
  litIds: ReadonlySet<string>;
}

/**
 * A few changes unfold their ancestors so each one is on the map. Many changes stay folded and
 * light the containers that hold them instead. O(changed · depth).
 */
export function deriveSpotlightLens(
  changedIds: ReadonlySet<string>,
  parentOf: ReadonlyMap<string, string>,
  expandedParents: ReadonlySet<string>,
): SpotlightLens {
  const ancestors = new Set<string>();
  for (const id of changedIds) {
    for (const ancestor of deriveDeeplinkAncestorExpansion(id, parentOf, [])) ancestors.add(ancestor);
  }
  if (changedIds.size <= RECENT_SPOTLIGHT_REVEAL_MAX) {
    return { expandedParents: new Set([...expandedParents, ...ancestors]), litIds: changedIds };
  }
  return { expandedParents: null, litIds: new Set([...changedIds, ...ancestors]) };
}
