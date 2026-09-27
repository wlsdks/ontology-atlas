import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import type { VaultDoc } from '@/entities/docs-vault';
import { countDeskReadablePages, findDeskClaims, findDeskSourceHits, jevClaimEligibility, jevPayloadEligibility, planDeskSourceReads, questionTerms } from './question-desk';
import { buildQuestionDeskBrief, buildQuestionDeskReportBrief, questionDeskReportFilename, serializeQuestionDeskReport, QUESTION_DESK_BRIEF_MAX_CHARS } from './question-desk-brief';
import { planQuestionDeskReportFile } from './question-desk-brief';
import { buildAnswerPage } from './answer-page';

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

  it('clips a very long source lead while retaining its exact address and re-read direction', () => {
    const brief = buildQuestionDeskBrief({
      question: 'Refund?', vaultRoot: '/folder', locale: 'en', claims: [],
      sourceHits: [{ path: 'sources/refund.md', anchor: 'l2', text: 'x'.repeat(10_000), score: 2 }],
      coverage: '1/1 original',
    });
    expect(brief).toContain('[[src:sources/refund.md#l2]]');
    expect(brief).toContain('[lead clipped; re-read the original]');
    expect(brief).not.toContain('x'.repeat(401));
    expect(brief).toContain('Read the Wiki pages and then re-read the cited originals.');
  });

  it('bounds eight huge Wiki claims and the whole handoff while preserving included addresses', () => {
    const longPath = `sources/${'a'.repeat(160)}.md`;
    const claims = Array.from({ length: 8 }, (_, index) => ({
      pageSlug: `wiki/long-${index}`, pageTitle: `Long ${index}`,
      text: `${'x'.repeat(70_028)} [[src:${longPath}#l2]]`, score: 1,
      citations: Array.from({ length: 4 }, (_, offset) => ({ path: longPath, anchor: `l${offset + 2}` })),
      recordedHashes: {},
    }));
    const brief = buildQuestionDeskBrief({
      question: 'Q'.repeat(30_000), vaultRoot: '/folder', locale: 'en', claims,
      sourceHits: Array.from({ length: 8 }, (_, index) => ({ path: longPath, anchor: `l${index + 2}`, text: 'z'.repeat(2_000), score: 1 })),
      coverage: 'c'.repeat(30_000),
    });
    expect(brief.length).toBeLessThanOrEqual(QUESTION_DESK_BRIEF_MAX_CHARS);
    expect(brief).toContain('wiki/long-0.md');
    expect(brief).toContain(`[[src:${longPath}#l2]]`);
    expect(brief).toContain('[Wiki lead clipped; re-read the page]');
    expect(brief).toContain('citations omitted; re-read the page');
    expect(brief).toContain('leads omitted by the brief limit');
    expect(brief).toContain('[question clipped; ask for the full question before answering]');
    expect(brief).toContain('Write nothing in this turn.');
  });

  it('requests a bounded report draft with four evidence categories and no write authority', () => {
    const claim = findDeskClaims('refund stock', [doc('wiki/refund')], new Map([['wiki/refund', raw]])).claims[0]!;
    const report = buildQuestionDeskReportBrief({
      question: 'When does stock return?', vaultRoot: '/folder', locale: 'en', claims: [claim],
      sourceHits: [{ path: 'sources/refund.md', anchor: 'l2', text: 'A job runs later.', score: 2 }],
      coverage: '1/1 pages; 1/1 originals; 0 omitted',
    });
    expect(report).toContain('## Answer');
    expect(report).toContain('## Source-backed evidence');
    expect(report).toContain('## Disagreements or changed claims');
    expect(report).toContain('## Unknowns and search limits');
    expect(report).toContain('[[src:sources/refund.md#l2]]');
    expect(report).toContain('Write no files.');
    expect(report.length).toBeLessThanOrEqual(QUESTION_DESK_BRIEF_MAX_CHARS);
  });

  it('reserves room for report instructions when the evidence handoff approaches its cap', () => {
    const sourcePath = `sources/${'nested/'.repeat(18)}${'a'.repeat(70)}.md`;
    const input = {
      question: 'q'.repeat(5_000), vaultRoot: `/folder/${'v'.repeat(3_000)}`, locale: 'en',
      coverage: 'c'.repeat(5_000),
      claims: Array.from({ length: 8 }, (_, index) => ({
        pageSlug: `wiki/long-${index}`, pageTitle: `Long ${index}`,
        text: 'w'.repeat(10_000), score: 1, recordedHashes: {},
        citations: [2, 3, 4].map((line) => ({ path: sourcePath, anchor: `l${line}` })),
      })),
      sourceHits: Array.from({ length: 8 }, (_, index) => ({ path: sourcePath, anchor: `l${index + 2}`, text: 's'.repeat(10_000), score: 1 })),
    };
    const report = buildQuestionDeskReportBrief(input);
    expect(report.length).toBeLessThanOrEqual(QUESTION_DESK_BRIEF_MAX_CHARS);
    expect(report).toContain('## Unknowns and search limits');
    expect(report).toContain('Write no files.');
    expect(report).toContain(`[[src:${sourcePath}#l2]]`);
    expect(report).toContain('omitted by the brief limit');
  });

  it('exports one unreviewed dossier with the exact answer and portable citations, excluding unrelated secrets', () => {
    const report = {
      question: '../../Who approved refunds?',
      text: 'A later job restores stock. [[src:sources/refund.md#l2]]\n\n## A freeform agent heading',
      coverage: 'Searched 2 of 2 pages and 1 of 2 originals.',
      limits: 'One source unreadable; one lead omitted.',
      generatedAt: '2026-09-27T17:00:00.000Z',
      secret: 'do-not-export', jevAdvice: 'do-not-export-either',
    };
    const markdown = serializeQuestionDeskReport(report, 'en', new Set(['sources/refund.md']));
    expect(markdown).toContain('Agent draft · Unreviewed');
    expect(markdown).toContain('Generated: 2026-09-27T17:00:00.000Z');
    expect(markdown).toContain(report.question);
    expect(markdown).toContain(report.text);
    expect(markdown).toContain(report.coverage);
    expect(markdown).toContain(report.limits);
    expect(markdown).not.toContain(report.secret);
    expect(markdown).not.toContain(report.jevAdvice);
    expect(questionDeskReportFilename(report)).toBe('atlas-question-report-who-approved-refunds-20260927.md');
  });

  it('marks missing and malformed ACP citations unavailable in the Markdown dossier', () => {
    const markdown = serializeQuestionDeskReport({
      question: 'Which source?', generatedAt: '2026-09-27T17:00:00Z', coverage: '1/2 sources', limits: 'one missing',
      text: 'Known [[src:sources/refund.md#l2]]. Missing [[src:sources/gone.md#l4]]. Bad [[src:sources/refund.md#bogus]].',
    }, 'en', new Set(['sources/refund.md']));
    expect(markdown).toContain('[[src:sources/refund.md#l2]]');
    expect(markdown).not.toContain('[[src:sources/refund.md#l2]] **[citation unavailable');
    expect(markdown).toContain('[[src:sources/gone.md#l4]] **[citation unavailable in this folder]**');
    expect(markdown).toContain('[[src:sources/refund.md#bogus]] **[citation unavailable in this folder]**');
    expect(markdown).toContain('search-time file inventory');
  });

  it('makes external links, remote images, and raw HTML inert in downloaded Markdown', () => {
    const markdown = serializeQuestionDeskReport({
      question: 'Can this be shared?', generatedAt: '2026-09-27T17:00:00Z', coverage: 'one source', limits: 'none',
      text: 'Read [outside](https://example.com/path) and https://example.com/bare. ![remote](https://example.com/image.png) <img src="https://example.com/raw.png"> [[src:sources/refund.md#l2]]',
    }, 'en', new Set(['sources/refund.md']));
    expect(markdown).toContain('outside [external link unavailable]');
    expect(markdown).toContain('remote [external image omitted]');
    expect(markdown).not.toContain('](https://');
    expect(markdown).not.toContain('<img');
    expect(markdown).toContain('`https://example.com/bare.`');
    expect(markdown).toContain('[[src:sources/refund.md#l2]]');
  });

  it('files only strictly sectioned evidence as facts, keeping disagreement and unknowns out of Facts', () => {
    const report = {
      question: 'When does stock return?', generatedAt: '2026-09-27T17:00:00Z',
      coverage: 'Searched 2/2 Wiki pages and 1/2 originals.', limits: 'One original unreadable; one lead omitted.',
      text: [
        '## Answer', 'Stock returns after a job, provisionally.',
        '## Source-backed evidence', '- Refund approval queues a job. [[src:sources/refund.md#l2]]',
        '## Disagreements or changed claims', '- One Wiki page claims immediate restoration, while the original queues a job. [[src:sources/refund.md#l2]]',
        '## Unknowns and search limits', '- The job completion date is not in the read originals.',
      ].join('\n'),
    };
    const plan = planQuestionDeskReportFile(report, 'en', new Set(['sources/refund.md']));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const page = buildAnswerPage({
      question: report.question, answer: plan.answer, askedOn: null, writer: 'agent:test',
      now: new Date('2026-09-27T17:00:00Z'), knownSources: ['sources/refund.md'],
    });
    expect(page.problems).toEqual([]);
    const facts = page.text.split('## Facts\n')[1]!.split('## Decisions')[0]!;
    expect(facts).toContain('Refund approval queues a job');
    expect(facts).not.toContain('claims immediate restoration');
    expect(facts).not.toContain('completion date');
    expect(page.text.split('## Open questions\n')[1]!).toContain('claims immediate restoration');
    expect(page.text.split('## Not in sources\n')[1]!).toContain('One original unreadable; one lead omitted.');
  });

  it('refuses freeform, duplicate/mixed headings, uncited evidence, and unavailable citations before filing', () => {
    const base = {
      question: 'When?', generatedAt: '2026-09-27T17:00:00Z', coverage: '1/1', limits: 'none',
      text: '## Answer\nLater.\n## Source-backed evidence\n- Job runs later. [[src:sources/refund.md#l2]]\n## Disagreements or changed claims\n- No known disagreement.\n## Unknowns and search limits\n- Completion hour unknown.',
    };
    const known = new Set(['sources/refund.md']);
    expect(planQuestionDeskReportFile({ ...base, text: '# Freeform\nA claim. [[src:sources/refund.md#l2]]' }, 'en', known)).toMatchObject({ ok: false, reason: 'shape' });
    expect(planQuestionDeskReportFile({ ...base, text: base.text + '\n## Answer\nAgain' }, 'en', known)).toMatchObject({ ok: false, reason: 'shape' });
    expect(planQuestionDeskReportFile({ ...base, text: base.text.replace('## Answer', '## 답') }, 'en', known)).toMatchObject({ ok: false, reason: 'shape' });
    expect(planQuestionDeskReportFile({ ...base, text: base.text.replace('Job runs later. [[src:sources/refund.md#l2]]', 'Job runs later.') }, 'en', known)).toMatchObject({ ok: false, reason: 'no-evidence' });
    expect(planQuestionDeskReportFile({ ...base, text: base.text.replace('sources/refund.md', 'sources/gone.md') }, 'en', known)).toMatchObject({ ok: false, reason: 'source' });
    expect(planQuestionDeskReportFile({ ...base, text: base.text.replace('#l2', '#bogus') }, 'en', known)).toMatchObject({ ok: false, reason: 'citation' });
    expect(planQuestionDeskReportFile({ ...base, text: base.text.replace('Later.', '[outside](https://example.com)') }, 'en', known)).toMatchObject({ ok: false, reason: 'unsafe' });
    const korean = { ...base, text: base.text.replace('## Answer', '## 답').replace('## Source-backed evidence', '## 원문 근거').replace('## Disagreements or changed claims', '## 불일치하거나 변경된 주장').replace('## Unknowns and search limits', '## 모르는 점과 검색 한계') };
    expect(planQuestionDeskReportFile(korean, 'ko', known)).toMatchObject({ ok: true });
  });

  it('refuses Jev lengths before opening a consent preview', () => {
    expect(jevPayloadEligibility('a'.repeat(2_001), 'evidence', '{}')).toBe('too-long');
    expect(jevPayloadEligibility('claim', 'e'.repeat(8_001), '{}')).toBe('too-long');
    expect(jevPayloadEligibility('claim', '한'.repeat(6_000), JSON.stringify({ claim: 'claim', evidence: '한'.repeat(6_000) }))).toBe('too-long');
    expect(jevPayloadEligibility('claim', 'evidence', '{}')).toBe('ready');
  });
});
