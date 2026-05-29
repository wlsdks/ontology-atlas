import { Fragment } from 'react';
import { splitHighlightSegments } from '@/shared/lib/highlight-match';

/**
 * 검색어 매치를 인디고 `<mark>` 로 강조한 텍스트. query 가 비어 있으면 plain
 * 텍스트(fast path) 를 그대로 반환. 트리·글로벌 검색 등 여러 검색 surface 가
 * 공통 사용하는 강조 primitive.
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
            className="rounded-sm bg-[color:rgba(139,151,255,0.22)] text-[color:rgba(210,218,255,0.98)]"
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
