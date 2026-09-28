import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { VaultDoc } from '@/entities/docs-vault';

import { reviewQueueKey, useReviewQueue } from './use-review-queue';

vi.mock('next-intl', () => ({ useLocale: () => 'en' }));

function raisedDoc(slug: string, note: string): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title: slug,
    tags: [],
    frontmatter: { kind: 'capability', title: slug, review_state: 'human_decides', review_note: note },
    headings: [],
    excerpt: '',
    wordCount: 1,
    updatedAt: '2026-09-29T00:00:00.000Z',
    linksOut: [],
  };
}

describe('useReviewQueue', () => {
  it('draws the rows it already computed on the first frame of a remount, so the tree below does not drop', async () => {
    const docs = [raisedDoc('capabilities/checkout', 'One capability or two?')];
    const first = renderHook(() => useReviewQueue({ docs, getDocContent: undefined, bundledContent: {} }));
    await waitFor(() => expect(first.result.current).toHaveLength(1));
    first.unmount();

    const again = renderHook(() =>
      useReviewQueue({ docs: [raisedDoc('capabilities/checkout', 'One capability or two?')], getDocContent: undefined, bundledContent: {} }),
    );
    expect(again.result.current.map((row) => row.slug)).toEqual(['capabilities/checkout']);
  });

  it('starts empty when the review marks changed since the last pass', () => {
    const before = reviewQueueKey([raisedDoc('capabilities/checkout', 'One capability or two?')], 'en');
    const after = reviewQueueKey([raisedDoc('capabilities/checkout', 'Split it.')], 'en');
    expect(after).not.toBe(before);
    const fresh = renderHook(() =>
      useReviewQueue({ docs: [raisedDoc('capabilities/checkout', 'Split it.')], getDocContent: undefined, bundledContent: {} }),
    );
    expect(fresh.result.current).toEqual([]);
  });
});
