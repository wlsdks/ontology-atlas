import { useCallback, useState, lazy } from "react";
import { SilentSuspense } from "@/shared/ui/fallbacks/silent-suspense";

import { useShellKeyClaimed } from "@/shared/lib/keyboard/shell-key-claims";
import {
  OPEN_SHORTCUTS_EVENT,
  requestSettingsOpen,
  useSurfaceRequest,
} from "@/shared/lib/keyboard/surface-requests";
import { blockingSurfaceOpen } from "@/shared/lib/keyboard/use-destination-shortcuts";
import { useTypingShortcuts } from "@/shared/lib/keyboard/use-typing-shortcut";

/* Loaded on first use, and nothing else is imported from either widget, so neither dialog lands in the chunk every route loads first. */
const ShortcutSheet = lazy(() => import("@/widgets/shortcut-sheet").then((m) => ({ default: m.ShortcutSheet })));
const MountedGlobalSearch = lazy(() => import("@/widgets/global-search").then((m) => ({ default: m.MountedGlobalSearch })));

/**
 * `?`, Cmd+K and Cmd+, answer on every screen the rail stands on unless a screen claims the key
 * (`shared/lib/keyboard/shell-key-claims.ts`). `disabled` means no rail, so no keys. `?` never
 * stacks over another dialog; Cmd+K replaces the sheet.
 */
export function ShellKeyboardSurfaces({ disabled }: { disabled: boolean }) {
  const sheetClaimed = useShellKeyClaimed("shortcuts");
  const searchClaimed = useShellKeyClaimed("search");
  const sheetLive = !disabled && !sheetClaimed;
  const searchLive = !disabled && !searchClaimed;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMounted, setSearchMounted] = useState(false);
  if (!sheetLive && sheetOpen) setSheetOpen(false);
  if (!searchLive && searchOpen) setSearchOpen(false);

  const changeSearchOpen = useCallback((next: boolean) => {
    if (next) {
      setSheetOpen(false);
      setSearchMounted(true);
    }
    setSearchOpen(next);
  }, []);

  useSurfaceRequest(OPEN_SHORTCUTS_EVENT, () => {
    if (!sheetLive) return false;
    setSearchOpen(false);
    setSheetOpen(true);
    return true;
  });

  useTypingShortcuts([
    {
      combo: { key: "?" },
      disabled: !sheetLive,
      onFire: () => {
        if (!sheetOpen && blockingSurfaceOpen()) return;
        setSheetOpen((open) => !open);
      },
    },
    {
      combo: { key: "k", meta: true },
      disabled: !searchLive || searchOpen,
      onFire: () => changeSearchOpen(true),
    },
    {
      combo: { key: ",", meta: true },
      disabled,
      onFire: () => {
        if (blockingSurfaceOpen()) return;
        requestSettingsOpen();
      },
    },
  ]);

  return (
    <>
      <SilentSuspense>
        <ShortcutSheet open={sheetLive && sheetOpen} onClose={() => setSheetOpen(false)} />
      </SilentSuspense>
      {searchLive && searchMounted ? (
        <SilentSuspense>
          <MountedGlobalSearch open={searchOpen} onOpenChange={changeSearchOpen} bindHotkey />
        </SilentSuspense>
      ) : null}
    </>
  );
}
