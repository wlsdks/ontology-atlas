import { describe, expect, it, vi } from 'vitest';

import {
  buildReviewQueue,
  reviewDigest,
} from './review';

const FRONTMATTER = {
  uid: '44444444-4444-4444-8444-444444444444',
  slug: 'capabilities/bound',
  kind: 'capability',
  title: 'Bound',
  domain: 'domains/example',
};

const BODY = 'The meaning a person read and accepted.';

function doc(slug: string, frontmatter: Record<string, unknown>) {
  return { slug, title: slug.split('/').pop() ?? slug, frontmatter };
}

describe('review queue — the two lists Docs shows, and the third it refuses to', () => {
  it('reads no bodies at all when nothing was ever approved', async () => {
    const readBody = vi.fn(async () => BODY);
    const rows = await buildReviewQueue(
      [
        doc('capabilities/a', { ...FRONTMATTER }),
        doc('capabilities/b', { ...FRONTMATTER, review_state: 'human_decides', review_note: 'Two readings.' }),
      ],
      readBody,
    );
    // The manifest keeps no bodies, so reading one per node would cost a second full pass.
    expect(readBody).not.toHaveBeenCalled();
    expect(rows).toEqual([
      { slug: 'capabilities/b', title: 'b', reason: 'raised', note: 'Two readings.' },
    ]);
  });

  it('lists an approval whose node changed underneath it', async () => {
    const digest = await reviewDigest(FRONTMATTER, BODY);
    const rows = await buildReviewQueue(
      [doc('capabilities/bound', { ...FRONTMATTER, review_state: 'confirmed', reviewed_by: 'jinan', reviewed_digest: digest })],
      async () => 'Something later rewrote this.',
    );
    expect(rows).toEqual([
      { slug: 'capabilities/bound', title: 'bound', reason: 'changed-since-review', reviewedBy: 'jinan' },
    ]);
  });

  it('leaves an approval alone while it still describes its node', async () => {
    const digest = await reviewDigest(FRONTMATTER, BODY);
    const rows = await buildReviewQueue(
      [doc('capabilities/bound', { ...FRONTMATTER, review_state: 'confirmed', reviewed_digest: digest })],
      async () => BODY,
    );
    expect(rows).toEqual([]);
  });

  it('never reports an unbound hand-written approval as drift', async () => {
    const readBody = vi.fn(async () => 'anything at all');
    const rows = await buildReviewQueue(
      [doc('capabilities/bound', { ...FRONTMATTER, review_state: 'confirmed', reviewed_by: 'jinan' })],
      readBody,
    );
    // Unknown currentness cannot change by reading the body.
    expect(readBody).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });

  it('says an approval could not be checked rather than calling it changed or fine', async () => {
    const digest = await reviewDigest(FRONTMATTER, BODY);
    const rows = await buildReviewQueue(
      [doc('capabilities/bound', { ...FRONTMATTER, review_state: 'confirmed', reviewed_digest: digest })],
      async () => null,
    );
    // Listed as unverifiable: hiding it conceals possible drift, calling it drift accuses.
    expect(rows).toEqual([
      { slug: 'capabilities/bound', title: 'bound', reason: 'unverifiable' },
    ]);
  });

  it('leaves a malformed binding out entirely — it never established a baseline', async () => {
    const readBody = vi.fn(async () => BODY);
    const rows = await buildReviewQueue(
      [doc('capabilities/bound', { ...FRONTMATTER, review_state: 'confirmed', reviewed_digest: 'not-a-digest' })],
      readBody,
    );
    expect(readBody).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });

  it('has no row for an unmarked node — absence stays unknown', async () => {
    const rows = await buildReviewQueue(
      Array.from({ length: 80 }, (_, index) => doc(`capabilities/n${index}`, { ...FRONTMATTER })),
      async () => BODY,
    );
    // Unmarked nodes are unknown, not queued, or the queue opens on a wall.
    expect(rows).toEqual([]);
  });
});
