'use client';

import { useTranslations } from 'next-intl';
import { KNOWLEDGE_EDGE_TYPES, type KnowledgeEdgeType } from './types';

/**
 * Two-register relation-type dictionary — the ONE place every surface that names a
 * `KnowledgeEdgeType` to a human reads its wording from.
 *
 * Before this module four surfaces each picked their own wording: the topology map
 * legend and `/ontology/insights` used formal Korean nouns ("포함"/"의존"), the node
 * datasheet used its own plain phrases ("쓰는 곳"/"기대는 곳"), and the compass
 * relation labels rendered raw untranslated English ("contains ─ · depends ╌ ·
 * evidence ┄"). A first-time reader moving between them saw up to four different word
 * families for the SAME edge type (measured: four per surface).
 *
 * Two registers, both locale-aware via next-intl:
 *   - `formal` — short noun form, for legends and breakdowns where several types are
 *     compared side by side. Backed by the pre-existing `edgeTypes.*` namespace.
 *   - `plain` — sentence or phrase form, for a first-time reader parsing one fact
 *     without prior ontology vocabulary (the datasheet). Backed by the
 *     `edgeTypesPlain.*` namespace.
 *
 * Surfaces still choose whichever register fits their density — they now choose from
 * the same dictionary instead of inventing a third wording. `useEdgeTypeLabel` (this
 * folder) is a thin formal-only wrapper kept for existing call sites.
 */
export type RelationRegister = 'formal' | 'plain';

function isKnownEdgeType(type: string): type is KnowledgeEdgeType {
  return (KNOWLEDGE_EDGE_TYPES as ReadonlyArray<string>).includes(type);
}

/**
 * Returns a `(type, register?) => label` resolver. Unknown types fall
 * through to the raw string so callers never render an empty label —
 * same fallback contract `useEdgeTypeLabel` already had.
 */
export function useRelationVocabulary() {
  const tFormal = useTranslations('edgeTypes');
  const tPlain = useTranslations('edgeTypesPlain');
  return (type: string, register: RelationRegister = 'formal'): string => {
    if (!isKnownEdgeType(type)) return type;
    return register === 'plain' ? tPlain(type) : tFormal(type);
  };
}
