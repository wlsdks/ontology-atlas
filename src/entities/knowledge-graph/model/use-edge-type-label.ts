'use client';

import { useRelationVocabulary } from './relation-vocabulary';

/** Formal-register edge labels for existing callers; new code uses `useRelationVocabulary`. Unknown types stay raw. */
export function useEdgeTypeLabel() {
  const vocabulary = useRelationVocabulary();
  return (type: string): string => vocabulary(type, 'formal');
}
