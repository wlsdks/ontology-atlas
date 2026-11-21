import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import type { VaultDoc } from '@/entities/docs-vault';
import { sourceUnits } from '@/shared/lib/library/source-passage';
import { MAX_VECTOR_PREFIX_BYTES, MAX_VECTOR_PREFIXES } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { countDeskReadablePages, deskBriefEvidence, deskPageClaims, deskLeadTermRuns, deskMeaningLeads, deskSearchPrefixes, deskSentenceWindow, DESK_SENTENCE_LIMIT, findDeskClaims, findDeskSourceHits, fuseDeskLeads, jevClaimEligibility, jevPayloadEligibility, newestDeskQuestions, planDeskSourceReads, questionDeskReportFileCurrent, questionTermRuns, questionTerms, recentDeskPages, type DeskClaim } from './question-desk';
import { buildQuestionDeskBrief, buildQuestionDeskReportBrief, questionDeskReportFilename, serializeQuestionDeskReport, splitQuestionDeskReportSections, QUESTION_DESK_BRIEF_MAX_CHARS } from './question-desk-brief';
import { planQuestionDeskReportFile } from './question-desk-brief';
import { buildAnswerPage } from './answer-page';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

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
  tags: [], updatedAt: '', linksOut: [],
});
const claimsOf = (texts: Iterable<readonly [string, string]>) =>
  new Map([...texts].map(([slug, text]) => [slug, deskPageClaims(text)] as const));

describe('question desk evidence', () => {
  it('retrieves a schema-valid but false claim as a lead and preserves its exact citation', () => {
    const found = findDeskClaims('When does refund approval restore stock?', [doc('wiki/refund')], claimsOf([['wiki/refund', raw]]));
    expect(found.readPages).toBe(1);
    expect(found.claims).toEqual([expect.objectContaining({
      pageSlug: 'wiki/refund', citations: [{ path: 'sources/refund.md', anchor: 'l2' }],
    })]);
    expect(found.claims[0]!.text).toContain('immediately restores stock');
    expect(found.claims[0]!.text).not.toContain('Does the batch');
  });

  it('never treats a citation file name as topical evidence', () => {
    const citedOnly = raw.replace('Refund approval immediately restores stock.', 'An unrelated decision was recorded.');
    const found = findDeskClaims('refund stock', [doc('wiki/refund', citedOnly)], claimsOf([['wiki/refund', citedOnly]]));
    expect(found.claims).toHaveLength(0);
  });

  it('keeps unread pages and absent answers explicit', () => {
    const found = findDeskClaims('nonexistent settlement', [doc('wiki/refund'), doc('wiki/unread')], claimsOf([['wiki/refund', raw]]));
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
    const found = findDeskClaims('refund approval stock', docs, claimsOf(texts));
    expect(found.totalPages).toBe(37);
    expect(found.readPages).toBe(37);
    expect(found.claims[0]?.pageSlug).toBe('wiki/refund');
    expect(found.omitted).toBe(0);
    const broad = findDeskClaims('policy reimbursement', docs, claimsOf(texts));
    expect(broad.claims).toHaveLength(8);
    expect(broad.omitted).toBe(28);
  });

  it('finds a Korean noun when the question and source use different particles', () => {
    const terms = questionTerms('재고가 언제 복구되나요?');
    const hits = findDeskSourceHits('sources/stock.md', [
      { anchor: 'l4', kind: 'line', text: '승인 뒤에는 재고를 별도 작업으로 복구합니다.' },
    ], terms);
    expect(hits.hits[0]?.anchor).toBe('l4');
    expect(hits.hits[0]?.score).toBeGreaterThan(0);
  });

  it('skips an oversized source and still searches later files within the read budget', () => {
    const planned = planDeskSourceReads([
      { path: 'sources/a-huge.pdf', bytes: 21 * 1024 * 1024 },
      { path: 'sources/b-policy.md', bytes: 400 },
    ]);
    expect(planned.map((source) => source.path)).toEqual(['sources/b-policy.md']);
  });

  it('refuses an old folder report even when relative paths and inventory stamps match exactly', () => {
    expect(questionDeskReportFileCurrent('folder-a#1', 'folder-b#2', 'same-listing', 'same-listing')).toBe(false);
    expect(questionDeskReportFileCurrent('folder-a#1', 'folder-a#1', 'old-listing', 'new-listing')).toBe(false);
    expect(questionDeskReportFileCurrent('folder-a#1', 'folder-a#1', 'same-listing', 'same-listing')).toBe(true);
  });

  it('counts matching source units hidden by the per-file display limit', () => {
    const units = Array.from({ length: 5 }, (_, index) => ({ anchor: `l${index + 1}`, kind: 'line' as const, text: 'Refund approval queues restoration.' }));
    const found = findDeskSourceHits('sources/refund.md', units, questionTerms('refund restoration'));
    expect(found.matches).toBe(5);
    expect(found.hits).toHaveLength(3);
  });

  it('reads exact original units and withholds Jev for missing, stale, and unmeasured evidence', () => {
    const claim = findDeskClaims('refund stock', [doc('wiki/refund')], claimsOf([['wiki/refund', raw]])).claims[0]!;
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
    const claim = findDeskClaims('refund stock', [doc('wiki/refund')], claimsOf([['wiki/refund', raw]])).claims[0]!;
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
      text: `${'x'.repeat(70_028)} [[src:${longPath}#l2]]`, line: 1, score: 1,
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
    const claim = findDeskClaims('refund stock', [doc('wiki/refund')], claimsOf([['wiki/refund', raw]])).claims[0]!;
    const report = buildQuestionDeskReportBrief({
      question: 'When does stock return?', vaultRoot: '/folder', locale: 'en', claims: [claim],
      sourceHits: [{ path: 'sources/refund.md', anchor: 'l2', text: 'A job runs later.', score: 2 }],
      coverage: '1/1 pages; 1/1 originals; 0 omitted',
    });
    expect(report).toContain('## Answer');
    expect(report).toContain('## Source-backed evidence');
    expect(report).toContain('## Disagreements or changed claims');
    expect(report).toContain('## Unknowns and search limits');
    expect(report).toContain('one short conclusion sentence in its own paragraph (160 characters or fewer)');
    expect(report).toContain('[[src:sources/refund.md#l2]]');
    expect(report).toContain('Write no files.');
    expect(report.length).toBeLessThanOrEqual(QUESTION_DESK_BRIEF_MAX_CHARS);
    const korean = buildQuestionDeskReportBrief({
      question: '재고는 언제 돌아오나요?', vaultRoot: '/folder', locale: 'ko', claims: [claim],
      sourceHits: [{ path: 'sources/refund.md', anchor: 'l2', text: '작업은 나중에 실행됩니다.', score: 2 }],
      coverage: '위키 1/1; 원문 1/1',
    });
    expect(korean).toContain('## 답의 첫 문단은 160자 이하의 짧은 결론 한 문장');
  });

  it('separates only exact ordered localized report headings and keeps freeform text raw', () => {
    const korean = '## 답\n승인 뒤 작업이 실행됩니다.\n## 원문 근거\n- 원문은 작업 대기라고 말합니다. [[src:sources/refund.md#l2]]\n## 불일치하거나 변경된 주장\n- 즉시 복구 주장은 어긋납니다.\n## 모르는 점과 검색 한계\n- 실행 시각은 알 수 없습니다.';
    const sections = splitQuestionDeskReportSections(korean, 'ko');
    expect(sections?.map((section) => section.title)).toEqual(['답', '원문 근거', '불일치하거나 변경된 주장', '모르는 점과 검색 한계']);
    expect(sections?.[0]?.markdown).toBe('승인 뒤 작업이 실행됩니다.');
    expect(sections?.[1]?.markdown).toContain('[[src:sources/refund.md#l2]]');
    expect(splitQuestionDeskReportSections('# 자유 형식\n\n모델 답변입니다.', 'ko')).toBeNull();
    expect(splitQuestionDeskReportSections(korean.replace('## 원문 근거', '## 바뀐 근거'), 'ko')).toBeNull();
    expect(splitQuestionDeskReportSections(korean + '\n## 답\n반복', 'ko')).toBeNull();
  });

  it('reserves room for report instructions when the evidence handoff approaches its cap', () => {
    const sourcePath = `sources/${'nested/'.repeat(18)}${'a'.repeat(70)}.md`;
    const input = {
      question: 'q'.repeat(5_000), vaultRoot: `/folder/${'v'.repeat(3_000)}`, locale: 'en',
      coverage: 'c'.repeat(5_000),
      claims: Array.from({ length: 8 }, (_, index) => ({
        pageSlug: `wiki/long-${index}`, pageTitle: `Long ${index}`,
        text: 'w'.repeat(10_000), line: 1, score: 1, recordedHashes: {},
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

  it('prints a labelled source citation as an exact portable address in Markdown', () => {
    const markdown = serializeQuestionDeskReport({
      question: 'Which policy?', generatedAt: '2026-09-27T17:00:00Z', coverage: '1/1', limits: 'none',
      text: 'See [[src:sources/refund.md#l2|refund policy]].',
    }, 'en', new Set(['sources/refund.md']));
    expect(markdown).toContain('refund policy [[src:sources/refund.md#l2]]');
    expect(markdown).not.toContain('[citation unavailable');
  });

  it('renders user-supplied Markdown syntax in question and coverage as inert export text', () => {
    const markdown = serializeQuestionDeskReport({
      question: 'Explain ![diagram](https://example.com/image.png)',
      generatedAt: '2026-09-27T17:00:00Z',
      coverage: 'Skipped ![map](//example.com/map.png)', limits: '[read more]( https://example.com)',
      text: 'Original [[src:sources/refund.md#l2]].',
    }, 'en', new Set(['sources/refund.md']));
    expect(markdown).not.toContain('![diagram](');
    expect(markdown).not.toContain('![map](');
    expect(markdown).not.toContain('[read more](');
    expect(markdown).toContain('&#33;&#91;diagram&#93;');
    expect(markdown).toContain('https&#58;//example.com/image.png');
    expect(markdown).toContain('[[src:sources/refund.md#l2]]');
  });

  it('makes external links, remote images, and raw HTML inert in downloaded Markdown', () => {
    const markdown = serializeQuestionDeskReport({
      question: 'Can this be shared?', generatedAt: '2026-09-27T17:00:00Z', coverage: 'one source', limits: 'none',
      text: 'Read [outside](https://example.com/path) and https://example.com/bare. ![remote](https://example.com/image.png) <img src="https://example.com/raw.png"> [[src:sources/refund.md#l2]]',
    }, 'en', new Set(['sources/refund.md']));
    expect(markdown).toContain('` outside ` &#91;external link unavailable&#93;');
    expect(markdown).toContain('` remote ` &#91;external image omitted&#93;');
    expect(markdown).not.toContain('](https://');
    expect(markdown).toContain('` <img src="https://example.com/raw.png"> `');
    expect(markdown).toContain('` https://example.com/bare `');
    expect(markdown).toContain('[[src:sources/refund.md#l2]]');
  });

  it.each([
    '![a [b]](//example.invalid/embedded-request.png)',
    '[![nested](//example.invalid/nested.png)](https://example.invalid)',
    '![reference][remote]\n\n[remote]: //example.invalid/reference.png',
    '[www.example.invalid](https://example.invalid) and <agent@example.invalid>',
    '![a `quoted` label](https://example.invalid/image.png)',
    '<picture>\n<img src="//example.invalid/raw.png">\n</picture>',
    '<https://example.invalid>(//example.invalid/adjacent)',
    'www&#46;example.invalid\n\n```\nkeep the fence inert\n```',
  ])('exports hostile Markdown as text without an active resource: %s', (hostile) => {
    const markdown = serializeQuestionDeskReport({
      question: 'What did the original say?', generatedAt: '2026-09-27T17:00:00Z', coverage: 'one source', limits: 'none',
      text: `${hostile}\n\nOriginal [[src:sources/refund.md#l2]].`,
    }, 'en', new Set(['sources/refund.md']));
    const types: string[] = [];
    const visit = (node: { type: string; children?: readonly { type: string }[] }) => {
      types.push(node.type);
      node.children?.forEach(visit);
    };
    visit(unified().use(remarkParse).use(remarkGfm).parse(markdown));
    expect(types.filter((type) => ['image', 'link', 'imageReference', 'linkReference', 'definition', 'html'].includes(type))).toEqual([]);
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

  it('files a realistic Korean ACP report with explanatory prose without promoting it to Facts', () => {
    const report = {
      question: '재고는 언제 복구되나요?', generatedAt: '2026-09-27T17:00:00Z',
      coverage: '위키 2/2 · 원문 2/2', limits: '로컬 단어 일치 없음; 다른 언어 문서는 빠질 수 있음',
      text: [
        '## 답', '즉시는 아닙니다. 별도 작업이 실행된 뒤 반영됩니다.',
        '## 원문 근거', '두 영어 원문을 다시 읽었습니다.', '- sources/refund.md',
        '- 환불 승인은 재고 복구 작업을 대기열에 넣습니다. [[src:sources/refund.md#l2]]',
        '이것은 승인 즉시 수량이 바뀐다는 뜻이 아닙니다.',
        '## 불일치하거나 변경된 주장', '위키의 즉시 복구 주장은 원문과 어긋납니다. [[src:sources/refund.md#l2]]',
        '## 모르는 점과 검색 한계', '실제 작업 완료 시각은 문서에 없습니다.',
        '마지막으로 로컬 단어 검색은 한국어 질문과 영어 원문을 연결하지 못했습니다.',
      ].join('\n'),
    };
    const plan = planQuestionDeskReportFile(report, 'ko', new Set(['sources/refund.md']));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const page = buildAnswerPage({ question: report.question, answer: plan.answer, askedOn: null,
      writer: 'agent:test', now: new Date(report.generatedAt), knownSources: ['sources/refund.md'] });
    expect(page.problems).toEqual([]);
    const facts = page.text.split('## Facts\n')[1]!.split('## Decisions')[0]!;
    expect(facts).toContain('환불 승인은 재고 복구 작업을 대기열에 넣습니다.');
    expect(facts).not.toContain('두 영어 원문을 다시 읽었습니다.');
    expect(facts).not.toContain('즉시 복구 주장은');
    expect(page.text.split('## Open questions\n')[1]!).toContain('즉시 복구 주장은');
    expect(page.text.split('## Not in sources\n')[1]!).toContain('두 영어 원문을 다시 읽었습니다.');
    expect(page.text.split('## Not in sources\n')[1]!).not.toContain('근거 해설 (사실로 승격하지 않음): - sources/refund.md');
    expect(page.text.split('## Not in sources\n')[1]!).toContain('로컬 단어 검색은 한국어 질문');
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
    expect(planQuestionDeskReportFile({ ...base, text: base.text.replace('Later.', '![remote](//example.com/x.png)') }, 'en', known)).toMatchObject({ ok: false, reason: 'unsafe' });
    expect(planQuestionDeskReportFile({ ...base, text: base.text.replace('Later.', '[outside]( https://example.com)') }, 'en', known)).toMatchObject({ ok: false, reason: 'unsafe' });
    expect(planQuestionDeskReportFile({ ...base, text: base.text.replace('Later.', '![a [b]](https://example.com/image.png)') }, 'en', known)).toMatchObject({ ok: false, reason: 'unsafe' });
    expect(planQuestionDeskReportFile({ ...base, text: base.text.replace('Later.', '[see][remote]\n[remote]: https://example.com') }, 'en', known)).toMatchObject({ ok: false, reason: 'unsafe' });
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

describe('question desk home and lead order', () => {
  const page = (slug: string, updatedAt: string, extra = ''): VaultDoc => ({
    ...doc(slug, `---\ntitle: ${slug}\nsources: [sources/a.md, sources/b.md]\n${extra}---\n`), updatedAt,
  });
  const claimAt = (pageSlug: string, line: number): DeskClaim => ({
    pageSlug, pageTitle: pageSlug, text: `claim ${line}`, citations: [], line, score: 1, recordedHashes: {},
  });

  it('lists the five newest wiki pages, newest first, without saved questions or concept documents', () => {
    const docs = [
      page('wiki/a', '2026-11-01T00:00:00Z'), page('wiki/b', '2026-11-05T00:00:00Z'), page('wiki/c', '2026-11-03T00:00:00Z'),
      page('wiki/d', '2026-11-07T00:00:00Z'), page('wiki/e', '2026-11-02T00:00:00Z'), page('wiki/f', '2026-11-06T00:00:00Z'),
      page('wiki/answers/kept', '2026-11-20T00:00:00Z'), page('wiki/concept', '2026-11-19T00:00:00Z', 'kind: capability\n'),
    ];
    const recent = recentDeskPages(docs, 5);
    expect(recent.map((row) => row.slug)).toEqual(['wiki/d', 'wiki/f', 'wiki/b', 'wiki/c', 'wiki/e']);
    expect(recent[0]!.sources).toBe(2);
  });

  it('orders pages written on the same day by slug, so the list does not shuffle', () => {
    const day = '2026-11-01T00:00:00Z';
    expect(recentDeskPages([page('wiki/b', day), page('wiki/c', day), page('wiki/a', day)], 2).map((row) => row.slug)).toEqual(['wiki/a', 'wiki/b']);
  });

  it('lists saved questions newest first by the day their page records', () => {
    const docs = [
      page('wiki/answers/old', '2026-11-20T00:00:00Z', 'compiled_at: 2026-10-01T00:00:00Z\n'),
      page('wiki/answers/new', '2026-11-01T00:00:00Z', 'compiled_at: 2026-11-05T00:00:00Z\n'),
      page('wiki/answers/listed', '2026-10-15T00:00:00Z'),
      page('wiki/plain', '2026-11-30T00:00:00Z'),
    ];
    const saved = newestDeskQuestions(docs, 3);
    expect(saved.map((row) => row.head.slug)).toEqual(['wiki/answers/new', 'wiki/answers/listed', 'wiki/answers/old']);
    expect(saved[1]!.savedAt).toBe('2026-10-15T00:00:00Z');
    expect(newestDeskQuestions(docs, 1)).toHaveLength(1);
  });

  it('interleaves wiki claims and source passages by rank, claim first on a tie', () => {
    const leads = fuseDeskLeads([claimAt('wiki/z', 4), claimAt('wiki/z', 9)], [
      { path: 'sources/a.md', anchor: 'l3', text: 'passage', score: 2 },
      { path: 'sources/b.md', anchor: 'l1', text: 'passage', score: 1 },
    ]);
    expect(leads.map((lead) => lead.key)).toEqual(['claim:wiki/z:4', 'source:sources/a.md#l3', 'claim:wiki/z:9', 'source:sources/b.md#l1']);
  });

  it('shows the sentence a listed claim cites once, as that claim, and lifts the claim by its rank', () => {
    const citing = {
      ...claimAt('wiki/z', 9),
      text: 'Returns  are accepted for 15 days. [[src:sources/a.md#l17]]',
      citations: [{ path: 'sources/a.md', anchor: 'l17' }],
    };
    const leads = fuseDeskLeads([claimAt('wiki/z', 4), citing], [
      // NFC, case, runs of whitespace, a list marker and trailing punctuation do not make it another sentence.
      { path: 'sources/a.md', anchor: 'l17', text: '- RETURNS are accepted\tfor 15 days', score: 2 },
      { path: 'sources/a.md', anchor: 'l18', text: 'next line', score: 1 },
    ]);
    expect(leads.map((lead) => lead.key)).toEqual(['claim:wiki/z:9', 'claim:wiki/z:4', 'source:sources/a.md#l18']);
  });

  it('folds composed and decomposed Hangul as one sentence', () => {
    const sentence = '배송 완료 후 15일 안에는 반품할 수 있다.';
    const citing = { ...claimAt('wiki/z', 9), text: sentence, citations: [{ path: 'sources/a.md', anchor: 'l17' }] };
    const leads = fuseDeskLeads([citing], [{ path: 'sources/a.md', anchor: 'l17', text: sentence.normalize('NFD'), score: 1 }]);
    expect(leads.map((lead) => lead.key)).toEqual(['claim:wiki/z:9']);
  });

  it('keeps a cited passage that says something else as its own row beside the claim', () => {
    const citing = {
      ...claimAt('wiki/z', 9),
      text: 'Refund approval immediately restores stock. [[src:sources/refund.md#l2]]',
      citations: [{ path: 'sources/refund.md', anchor: 'l2' }],
    };
    const leads = fuseDeskLeads([citing], [
      { path: 'sources/refund.md', anchor: 'l2', text: 'Refund approval queues a stock restoration job.', score: 1 },
    ]);
    expect(leads.map((lead) => lead.key)).toEqual(['claim:wiki/z:9', 'source:sources/refund.md#l2']);
  });

  it('gives every row the reason words when meaning took no part', () => {
    const leads = fuseDeskLeads([claimAt('wiki/z', 4)], [{ path: 'sources/a.md', anchor: 'l3', text: 'passage', score: 2 }]);
    expect(leads.map((lead) => lead.reason)).toEqual(['words', 'words']);
  });

  it('keeps one order whichever list a passage reaches first', () => {
    const a = { path: 'sources/a.md', anchor: 'l3', text: 'a', score: 2 };
    const b = { path: 'sources/b.md', anchor: 'l1', text: 'b', score: 1 };
    const c = { path: 'sources/c.md', anchor: 'l9', text: 'c', score: 1 };
    // a ranks first by words and second by meaning, c first by meaning; then the lists trade places.
    const one = fuseDeskLeads([], [a, b], [{ kind: 'source', hit: c }, { kind: 'source', hit: a }]);
    const other = fuseDeskLeads([], [c, a], [{ kind: 'source', hit: a }, { kind: 'source', hit: b }]);
    expect(one.map((lead) => [lead.key, lead.reason])).toEqual([
      ['source:sources/a.md#l3', 'both'], ['source:sources/c.md#l9', 'meaning'], ['source:sources/b.md#l1', 'words'],
    ]);
    expect(other.map((lead) => [lead.key, lead.reason])).toEqual([
      ['source:sources/a.md#l3', 'both'], ['source:sources/c.md#l9', 'words'], ['source:sources/b.md#l1', 'meaning'],
    ]);
  });

  it('counts the lists of a passage folded into its claim for the claim', () => {
    const citing = { ...claimAt('wiki/z', 9), text: 'Returns are accepted for 15 days.', citations: [{ path: 'sources/a.md', anchor: 'l17' }] };
    const leads = fuseDeskLeads([citing], [], [{ kind: 'source', hit: { path: 'sources/a.md', anchor: 'l17', text: 'Returns are accepted for 15 days', score: 0 } }]);
    expect(leads.map((lead) => [lead.key, lead.reason])).toEqual([['claim:wiki/z:9', 'both']]);
  });

  it('marks whole question terms and the stems of longer Hangul terms, nothing else', () => {
    const terms = questionTerms('반품은 며칠 안에 Refund');
    const runs = questionTermRuns('배송 후 15일 안에는 반품할 수 있다. refund ok', terms);
    expect(runs.filter((run) => run.strong).map((run) => run.text)).toEqual(['안에', '반품', 'refund']);
    expect(runs.map((run) => run.text).join('')).toBe('배송 후 15일 안에는 반품할 수 있다. refund ok');
  });

  it('shows a sentence that fits whole and a longer one as a window around its first matched term', () => {
    const short = 'Refund approval queues a stock restoration job.';
    expect(deskSentenceWindow(short, ['refund'])).toBe(short);
    const long = `${'Before the refund clause. '.repeat(40)}${'Stock waits. '.repeat(40)}`;
    expect(deskSentenceWindow(long, ['refund'])).toMatch(/^Before the refund clause\..*…$/u);
    const late = `${'padding words here. '.repeat(60)}The refund is queued.${' trailing words.'.repeat(60)}`;
    const window = deskSentenceWindow(late, ['refund']);
    expect(window.length).toBeLessThanOrEqual(DESK_SENTENCE_LIMIT + 2);
    expect(window.startsWith('…') && window.endsWith('…')).toBe(true);
    expect(window).toContain('The refund is queued.');
    // A Hangul term matches by its stem, as the highlight does.
    expect(deskSentenceWindow(`${'가나다라 '.repeat(100)}반품할 수 있다${' 마바사'.repeat(100)}`, ['반품은']))
      .toContain('반품할 수 있다');
  });

  it('cuts a window between graphemes, never inside one', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    const accent = 'e\u0301';
    const text = `${family.repeat(40)}${accent.repeat(31)} refund ${accent.repeat(31)}${family.repeat(40)}`;
    const window = deskSentenceWindow(text, ['refund']);
    expect(window.length).toBeLessThanOrEqual(DESK_SENTENCE_LIMIT + 2);
    const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(window.slice(1, -1).trim())]
      .map((part) => part.segment);
    for (const grapheme of graphemes) expect([family, accent, ' ', ...'refund']).toContain(grapheme);
  });
});

describe('question desk rows found by meaning', () => {
  const sourceText = '# Returns\nRefund window is 15 days.\n\n## Exceptions\nOpened items cannot go back.\nThe fee is waived for defects.\n';
  const units = sourceUnits(new TextEncoder().encode(sourceText), 'sources/returns.md').units;
  const pageRaw = `---\ntitle: Returns\nsource_hash:\n  sources/returns.md: ${'a'.repeat(64)}\n---\n## Summary\nHow returns work.\n## Facts\n- Opened items are excluded. [[src:sources/returns.md#l5]]\n- Defects waive the fee. [[src:sources/returns.md#l6]]\n`;
  const page = doc('wiki/returns', pageRaw);
  const base = {
    docs: [page], claimsBySlug: claimsOf([['wiki/returns', pageRaw]]),
    searchedSources: new Set(['sources/returns.md']), sourceUnitsByPath: new Map([['sources/returns.md', units]]),
  };

  it('is the word lead the passage holds, so the list shows it once for both reasons', () => {
    const terms = questionTerms('refund window');
    const words = findDeskSourceHits('sources/returns.md', units, terms).hits;
    const meaning = deskMeaningLeads({ ...base, hits: [{ path: 'sources/returns.md', lineStart: 1, lineEnd: 3 }], claims: [], sourceHits: words });
    expect(meaning).toEqual({ leads: [{ kind: 'source', hit: words[0] }], dropped: 0 });
    const leads = fuseDeskLeads([], words, meaning.leads);
    expect(leads.map((lead) => [lead.key, lead.reason])).toEqual([['source:sources/returns.md#l2', 'both']]);
  });

  it('is the first sentence of a source passage, past its heading, with no word strong', () => {
    const terms = questionTerms('can I send back a box I opened');
    const meaning = deskMeaningLeads({ ...base, hits: [{ path: 'sources/returns.md', lineStart: 4, lineEnd: 6 }], claims: [], sourceHits: [] });
    expect(meaning.leads).toEqual([{ kind: 'source', hit: { path: 'sources/returns.md', anchor: 'l5', text: 'Opened items cannot go back.', score: 0 } }]);
    const [lead] = fuseDeskLeads([], [], meaning.leads);
    expect(lead!.reason).toBe('meaning');
    expect(deskLeadTermRuns(lead!, 'Opened items cannot go back.', terms).filter((run) => run.strong)).toEqual([]);
    expect(deskLeadTermRuns({ reason: 'words' }, 'Opened items cannot go back.', terms).filter((run) => run.strong).map((run) => run.text)).toEqual(['Opened', 'back']);
  });

  it('is the first claim a wiki passage holds, counted by file line and keeping its citation', () => {
    // File lines: frontmatter 1-5, Summary 6-7, Facts 8, the claims 9 and 10.
    const meaning = deskMeaningLeads({ ...base, hits: [{ path: 'wiki/returns.md', lineStart: 7, lineEnd: 10 }], claims: [], sourceHits: [] });
    expect(meaning.leads).toEqual([{ kind: 'claim', claim: expect.objectContaining({
      pageSlug: 'wiki/returns', text: 'Opened items are excluded. [[src:sources/returns.md#l5]]',
      citations: [{ path: 'sources/returns.md', anchor: 'l5' }], recordedHashes: { 'sources/returns.md': 'a'.repeat(64) },
    }) }]);
    const lateHit = deskMeaningLeads({ ...base, hits: [{ path: 'wiki/returns.md', lineStart: 10, lineEnd: 10 }], claims: [], sourceHits: [] });
    expect(lateHit.leads).toEqual([{ kind: 'claim', claim: expect.objectContaining({ text: 'Defects waive the fee. [[src:sources/returns.md#l6]]' }) }]);
  });

  it('takes a word claim in range over the first claim there', () => {
    const words = findDeskClaims('fee defects', [page], base.claimsBySlug).claims;
    const meaning = deskMeaningLeads({ ...base, hits: [{ path: 'wiki/returns.md', lineStart: 9, lineEnd: 10 }], claims: words, sourceHits: [] });
    expect(meaning.leads).toEqual([{ kind: 'claim', claim: words[0] }]);
    expect(fuseDeskLeads(words, [], meaning.leads).map((lead) => lead.reason)).toEqual(['both']);
  });

  it('drops a file the desk does not search uncounted, and counts one it could not read or with no sentence in range', () => {
    const meaning = deskMeaningLeads({
      ...base,
      searchedSources: new Set(['sources/returns.md', 'sources/changed.md']),
      hits: [
        { path: 'project.md', lineStart: 1, lineEnd: 4 },
        { path: 'sources/unplanned.md', lineStart: 1, lineEnd: 4 },
        { path: 'sources/changed.md', lineStart: 1, lineEnd: 4 },
        { path: 'sources/returns.md', lineStart: 3, lineEnd: 4 },
        { path: 'wiki/returns.md', lineStart: 6, lineEnd: 7 },
      ],
      claims: [], sourceHits: [],
    });
    expect(meaning).toEqual({ leads: [], dropped: 3 });
  });

  it('reaches the report brief as a row of the list, in the order the list shows', () => {
    const terms = questionTerms('refund window');
    const words = findDeskSourceHits('sources/returns.md', units, terms).hits;
    const meaning = deskMeaningLeads({ ...base, hits: [{ path: 'sources/returns.md', lineStart: 4, lineEnd: 6 }], claims: [], sourceHits: words });
    const leads = fuseDeskLeads([], words, meaning.leads);
    expect(leads.map((lead) => lead.reason)).toEqual(['words', 'meaning']);
    const evidence = deskBriefEvidence(leads);
    expect(evidence.sourceHits.map((hit) => hit.anchor)).toEqual(['l2', 'l5']);
    const brief = buildQuestionDeskReportBrief({ question: 'Can I return an opened box?', vaultRoot: '/folder', locale: 'en', ...evidence, coverage: 'Searched 1 of 1 source files.' });
    expect(brief).toContain('[[src:sources/returns.md#l5]]: Opened items cannot go back.');
    expect(brief.indexOf('#l2]]')).toBeLessThan(brief.indexOf('#l5]]'));
  });
});

describe('question desk search by meaning in names Finder wrote', () => {
  // Finder writes names decomposed; slugs and some listings are composed.
  const hangul = '반품 정책';
  const accent = 'café notes';
  const nfd = (text: string) => text.normalize('NFD');
  const pageRaw = '---\ntitle: Returns\n---\n## Facts\n- Opened items are excluded. [[src:sources/returns.md#l5]]\n';
  const sourceText = '# Notes\nOpened boxes go back to the shelf.\n';

  it('joins a decomposed hit to its page and to its listed source, and each row opens the listed file', () => {
    const page = doc(`wiki/${hangul}`, pageRaw);
    const listed = `sources/${accent}.md`;
    const units = sourceUnits(new TextEncoder().encode(sourceText), listed).units;
    const meaning = deskMeaningLeads({
      hits: [
        { path: nfd(`wiki/${hangul}.md`), lineStart: 1, lineEnd: 5 },
        { path: nfd(listed), lineStart: 1, lineEnd: 2 },
      ],
      docs: [page], claimsBySlug: claimsOf([[page.slug, pageRaw]]),
      searchedSources: new Set([listed]), sourceUnitsByPath: new Map([[listed, units]]),
      claims: [], sourceHits: [],
    });
    expect(meaning.dropped).toBe(0);
    const leads = fuseDeskLeads([], [], meaning.leads);
    expect(leads.map((lead) => lead.reason)).toEqual(['meaning', 'meaning']);
    expect(leads.map((lead) => lead.kind === 'claim' ? lead.claim.pageSlug : lead.hit.path)).toEqual([`wiki/${hangul}`, listed]);
    expect(leads[1]!.kind === 'source' && leads[1]!.hit.text).toBe('Opened boxes go back to the shelf.');
  });

  it('keeps a listing written decomposed as it is listed', () => {
    const listed = nfd(`sources/${accent}.md`);
    const units = sourceUnits(new TextEncoder().encode(sourceText), listed).units;
    const meaning = deskMeaningLeads({
      hits: [{ path: listed.normalize('NFC'), lineStart: 2, lineEnd: 2 }],
      docs: [], claimsBySlug: new Map(), searchedSources: new Set([listed]), sourceUnitsByPath: new Map([[listed, units]]),
      claims: [], sourceHits: [],
    });
    expect(meaning.leads).toEqual([{ kind: 'source', hit: expect.objectContaining({ path: listed, anchor: 'l2' }) }]);
  });
});

describe('question desk search by meaning prefixes', () => {
  it('names the top folder of each searched file once, in composed and decomposed form, and a top-level file by itself', () => {
    expect(deskSearchPrefixes(['wiki/returns.md', 'wiki/team/a.md', 'sources/a.md', 'sources/b/c.md', 'project.md']))
      .toEqual(['wiki/', 'sources/', 'project.md']);
    const prefixes = deskSearchPrefixes(['원문/회의록.md', 'wiki/a.md']);
    expect(prefixes).toEqual(['원문/', '원문/'.normalize('NFD'), 'wiki/']);
    expect(new Set(prefixes).size).toBe(3);
  });

  it("asks over every file when the folders would pass the app's limits", () => {
    const many = Array.from({ length: MAX_VECTOR_PREFIXES + 1 }, (_, index) => `folder-${index}/a.md`);
    expect(deskSearchPrefixes(many.slice(0, MAX_VECTOR_PREFIXES))).toHaveLength(MAX_VECTOR_PREFIXES);
    expect(deskSearchPrefixes(many)).toEqual([]);
    const longest = `${'a'.repeat(MAX_VECTOR_PREFIX_BYTES - 1)}/`;
    expect(deskSearchPrefixes([`${longest}a.md`])).toEqual([longest]);
    expect(deskSearchPrefixes([`b${longest}a.md`, 'wiki/a.md'])).toEqual([]);
  });
});
