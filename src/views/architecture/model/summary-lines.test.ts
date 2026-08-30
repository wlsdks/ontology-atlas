import { describe, expect, it } from 'vitest';

import { splitSummaryLines } from './summary-lines';

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
