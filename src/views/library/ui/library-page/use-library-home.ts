import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  readLibraryGuideSeen,
  useLibraryGuideSeen,
  writeLibraryGuideSeen,
} from "@/shared/lib/preferences/appearance-preferences";
import { RIGHT_DOCK_WIDTH_VAR } from "@/shared/lib/overlays/right-dock-reserve";
import { useChatWidth } from "@/widgets/acp-chat-panel";
import type { LibrarySelection, LibraryHomeSurface } from "./library-page-state";
import type { useLibraryWorkActivity } from "./use-library-work-activity";

export function useLibraryHome({
  selected, setHomeSurface, chatWidth, dockOpen, workActivity, importOpen,
}: {
  selected: LibrarySelection;
  setHomeSurface: Dispatch<SetStateAction<LibraryHomeSurface>>;
  chatWidth: ReturnType<typeof useChatWidth>;
  dockOpen: boolean;
  workActivity: ReturnType<typeof useLibraryWorkActivity>;
  /** The first-visit guide waits while the service import dialog is up, so two surfaces never stack. */
  importOpen: boolean;
}) {
  const { localReviewVisible } = workActivity;
  const homeVisible = selected === null && !localReviewVisible;
  const guideSeen = useLibraryGuideSeen();
  const guideRaisedRef = useRef(false);
  useEffect(() => {
    // `useLibraryGuideSeen` answers `false` on a static export's first client render, so the direct
    // read decides; `guideSeen` stays a dependency so a change in another tab still settles here.
    if (!homeVisible || importOpen || guideSeen || guideRaisedRef.current || readLibraryGuideSeen()) return;
    guideRaisedRef.current = true;
    setHomeSurface("guide");
  }, [guideSeen, homeVisible, importOpen, setHomeSurface]);
  const closeGuide = useCallback(() => {
    writeLibraryGuideSeen(true);
    setHomeSurface(null);
  }, [setHomeSurface]);

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

  return { homeVisible, guideSeen, guideRaisedRef, closeGuide };
}
