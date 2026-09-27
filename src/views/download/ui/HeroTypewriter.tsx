'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { cn } from '@/shared/lib/cn';

/**
 * The hero headline typed one character at a time. Every character is laid out from the first
 * frame and typing only switches ink on, or each keystroke reflows the block. Words, not
 * characters, are `nowrap`, or Korean breaks between syllables (`tests/e2e/korean-word-break.spec.ts`).
 * The name is one `aria-label` from `heroSentence()`; a hidden copy doubled `h1.innerText`.
 */

/** 26 characters a second still reads as typing, not flicker; a cadence, so not a `--motion-*` token. */
const CADENCE_MS = 38;
/** A longer sentence types faster instead of taking longer. */
const BUDGET_MS = 1800;

export interface HeroTypewriterLine {
  text: string;
  /** The two lines sit one ink step apart. */
  className?: string;
}

export function typingStepMs(totalChars: number, budgetMs: number = BUDGET_MS): number {
  if (totalChars <= 0) return CADENCE_MS;
  return Math.min(CADENCE_MS, budgetMs / totalChars);
}

/** Keeps whitespace as entries so `textContent` still equals the sentence tests read. */
function toWords(text: string): { value: string; isSpace: boolean }[] {
  return text.split(/(\s+)/).filter(Boolean).map((value) => ({ value, isSpace: /^\s+$/.test(value) }));
}

/** Code points, or a split surrogate pair renumbers everything after it. */
function charLength(text: string): number {
  return [...text].length;
}

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
  start: boolean;
  className?: string;
  /** Reported after the characters paint, so the echo never runs ahead of its cause. */
  onProgress?: (typed: number, total: number) => void;
  budgetMs?: number;
}) {
  const reduced = usePrefersReducedMotion();
  /** `settled`: characters caught up on a late tick, which appear without a landing. */
  const [progress, setProgress] = useState<{ typed: number; settled: ReadonlySet<number> }>(
    () => ({ typed: 0, settled: new Set() }),
  );

  /** Memoised on the sentence: the caller passes a fresh array every render. */
  const sentence = heroSentence(lines);
  const model = useMemo(() => {
    /* Scanned, not a mutated counter React's lint rejects; quadratic over two lines is free. */
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

  /** Derived, not set in an effect, which would cascade a render. */
  const typed = reduced ? total : progress.typed;

  /* A layout effect, so the hero's dots light before the browser paints these characters. */
  useLayoutEffect(() => {
    onProgress?.(typed, total);
  }, [onProgress, typed, total]);

  /*
   * The count follows the wall clock, not the number of callbacks, so a throttled main thread
   * still finishes on budget. Only a catch-up's newest character lands, or stacked landings narrow
   * the line (`download-gateway-grid.spec.ts`). `Date.now()` is what the fake timers drive.
   */
  useEffect(() => {
    if (!start || reduced) return;
    const step = typingStepMs(total, budgetMs);
    const startedAt = Date.now();
    let shown = 0;
    const id = window.setInterval(() => {
      // Rounded: whole-millisecond clocks land a fraction short of n fractional steps.
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

  // Spaces included, or the caret vanishes for a tick at each word boundary.
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
