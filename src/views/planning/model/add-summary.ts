import type { PlanningAddOutcome } from '@/shared/lib/planning/add-files';

type SentenceKey = 'addFilesAdded' | 'addFilesLeftBoth' | 'addFilesLeftDuplicates' | 'addFilesLeftUnsupported' | 'addFilesPartFailed' | 'addFilesNothing' | 'addFilesFailed';
export type PlanningAddSentence = { key: SentenceKey; values: Record<string, number> };
export type PlanningAddSummary = { sentences: PlanningAddSentence[]; tone: 'success' | 'info' | 'warning' | 'error' };

function leftovers({ duplicates, unsupported }: PlanningAddOutcome): PlanningAddSentence[] {
  if (duplicates > 0 && unsupported > 0) return [{ key: 'addFilesLeftBoth', values: { duplicates, unsupported } }];
  if (duplicates > 0) return [{ key: 'addFilesLeftDuplicates', values: { duplicates } }];
  if (unsupported > 0) return [{ key: 'addFilesLeftUnsupported', values: { unsupported } }];
  return [];
}

/** The one toast an "Add files" shows, sentence by sentence; null when nothing was chosen. */
export function planningAddSummary(outcome: PlanningAddOutcome): PlanningAddSummary | null {
  const { added, duplicates, unsupported, failed } = outcome;
  if (added.length > 0) {
    const sentences: PlanningAddSentence[] = [{ key: 'addFilesAdded', values: { count: added.length } }, ...leftovers(outcome)];
    if (failed > 0) sentences.push({ key: 'addFilesPartFailed', values: { failed } });
    return { sentences, tone: failed > 0 ? 'warning' : 'success' };
  }
  if (failed > 0) return { sentences: [{ key: 'addFilesFailed', values: {} }], tone: 'error' };
  if (duplicates > 0) return { sentences: leftovers(outcome), tone: 'info' };
  if (unsupported > 0) return { sentences: [{ key: 'addFilesNothing', values: {} }], tone: 'info' };
  return null;
}
