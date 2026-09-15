import { describe, expect, it } from 'vitest';
import type { SavedConstellation } from './use-saved-constellations';
import type { ConstellationCandidate } from './constellation-candidate';
import {
  constellationMemberDrafts,
  resolvedDraftCandidates,
  toggleConstellationCandidate,
  unresolvedDraftMembers,
} from './constellation-draft-members';

const current: ConstellationCandidate = {
  uid: '11111111-1111-4111-8111-111111111111',
  mergedUids: ['22222222-2222-4222-8222-222222222222'],
  mapId: 'capability:current',
  lastKnownPath: 'capabilities/current.md',
  label: 'Current',
  kind: 'capability',
  galaxyPoint: { x: 40, y: -20 },
};

const saved: SavedConstellation = {
  folder: {
    id: '33333333-3333-4333-8333-333333333333', name: 'Review', parentId: null, order: 0,
    presentation: 'constellation', createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-15T00:00:00.000Z',
  },
  items: [
    { id: '44444444-4444-4444-8444-444444444444', folderId: '33333333-3333-4333-8333-333333333333', order: 0, label: 'Merged', target: { kind: 'ontology', uid: '22222222-2222-4222-8222-222222222222', lastKnownPath: 'old.md' } },
    { id: '55555555-5555-4555-8555-555555555555', folderId: '33333333-3333-4333-8333-333333333333', order: 1, label: 'Deleted', target: { kind: 'ontology', uid: '66666666-6666-4666-8666-666666666666', lastKnownPath: 'deleted.md' } },
  ],
};

describe('constellation edit member drafts', () => {
  it('preserves unresolved UIDs while resolving a merged UID to the current star', () => {
    const drafts = constellationMemberDrafts(saved);
    expect([...drafts.keys()]).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '66666666-6666-4666-8666-666666666666',
    ]);
    expect(resolvedDraftCandidates(drafts, [current])).toEqual([current]);
    expect(unresolvedDraftMembers(drafts, [current]).map((member) => member.uid)).toEqual([
      '66666666-6666-4666-8666-666666666666',
    ]);
  });

  it('removes only identities that resolve to the unchecked current candidate', () => {
    const next = toggleConstellationCandidate(constellationMemberDrafts(saved), current, [current], false);
    expect([...next.keys()]).toEqual(['66666666-6666-4666-8666-666666666666']);
  });
});
