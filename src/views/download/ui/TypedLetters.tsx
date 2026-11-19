import { useMemo, type CSSProperties } from 'react';

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const lettersOf = (text: string) => (segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text));

/**
 * Text that types itself out, one letter after another (`.build-letter`). It is drawn only: the
 * caller gives assistive technology the whole text once, in an accessible name or hidden copy.
 */
export function TypedLetters({ text }: { text: string }) {
  const letters = useMemo(() => lettersOf(text), [text]);
  return (
    <span aria-hidden>
      {letters.map((letter, index) =>
        letter === ' ' ? (
          ' '
        ) : (
          <span key={index} className="build-letter" style={{ '--i': index } as CSSProperties}>
            {letter}
          </span>
        ),
      )}
    </span>
  );
}
