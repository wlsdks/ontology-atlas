import { analysisScopeKey, compareAnalysisBasis, type AnalysisCompatibility, type AnalysisRecord, type AnalysisRun } from '@/entities/analysis-record';

/** One saved explanation of the product, as the Flow tab reads it. */
export interface FlowVersion {
  id: string;
  createdAt: string;
  /** The agent runtime that wrote it, as the record names it. */
  writer: string;
  /** The Markdown the agent produced: the body a person reads. */
  answer: string;
  /** Whether the folder still matches what the explanation was written from. */
  standing: AnalysisCompatibility['status'];
  /** Why it is stale or unknown, in the record's words. */
  reasons: readonly string[];
  /** Whether Atlas could prove the answer rested on reads it made. */
  grounded: boolean;
}

/**
 * Saved analysis turns as versions of the product's explanation, with `compareAnalysisBasis` saying whether the
 * folder moved since. Only runs from this surface and project scope count; others answer a different question.
 */
export function selectFlowVersions(
  records: readonly AnalysisRecord[],
  context: { mode: AnalysisRun['mode']; scope: AnalysisRun['scope'] } | null,
  currentBasis: AnalysisRun['basis'] | null,
  limit = 5,
): FlowVersion[] {
  if (!context) return [];
  const wantedScope = analysisScopeKey(context.mode, context.scope);
  return records
    .filter((record): record is AnalysisRun => record.recordType === 'run')
    .filter((run) => run.origin.surface === 'analysis' && run.mode === context.mode)
    .filter((run) => analysisScopeKey(run.mode, run.scope) === wantedScope)
    .filter((run) => run.origin.outcome === 'completed' && run.answer.trim().length > 0)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit)
    .map((run) => {
      const compatibility = currentBasis ? compareAnalysisBasis(run.basis, currentBasis) : null;
      return {
        id: run.id,
        createdAt: run.createdAt,
        writer: run.origin.runtimeId,
        answer: run.answer,
        standing: compatibility?.status ?? 'unknown',
        reasons: compatibility?.reasons ?? ['basis_unavailable'],
        grounded: run.qualification.status === 'grounded',
      };
    });
}

/**
 * Changes between two saved explanations by heading, the request's six scenes. Prose inside a scene is compared
 * whole: a word diff of an agent's sentences invites reading a rewrite as a change of meaning.
 */
export function flowHeadingChanges(newer: string, older: string): { heading: string; change: 'added' | 'removed' | 'rewritten' }[] {
  const sections = (text: string) => {
    const map = new Map<string, string>();
    let heading = '';
    let body: string[] = [];
    for (const line of text.split('\n')) {
      const match = /^#{2,4}\s+(.*)$/.exec(line.trim());
      if (match) {
        if (heading) map.set(heading, body.join('\n').trim());
        heading = match[1]!.trim();
        body = [];
        continue;
      }
      body.push(line);
    }
    if (heading) map.set(heading, body.join('\n').trim());
    return map;
  };
  const left = sections(newer);
  const right = sections(older);
  const changes: { heading: string; change: 'added' | 'removed' | 'rewritten' }[] = [];
  for (const [heading, body] of left) {
    if (!right.has(heading)) changes.push({ heading, change: 'added' });
    else if (right.get(heading) !== body) changes.push({ heading, change: 'rewritten' });
  }
  for (const heading of right.keys()) {
    if (!left.has(heading)) changes.push({ heading, change: 'removed' });
  }
  return changes;
}
