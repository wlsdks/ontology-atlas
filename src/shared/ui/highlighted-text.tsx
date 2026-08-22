import { Fragment } from 'react';
import { splitHighlightSegments } from '@/shared/lib/highlight-match';

/**
 * Text with query matches highlighted in an indigo `<mark>`. An empty query
 * returns the plain text unchanged (fast path). This is the shared highlighting
 * primitive for every search surface — the tree, global search and the rest.
 */
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
