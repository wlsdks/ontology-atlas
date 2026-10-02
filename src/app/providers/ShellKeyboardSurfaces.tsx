"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

import { useShellKeyClaimed } from "@/shared/lib/shell-key-claims";
import {
  OPEN_SHORTCUTS_EVENT,
  requestSettingsOpen,
  useSurfaceRequest,
} from "@/shared/lib/surface-requests";
import { blockingSurfaceOpen } from "@/shared/lib/use-destination-shortcuts";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";

/*
 * The `ssr: false` option is load-bearing: the sheet calls `useSearchParams`, which in the static prerender
 * bails every route out (see `AppShell`). Nothing else is imported from either widget, so neither
 * dialog lands in the chunk every route loads first.
 */
const ShortcutSheet = dynamic(
  () => import("@/widgets/shortcut-sheet").then((m) => m.ShortcutSheet),
  { ssr: false },
);
const MountedGlobalSearch = dynamic(
  () => import("@/widgets/global-search").then((m) => m.MountedGlobalSearch),
  { ssr: false },
);

/**
 * The keys `?`, ⌘K and ⌘, answer on every screen the rail stands on, as the shortcut sheet
 * promises. Screens that answer a key themselves claim it (`shared/lib/shell-key-claims.ts`).
 * `disabled` is the rail's verdict: no rail, no keys, the same rule as the `G` keys.
 *
 * - `?` does not stack the sheet over another dialog (`blockingSurfaceOpen`), but always closes
 *   the sheet it opened.
 * - ⌘K opens the search in the sheet's place, so two modal surfaces never stand at once.
 * - ⌘, asks a visible settings trigger to open its sheet (`requestSettingsOpen`), never over
 *   another dialog.
 * - The search mounts on its first ⌘K, because it derives the whole ontology; once mounted it
 *   stays and binds ⌘K itself (`bindHotkey`) so the key closes it from its own field.
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
      <ShortcutSheet open={sheetLive && sheetOpen} onClose={() => setSheetOpen(false)} />
      {searchLive && searchMounted ? (
        <MountedGlobalSearch open={searchOpen} onOpenChange={changeSearchOpen} bindHotkey />
      ) : null}
    </>
  );
}
