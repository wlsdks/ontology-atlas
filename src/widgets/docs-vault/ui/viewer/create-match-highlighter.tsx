import { splitHighlightSegments } from '@/shared/lib/search-match/highlight-match';

export type MatchHighlighter = (children: React.ReactNode, key?: string) => React.ReactNode;

/** Wraps each literal match of `highlightQuery` in the text it is given in a `mark.docs-match`. */
export function createMatchHighlighter(highlightQuery: string | undefined): MatchHighlighter {
  const hl = (
    children: React.ReactNode,
    q: string,
    key = 'hl',
  ): React.ReactNode => {
    if (!q) return children;
    if (typeof children === 'string') {
      // Literal only: searchDocs found this document by literal text, not Hangul keystrokes.
      // The `.docs-match` class is what the scroll effect looks for.
      return splitHighlightSegments(children, q, false).map((seg, i) =>
        seg.match ? (
          <mark
            key={`${key}-${i}`}
            className="docs-match rounded-micro bg-[color:var(--color-indigo-line-a22)] px-0.5 text-[color:var(--color-search-mark-text)]"
          >
            {seg.text}
          </mark>
        ) : (
          seg.text
        ),
      );
    }
    if (Array.isArray(children)) {
      return children.map((c, idx) => hl(c, q, `${key}-${idx}`));
    }
    return children;
  };
  const q = highlightQuery?.toLowerCase() ?? '';
  return (children, key = 'hl') => hl(children, q, key);
}
