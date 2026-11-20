import { describe, expect, it, vi } from 'vitest';
import type { StaticVaultSource } from '@/entities/docs-vault';

const chunk = vi.hoisted(() => ({ failures: 1 }));
vi.mock('@/entities/docs-vault', async (original) => ({
  ...(await original<typeof import('@/entities/docs-vault')>()),
  loadStaticVaultHeadings: async () => {
    if (chunk.failures > 0) {
      chunk.failures -= 1;
      throw new Error('chunk load failed');
    }
    return { guide: [{ depth: 2, text: 'Part', slug: 'part' }] };
  },
}));

import { createBundledDetailReader } from './bundled-detail-reader';

const sample = {
  source: 'dogfood',
  manifest: { docs: [{ slug: 'guide', path: 'guide.md', excerpt: 'Held excerpt.', wordCount: 3 }] },
  content: {},
} as unknown as StaticVaultSource;

describe('createBundledDetailReader', () => {
  it('answers nothing while the headings chunk fails, then the outline once it loads', async () => {
    const read = createBundledDetailReader(sample, { headings: true });
    const doc = { slug: 'guide', path: 'guide.md' };
    expect(await read([doc])).toEqual([null]);
    expect(await read([doc])).toEqual([
      { headings: [{ depth: 2, text: 'Part', slug: 'part' }], excerpt: 'Held excerpt.', wordCount: 3 },
    ]);
  });
});
