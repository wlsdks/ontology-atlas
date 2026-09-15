export interface ConstellationCandidate {
  uid: string;
  mergedUids: readonly string[];
  /** Current canvas node identity used only for map focus. */
  mapId: string;
  /** Current vault-relative document path, retained only as display context. */
  lastKnownPath: string;
  label: string;
  kind: 'project' | 'domain' | 'capability' | 'element';
  /** The same stable Galaxy world coordinate used by the canvas. */
  galaxyPoint: { x: number; y: number };
}

export type CandidateIdentityResolution =
  | { status: 'resolved'; candidate: ConstellationCandidate; identityResolution: 'current' | 'merged' }
  | { status: 'unresolved'; reason: 'missing' | 'ambiguous' };

/** Resolves a saved member against current map-supported concepts by UID claim only. */
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
