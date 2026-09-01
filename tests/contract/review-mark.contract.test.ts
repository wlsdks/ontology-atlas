import { describe, expect, it } from 'vitest';

import * as mcp from '../../mcp/src/schema.mjs';
import {
  reviewCurrentness as appReviewCurrentness,
  reviewDigest as appReviewDigest,
} from '../../src/entities/docs-vault/lib/review';
import { REVIEW_DIGEST_BASE, REVIEW_DIGEST_CASES } from '../fixtures/review-mark-cases.mjs';

/**
 * **One meaning of "unchanged", two packages.**
 *
 * The MCP server checks an approval's binding; the app writes it. They share no
 * module by design (`AGENTS.md`), so the only thing stopping "changed since
 * review" from meaning two different things is this table — the R11 contract
 * pattern already used for the frontmatter parser and the vault validator.
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

describe('review digest — the app and the MCP server agree on what was approved', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s (mcp)', async (_name, testCase) => {
    const { frontmatter, body } = variant(testCase);
    const baseDigest = mcp.reviewDigest(base.frontmatter, base.body);
    const digest = mcp.reviewDigest(frontmatter, body);
    expect(digest === baseDigest, testCase.why).toBe(testCase.sameAsBase);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s (app)', async (_name, testCase) => {
    const { frontmatter, body } = variant(testCase);
    const baseDigest = await appReviewDigest(base.frontmatter, base.body);
    const digest = await appReviewDigest(frontmatter, body);
    expect(digest === baseDigest, testCase.why).toBe(testCase.sameAsBase);
  });

  it.each(cases.map((c) => [c.name, c] as const))(
    '%s — both packages compute the identical value',
    async (_name, testCase) => {
      const { frontmatter, body } = variant(testCase);
      expect(await appReviewDigest(frontmatter, body)).toBe(mcp.reviewDigest(frontmatter, body));
    },
  );
});

describe('review currentness — the same verdict on both sides', () => {
  const confirmedWithBinding = () => {
    const digest = mcp.reviewDigest(base.frontmatter, base.body);
    return {
      ...base.frontmatter,
      review_state: 'confirmed',
      reviewed_by: 'jinan',
      reviewed_digest: digest,
    };
  };

  it('current on both sides while nothing moved', async () => {
    const frontmatter = confirmedWithBinding();
    expect(mcp.reviewCurrentness(frontmatter, base.body)).toBe('current');
    expect(await appReviewCurrentness(frontmatter, base.body)).toBe('current');
  });

  it('changed-since-review on both sides after a later rewrite', async () => {
    const frontmatter = confirmedWithBinding();
    const rewritten = 'Rewritten by something after the review.';
    expect(mcp.reviewCurrentness(frontmatter, rewritten)).toBe('changed-since-review');
    expect(await appReviewCurrentness(frontmatter, rewritten)).toBe('changed-since-review');
  });

  it('unknown on both sides when a person wrote the approval by hand, with no binding', async () => {
    const frontmatter = { ...base.frontmatter, review_state: 'confirmed', reviewed_by: 'jinan' };
    expect(mcp.reviewCurrentness(frontmatter, base.body)).toBe('unknown');
    expect(await appReviewCurrentness(frontmatter, base.body)).toBe('unknown');
  });

  it('not-confirmed on both sides for an unmarked node — absence is its own answer', async () => {
    expect(mcp.reviewCurrentness(base.frontmatter, base.body)).toBe('not-confirmed');
    expect(await appReviewCurrentness(base.frontmatter, base.body)).toBe('not-confirmed');
  });
});
