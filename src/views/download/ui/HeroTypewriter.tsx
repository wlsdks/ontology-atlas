'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { cn } from '@/shared/lib/cn';

/**
 * The hero headline, typed one character at a time with a caret that advances.
 *
 * Owner call 2026-08-23, after being shown the alternative and the cost: *"real typewriter"* — a real
 * typewriter, the device `buzz.xyz` uses, not a per-character fade. What follows is that device
 * with its two measured failure modes engineered out rather than shipped.
 *
 * ## Failure mode ①: the main claim is unreadable while it types
 *
 * Buzz types its rotating tagline at a measured **~200ms per character** (sampled 2026-08-23 from
 * the live page). That is right for a line whose job is to be watched on a loop. Applied to this
 * headline it is not: 30 Korean characters would hold the page's one claim hostage for six
 * seconds, and the English copy is **59 characters** — nearly twice as long for the same sentence.
 *
 * So the cadence is ours, not theirs, and it is bounded from both ends:
 *
 * - `CADENCE_MS` is the resting speed — fast enough to still read as typing (26 characters per
 *   second is plainly sequential to the eye), slow enough not to look like a flicker.
 * - `BUDGET_MS` caps the **total**, which is what actually matters to a reader. Without it the
 *   English headline would run 2.24s purely because English spells the same thought with more
 *   letters. With it, per-character time shortens as the sentence lengthens and no locale waits
 *   longer than the budget. Measured here: Korean 30 chars → 38ms each, 1.14s; English 59 chars →
 *   30ms each, 1.80s.
 *
 * **This is a cadence, not a transition duration**, which is why it is a number here rather than a
 * `--motion-*` ramp token. The ramp answers "how long does one thing take to move" (120/180/240);
 * nothing here moves — characters switch on. The neighbouring agent scene already sets the
 * precedent, driving its line rhythm from a JS timer for the same reason
 * (`.gateway-term-line`: *"the typewriter rhythm is created by a JS timer"*).
 *
 * ## Failure mode ②: the text jumps while it types
 *
 * A typewriter that *appends* characters re-wraps its line on every keystroke, so the whole block
 * shifts as it grows. Buzz does not hit this because its typed line is short and single-line.
 *
 * Here every character is in the DOM and **at its final position from the first frame** — typing
 * only switches ink on. The line box, the wrap points, and the block's height are therefore fixed
 * before the first character appears, and nothing below the headline moves. This is also why the
 * caret can be drawn as a pseudo-element on the next un-typed character instead of being an
 * element that has to be measured and moved.
 *
 * ## Line breaking
 *
 * Characters are grouped into words, and it is the **word** that is `nowrap`, never the character.
 * Splitting a Korean sentence into free-standing per-character boxes would let the browser break
 * between any two syllables and would quietly defeat the `break-keep` contract this repository
 * gates elsewhere (`tests/e2e/korean-word-break.spec.ts`).
 *
 * ## What a screen reader gets
 *
 * The sentence, once, as the heading's accessible name via `aria-label`, with every visible
 * character `aria-hidden` — a heading built from 59 one-character elements is a heading some
 * assistive tech spells out letter by letter.
 *
 * ⚠️ **Not a visually-hidden copy of the sentence.** That was the first attempt and it put the
 * sentence in the DOM twice: `h1.innerText` came back as the headline followed by the headline
 * again (measured 2026-08-23). Anything reading the heading as text — a test, a scraper, an
 * og-image renderer — would have seen it doubled. `heroSentence()` is exported so the label and
 * the characters are built from one call on one argument and cannot drift apart.
 */

/** Resting speed, ms per character. */
const CADENCE_MS = 38;
/** Ceiling on the whole headline, ms — a longer sentence types faster, it does not take longer. */
const BUDGET_MS = 1800;

export interface HeroTypewriterLine {
  text: string;
  /** Ink for this line — the two lines sit one step apart, which is the sentence's hierarchy. */
  className?: string;
}

/** ms between characters for a line of this length under the given total budget. */
export function typingStepMs(totalChars: number, budgetMs: number = BUDGET_MS): number {
  if (totalChars <= 0) return CADENCE_MS;
  return Math.min(CADENCE_MS, budgetMs / totalChars);
}

/**
 * Splits a line into words plus the whitespace between them, preserving both. The whitespace is
 * kept as its own entry so `textContent` still equals the original sentence — several tests read
 * the headline that way, and a lost space would be invisible here and wrong there.
 */
function toWords(text: string): { value: string; isSpace: boolean }[] {
  return text.split(/(\s+)/).filter(Boolean).map((value) => ({ value, isSpace: /^\s+$/.test(value) }));
}

/** Characters, not UTF-16 units — a count that splits a surrogate pair renumbers everything after it. */
function charLength(text: string): number {
  return [...text].length;
}

/** The sentence as one line of text — the heading's accessible name. */
export function heroSentence(lines: readonly HeroTypewriterLine[]): string {
  return lines.map((line) => line.text).join(' ');
}

export function HeroTypewriter({
  lines,
  start,
  className,
  budgetMs = BUDGET_MS,
  onProgress,
}: {
  lines: readonly HeroTypewriterLine[];
  /** Typing begins when this turns true. Measured 2026-09-02: the headline starts 533ms before
      the eyebrow rises — the attention winner moves first; the eyebrow follows it. */
  start: boolean;
  className?: string;
  /**
   * Every change of the typed count, as `(typed, total)`, after the characters are on screen.
   * The hero object listens: a dot lights for a character only once the character is visible,
   * so the echo never runs ahead of its cause. Reported once as `(total, total)` under reduced
   * motion, where the sentence is complete from the first frame.
   */
  onProgress?: (typed: number, total: number) => void;
  /**
   * Ceiling on the whole run. The hero's 1.8s default suits a two-line headline; a shorter line
   * inside a choreography (the agent scene's tool call) passes its own so the next beat is not
   * kept waiting.
   */
  budgetMs?: number;
}) {
  const reduced = usePrefersReducedMotion();
  /**
   * How many characters are on, plus the ones that came on **without a landing**: every character
   * but the newest of a catch-up (the typing effect below). They missed their moment on a late
   * tick, so they appear already settled and only the newest one lands — one keystroke landing at
   * a time, as on a healthy frame rate.
   */
  const [progress, setProgress] = useState<{ typed: number; settled: ReadonlySet<number> }>(
    () => ({ typed: 0, settled: new Set() }),
  );

  /**
   * The characters with their absolute position across both lines, computed once per sentence.
   * Keyed on the sentence rather than the array, because the caller builds a fresh array literal
   * on every render and a memo on the array would never hit.
   */
  const sentence = heroSentence(lines);
  const model = useMemo(() => {
    /*
     * Offsets are scanned, not counted. A `let` advanced with `i++` while building this would be
     * a variable reassigned after render completes — React's lint rule flags it, and it is right
     * to: a re-render that resumes from a stale counter renumbers every character after the point
     * it resumed. The sentence is two lines, so the quadratic scan is free.
     */
    const lineOffsets = lines.map((_, i) =>
      lines.slice(0, i).reduce((n, line) => n + charLength(line.text), 0),
    );
    const built = lines.map((line, lineIndex) => {
      const words = toWords(line.text);
      const wordOffsets = words.map((_, i) =>
        words.slice(0, i).reduce((n, word) => n + charLength(word.value), 0),
      );
      return {
        className: line.className,
        parts: words.map((word, wordIndex) => {
          const at = lineOffsets[lineIndex] + wordOffsets[wordIndex];
          if (word.isSpace) return { isSpace: true as const, value: word.value, at };
          return {
            isSpace: false as const,
            chars: [...word.value].map((char, i) => ({ char, at: at + i })),
          };
        }),
      };
    });
    return { lines: built, total: lines.reduce((n, line) => n + charLength(line.text), 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sentence` is the identity of `lines`
  }, [sentence]);

  const { total } = model;

  /**
   * Reduced motion is **derived, not set**. Jumping to the end with a `setState` inside the
   * effect body is a cascading render, and needlessly: whether the sentence is complete is a
   * pure function of a preference that is already known while rendering.
   */
  const typed = reduced ? total : progress.typed;

  /*
   * A **layout** effect, so the echo lands in the same frame as the characters (2026-09-25). The
   * listener sets state, and a state update from a layout effect renders synchronously, so the
   * hero object's own layout effect lights its dots before the browser paints. With a passive
   * effect the dots trailed the headline by a render; that was one keystroke while the timer
   * could only admit one character per tick, and became a whole catch-up once a late tick shows
   * every character the clock has earned (the typing effect below).
   */
  useLayoutEffect(() => {
    onProgress?.(typed, total);
  }, [onProgress, typed, total]);

  /*
   * **The count is a function of the wall clock, not of how many callbacks arrived** (2026-09-25).
   * Each tick shows every character the elapsed time has earned, so the headline finishes at its
   * budget whatever the frame rate. Two earlier versions counted callbacks instead: the first added
   * one character per tick at the full step, the second polled at half the step but still admitted
   * only one character per tick. Both are the same defect on a slow machine — when the main thread
   * delivers a callback every ~110ms (4× CPU throttle, the hero canvas drawing beside it), a
   * one-per-tick typewriter types the 31-character Korean headline in 5.0s against a 1.8s budget,
   * and CI measured 1.9–2.9s. A person on that machine reads a sentence that is still typing.
   *
   * On a healthy frame rate nothing changes: the timer polls at half the step, so the clock earns
   * at most one character between ticks and the sentence still types one keystroke at a time. A
   * catch-up of several characters only happens on a tick that arrived late, where the only
   * alternative is to be late for the rest of the sentence. In a catch-up only the newest
   * character lands; the ones before it appear settled (`progress.settled`). Several landing
   * together would stack their weight landings, and each landing glyph is narrower than at rest,
   * so the line would narrow while it types (`download-gateway-grid.spec.ts`, "does not wander").
   *
   * `Date.now()` rather than `performance.now()` because it is the clock the tests' fake timers
   * drive.
   */
  useEffect(() => {
    if (!start || reduced) return;
    const step = typingStepMs(total, budgetMs);
    const startedAt = Date.now();
    let shown = 0;
    const id = window.setInterval(() => {
      // Rounded, not floored: the clock is whole milliseconds and the step is not, so the nth
      // step lands a fraction short of n steps and a floor would show one character fewer.
      const earned = Math.min(total, Math.round((Date.now() - startedAt) / step));
      if (earned <= shown) return;
      const from = shown;
      shown = earned;
      setProgress((prev) => {
        if (earned - from < 2) return { typed: earned, settled: prev.settled };
        const settled = new Set(prev.settled);
        for (let at = from; at < earned - 1; at += 1) settled.add(at);
        return { typed: earned, settled };
      });
      if (shown >= total) window.clearInterval(id);
    }, step / 2);
    return () => window.clearInterval(id);
  }, [start, reduced, total, budgetMs]);

  // The caret rides the first un-typed character, spaces included — skipping spaces would blink it
  // out of existence for one tick every time it crossed a word boundary (measured 2026-08-23).
  const cursorAt = (at: number) => typed === at && start && !reduced;
  const chClass = (at: number) =>
    cn(
      'gateway-type-ch',
      typed > at && 'is-on',
      typed > at && !progress.settled.has(at) && 'gateway-type-land',
      cursorAt(at) && 'is-cursor',
    );

  return (
    <span className={className} aria-hidden="true">
      {model.lines.map((line, lineIndex) => (
        <span key={lineIndex} className={cn('gateway-type-line', line.className)}>
          {line.parts.map((part, partIndex) =>
            part.isSpace ? (
              <span key={`s${partIndex}`} className={chClass(part.at)}>
                {part.value}
              </span>
            ) : (
              <span key={`w${partIndex}`} className="gateway-type-word">
                {part.chars.map(({ char, at }) => (
                  <span key={at} className={chClass(at)}>
                    {char}
                  </span>
                ))}
              </span>
            ),
          )}
        </span>
      ))}
    </span>
  );
}
