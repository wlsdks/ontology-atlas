import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import { cycleIndex, matchMentionCandidates } from './mention-candidates';

function doc(slug: string, title = slug): VaultDoc {
  return { slug, path: `${slug}.md`, title, tags: [], frontmatter: {}, updatedAt: '', linksOut: [] };
}

describe('matchMentionCandidates', () => {
  const docs = [doc('self'), doc('capabilities/checkout', 'Checkout'), doc('elements/cart', 'Shopping Cart')];

  it('offers everything but the edited document for a bare `@`', () => {
    expect(matchMentionCandidates(docs, '', 'self').map((d) => d.slug)).toEqual([
      'capabilities/checkout',
      'elements/cart',
    ]);
  });

  it('matches a title or a slug, ignoring case, and never offers the edited document', () => {
    expect(matchMentionCandidates(docs, 'CART', 'self').map((d) => d.slug)).toEqual(['elements/cart']);
    expect(matchMentionCandidates(docs, 'capab', 'self').map((d) => d.slug)).toEqual(['capabilities/checkout']);
    expect(matchMentionCandidates(docs, 'self', 'self')).toEqual([]);
  });

  it('offers at most eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => doc(`d${i}`));
    expect(matchMentionCandidates(many, '', 'none')).toHaveLength(8);
    expect(matchMentionCandidates(many, 'd', 'none')).toHaveLength(8);
  });
});

describe('cycleIndex', () => {
  it('wraps past either end', () => {
    expect(cycleIndex(2, 1, 3)).toBe(0);
    expect(cycleIndex(0, -1, 3)).toBe(2);
    expect(cycleIndex(1, 1, 3)).toBe(2);
  });
});
