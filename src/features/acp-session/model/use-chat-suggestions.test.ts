import { describe, expect, it } from 'vitest';

import type { VaultDoc } from '@/entities/docs-vault/model/types';

import { suggestionDisplayNames } from './use-chat-suggestions';

function doc(
  slug: string,
  title: string,
  frontmatter: Record<string, unknown>,
): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title,
    tags: [],
    frontmatter,
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: '',
    linksOut: [],
  };
}

describe('suggestionDisplayNames', () => {
  it('indexes both the document address and canonical frontmatter slug', () => {
    const names = suggestionDisplayNames([
      doc('ontology/elements/checkout-form', 'Checkout Form', {
        slug: 'elements/checkout-form',
        display_ko: '결제 입력 화면',
      }),
    ], 'ko');

    expect(names['elements/checkout-form']).toBe('결제 입력 화면');
    expect(names['ontology/elements/checkout-form']).toBe('결제 입력 화면');
  });

  it('falls back to the canonical title when a localized value has broken encoding', () => {
    const names = suggestionDisplayNames([
      doc('ontology/elements/workbench', 'Architecture Workbench', {
        slug: 'elements/workbench',
        display_ko: 'ì\u0095\u0084í\u0082¤',
      }),
    ], 'ko');

    expect(names['elements/workbench']).toBe('Architecture Workbench');
  });
});
