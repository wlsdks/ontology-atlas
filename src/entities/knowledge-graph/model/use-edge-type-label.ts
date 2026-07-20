'use client';

import { useRelationVocabulary } from './relation-vocabulary';

/**
 * Locale-aware FORMAL-register edge type label resolver — thin wrapper over
 * `useRelationVocabulary` (this folder) kept for existing call sites (e.g.
 * `/ontology/insights`'s relation breakdown) that only ever need the formal
 * register. New call sites that also need the plain register (or want to be
 * explicit about which register they're choosing) should call
 * `useRelationVocabulary` directly instead.
 *
 * Maps a canonical KnowledgeEdgeType (`contains` / `belongs_to` /
 * `depends_on` / `implements` / `uses` / `describes` / `related_to`) to its
 * localized display label. Unknown types fall through to the raw string so
 * we never render an empty chip.
 */
export function useEdgeTypeLabel() {
  const vocabulary = useRelationVocabulary();
  return (type: string): string => vocabulary(type, 'formal');
}
