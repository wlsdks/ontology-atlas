import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../../messages/ko.json';
import { buildAnswerRevision } from '@/features/library';
import {
  prepareAnswerRefresh,
  saveAnswerRevision,
  type AnswerRevisionStore,
} from '@/features/library/lib/answer-revision-store';
import { useFailureSentence, type FailureCopy } from '@/shared/lib/use-failure-sentence';
import type { AnswerObservation } from '@/features/library';

import { RetainedAnswerContext } from './RetainedAnswerContext';

/**
 * **B2, and the two halves of it** (installed-app inspection before v1.2.2).
 *
 * A Korean reader opened a saved answer whose `answer_thread` was malformed, pressed
 * the redraft button (`library.answers.refresh`), and got
 *
 * > The retained question or its history cannot be read.
 *
 * in the page body. Two separate failures produced that one line:
 *
 * 1. **The sentence was the developer's.** Thrown from a module that cannot know which
 *    language the reader chose, and preferred over the copy the product had written.
 * 2. **The press should never have been offered.** The index card beside it already read
 *    `answers.version.unresolved`, computed from the same frontmatter this block had in hand.
 *
 * `tests/contract/no-raw-error-copy.contract.test.ts` guards the shape in source. This
 * file guards the **rendered tree**: what the DOM actually carries after each failure the
 * refresh can raise, and whether the control is offered when the page already knows it
 * would be refused. Source and DOM are different claims, and B2 needed both.
 */

/** Nothing measured, nothing to act on — the observation this block draws by default. */
const QUIET: AnswerObservation = {
  state: 'unchanged',
  changed: [],
  missing: [],
  unmeasured: [],
  added: [],
};

/**
 * An English sentence: three or more Latin words in a row.
 *
 * Two is a label (`Claude Code`, `Ontology Atlas`); three is prose nobody translated,
 * which is what B2 put on screen. The probe at the end of this file proves the detector
 * fires on the exact line the inspection captured.
 */
function englishSentences(text: string): string[] {
  return text.match(/(?:\b[A-Za-z][A-Za-z'-]*\b[ ,]+){2,}\b[A-Za-z][A-Za-z'-]*\b/g) ?? [];
}

function Harness({ error, historyBlocked, onRefresh }: {
  error: FailureCopy | null;
  historyBlocked?: boolean;
  onRefresh: (() => void) | null;
}) {
  const t = useTranslations('library');
  return (
    <RetainedAnswerContext
      observation={QUIET}
      phase="idle"
      historyState="none"
      older={false}
      onRefresh={onRefresh}
      historyBlocked={historyBlocked}
      error={error}
      t={t}
    />
  );
}

/** Renders the block with the real Korean catalogue behind it. */
function draw(props: Parameters<typeof Harness>[0]) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <Harness {...props} />
    </NextIntlClientProvider>,
  );
}

/**
 * Turns a thrown value into the copy the hook would hand this block, via the real lookup.
 *
 * The copy is read back off the DOM rather than out of a closure: assigning to a variable
 * declared outside a component during render is the side effect `react-hooks/globals`
 * refuses, and it is refused for a real reason — this probe renders once, but nothing in the
 * test says it must.
 */
function copyFor(thrown: unknown, fallback: string): FailureCopy {
  function Probe() {
    const copy = useFailureSentence()(thrown, fallback);
    return <i data-testid="failure-probe" data-sentence={copy.sentence} data-detail={copy.detail ?? ''} />;
  }
  const view = render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <Probe />
    </NextIntlClientProvider>,
  );
  const node = view.getByTestId('failure-probe');
  const copy: FailureCopy = {
    sentence: node.getAttribute('data-sentence') ?? '',
    detail: node.getAttribute('data-detail') || null,
  };
  view.unmount();
  return copy;
}

/* ------------------------------------------------------------------ *
 * Every failure the refresh can actually raise, collected by running it
 * ------------------------------------------------------------------ */

const SLUG = 'wiki/answers/original';
const SOURCE = 'sources/plan.md';
const HASH = 'a'.repeat(64);
const BODY = '## Summary\nSeptember\n## Facts\n- September. [[src:sources/plan.md#l1]]\n'
  + '## Decisions\n## Open questions\n- Approval?\n## Not in sources\n';

function pageText(frontmatter: string): string {
  return `---\ntitle: When?\ncreated_by: human\nsources: [${SOURCE}]\nsource_hash: {}\n`
    + `status: draft\nsummary: Date\ncompiled_at: 2026-09-10\n${frontmatter}---\n${BODY}`;
}

function fakeStore(text: string, hashes: Map<string, string>): AnswerRevisionStore {
  const files = new Map([[SLUG, text]]);
  return {
    read: vi.fn(async (key: string) => {
      const found = files.get(key);
      if (found === undefined) throw new Error('missing');
      return found;
    }),
    observe: vi.fn(async () => new Map(hashes)),
    create: vi.fn(async (key: string, body: string) => {
      if (files.has(key)) return false;
      files.set(key, body);
      return true;
    }),
  };
}

async function thrownBy(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected this to fail, and it did not');
}

/**
 * The fixture's own defect, reproduced: `answer_thread` that is not a `wiki/answers/…`
 * address. This is the exact path the inspection walked.
 */
const MALFORMED_THREAD = 'answer_thread: "dispute-records"\n';

/** The real Korean catalogue, read the way the screen reads it. */
const FAILURES: Record<string, string> = koMessages.failures;
const ANSWERS = koMessages.library.answers;

describe('the answer page speaks the reader\'s language when a refresh fails', () => {
  it.each([
    ['a malformed thread edge', MALFORMED_THREAD, 'answer-history-unreadable'],
  ])('%s renders the translated sentence and no English', async (_name, frontmatter, code) => {
    const thrown = await thrownBy(() =>
      prepareAnswerRefresh(fakeStore(pageText(frontmatter), new Map([[SOURCE, HASH]])), SLUG, [SOURCE]),
    );
    // The throw still carries the English fact for a developer — that is not the defect.
    expect((thrown as Error).message).toContain(code);

    const copy = copyFor(thrown, 'unused fallback');
    expect(copy.sentence).toBe(FAILURES[code]);

    draw({ error: copy, onRefresh: () => {} });
    const alert = screen.getByTestId('answer-refresh-error');
    expect(alert.textContent).toBe(copy.sentence);
    expect(
      englishSentences(alert.textContent ?? ''),
      'the page body is carrying a sentence nobody translated',
    ).toEqual([]);
    // The English is kept, where only somebody debugging looks for it.
    expect(alert.getAttribute('data-failure-detail')).toBeTruthy();
  });

  it('an unreadable original and an unmeasurable refresh each get their own sentence', async () => {
    const thrown = await thrownBy(() =>
      prepareAnswerRefresh(fakeStore(pageText(''), new Map()), SLUG, [SOURCE]),
    );
    const copy = copyFor(thrown, 'unused fallback');
    expect(copy.sentence).toBe(FAILURES['answer-sources-unmeasured']);
    // Two different failures must not collapse into one sentence, or the reader cannot act.
    expect(copy.sentence).not.toBe(FAILURES['answer-history-unreadable']);

    draw({ error: copy, onRefresh: () => {} });
    expect(englishSentences(screen.getByTestId('answer-refresh-error').textContent ?? '')).toEqual([]);
  });

  it('a colliding revision path says nothing was overwritten, in Korean', async () => {
    const store = fakeStore(pageText(''), new Map([[SOURCE, HASH]]));
    const snapshot = await prepareAnswerRefresh(store, SLUG, [SOURCE]);
    const page = buildAnswerRevision({
      ...snapshot, response: BODY, writer: 'agent:test', now: new Date(), knownSources: [SOURCE],
    });
    store.create = vi.fn(async () => false);
    const thrown = await thrownBy(() => saveAnswerRevision(store, snapshot, page));
    const copy = copyFor(thrown, 'unused fallback');
    expect(copy.sentence).toBe(FAILURES['answer-revision-exists']);
    draw({ error: copy, onRefresh: () => {} });
    expect(englishSentences(screen.getByTestId('answer-refresh-error').textContent ?? '')).toEqual([]);
  });

  it('an unrecognised failure falls back to this screen\'s own sentence, never the English', () => {
    const copy = copyFor(new Error('ENOSPC: no space left on device'), '갱신을 마치지 못했어요.');
    expect(copy.sentence).toBe('갱신을 마치지 못했어요.');
    draw({ error: copy, onRefresh: () => {} });
    expect(englishSentences(screen.getByTestId('answer-refresh-error').textContent ?? '')).toEqual([]);
  });

  it('probe: the sentence B2 actually printed is caught by this file\'s detector', () => {
    // Verbatim from capture `11-redraft-no-agent.png`.
    expect(englishSentences('The retained question or its history cannot be read.')).toHaveLength(1);
    // A product name beside Korean is not an untranslated sentence.
    expect(englishSentences('Claude Code 로 갱신 초안을 요청해요.')).toEqual([]);
    // And planting it as the rendered sentence really turns this red.
    draw({ error: { sentence: 'The retained question or its history cannot be read.', detail: null }, onRefresh: () => {} });
    expect(englishSentences(screen.getByTestId('answer-refresh-error').textContent ?? '')).toHaveLength(1);
  });
});

describe('a press the page knows would be refused is not offered', () => {
  it('offers the refresh when the thread edge reads cleanly', () => {
    draw({ error: null, onRefresh: () => {} });
    expect(screen.getByTestId('answer-refresh-start')).toBeEnabled();
    expect(screen.queryByTestId('answer-refresh-blocked-history')).toBeNull();
  });

  it('disables it and says why on the same row when the history cannot be read', () => {
    const onRefresh = vi.fn();
    draw({ error: null, historyBlocked: true, onRefresh });

    const button = screen.getByTestId('answer-refresh-start');
    expect(button).toBeDisabled();

    // The reason is on the row, not behind the `answers.evidenceMore` disclosure: a state that
    // changes what the page can do may not be hidden behind a press.
    const reason = screen.getByTestId('answer-refresh-blocked-history');
    expect(reason.textContent).toBe(ANSWERS.refreshBlockedHistory);
    // One wording for one fact: the index card's own words open the sentence.
    expect(reason.textContent).toContain(ANSWERS.version.unresolved);
    // And it is the sentence the control is described by, so a screen reader hears the
    // reason rather than the observation.
    expect(button.getAttribute('aria-describedby')).toBe('answer-refresh-blocked-history');
    expect(reason.id).toBe('answer-refresh-blocked-history');

    button.click();
    expect(onRefresh, 'a disabled control still ran its handler').not.toHaveBeenCalled();
  });

  it('says nothing in English while it refuses', () => {
    draw({ error: null, historyBlocked: true, onRefresh: () => {} });
    const reason = screen.getByTestId('answer-refresh-blocked-history').textContent ?? '';
    // `answer_thread` is a field name in the reader's own file — a name, not a sentence.
    expect(englishSentences(reason.replace(/answer_thread|wiki\/answers\//g, ''))).toEqual([]);
    expect(reason, 'the reader is not told which field to fix').toContain('answer_thread');
  });
});
