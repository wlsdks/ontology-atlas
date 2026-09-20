"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useRoundsRunner } from "./use-rounds-runner";
import type { RoundsRunnerValue } from "@/features/library-rounds";

/**
 * One clock for the whole app.
 *
 * The runner is a hook with a timer and a headless agent session; mounted twice it would tick
 * twice and could open two adapters for one pass. The provider sits in the shell, above every
 * route, so a round keeps running while the person is on the map, and the Rounds tab only reads.
 */
const LibraryRoundsContext = createContext<RoundsRunnerValue | null>(null);

export function LibraryRoundsProvider({ children }: { children: ReactNode }) {
  const value = useRoundsRunner();
  return <LibraryRoundsContext.Provider value={value}>{children}</LibraryRoundsContext.Provider>;
}

export function useLibraryRounds(): RoundsRunnerValue | null {
  return useContext(LibraryRoundsContext);
}
