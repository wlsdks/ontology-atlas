import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import type { VaultDoc } from '@/entities/docs-vault';
import { countDeskReadablePages, findDeskClaims, findDeskSourceHits, jevClaimEligibility, planDeskSourceReads, questionTerms } from './question-desk';
import { buildQuestionDeskBrief } from './question-desk-brief';

const raw = `---
title: Refund overview
sources: [sources/refund.md]
source_hash:
  sources/refund.md: ${'f'.repeat(64)}
---
## Facts
- Refund approval immediately restores stock. [[src:sources/refund.md#l2]]
## Open questions
- Does the batch ever fail?
`;
const doc = (slug: string, text = raw): VaultDoc => ({
  slug, path: `${slug}.md`, title: slug, frontmatter: parseFrontmatter(text).frontmatter,
  headings: [], tags: [], excerpt: '', wordCount: 0, updatedAt: '', linksOut: [],
});

describe('question desk evidence', () => {
  it('retrieves a schema-valid but false claim as a lead and preserves its exact citation', () => {
    const found = findDeskClaims('When does refund approval restore stock?', [doc('wiki/refund')], new Map([['wiki/refund', raw]]));
    expect(found.readPages).toBe(1);
    expect(found.claims).toEqual([expect.objectContaining({
      pageSlug: 'wiki/refund', citations: [{ path: 'sources/refund.md', anchor: 'l2' }],
    })]);
    expect(found.claims[0]!.text).toContain('immediately restores stock');
    expect(found.claims[0]!.text).not.toContain('Does the batch');
  });

  it('never treats a citation file name as topical evidence', () => {
    const citedOnly = raw.replace('Refund approval immediately restores stock.', 'An unrelated decision was recorded.');
    const found = findDeskClaims('refund stock', [doc('wiki/refund', citedOnly)], new Map([['wiki/refund', citedOnly]]));
    expect(found.claims).toHaveLength(0);
  });

  it('keeps unread pages and absent answers explicit', () => {
    const found = findDeskClaims('nonexistent settlement', [doc('wiki/refund'), doc('wiki/unread')], new Map([['wiki/refund', raw]]));
    expect(found.claims).toHaveLength(0);
    expect(found.readPages).toBe(1);
    expect(found.totalPages).toBe(2);
    expect(countDeskReadablePages([doc('wiki/refund'), doc('wiki/_template')], new Map([['wiki/refund', raw], ['wiki/_template', raw]]))).toBe(1);
  });

  it('places the relevant cited claim above 36 distractors and counts truncated leads', () => {
    const unrelated = (index: number) => `---\ntitle: Policy ${index}\n---\n## Facts\n- The travel policy covers lodging reimbursement. [[src:sources/travel-${index}.md#l1]]`;
    const docs = Array.from({ length: 36 }, (_, index) => doc(`wiki/travel-${index}`, unrelated(index)));
    const texts = new Map(docs.map((item, index) => [item.slug, unrelated(index)]));
    docs.push(doc('wiki/refund'));
    texts.set('wiki/refund', raw);
    const found = findDeskClaims('refund approval stock', docs, texts);
    expect(found.totalPages).toBe(37);
    expect(found.readPages).toBe(37);
    expect(found.claims[0]?.pageSlug).toBe('wiki/refund');
    expect(found.omitted).toBe(0);
    const broad = findDeskClaims('policy reimbursement', docs, texts);
    expect(broad.claims).toHaveLength(8);
    expect(broad.omitted).toBe(28);
  });

  it('finds a Korean noun when the question and source use different particles', () => {
    const terms = questionTerms('재고가 언제 복구되나요?');
    const hits = findDeskSourceHits('sources/stock.md', [
      { anchor: 'l4', kind: 'line', text: '승인 뒤에는 재고를 별도 작업으로 복구합니다.' },
    ], terms);
    expect(hits.hits[0]?.anchor).toBe('l4');
    // Bigram overlap is a limited lexical fallback, not semantic coverage.
    expect(hits.hits[0]?.score).toBeGreaterThan(0);
  });

  it('skips an oversized source and still searches later files within the read budget', () => {
    const planned = planDeskSourceReads([
      { path: 'sources/a-huge.pdf', bytes: 21 * 1024 * 1024 },
      { path: 'sources/b-policy.md', bytes: 400 },
    ]);
    expect(planned.map((source) => source.path)).toEqual(['sources/b-policy.md']);
  });

  it('counts matching source units hidden by the per-file display limit', () => {
    const units = Array.from({ length: 5 }, (_, index) => ({ anchor: `l${index + 1}`, kind: 'line' as const, text: 'Refund approval queues restoration.' }));
    const found = findDeskSourceHits('sources/refund.md', units, questionTerms('refund restoration'));
    expect(found.matches).toBe(5);
    expect(found.hits).toHaveLength(3);
  });

  it('reads exact original units and withholds Jev for missing, stale, and unmeasured evidence', () => {
    const claim = findDeskClaims('refund stock', [doc('wiki/refund')], new Map([['wiki/refund', raw]])).claims[0]!;
    const citation = claim.citations[0]!;
    const unit = { anchor: 'l2', kind: 'line' as const, text: 'Refund approval queues a stock restoration job.' };
    expect(findDeskSourceHits('sources/refund.md', [unit], questionTerms('refund approval job'))).toEqual({
      hits: [expect.objectContaining({ anchor: 'l2', text: unit.text })], matches: 1,
    });
    expect(jevClaimEligibility(claim, citation, { state: 'unresolved', cited: [] }, 'f'.repeat(64), false)).toBe('missing');
    expect(jevClaimEligibility(claim, citation, { state: 'resolved', cited: [unit] }, '1'.repeat(64), false)).toBe('stale');
    expect(jevClaimEligibility(claim, citation, { state: 'resolved', cited: [unit] }, null, false)).toBe('unmeasured');
    expect(jevClaimEligibility(claim, citation, { state: 'resolved', cited: [unit] }, 'f'.repeat(64), false)).toBe('ready');
  });

  it('hands off a read-only question with coverage and original addresses', () => {
    const claim = findDeskClaims('refund stock', [doc('wiki/refund')], new Map([['wiki/refund', raw]])).claims[0]!;
    const brief = buildQuestionDeskBrief({
      question: 'When does stock return?', vaultRoot: '/folder', locale: 'en', claims: [claim],
      sourceHits: [{ path: 'sources/refund.md', anchor: 'l2', text: 'A job runs later.', score: 2 }],
      coverage: '1/2 Wiki pages; 1/3 originals',
    });
    expect(brief).toContain('[[src:sources/refund.md#l2]]');
    expect(brief).toContain('1/2 Wiki pages; 1/3 originals');
    expect(brief).toContain('Write nothing in this turn.');
  });
});
