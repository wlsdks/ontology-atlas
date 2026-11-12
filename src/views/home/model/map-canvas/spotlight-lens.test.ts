import { describe, expect, it } from 'vitest';
import { RECENT_SPOTLIGHT_REVEAL_MAX } from '@/widgets/ontology-map';
import { deriveSpotlightLens } from './spotlight-lens';

const parentOf = new Map<string, string>();
for (let i = 0; i < 60; i += 1) {
  parentOf.set(`element-${i}`, `capability-${i % 6}`);
  parentOf.set(`capability-${i % 6}`, 'domain');
}
const changed = (count: number) => new Set(Array.from({ length: count }, (_, i) => `element-${i}`));

describe('deriveSpotlightLens', () => {
  it('unfolds the ancestors of a few changes and keeps the person\'s own expansion', () => {
    const lens = deriveSpotlightLens(changed(2), parentOf, new Set(['mine']));
    expect([...(lens.expandedParents ?? [])].sort()).toEqual(['capability-0', 'capability-1', 'domain', 'mine']);
    expect(lens.litIds).toEqual(changed(2));
  });

  it('leaves the map folded when the changes would cover it, and lights their containers', () => {
    const lens = deriveSpotlightLens(changed(RECENT_SPOTLIGHT_REVEAL_MAX + 1), parentOf, new Set(['mine']));
    expect(lens.expandedParents).toBeNull();
    expect(lens.litIds.has('domain')).toBe(true);
    expect(lens.litIds.has('capability-3')).toBe(true);
    expect(lens.litIds.has('element-0')).toBe(true);
  });
});
