import { describe, expect, it } from 'vitest';

import {
  balanceLinesByWidthAt,
  captionLineBudgets,
  captionLineRoom,
  estimateCaptionWidth,
  estimateTextWidthAt,
  splitLinesByWidthAt,
  splitSummaryLines,
  splitSummaryLinesByWidth,
} from './summary-lines';

/*
 * The seven sentences the dogfood profile declares, measured 2026-08-30: 91, 121, 79, 89, 108,
 * 87 and 111 characters, every first clause 51 or fewer. One 34-character line cut all seven
 * before the clause carried meaning; two lines of 34 carry every first clause.
 */
const ROUTING =
  'Locale-prefixed Next entry wrappers. They name a page and hand off; no logic lives here.';
const APP =
  'Providers and start-up wiring the whole app shares: theme, i18n, and the stores a page assumes are already running.';
const SHARED =
  'Primitives everything may use: design tokens, UI parts, pure helpers, and types. It depends on nothing here.';

describe('splitSummaryLines', () => {
  it('wraps on word boundaries and never exceeds the budget on any line', () => {
    const lines = splitSummaryLines(ROUTING, 34, 2);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(35);
    expect(lines[0]).toBe('Locale-prefixed Next entry');
    expect(lines[1].startsWith('wrappers. They name a page')).toBe(true);
  });

  it('ellipsizes only the last line, and only when something was left out', () => {
    expect(splitSummaryLines(APP, 34, 2).at(-1)?.endsWith('…')).toBe(true);
    expect(splitSummaryLines('Short.', 34, 2)).toEqual(['Short.']);
    /* Exactly fills two lines: nothing left, so nothing is cut. */
    const exact = 'one two three four five six seven eight nine ten eleven twelve';
    const lines = splitSummaryLines(exact, 34, 2);
    expect(lines.join(' ')).toBe(exact);
    expect(lines.at(-1)?.endsWith('…')).toBe(false);
  });

  it('carries the first clause of every dogfood sentence within two lines', () => {
    for (const sentence of [ROUTING, APP, SHARED]) {
      const clause = sentence.slice(0, sentence.search(/[.:;]/) + 1);
      expect(splitSummaryLines(sentence, 34, 2).join(' ')).toContain(clause);
    }
  });

  it('hard-cuts a single word longer than the budget instead of overflowing', () => {
    const lines = splitSummaryLines('Supercalifragilisticexpialidocious-and-then-some words', 10, 2);
    expect(lines[0]).toHaveLength(10);
    expect(lines).toHaveLength(2);
  });

  it('collapses to one line when asked for one, matching the old single-line cut', () => {
    const [only] = splitSummaryLines(ROUTING, 34, 1);
    expect(only.endsWith('…')).toBe(true);
    expect(only.length).toBeLessThanOrEqual(35);
  });
});

/*
 * ⚠️ **The box tells the sentence how much room each line has** (owner, 2026-08-30, pointing at
 * the Adapters pill: text running past its box, which must never happen). A fixed 34-character budget was
 * measured on the 180px receipt box and never on the 148px one, and a stadium's rounded caps make
 * its second line narrower than its first. Budgets come from geometry now, per line.
 */
describe('captionLineBudgets', () => {
  it('gives a rectangle the same budget on both lines, from its width', () => {
    const budgets = captionLineBudgets({ boxW: 180, boxH: 82, shape: 'process', baselines: [36, 50] });
    expect(budgets).toHaveLength(2);
    expect(budgets[0]).toBe(budgets[1]);
    /* 156px of usable width at the cross-platform 4.8px caption-glyph bound. */
    expect(budgets[0]).toBe(32);
  });

  it('narrows a stadium line by the cap chord at that line, so the lower line gets less', () => {
    const budgets = captionLineBudgets({ boxW: 148, boxH: 72, shape: 'terminator', baselines: [40, 54] });
    expect(budgets[1]).toBeLessThan(budgets[0]);
    expect(budgets[0]).toBeLessThanOrEqual(26);
    expect(budgets[1]).toBeLessThanOrEqual(23);
  });

  it('never returns a budget below a readable minimum, and never above the rectangle budget', () => {
    const tiny = captionLineBudgets({ boxW: 60, boxH: 60, shape: 'terminator', baselines: [30, 44] });
    for (const b of tiny) expect(b).toBeGreaterThanOrEqual(8);
    const wide = captionLineBudgets({ boxW: 400, boxH: 40, shape: 'terminator', baselines: [20, 34] });
    expect(Math.max(...wide)).toBeLessThanOrEqual(Math.floor((400 - 24) / 4.8));
  });
});

describe('splitSummaryLines with per-line budgets', () => {
  it('honours a shorter budget on the second line', () => {
    const lines = splitSummaryLines(ROUTING, [26, 23], 2);
    expect(lines[0].length).toBeLessThanOrEqual(26);
    expect(lines[1].length).toBeLessThanOrEqual(24); /* 23 + the ellipsis */
  });
});

describe('splitSummaryLinesByWidth', () => {
  /* Owner, 2026-09-03: the first Korean role sentences ran past both outlines of a 280px face,
     because the character budget assumed a 4.8px Latin glyph and a Hangul glyph is about 8px. */
  it('keeps every Korean line inside the face by estimated width', () => {
    const room = captionLineRoom(280);
    const sentence = '로케일이 붙은 Next 진입 래퍼로, 페이지를 지정해 넘길 뿐 로직은 여기 두지 않습니다.';
    const lines = splitSummaryLinesByWidth(sentence, room, 2);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const line of lines) expect(estimateCaptionWidth(line)).toBeLessThanOrEqual(room);
    /* Nothing was dropped silently: either the whole sentence is there or the cut is stated. */
    const joined = lines.join(' ');
    expect(joined === sentence || joined.endsWith('…')).toBe(true);
  });

  it('gives a Latin sentence the same lines the character budget gave it', () => {
    const sentence = 'Locale-prefixed Next entry wrappers. They name a page and hand off; no logic lives here.';
    const byWidth = splitSummaryLinesByWidth(sentence, captionLineRoom(280), 2);
    for (const line of byWidth) expect(estimateCaptionWidth(line)).toBeLessThanOrEqual(captionLineRoom(280));
    expect(byWidth.join(' ').replace('…', '')).toContain('Locale-prefixed Next entry wrappers.');
  });

  it('cuts a single word wider than the room by width instead of overflowing', () => {
    const [line] = splitSummaryLinesByWidth('가나다라마바사아자차카타파하가나다라마바사아자차카타파하', 60, 1);
    expect(estimateCaptionWidth(line)).toBeLessThanOrEqual(60);
    expect(line.endsWith('…')).toBe(true);
  });
});

describe('splitLinesByWidthAt', () => {
  /* The architecture canvas's empty observation column sets its sentence at the label step (11px),
     not the caption step the estimates were measured at, so the room is read at that size. */
  it('scales the caption estimate linearly with the type size', () => {
    const text = '소스 검사 import';
    expect(estimateTextWidthAt(text, 9.5)).toBeCloseTo(estimateCaptionWidth(text));
    expect(estimateTextWidthAt(text, 19)).toBeCloseTo(estimateCaptionWidth(text) * 2);
  });

  it('keeps every line inside the room at the larger size, and drops nothing silently', () => {
    const sentence =
      '「소스 검사」를 하면 에이전트가 코드의 실제 import를 읽어, 역할마다 관찰한 의존과 차이를 여기에 채워요.';
    const lines = splitLinesByWidthAt(sentence, 200, 4, 11);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(estimateTextWidthAt(line, 11)).toBeLessThanOrEqual(200);
    expect(lines.join(' ')).toBe(sentence);
  });

  it('wraps a larger size onto more lines than the caption would need', () => {
    const sentence = 'Inspect source has an agent read the real imports and fill this column in for each role.';
    const caption = splitSummaryLinesByWidth(sentence, 200, 6);
    const label = splitLinesByWidthAt(sentence, 200, 6, 11);
    expect(label.length).toBeGreaterThanOrEqual(caption.length);
    for (const line of label) expect(estimateTextWidthAt(line, 11)).toBeLessThanOrEqual(200);
  });
});

describe('balanceLinesByWidthAt', () => {
  /* Measured 2026-09-26: the greedy wrap of the empty column's English sentence left "differs."
     alone on its last line at 1512 and at 1040. */
  const SENTENCE =
    '“Inspect source” has an agent read the real imports and fill in, for each role, what it depends on and where that differs.';

  it('keeps the greedy line count and leaves no lone word on the last line', () => {
    const greedy = splitLinesByWidthAt(SENTENCE, 320, 5, 11);
    const balanced = balanceLinesByWidthAt(SENTENCE, 320, 5, 11);
    expect(greedy.at(-1)).toBe('differs.');
    expect(balanced).toHaveLength(greedy.length);
    expect(balanced.at(-1)?.split(' ').length).toBeGreaterThan(1);
    expect(balanced.join(' ')).toBe(SENTENCE);
    for (const line of balanced) expect(estimateTextWidthAt(line, 11)).toBeLessThanOrEqual(320);
  });

  it('evens the lines out: the widest balanced line is no wider than the widest greedy one', () => {
    const widest = (lines: readonly string[]) => Math.max(...lines.map((line) => estimateTextWidthAt(line, 11)));
    expect(widest(balanceLinesByWidthAt(SENTENCE, 320, 5, 11))).toBeLessThanOrEqual(
      widest(splitLinesByWidthAt(SENTENCE, 320, 5, 11)),
    );
  });

  it('prefers a clause break when it costs only a few pixels of measure', () => {
    const korean =
      '「소스 검사」를 하면 에이전트가 실제 import를 읽어, 역할마다 관찰한 의존과 차이를 여기에 채워요.';
    expect(balanceLinesByWidthAt(korean, 320, 5, 11)).toEqual([
      '「소스 검사」를 하면 에이전트가 실제 import를 읽어,',
      '역할마다 관찰한 의존과 차이를 여기에 채워요.',
    ]);
  });

  it('returns a one-line or ellipsized wrap untouched', () => {
    expect(balanceLinesByWidthAt('Short.', 320, 5, 11)).toEqual(['Short.']);
    const cut = splitLinesByWidthAt(SENTENCE, 120, 2, 11);
    expect(cut.at(-1)?.endsWith('…')).toBe(true);
    expect(balanceLinesByWidthAt(SENTENCE, 120, 2, 11)).toEqual(cut);
  });
});
