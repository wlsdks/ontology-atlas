import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroTypewriter, heroSentence, typingStepMs } from './HeroTypewriter';

/**
 * The hero typewriter — **what is locked here is the three ways it broke while being built**,
 * not the cadence numbers.
 *
 * A typing effect is easy to write and easy to write wrongly, and all three defects below shipped
 * green through typecheck and lint on the way here (2026-08-23). None of them is visible in a
 * diff; each needs the rendered DOM to see.
 */

const LINES = [{ text: 'Agents write the code.' }, { text: 'People accumulate the debt.' }];
const TOTAL = LINES.reduce((n, l) => n + [...l.text].length, 0);

function chars() {
  return [...document.querySelectorAll('.gateway-type-ch')];
}
function typedCount() {
  return chars().filter((c) => c.classList.contains('is-on')).length;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HeroTypewriter', () => {
  /**
   * **The reflow defect.** A typewriter that appends characters re-wraps its line on every
   * keystroke and the block below it walks up and down the page. The fix is that every character
   * is in the DOM from the first frame and only its ink changes — so what is asserted is that the
   * character count never changes, only how many are switched on.
   */
  it('lays out every character from the first frame, since appending would reflow the lines', () => {
    /*
     * ⚠️ **Assert the text, not the span count.** The first version of this test counted spans,
     * and the probe walked straight through it: an implementation that renders the span but
     * leaves it empty until typed keeps the count identical while the box collapses to zero —
     * which is the reflow this whole design exists to avoid. jsdom has no layout, so the text a
     * span carries is the honest proxy for the width it reserves.
     */
    render(<HeroTypewriter lines={LINES} start />);
    const sentence = LINES.map((l) => l.text).join('');
    const laidOut = () => chars().map((c) => c.textContent).join('');

    expect(typedCount()).toBe(0);
    expect(laidOut(), 'untyped characters hold no place, so each keystroke pushes the line').toBe(sentence);

    act(() => void vi.advanceTimersByTime(typingStepMs(TOTAL) * 5));
    expect(laidOut(), 'the laid-out text changed while typing').toBe(sentence);
    expect(typedCount()).toBeGreaterThan(0);
    expect(typedCount()).toBeLessThan(TOTAL);

    act(() => void vi.advanceTimersByTime(typingStepMs(TOTAL) * TOTAL));
    expect(laidOut()).toBe(sentence);
    expect(typedCount()).toBe(TOTAL);
  });

  /**
   * **The caret-gap defect.** The caret rides the first character that has *not* been typed. The
   * first version skipped whitespace, so every time the caret crossed a word boundary it blinked
   * out of existence for one tick — visible as a stutter, invisible in the code.
   */
  it('keeps the caret visible between words', () => {
    render(<HeroTypewriter lines={LINES} start />);
    const step = typingStepMs(TOTAL);
    const gaps: number[] = [];
    for (let i = 0; i < TOTAL - 1; i += 1) {
      act(() => void vi.advanceTimersByTime(step));
      if (chars().filter((c) => c.classList.contains('is-cursor')).length !== 1) gaps.push(i);
    }
    expect(gaps, `caret missing at character positions ${gaps.join(',')}`).toEqual([]);
  });

  /**
   * **The doubled-sentence defect.** The first version put a visually-hidden copy of the sentence
   * beside the split characters so assistive tech had something to read, which meant
   * `h1.innerText` returned the headline twice. The accessible name now comes from `aria-label`
   * built by `heroSentence`, and the characters are `aria-hidden`.
   */
  it('puts the sentence in the DOM once', () => {
    const { container } = render(<HeroTypewriter lines={LINES} start />);
    act(() => void vi.advanceTimersByTime(typingStepMs(TOTAL) * TOTAL));
    const text = container.textContent ?? '';
    const first = LINES[0].text;
    expect(text.split(first).length - 1, 'the first line appears twice in the DOM').toBe(1);
    expect(text).toContain(LINES[1].text);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('groups characters into words, since a box per character breaks lines between syllables', () => {
    const { container } = render(<HeroTypewriter lines={LINES} start />);
    const words = container.querySelectorAll('.gateway-type-word');
    // "Agents write the code." → 4 words, "People accumulate the debt." → 4
    expect(words.length).toBe(8);
    for (const word of words) {
      expect(word.textContent ?? '').not.toMatch(/\s/);
    }
  });

  it('types nothing before start, so the eyebrow comes first', () => {
    render(<HeroTypewriter lines={LINES} start={false} />);
    act(() => void vi.advanceTimersByTime(3000));
    expect(typedCount()).toBe(0);
  });

  /**
   * Reduced motion is not "no headline" — it is the finished headline, immediately. The whole
   * sentence must be readable without a single timer tick, and no caret should be drawn.
   */
  it('shows the whole sentence at once with no caret under reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    render(<HeroTypewriter lines={LINES} start />);
    expect(typedCount(), 'the title is hidden under reduced motion').toBe(TOTAL);
    expect(chars().filter((c) => c.classList.contains('is-cursor'))).toHaveLength(0);
  });

  /**
   * The cadence is capped by **total** time, not per character, because English spells this
   * sentence with roughly twice the characters Korean does. Without the cap the English visitor
   * waits twice as long for the same thought.
   */
  it('shortens the per-character time for longer sentences under a total-time cap', () => {
    const shortStep = typingStepMs(10);
    const longStep = typingStepMs(200);
    expect(longStep).toBeLessThan(shortStep);
    expect(10 * shortStep).toBeLessThanOrEqual(1800);
    expect(200 * longStep).toBeLessThanOrEqual(1800);
  });

  /**
   * The hero object lights a dot per typed character (Direction B, 2026-08-30), so the count it
   * hears must be the count on screen: reported after the characters paint, never ahead of them,
   * and complete from the first report under reduced motion.
   */
  it('reports every typed count after it is on screen, ending on the total', () => {
    const heard: [number, number][] = [];
    render(<HeroTypewriter lines={LINES} start onProgress={(typed, total) => heard.push([typed, total])} />);
    expect(heard[0]).toEqual([0, TOTAL]);
    act(() => void vi.advanceTimersByTime(typingStepMs(TOTAL) * 3 + 1));
    expect(heard.at(-1)).toEqual([3, TOTAL]);
    expect(typedCount()).toBe(3);
    act(() => void vi.advanceTimersByTime(5000));
    expect(heard.at(-1)).toEqual([TOTAL, TOTAL]);
    for (let i = 1; i < heard.length; i += 1) expect(heard[i][0]).toBeGreaterThan(heard[i - 1][0]);
  });

  /**
   * **The late-tick defect** (2026-09-25). A typewriter that admits one character per timer
   * callback is paced by the main thread, not the clock: on a 4× throttled CPU the Korean headline
   * took 5.0s against its 1.8s budget. Here the clock jumps ten steps while no callback runs, then
   * one callback arrives — it must show what the clock has earned, and only its newest character
   * lands; the ones it caught up appear settled.
   */
  it('a late tick shows every character the clock has earned, and only the newest lands', () => {
    render(<HeroTypewriter lines={LINES} start />);
    const step = typingStepMs(TOTAL);
    vi.setSystemTime(Date.now() + step * 10);
    act(() => void vi.advanceTimersByTime(step / 2));
    const on = chars().filter((c) => c.classList.contains('is-on'));
    expect(on.length, 'one late tick admitted one character, not what the clock earned').toBeGreaterThanOrEqual(10);
    const landing = on.filter((c) => c.classList.contains('gateway-type-land'));
    expect(landing, 'several characters landed at once').toHaveLength(1);
    expect(landing[0]).toBe(on.at(-1));
  });

  it('under reduced motion the first report is already the whole sentence', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    const heard: [number, number][] = [];
    render(<HeroTypewriter lines={LINES} start onProgress={(typed, total) => heard.push([typed, total])} />);
    expect(heard).toEqual([[TOTAL, TOTAL]]);
  });

  it('joins the two lines into one sentence in heroSentence', () => {
    expect(heroSentence(LINES)).toBe('Agents write the code. People accumulate the debt.');
  });

  it('rebuilds the original sentence from the lit characters with no character or space lost', () => {
    const { container } = render(<HeroTypewriter lines={LINES} start />);
    act(() => void vi.advanceTimersByTime(5000));
    expect(typedCount()).toBe(TOTAL);
    const painted = chars()
      .filter((c) => c.classList.contains('is-on'))
      .map((c) => c.textContent)
      .join('');
    expect(painted).toBe(LINES.map((l) => l.text).join(''));
    expect(container.querySelectorAll('.gateway-type-line')).toHaveLength(2);
  });
});
