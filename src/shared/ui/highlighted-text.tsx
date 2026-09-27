import { Fragment } from 'react';
import { splitHighlightSegments } from '@/shared/lib/highlight-match';

/** Highlights query matches in an indigo `<mark>`; shared by every search surface. */
export function HighlightedText({
  text,
  query,
}: {
  text: string;
  query?: string;
}) {
  const segments = query ? splitHighlightSegments(text, query) : null;
  if (!segments) return <>{text}</>;
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark
            key={i}
            className="rounded-micro bg-[color:var(--color-indigo-line-a22)] text-[color:var(--color-search-mark-text)]"
          >
            {seg.text}
          </mark>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </>
  );
}
