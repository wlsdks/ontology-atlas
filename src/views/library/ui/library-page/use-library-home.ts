import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import {
  readLibraryGuideSeen,
  useLibraryGuideSeen,
  writeLibraryGuideSeen,
} from "@/shared/lib/appearance-preferences";
import { RIGHT_DOCK_WIDTH_VAR } from "@/shared/lib/right-dock-reserve";
import { useChatWidth } from "@/widgets/acp-chat-panel";
import type { LibraryUiModel } from "@/features/library";
import type { LibrarySelection, LibraryHomeSurface } from "./library-page-state";
import type { useLibraryWorkActivity } from "./use-library-work-activity";

export function useLibraryHome({
  selected, setHomeSurface, setStaleLit, staleLit, choose, model, chatWidth, dockOpen,
  workActivity,
}: {
  selected: LibrarySelection;
  setHomeSurface: Dispatch<SetStateAction<LibraryHomeSurface>>;
  setStaleLit: Dispatch<SetStateAction<boolean>>;
  staleLit: boolean;
  choose: (next: LibrarySelection) => void;
  model: LibraryUiModel;
  chatWidth: ReturnType<typeof useChatWidth>;
  dockOpen: boolean;
  workActivity: ReturnType<typeof useLibraryWorkActivity>;
}) {
  const { localReviewVisible } = workActivity;
  const homeVisible = selected === null && !localReviewVisible;
  const staleHighlight = useMemo(() => {
    const ids = new Set<string>();
    const pages = new Set<string>();
    for (const row of model.sources) {
      if (row.state !== "stale") continue;
      ids.add(`source:${row.path}`);
      for (const slug of row.citedBy) {
        ids.add(`page:${slug}`);
        pages.add(slug);
      }
    }
    return { ids, pages: pages.size };
  }, [model.sources]);
  const openReport = useCallback(() => {
    setHomeSurface(null);
    setStaleLit(false);
    choose({ kind: "report" });
  }, [choose, setHomeSurface, setStaleLit]);
  const guideSeen = useLibraryGuideSeen();
  const guideRaisedRef = useRef(false);
  useEffect(() => {
    // `useLibraryGuideSeen` answers `false` on a static export's first client render, so the direct
    // read decides; `guideSeen` stays a dependency so a change in another tab still settles here.
    if (!homeVisible || guideSeen || guideRaisedRef.current || readLibraryGuideSeen()) return;
    guideRaisedRef.current = true;
    setHomeSurface("guide");
  }, [guideSeen, homeVisible, setHomeSurface]);
  const closeGuide = useCallback(() => {
    writeLibraryGuideSeen(true);
    setHomeSurface(null);
  }, [setHomeSurface]);

  useEffect(() => {
    if (!staleLit) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      setStaleLit(false);
    };
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('[data-testid="library-graph-canvas"]')) setStaleLit(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown);
    };
  }, [setStaleLit, staleLit]);
  useEffect(() => {
    const root = document.documentElement;
    if (!dockOpen) {
      root.style.removeProperty(RIGHT_DOCK_WIDTH_VAR);
      return undefined;
    }
    root.style.setProperty(RIGHT_DOCK_WIDTH_VAR, `${Math.round(chatWidth.width)}px`);
    return () => {
      root.style.removeProperty(RIGHT_DOCK_WIDTH_VAR);
    };
  }, [chatWidth.width, dockOpen]);

  return { homeVisible, staleHighlight, openReport, guideSeen, guideRaisedRef, closeGuide };
}
