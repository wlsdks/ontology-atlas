import type { SavedConstellation, ConstellationMemberDraft } from './use-saved-constellations';
import {
  resolveConstellationCandidate,
  type ConstellationCandidate,
} from './constellation-candidate';

export function constellationMemberDrafts(saved: SavedConstellation): Map<string, ConstellationMemberDraft> {
  return new Map(saved.items.flatMap((item) => item.target.kind === 'ontology'
    ? [[item.target.uid, {
        uid: item.target.uid,
        lastKnownPath: item.target.lastKnownPath,
        label: item.label,
      }] as const]
    : []));
}

export function resolvedDraftCandidates(
  drafts: ReadonlyMap<string, ConstellationMemberDraft>,
  candidates: readonly ConstellationCandidate[],
): ConstellationCandidate[] {
  const selected = new Map<string, ConstellationCandidate>();
  for (const uid of drafts.keys()) {
    const resolution = resolveConstellationCandidate(uid, candidates);
    if (resolution.status === 'resolved') selected.set(resolution.candidate.uid, resolution.candidate);
  }
  return [...selected.values()];
}

export function unresolvedDraftMembers(
  drafts: ReadonlyMap<string, ConstellationMemberDraft>,
  candidates: readonly ConstellationCandidate[],
): ConstellationMemberDraft[] {
  return [...drafts.values()].filter(
    (member) => resolveConstellationCandidate(member.uid, candidates).status === 'unresolved',
  );
}

export function toggleConstellationCandidate(
  drafts: ReadonlyMap<string, ConstellationMemberDraft>,
  candidate: ConstellationCandidate,
  candidates: readonly ConstellationCandidate[],
  checked: boolean,
): Map<string, ConstellationMemberDraft> {
  const next = new Map(drafts);
  if (checked) {
    next.set(candidate.uid, {
      uid: candidate.uid,
      lastKnownPath: candidate.lastKnownPath,
      label: candidate.label,
    });
    return next;
  }
  for (const savedUid of next.keys()) {
    const resolution = resolveConstellationCandidate(savedUid, candidates);
    if (resolution.status === 'resolved' && resolution.candidate.uid === candidate.uid) next.delete(savedUid);
  }
  return next;
}
