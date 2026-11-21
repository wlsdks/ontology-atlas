import { useMemo, type CSSProperties } from 'react';

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const lettersOf = (text: string) => (segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text));

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
