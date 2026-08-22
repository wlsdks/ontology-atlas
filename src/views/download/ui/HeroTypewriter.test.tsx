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
  it('모든 글자가 첫 프레임부터 제 글자를 들고 있다 — 덧붙이면 줄바꿈이 다시 계산된다', () => {
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
    expect(laidOut(), '아직 안 쳐진 글자가 자리를 안 잡고 있다 — 쳐질 때마다 줄이 밀린다').toBe(sentence);

    act(() => void vi.advanceTimersByTime(typingStepMs(TOTAL) * 5));
    expect(laidOut(), '타이핑 중에 차지한 자리가 달라졌다').toBe(sentence);
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
  it('커서가 낱말 사이에서 사라지지 않는다', () => {
    render(<HeroTypewriter lines={LINES} start />);
    const step = typingStepMs(TOTAL);
    const gaps: number[] = [];
    for (let i = 0; i < TOTAL - 1; i += 1) {
      act(() => void vi.advanceTimersByTime(step));
      if (chars().filter((c) => c.classList.contains('is-cursor')).length !== 1) gaps.push(i);
    }
    expect(gaps, `커서가 없는 순간이 있다 (글자 위치 ${gaps.join(',')})`).toEqual([]);
  });

  /**
   * **The doubled-sentence defect.** The first version put a visually-hidden copy of the sentence
   * beside the split characters so assistive tech had something to read, which meant
   * `h1.innerText` returned the headline twice. The accessible name now comes from `aria-label`
   * built by `heroSentence`, and the characters are `aria-hidden`.
   */
  it('문장이 DOM 에 한 번만 있다', () => {
    const { container } = render(<HeroTypewriter lines={LINES} start />);
    act(() => void vi.advanceTimersByTime(typingStepMs(TOTAL) * TOTAL));
    const text = container.textContent ?? '';
    const first = LINES[0].text;
    expect(text.split(first).length - 1, '첫 줄이 DOM 에 두 번 있다').toBe(1);
    expect(text).toContain(LINES[1].text);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('글자는 낱말로 묶인다 — 글자마다 상자를 주면 음절 사이에서 줄이 끊긴다', () => {
    const { container } = render(<HeroTypewriter lines={LINES} start />);
    const words = container.querySelectorAll('.gateway-type-word');
    // "Agents write the code." → 4 words, "People accumulate the debt." → 4
    expect(words.length).toBe(8);
    for (const word of words) {
      expect(word.textContent ?? '').not.toMatch(/\s/);
    }
  });

  it('start 전에는 한 글자도 안 쳐진다 — 눈썹이 먼저 온다', () => {
    render(<HeroTypewriter lines={LINES} start={false} />);
    act(() => void vi.advanceTimersByTime(3000));
    expect(typedCount()).toBe(0);
  });

  /**
   * Reduced motion is not "no headline" — it is the finished headline, immediately. The whole
   * sentence must be readable without a single timer tick, and no caret should be drawn.
   */
  it('모션을 줄인 사용자는 기다리지 않는다 — 문장이 즉시 다 있고 커서는 없다', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    render(<HeroTypewriter lines={LINES} start />);
    expect(typedCount(), '모션을 줄이면 제목이 안 보인다').toBe(TOTAL);
    expect(chars().filter((c) => c.classList.contains('is-cursor'))).toHaveLength(0);
  });

  /**
   * The cadence is capped by **total** time, not per character, because English spells this
   * sentence with roughly twice the characters Korean does. Without the cap the English visitor
   * waits twice as long for the same thought.
   */
  it('긴 문장일수록 글자당 시간이 짧아진다 — 총 시간이 상한이다', () => {
    const shortStep = typingStepMs(10);
    const longStep = typingStepMs(200);
    expect(longStep).toBeLessThan(shortStep);
    expect(10 * shortStep).toBeLessThanOrEqual(1800);
    expect(200 * longStep).toBeLessThanOrEqual(1800);
  });

  it('heroSentence 는 두 줄을 한 문장으로 잇는다', () => {
    expect(heroSentence(LINES)).toBe('Agents write the code. People accumulate the debt.');
  });

  it('켜진 글자를 이어 붙이면 원래 문장이 된다 — 글자·공백이 하나도 안 샜다', () => {
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
