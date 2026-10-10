import { useEffect, useRef, type RefObject, type Dispatch, type SetStateAction } from "react";
import { useLibraryAgent } from "../../lib/use-library-agent";
import { usePaneArrival } from "../../lib/use-pane-arrival";
import {
  type LibrarySelection,
  type LibraryHomeSurface,
  librarySelectionFocusTarget,
} from "./library-page-state";
import type { useLibrarySources } from "./use-library-sources";
import type { useLibraryWorkActivity } from "./use-library-work-activity";

export function useLibraryFocus({
  selected, setSelected, mobileBrowseOpen, mobileBrowseBackRef, homeSurface, answerComparisonOpen,
  skipReaderFocusRef, agent, sources, workActivity,
}: {
  selected: LibrarySelection;
  setSelected: Dispatch<SetStateAction<LibrarySelection>>;
  mobileBrowseOpen: boolean;
  mobileBrowseBackRef: RefObject<HTMLButtonElement | null>;
  homeSurface: LibraryHomeSurface;
  answerComparisonOpen: boolean;
  skipReaderFocusRef: RefObject<boolean>;
  agent: ReturnType<typeof useLibraryAgent>;
  sources: ReturnType<typeof useLibrarySources>;
  workActivity: ReturnType<typeof useLibraryWorkActivity>;
}) {
  const { findOpen } = sources;
  const { localReviewVisible } = workActivity;
  const readerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (localReviewVisible) readerRef.current?.focus({ preventScroll: true });
  }, [localReviewVisible]);
  const paneBodyRef = useRef<HTMLDivElement | null>(null);
  usePaneArrival(
    paneBodyRef,
    localReviewVisible
      ? "local-review"
      : selected === null
        ? "home"
        : selected.kind === "wiki"
          ? `wiki:${selected.slug}`
          : selected.kind === "source"
            ? `source:${selected.path}`
            : "report",
  );
  const lastFocusedSelection = useRef<typeof selected | undefined>(undefined);
  useEffect(() => {
    if (lastFocusedSelection.current === undefined) {
      lastFocusedSelection.current = selected;
      return;
    }
    if (lastFocusedSelection.current === selected) return;
    lastFocusedSelection.current = selected;
    if (skipReaderFocusRef.current) {
      skipReaderFocusRef.current = false;
      return;
    }
    librarySelectionFocusTarget({
      selected,
      mobileBrowseOpen,
      narrow: window.matchMedia('(max-width: 1023px)').matches,
      browseBack: mobileBrowseBackRef.current,
      reader: readerRef.current,
    })?.focus({ preventScroll: true });
  }, [mobileBrowseBackRef, mobileBrowseOpen, selected, skipReaderFocusRef]);

  useEffect(() => {
    if (localReviewVisible || selected === null || findOpen || answerComparisonOpen || homeSurface !== null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [agent.open, answerComparisonOpen, findOpen, homeSurface, localReviewVisible, selected, setSelected]);

  return { readerRef, paneBodyRef, lastFocusedSelection };
}
