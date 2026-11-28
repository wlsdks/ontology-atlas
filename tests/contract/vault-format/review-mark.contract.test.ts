import { describe, expect, it } from 'vitest';

import GOLDEN from '../../fixtures/review-digest-golden.json';
import {
  reviewCurrentness as appReviewCurrentness,
  reviewDigest as appReviewDigest,
} from '../../../src/entities/docs-vault/lib/review';
import { REVIEW_DIGEST_BASE, REVIEW_DIGEST_CASES } from '../../fixtures/review-mark-cases.mjs';

/**
 * **One meaning of "unchanged", two programs.**
 *
 * The MCP server checks an approval's binding; the app writes it. They share no
 * module by design (`AGENTS.md`), so the only thing stopping "changed since
 * review" from meaning two different things is this table and the digests in
 * `tests/fixtures/review-digest-golden.json`: for each case below, the value the
 * script server reported as current when they were recorded, 2026-11-28.
 *
 * The calling conventions differ on purpose: `node:crypto` is synchronous and
 * the browser's `crypto.subtle` is not. What must agree is the value.
 */

const base = REVIEW_DIGEST_BASE as {
  frontmatter: Record<string, unknown>;
  body: string;
};

type Case = {
  name: string;
  frontmatter: Record<string, unknown>;
  body?: string;
  sameAsBase: boolean;
  why: string;
};

const cases = REVIEW_DIGEST_CASES as readonly Case[];

function variant(testCase: Case) {
  return {
    frontmatter: { ...base.frontmatter, ...testCase.frontmatter },
    body: testCase.body ?? base.body,
  };
}

/**
 * The binding is always written by the app — that is the only side that writes
 * one — and then read back by both. Comparing verdicts rather than raw hashes is
 * what the product actually depends on, and it also removes the shape where the
 * two could agree on a hash while disagreeing about what the hash means.
 */
async function bind(frontmatter: Record<string, unknown>, body: string) {
  return { ...frontmatter, review_state: 'confirmed', reviewed_digest: await appReviewDigest(frontmatter, body) };
}

describe('review currentness — the app writes the digest the server checks', () => {
  it.each(cases.map((c) => [c.name, c] as const))(
    '%s — the digest is the recorded one and the verdict follows it',
    async (_name, testCase) => {
      const digestNow = await appReviewDigest(variant(testCase).frontmatter, variant(testCase).body);
      expect(digestNow, testCase.why).toBe((GOLDEN.cases as Record<string, string>)[testCase.name]);
      expect(digestNow === GOLDEN.baseDigest, testCase.why).toBe(testCase.sameAsBase);
      const confirmed = await bind(base.frontmatter, base.body);
      const { frontmatter, body } = variant(testCase);
      // The approval was recorded against the base; the variant is what the file
      // says now. `reviewed_digest` rides along untouched — it is outside the
      // digest by construction.
      const now = { ...frontmatter, ...confirmed, ...testCase.frontmatter };
      const expected = testCase.sameAsBase ? 'current' : 'changed-since-review';
      expect(await appReviewCurrentness(now, body), testCase.why).toBe(expected);
    },
  );
});

describe('review currentness — the verdicts the server gives', () => {
  const confirmedWithBinding = async () => ({
    ...base.frontmatter,
    review_state: 'confirmed',
    reviewed_by: 'jinan',
    reviewed_digest: await appReviewDigest(base.frontmatter, base.body),
  });

  it('current while nothing moved', async () => {
    const frontmatter = await confirmedWithBinding();
    expect(await appReviewCurrentness(frontmatter, base.body)).toBe('current');
  });

  it('changed-since-review after a later rewrite', async () => {
    const frontmatter = await confirmedWithBinding();
    const rewritten = 'Rewritten by something after the review.';
    expect(await appReviewCurrentness(frontmatter, rewritten)).toBe('changed-since-review');
  });

  it('unknown when a person wrote the approval by hand, with no binding', async () => {
    const frontmatter = { ...base.frontmatter, review_state: 'confirmed', reviewed_by: 'jinan' };
    expect(await appReviewCurrentness(frontmatter, base.body)).toBe('unknown');
  });

  it('a malformed binding is unknown, never an accusation', async () => {
    // A malformed binding is unknown: comparing any non-empty string made a hand-typed
    // placeholder report "changed since review" for an untouched node.
    for (const bogus of ['not-a-digest', '   ', 'ABCDEF0123456789ABCDEF0123456789', '70498bae']) {
      const frontmatter = { ...base.frontmatter, review_state: 'confirmed', reviewed_digest: bogus };
      expect(await appReviewCurrentness(frontmatter, base.body), bogus).toBe('unknown');
    }
  });

  it('not-confirmed for an unmarked node — absence is its own answer', async () => {
    expect(await appReviewCurrentness(base.frontmatter, base.body)).toBe('not-confirmed');
  });
});
