import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroTypewriter, heroSentence, typingStepMs } from './HeroTypewriter';

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
  it('lays out every character from the first frame, since appending would reflow the lines', () => {
    /* Text, not span count: jsdom has no layout, and an empty span keeps the count but no width. */
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

  it('shows the whole sentence at once with no caret under reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    render(<HeroTypewriter lines={LINES} start />);
    expect(typedCount(), 'the title is hidden under reduced motion').toBe(TOTAL);
    expect(chars().filter((c) => c.classList.contains('is-cursor'))).toHaveLength(0);
  });

  it('shortens the per-character time for longer sentences under a total-time cap', () => {
    const shortStep = typingStepMs(10);
    const longStep = typingStepMs(200);
    expect(longStep).toBeLessThan(shortStep);
    expect(10 * shortStep).toBeLessThanOrEqual(1800);
    expect(200 * longStep).toBeLessThanOrEqual(1800);
  });

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
