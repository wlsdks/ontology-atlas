export interface ConstellationCandidate {
  uid: string;
  mergedUids: readonly string[];
  mapId: string;
  lastKnownPath: string;
  label: string;
  kind: 'project' | 'domain' | 'capability' | 'element';
}

export type CandidateIdentityResolution =
  | { status: 'resolved'; candidate: ConstellationCandidate; identityResolution: 'current' | 'merged' }
  | { status: 'unresolved'; reason: 'missing' | 'ambiguous' };

export function resolveConstellationCandidate(
  uid: string,
  candidates: readonly ConstellationCandidate[],
): CandidateIdentityResolution {
  const claimants = candidates.filter((candidate) => candidate.uid === uid || candidate.mergedUids.includes(uid));
  if (claimants.length !== 1) return { status: 'unresolved', reason: claimants.length === 0 ? 'missing' : 'ambiguous' };
  return {
    status: 'resolved',
    candidate: claimants[0],
    identityResolution: claimants[0].uid === uid ? 'current' : 'merged',
  };
}
