import type { VaultDoc } from '@/entities/docs-vault';
import { isRetainedAnswerPath, type LibraryPageFacts } from '@/features/library';

/** Whether a saved answer's previous version still has the text its `answer_previous_hash` records. */
export function useAnswerHistory(doc: VaultDoc | null, docs: readonly VaultDoc[], pageFacts: ReadonlyMap<string, LibraryPageFacts>) {
  const value = doc?.frontmatter.answer_previous;
  const previous = typeof value === 'string' && isRetainedAnswerPath(value) ? value : null;
  const exists = previous !== null && docs.some((page) => page.slug === previous);
  const hash = previous ? pageFacts.get(previous)?.answerHash : undefined;
  const expected = doc?.frontmatter.answer_previous_hash;
  const state = value === undefined ? 'none' : !previous ? 'invalid' : !exists ? 'missing'
    : typeof expected !== 'string' || !/^[a-f0-9]{64}$/i.test(expected) ? 'unmeasured'
    : hash === undefined ? 'checking'
    : hash === expected.toLowerCase() ? 'matches' : 'changed';
  return { previous, exists, state };
}
