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
 * Reverse data flow from a leaf page to the rail in the layout: pages register values through
 * hooks, and the rail renders them without remounting.
 */
interface NavRailShellState {
  settingsSlot: ReactNode | null;
  hidden: boolean;
  contextHrefs: NavRailContextHrefs | null;
}

/** Rail item id to context href (docs vault only). */
export interface NavRailContextHrefs {
  docs?: string;
  /** The Projects door target when the folder holds exactly one project; absent otherwise. */
  projects?: string;
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
 * Registers a page's settings UI in the rail's bottom slot; stabilise `slot` with useMemo. Clears
 * on unmount.
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
 * Swaps rail item hrefs for context deep links; null or empty keys keep the default. Clears on
 * unmount.
 */
export function useNavRailContextHrefs(hrefs: NavRailContextHrefs | null): void {
  const { setContextHrefs } = useNavRailShellContext();
  useEffect(() => {
    setContextHrefs(hrefs);
    return () => setContextHrefs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrefs]);
}
