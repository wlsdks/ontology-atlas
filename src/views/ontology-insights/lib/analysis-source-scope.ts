import type { EvidenceStates } from '@/shared/lib/git/evidence-states';

export type AnalysisSourceScope = 'all' | 'moved' | 'missing' | 'unknown';

export function linearAnalysisSourceScopes(ids: readonly string[], evidence: EvidenceStates | null) {
  const scopes: Record<AnalysisSourceScope, Set<string>> = { all: new Set(ids), moved: new Set(), missing: new Set(), unknown: new Set() };
  for (const id of scopes.all) {
    if (evidence?.missing.has(id)) scopes.missing.add(id);
    else if (evidence?.stale.has(id)) scopes.moved.add(id);
    else if (!evidence?.current.has(id)) scopes.unknown.add(id);
  }
  return scopes;
}
