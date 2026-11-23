import { useCallback, useEffect, useRef, useState } from "react";
import {
  useLibraryIndexSegment,
  type LibraryIndexSegment,
} from "@/shared/lib/preferences/library-preferences";
import type { LibraryUiModel } from "@/features/library";

const INDEX_COLUMN_PX = 280;
// The gap between the two thresholds stops a one-pixel drag from flapping the index.
const FOLD_BELOW_READER_PX = 420;
const UNFOLD_AT_READER_PX = 460;
const WIDE_QUERY = "(min-width: 1024px)";

/**
 * Whether the index column stands folded beside a reader this wide. A folded column has given the
 * reader its width, so it returns only when the reader would still keep `UNFOLD_AT_READER_PX`.
 */
export function indexFoldsAt(readerWidthPx: number, folded: boolean): boolean {
  if (folded) return readerWidthPx - INDEX_COLUMN_PX < UNFOLD_AT_READER_PX;
  return readerWidthPx < FOLD_BELOW_READER_PX;
}

export function useLibraryIndexColumn({
  segment, model,
}: {
  segment: LibraryIndexSegment | undefined;
  model: LibraryUiModel;
}) {
  const preferredSegment = useLibraryIndexSegment();
  const indexSegment = segment ?? preferredSegment;
  const [indexFolded, setIndexFolded] = useState(false);
  // Off until the first measurement has landed, so a window already too narrow opens folded rather than folding in view.
  const [foldMoves, setFoldMoves] = useState(false);
  // State, not a ref: the reader mounts only after a folder opens, and the observer must attach then.
  const [readerEl, setReaderEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = readerEl;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observe = () => {
      const width = el.getBoundingClientRect().width;
      // Below `lg` the column stacks under the reader and has no width to give.
      const wide = window.matchMedia(WIDE_QUERY).matches;
      setIndexFolded((folded) => wide && indexFoldsAt(width, folded));
    };
    observe();
    const frame = window.requestAnimationFrame(() => setFoldMoves(true));
    const observer = new ResizeObserver(observe);
    observer.observe(el);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [readerEl]);

  const indexScrollRef = useRef<HTMLDivElement | null>(null);
  const [indexEdge, setIndexEdge] = useState({ top: false, bottom: false });
  const measureIndexEdges = useCallback(() => {
    const box = indexScrollRef.current;
    if (!box) return;
    const top = box.scrollTop > 1;
    const bottom = box.scrollTop < box.scrollHeight - box.clientHeight - 1;
    setIndexEdge((previous) =>
      previous.top === top && previous.bottom === bottom ? previous : { top, bottom },
    );
  }, []);
  const handleIndexScroll = useCallback(() => measureIndexEdges(), [measureIndexEdges]);
  useEffect(() => {
    const box = indexScrollRef.current;
    if (!box || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measureIndexEdges());
    observer.observe(box);
    return () => observer.disconnect();
  }, [measureIndexEdges]);
  useEffect(() => {
    measureIndexEdges();
  }, [indexSegment, measureIndexEdges, model.sources.length, model.wikiPages.length]);

  const libraryIsEmpty = model.sources.length === 0 && model.wikiPages.length === 0;
  const wasEmpty = useRef<boolean | null>(null);
  useEffect(() => {
    const before = wasEmpty.current;
    wasEmpty.current = libraryIsEmpty;
    if (before !== true || libraryIsEmpty) return;
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [libraryIsEmpty]);

  return {
    preferredSegment, indexSegment, indexFolded, foldMoves, readerEl, setReaderEl, indexScrollRef,
    indexEdge, setIndexEdge, measureIndexEdges, handleIndexScroll, libraryIsEmpty, wasEmpty,
  };
}
