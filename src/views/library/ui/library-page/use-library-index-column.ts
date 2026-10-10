import { useCallback, useEffect, useRef, useState } from "react";
import {
  useLibraryIndexCollapsed,
  useLibraryIndexSegment,
  writeLibraryIndexCollapsed,
  type LibraryIndexSegment,
} from "@/shared/lib/appearance-preferences";
import type { LibraryUiModel } from "@/features/library";

const INDEX_COLUMN_PX = 280;
const FOLDED_TAB_PX = 38;
// The gap between the two thresholds stops a one-pixel drag from flapping the index.
const FOLD_BELOW_READER_PX = 420;
const UNFOLD_AT_READER_PX = 460;

export function useLibraryIndexColumn({
  segment, model,
}: {
  segment: LibraryIndexSegment | undefined;
  model: LibraryUiModel;
}) {
  const preferredSegment = useLibraryIndexSegment();
  const indexSegment = segment ?? preferredSegment;
  const indexCollapsedByChoice = useLibraryIndexCollapsed();
  const [autoFolded, setAutoFolded] = useState(false);
  const autoFoldDeclinedRef = useRef(false);
  // State, not a ref: the reader mounts only after a folder opens, and the observer must attach then.
  const [readerEl, setReaderEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = readerEl;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observe = () => {
      const width = el.getBoundingClientRect().width;
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      if (!wide) {
        setAutoFolded(false);
        return;
      }
      setAutoFolded((current) => {
        if (current) {
          if (width - INDEX_COLUMN_PX + FOLDED_TAB_PX >= UNFOLD_AT_READER_PX) {
            autoFoldDeclinedRef.current = false;
            return false;
          }
          return true;
        }
        if (width < FOLD_BELOW_READER_PX && !autoFoldDeclinedRef.current) return true;
        if (width >= UNFOLD_AT_READER_PX) autoFoldDeclinedRef.current = false;
        return false;
      });
    };
    observe();
    const observer = new ResizeObserver(observe);
    observer.observe(el);
    return () => observer.disconnect();
  }, [readerEl]);

  const indexCollapsed = indexCollapsedByChoice || autoFolded;
  const indexTabRef = useRef<HTMLButtonElement | null>(null);
  const indexCollapseRef = useRef<HTMLButtonElement | null>(null);
  const pendingIndexFocusRef = useRef<"tab" | "head" | null>(null);
  const setIndexCollapsed = useCallback((next: boolean) => {
    pendingIndexFocusRef.current = next ? "tab" : "head";
    writeLibraryIndexCollapsed(next);
  }, []);
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

  useEffect(() => {
    const pending = pendingIndexFocusRef.current;
    if (pending === null) return;
    pendingIndexFocusRef.current = null;
    (pending === "tab" ? indexTabRef.current : indexCollapseRef.current)?.focus();
  }, [indexCollapsed]);
  const libraryIsEmpty = model.sources.length === 0 && model.wikiPages.length === 0;
  const wasEmpty = useRef<boolean | null>(null);
  useEffect(() => {
    const before = wasEmpty.current;
    wasEmpty.current = libraryIsEmpty;
    if (before !== true || libraryIsEmpty) return;
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [libraryIsEmpty]);

  return {
    preferredSegment, indexSegment, indexCollapsedByChoice, autoFolded, setAutoFolded,
    autoFoldDeclinedRef, readerEl, setReaderEl, indexCollapsed, indexTabRef, indexCollapseRef,
    pendingIndexFocusRef, setIndexCollapsed, indexScrollRef, indexEdge, setIndexEdge,
    measureIndexEdges, handleIndexScroll, libraryIsEmpty, wasEmpty,
  };
}
