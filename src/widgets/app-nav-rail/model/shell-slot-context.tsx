"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * perf/persistent-shell — when AppNavRail was promoted into
 * `app/[locale]/layout.tsx` (keeping the rail's DOM identity across every route
 * change, replacing only the content area), two per-page things could no longer be
 * passed as props: (1) the `settingsSlot` gear that only the topology (HomePage)
 * plugged in, and (2) hiding the rail on an immersive fullscreen surface.
 *
 * Both are a reverse data flow — leaf page state → a rail that lives in the layout —
 * so Context solves them: a page only registers a value through a hook, and the rail
 * renders it as is. The rail component itself never mounts or unmounts (hidden is
 * handled in CSS only — see `AppNavRail`'s `hidden` prop).
 *
 * `contextHrefs` (carrying LNB context forward) is the same reverse flow. Moving from
 * the topology with a node selected to the rail's "docs vault" item used to open the
 * default `/docs/` screen, unrelated to that selection. When the topology registers
 * the selected node's document deep link here (`buildDocsVaultHref`, a value the
 * datasheet already derives), the rail swaps the "docs vault" item's href for that
 * deep link. With no selection — or on navigating to another page, where effect
 * cleanup empties it — it returns to the default `/docs/` href, with zero visual or
 * default-behaviour change.
 */
interface NavRailShellState {
  settingsSlot: ReactNode | null;
  hidden: boolean;
  contextHrefs: NavRailContextHrefs | null;
}

/** Rail item id → context href. The docs vault only for now — whether insights needs
 *  context is unclear, so it was left out of this slice (per instruction). */
export interface NavRailContextHrefs {
  docs?: string;
}

interface NavRailShellContextValue extends NavRailShellState {
  setSettingsSlot: (slot: ReactNode | null) => void;
  setHidden: (hidden: boolean) => void;
  setContextHrefs: (hrefs: NavRailContextHrefs | null) => void;
}

const NavRailShellContext = createContext<NavRailShellContextValue | null>(null);

export function NavRailShellProvider({ children }: { children: ReactNode }) {
  const [settingsSlot, setSettingsSlot] = useState<ReactNode | null>(null);
  const [hidden, setHidden] = useState(false);
  const [contextHrefs, setContextHrefs] = useState<NavRailContextHrefs | null>(null);

  const value = useMemo(
    () => ({ settingsSlot, hidden, contextHrefs, setSettingsSlot, setHidden, setContextHrefs }),
    [settingsSlot, hidden, contextHrefs],
  );

  return (
    <NavRailShellContext.Provider value={value}>
      {children}
    </NavRailShellContext.Provider>
  );
}

function useNavRailShellContext(): NavRailShellContextValue {
  const ctx = useContext(NavRailShellContext);
  if (!ctx) {
    throw new Error(
      "NavRailShellContext is missing — this hook must render under <NavRailShellProvider> (mounted once in app/[locale]/layout.tsx).",
    );
  }
  return ctx;
}

/** The current slot/hidden/contextHrefs values the rail itself renders — used only inside `AppShell`. */
export function useNavRailShellValue(): NavRailShellState {
  const { settingsSlot, hidden, contextHrefs } = useNavRailShellContext();
  return { settingsSlot, hidden, contextHrefs };
}

/**
 * Used when a page plugs its own settings UI into the rail's bottom (the topology's
 * settings sheet trigger, `AppSettingsMenu` rail-tile, for instance). `slot` may be a
 * new object on every re-render; there is no guarantee the effect re-runs only when
 * the content really changes, so stabilising the slot with `useMemo` at the call site
 * reduces needless re-registration. It clears itself on unmount.
 */
export function useNavRailSettingsSlot(slot: ReactNode | null): void {
  const { setSettingsSlot } = useNavRailShellContext();
  useEffect(() => {
    setSettingsSlot(slot);
    return () => setSettingsSlot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);
}

/**
 * Used when a page swaps a rail item's href for one based on "what you were just
 * looking at" (for instance, the topology pointing the "docs vault" item at the
 * selected node's document deep link while a node is selected). Where `hrefs` is
 * `null` or a particular key is empty, that item keeps the rail's default href —
 * effect cleanup empties it automatically on deselection or navigation (the same
 * pattern as `useNavRailSettingsSlot`).
 */
export function useNavRailContextHrefs(hrefs: NavRailContextHrefs | null): void {
  const { setContextHrefs } = useNavRailShellContext();
  useEffect(() => {
    setContextHrefs(hrefs);
    return () => setContextHrefs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrefs]);
}
