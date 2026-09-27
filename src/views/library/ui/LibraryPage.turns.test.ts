import { describe, expect, it } from 'vitest';
import { clearFiledAnswer, librarySelectionFocusTarget, matchLibraryOpeningRequest, restoreFiledAnswer, type RetainedLibraryAnswer } from './LibraryPage';

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

describe('mobile Browse page round-trip focus', () => {
  it('returns from a Wiki reader to the visible Browse exit, then lets that exit return to the question', () => {
    const reader = document.createElement('div');
    reader.tabIndex = -1;
    const browseBack = document.createElement('button');
    document.body.append(reader, browseBack);
    try {
      const openPage = librarySelectionFocusTarget({ selected: { kind: 'wiki' }, mobileBrowseOpen: true, narrow: true, browseBack, reader });
      expect(openPage).toBe(reader);
      openPage?.focus();
      const backFromPage = librarySelectionFocusTarget({ selected: null, mobileBrowseOpen: true, narrow: true, browseBack, reader });
      expect(backFromPage).toBe(browseBack);
      backFromPage?.focus();
      expect(document.activeElement).toBe(browseBack);
      expect(librarySelectionFocusTarget({ selected: null, mobileBrowseOpen: false, narrow: true, browseBack: null, reader })).toBe(reader);
    } finally {
      reader.remove();
      browseBack.remove();
    }
  });
});
