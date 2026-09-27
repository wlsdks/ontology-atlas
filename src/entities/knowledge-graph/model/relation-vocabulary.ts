'use client';

import { useTranslations } from 'next-intl';
import { KNOWLEDGE_EDGE_TYPES, type KnowledgeEdgeType } from './types';

/**
 * The one dictionary every surface reads relation wording from, in two registers: `formal` nouns
 * (`edgeTypes.*`) for side-by-side legends and `plain` phrases (`edgeTypesPlain.*`) for one fact.
 */
export type RelationRegister = 'formal' | 'plain';

function isKnownEdgeType(type: string): type is KnowledgeEdgeType {
  return (KNOWLEDGE_EDGE_TYPES as ReadonlyArray<string>).includes(type);
}

/** `(type, register?) => label`; unknown types fall through to the raw string, never empty. */
export function useRelationVocabulary() {
  const tFormal = useTranslations('edgeTypes');
  const tPlain = useTranslations('edgeTypesPlain');
  return (type: string, register: RelationRegister = 'formal'): string => {
    if (!isKnownEdgeType(type)) return type;
    return register === 'plain' ? tPlain(type) : tFormal(type);
  };
}
