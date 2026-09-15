import { describe, expect, it } from 'vitest';
import type { SavedConstellation } from './use-saved-constellations';
import { buildConstellationAgentPrompt } from './constellation-agent-prompt';

const saved = (purpose?: string): SavedConstellation => ({
  folder: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Ontology write review',
    parentId: null,
    order: 0,
    presentation: 'constellation',
    purpose,
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
  },
  items: [{
    id: '22222222-2222-4222-8222-222222222222',
    folderId: '11111111-1111-4111-8111-111111111111',
    order: 0,
    label: 'Review writes',
    target: { kind: 'ontology', uid: '33333333-3333-4333-8333-333333333333', lastKnownPath: 'capabilities/review.md' },
  }],
});

describe('buildConstellationAgentPrompt', () => {
  it('hands off the set id while preserving collection, identity, evidence, and write boundaries', () => {
    const prompt = buildConstellationAgentPrompt(saved('Check approval boundaries'), { vaultPath: '/vault' });
    expect(prompt).toContain('11111111-1111-4111-8111-111111111111');
    expect(prompt).toContain('User-stated purpose: Check approval boundaries');
    expect(prompt).toContain('Vault path: /vault');
    expect(prompt).toContain('Prepared snapshot updatedAt: 2026-09-15T00:00:00.000Z');
    expect(prompt).toContain('33333333-3333-4333-8333-333333333333');
    expect(prompt).toContain('If they differ, stop');
    expect(prompt).toContain('not as an ontology relation');
    expect(prompt).toContain('outside the saved set');
    expect(prompt).toContain('Do not write without explicit approval');
  });

  it('keeps an absent purpose explicitly unknown', () => {
    expect(buildConstellationAgentPrompt(saved())).toContain('User-stated purpose: unknown');
  });
});
