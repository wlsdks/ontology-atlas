import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import {
  answerObservation,
  buildAnswerRevision,
  answerHistoryUnreadable,
  retainedAnswerHeads,
  isRetainedAnswerPath,
  automaticWikiWriteAllowed,
} from './answer-revision';

const source = 'sources/plan.md';
const oldHash = 'a'.repeat(64);
const newHash = 'b'.repeat(64);
const previous = 'wiki/answers/original';
const body = `## Summary
The date remains disputed.

## Facts
- The plan names September. [[src:sources/plan.md#l1]]

## Decisions
- Human note: do not announce a date yet.

## Open questions
- The amendment disagrees. [[src:sources/plan.md#l2]]

## Not in sources
- Approval has not been established.
`;
const input = () => ({
  question: 'When can we announce?', previousSlug: previous, thread: previous,
  previousHash: oldHash, response: body, writer: 'agent:test',
  now: new Date('2026-09-10T10:00:00Z'), observedAt: '2026-09-10T09:59:00Z',
  observations: new Map([[source, oldHash]]), knownSources: [source],
  filingId: 'ddc9eef2-049d-4178-9e5d-69024a5c9f43',
});

describe('retained answer evidence', () => {
  it('distinguishes a changed original, a missing original, and absent observations', () => {
    const fm = { sources: [source], answer_source_observations: { [source]: oldHash } };
    expect(answerObservation(fm, new Set([source]), new Map([[source, newHash]]))).toMatchObject({ state: 'changed', changed: [source] });
    expect(answerObservation(fm, new Set(), new Map())).toMatchObject({ state: 'missing', missing: [source] });
    expect(answerObservation({ sources: [source] }, new Set([source]), new Map([[source, newHash]]))).toMatchObject({ state: 'unmeasured' });
    expect(answerObservation(fm, new Set([source]), new Map([[source, oldHash]]))).toMatchObject({ state: 'unchanged' });
    expect(answerObservation({ ...fm, answer_scope_sources: [source] }, new Set([source, 'sources/amendment.md']), new Map([[source, oldHash]]))).toMatchObject({ state: 'new-sources', added: ['sources/amendment.md'] });
  });

  it('preserves cited uncertainty and human sections instead of classifying every citation as a fact', () => {
    const result = buildAnswerRevision(input());
    expect(result.problems).toEqual([]);
    const parsed = parseFrontmatter(result.text);
    expect(parsed.body).toContain(body.trim());
    expect(parsed.frontmatter.source_hash).toEqual({ [source]: 'unmeasured' });
    expect(parsed.frontmatter.answer_source_observations).toEqual({ [source]: oldHash });
    expect(parsed.frontmatter.answer_previous).toBe(previous);
    expect(parsed.frontmatter.answer_previous_hash).toBe(oldHash);
    expect(result.slug).not.toBe(previous);
  });

  it('refuses a response missing the wiki sections or citing a missing original', () => {
    expect(buildAnswerRevision({ ...input(), response: 'September. [[src:sources/plan.md#l1]]' }).problems.length).toBeGreaterThan(0);
    expect(buildAnswerRevision({ ...input(), knownSources: [] }).problems).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'citation-target-missing' })]));
  });

  it('rebinds a copied navigation footer to the actual previous revision', () => {
    const latest = 'wiki/answers/latest';
    const result = buildAnswerRevision({ ...input(), previousSlug: latest,
      response: `${body}\nPrevious retained answer: [[${previous}]].\n` });
    expect(result.problems).toEqual([]);
    expect(result.text.match(/Previous retained answer:/g)).toHaveLength(1);
    expect(result.text).toContain(`Previous retained answer: [[${latest}]].`);
    expect(parseFrontmatter(result.text).body).toContain(body.trim());
  });

  it('retains sibling revisions as alternatives rather than picking a timestamp winner', () => {
    const row = (slug: string, parent?: string) => ({ slug, title: 'When?', frontmatter: { answer_thread: previous, ...(parent ? { answer_previous: parent } : {}) } });
    const heads = retainedAnswerHeads([row(previous), row('wiki/answers/one', previous), row('wiki/answers/two', previous)]);
    expect(heads.map((entry) => entry.slug).sort()).toEqual(['wiki/answers/one', 'wiki/answers/two']);
    expect(heads.every((entry) => entry.alternatives === 2)).toBe(true);
  });

  it('keeps broken or cyclic history visible', () => {
    const heads = retainedAnswerHeads([
      { slug: 'wiki/answers/one', title: 'One', frontmatter: { answer_thread: previous, answer_previous: 'wiki/answers/two' } },
      { slug: 'wiki/answers/two', title: 'Two', frontmatter: { answer_thread: previous, answer_previous: 'wiki/answers/one' } },
      { slug: 'wiki/answers/missing', title: 'Missing', frontmatter: { answer_previous: previous } },
    ]);
    expect(heads).toHaveLength(3);
    expect(heads.every((entry) => entry.historyProblem !== null)).toBe(true);
  });

  it('recognizes retained paths without accepting path escapes', () => {
    expect(isRetainedAnswerPath('wiki/answers/one.md')).toBe(true);
    expect(isRetainedAnswerPath('wiki/answers/one')).toBe(true);
    expect(isRetainedAnswerPath('wiki/answers/../../project.md')).toBe(false);
    expect(isRetainedAnswerPath('wiki/plans.md')).toBe(false);
    expect(automaticWikiWriteAllowed('wiki/plans.md')).toBe(true);
    for (const path of ['wiki/answers/one.md', 'wiki/answers//one.md', 'wiki/notes/../answers/one.md', 'wiki/answers/./one.md']) {
      expect(automaticWikiWriteAllowed(path)).toBe(false);
    }
  });
  /**
   * **The card and the button must not disagree** (installed-app inspection before v1.2.2, B2).
   *
   * The fixture's answer carried `answer_thread: "dispute-records"`. `retainedAnswerHeads` read
   * that as a broken edge and the index card said 「이력 확인 필요」, while the answer page offered
   * the refresh anyway; the press then threw, and its English landed in the page body. Both sides
   * now read `answerHistoryUnreadable`, so a malformed thread is refused before it is offered.
   */
  it('names a malformed thread edge to the card and to the refusal alike', () => {
    // `frontmatter`, not the row's derived `title`: this is the same object
    // `prepareAnswerRefresh` reads back out of the file, which is what makes the two agree.
    const malformed = { title: 'When?', answer_thread: 'dispute-records' };
    const heads = retainedAnswerHeads([{ slug: previous, title: 'When?', frontmatter: malformed }]);
    expect(heads[0]!.historyProblem, 'the index card would not have marked this').toBe('invalid');
    expect(answerHistoryUnreadable(previous, malformed), 'the press would still be offered').toBe(true);

    // A thread edge that reads cleanly is offered, so this is not a gate that always refuses.
    const clean = { title: 'When?', answer_thread: previous };
    expect(retainedAnswerHeads([{ slug: previous, title: 'When?', frontmatter: clean }])[0]!.historyProblem).toBeNull();
    expect(answerHistoryUnreadable(previous, clean)).toBe(false);

    // The other two facts `prepareAnswerRefresh` refuses on, named before the press as well.
    expect(answerHistoryUnreadable(previous, { title: '   ' })).toBe(true);
    expect(answerHistoryUnreadable(previous, { title: 'When?', kind: 'capability' })).toBe(true);
  });
});
