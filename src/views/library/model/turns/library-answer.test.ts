import { describe, expect, it } from 'vitest';
import { answerFilingKind, clearFiledAnswer, matchLibraryOpeningRequest, restoreFiledAnswer, retryAskApplies, type LibraryAskContext, type RetainedLibraryAnswer, type RetryAsk } from './library-answer';

describe('Library turn presentation belongs to the actual opening request', () => {
  const compile = { kind: 'compile', text: 'Compile this folder', nonce: 1 } as const;

  it('does not classify an ordinary question as compile', () => {
    expect(matchLibraryOpeningRequest('What is the current capacity?', null, null)).toBeNull();
    expect(matchLibraryOpeningRequest('What is the current capacity?', compile, null)).toBeNull();
  });

  it('uses an explicit matching request once, even if the same prompt is typed again', () => {
    expect(matchLibraryOpeningRequest(compile.text, compile, null)).toBe(compile);
    expect(matchLibraryOpeningRequest(compile.text, { ...compile }, 1)).toBeNull();
    const next = { ...compile, nonce: 2 };
    expect(matchLibraryOpeningRequest(next.text, next, 1)).toBe(next);
  });

  it('matches the actual text rather than applying a stale operation to a later question', () => {
    const ask = { kind: 'ask', text: 'Read this selected passage', nonce: 2 } as const;
    expect(matchLibraryOpeningRequest('Explain the new budget', ask, 1)).toBeNull();
    expect(matchLibraryOpeningRequest(` ${ask.text}\n`, ask, 1)).toBe(ask);
  });
});

describe('filed-answer ownership across later turns', () => {
  const answer = (generation: number): RetainedLibraryAnswer => ({ generation, question: `Question ${generation}`, text: `Answer ${generation}`, askedOn: null });

  it('a delayed A write cannot clear answer B or a newer answer object', async () => {
    const a = answer(1);
    const b = answer(2);
    let current: RetainedLibraryAnswer | null = a;
    let finish!: () => void;
    const write = new Promise<void>((resolve) => { finish = resolve; }).then(() => { current = clearFiledAnswer(current, a); });
    current = b;
    finish();
    await write;
    expect(current).toBe(b);
    const replacement = { ...a, text: 'A replaced before its old write completed' };
    expect(clearFiledAnswer(replacement, a)).toBe(replacement);
  });

  it.each(['during', 'after'] as const)('Undo A %s B removes no B offer and resurrects no A offer', async (phase) => {
    const a = answer(1);
    const b = answer(2);
    let generation = 1;
    let current: RetainedLibraryAnswer | null = null;
    let finish!: () => void;
    const deletion = new Promise<void>((resolve) => { finish = resolve; }).then(() => { current = restoreFiledAnswer(current, a, generation); });
    generation = 2;
    current = phase === 'after' ? b : null;
    finish();
    await deletion;
    expect(current).toBe(phase === 'after' ? b : null);
  });

  it('Undo restores the same answer only if no later turn started', () => {
    const a = answer(1);
    expect(restoreFiledAnswer(null, a, 1)).toBe(a);
    expect(clearFiledAnswer(a, a)).toBeNull();
  });
});

describe('a retried ask belongs to its request', () => {
  const context = (report?: LibraryAskContext['report']): LibraryAskContext => ({ question: 'Q', askedOn: null, report });
  const retry = (overrides: Partial<RetryAsk> = {}): RetryAsk => ({ nonce: 3, text: 'Ask this', scope: 'folder-a', context: context(), ...overrides });
  const report = { searchId: 1, listingVersion: 'v1', vaultScope: 'folder-a', coverage: '', limits: '', epoch: 4 };

  it('applies to the same request, text and folder, ignoring surrounding whitespace in the typed text', () => {
    expect(retryAskApplies(retry(), { nonce: 3, text: '  Ask this ' }, 'folder-a', { epoch: 0, listingVersion: 'v1' })).toBe(true);
  });

  it('does not apply to another request, text or folder, or without a retry', () => {
    const live = { epoch: 0, listingVersion: 'v1' };
    expect(retryAskApplies(null, { nonce: 3, text: 'Ask this' }, 'folder-a', live)).toBe(false);
    expect(retryAskApplies(retry(), { nonce: 4, text: 'Ask this' }, 'folder-a', live)).toBe(false);
    expect(retryAskApplies(retry(), { nonce: 3, text: 'Other' }, 'folder-a', live)).toBe(false);
    expect(retryAskApplies(retry(), { nonce: 3, text: 'Ask this' }, 'folder-b', live)).toBe(false);
  });

  it('keeps a desk report only while it was not invalidated and its listing and folder still hold', () => {
    const withReport = retry({ context: context(report) });
    const ask = { nonce: 3, text: 'Ask this' };
    expect(retryAskApplies(withReport, ask, 'folder-a', { epoch: 4, listingVersion: 'v1' })).toBe(true);
    expect(retryAskApplies(withReport, ask, 'folder-a', { epoch: 5, listingVersion: 'v1' })).toBe(false);
    expect(retryAskApplies(withReport, ask, 'folder-a', { epoch: 4, listingVersion: 'v2' })).toBe(false);
  });
});

describe('which filing the dock offers', () => {
  const typed: RetainedLibraryAnswer = { generation: 1, question: 'Q', text: 'A', askedOn: null };
  const summary: RetainedLibraryAnswer = { ...typed, generation: 2, origin: 'question-report' };

  it('offers nothing without an answer, and files a typed answer as itself', () => {
    expect(answerFilingKind(null, null, 'folder')).toBeNull();
    expect(answerFilingKind(typed, null, 'folder')).toBe('answer');
  });

  it('files a summary only while it is the report the desk holds for this folder', () => {
    expect(answerFilingKind(summary, { answer: summary, vaultScope: 'folder' }, 'folder')).toBe('report');
    expect(answerFilingKind(summary, { answer: summary, vaultScope: 'other' }, 'folder')).toBeNull();
    expect(answerFilingKind(summary, { answer: { ...summary }, vaultScope: 'folder' }, 'folder')).toBeNull();
    expect(answerFilingKind(summary, null, 'folder')).toBeNull();
  });
});
