"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

import { useShellKeyClaimed } from "@/shared/lib/shell-key-claims";
import { blockingSurfaceOpen } from "@/shared/lib/use-destination-shortcuts";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";

/*
 * `ssr: false` is load-bearing, not a size optimisation. The sheet reads the address's `tab` with
 * `useSearchParams`, and that call during the static export's prerender makes every route bail out
 * of it — `AppShell` records the build it broke. Loaded on the client only, neither dialog is
 * rendered by the prerender at all.
 *
 * Nothing else is imported from either widget, on purpose: a static import from the search
 * widget's barrel would pull the whole dialog into the chunk every route loads first.
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
 * **`?` and ⌘K answer on every screen the rail stands on** (2026-09-26).
 *
 * The shortcut sheet's Navigation section — the one it shows on every tab of every screen — lists
 * ⌘K, `?` and the `G`-leader keys. The `G` keys are the shell's (`useDestinationShortcuts`), so
 * they always worked; ⌘K and `?` were each wired by the screen that drew its own dialog, and only
 * the map, a project page and Insights drew one. Measured against a real folder on 2026-09-25:
 * on Library, Git, Automations, Agents and the harness neither key did anything (0 of 5 each),
 * so the reference for the keyboard could not be opened on five of eight destinations.
 *
 * The shell draws both dialogs now and binds both keys, and stands aside for the screens that
 * answer a key themselves (`shared/lib/shell-key-claims.ts`): the map keeps its own search and
 * sheet, the ontology documents keep ⌘K for their palette, and a project page keeps ⌘K for its own.
 *
 * `disabled` is the rail's own verdict (a gateway, or the installed app with no folder): a key
 * with no screen around it to explain it is not offered, the same rule the `G` keys follow.
 *
 * - `?` does not stack the sheet over another dialog (`blockingSurfaceOpen`, the check the `G`
 *   keys make), but it always closes the sheet it opened, as the sheet's footer says.
 * - ⌘K (Shift optional, as everywhere) opens the search in the sheet's place: the sheet closes as
 *   the search opens, so two modal surfaces never stand at once. Like the search's own binding it
 *   does not open from inside a field.
 * - **The search mounts on its first ⌘K**, not with the screen. It derives the whole ontology from
 *   the open folder to have something to search, and a screen that never searches should not pay
 *   that on every arrival. Once mounted it stays, and binds ⌘K itself (`bindHotkey`) so the same
 *   key closes it from inside its own field.
 */
export function ShellKeyboardSurfaces({ disabled }: { disabled: boolean }) {
  const sheetClaimed = useShellKeyClaimed("shortcuts");
  const searchClaimed = useShellKeyClaimed("search");
  const sheetLive = !disabled && !sheetClaimed;
  const searchLive = !disabled && !searchClaimed;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMounted, setSearchMounted] = useState(false);
  /*
   * A screen that takes a key over, or a gateway arriving, ends what the shell had open for it.
   * Adjusted during render — React's shape for state that follows a changed input — so no frame
   * shows the shell's dialog over the screen that now owns the key.
   */
  if (!sheetLive && sheetOpen) setSheetOpen(false);
  if (!searchLive && searchOpen) setSearchOpen(false);

  const changeSearchOpen = useCallback((next: boolean) => {
    if (next) {
      setSheetOpen(false);
      setSearchMounted(true);
    }
    setSearchOpen(next);
  }, []);

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
      // Opening only: once open, the search's own binding closes it, from its field too.
      combo: { key: "k", meta: true },
      disabled: !searchLive || searchOpen,
      onFire: () => changeSearchOpen(true),
    },
  ]);

  return (
    <>
      {/* Always mounted and steered by `open`, so a closing sheet keeps its exit motion. */}
      <ShortcutSheet open={sheetLive && sheetOpen} onClose={() => setSheetOpen(false)} />
      {/* Mounted on the first search and then kept; it is only ever unmounted closed. */}
      {searchLive && searchMounted ? (
        <MountedGlobalSearch open={searchOpen} onOpenChange={changeSearchOpen} bindHotkey />
      ) : null}
    </>
  );
}
