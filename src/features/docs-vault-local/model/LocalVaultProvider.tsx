"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLocalVaultInternal } from "./use-local-vault";
import { VaultDiffToaster } from "./VaultDiffToaster";
import { TauriVaultWatchBridge } from "./TauriVaultWatchBridge";

type LocalVaultValue = ReturnType<typeof useLocalVaultInternal>;

/**
 * Makes the local vault a single source of truth.
 *
 * `useLocalVault` used to be called independently from eight places, so a single page mount held two
 * or three hook instances at once — rehydrating the same IDB key N times and running
 * `buildLocalManifest` (a full FS walk) on the same folder N times. On an 18-node dogfood vault that
 * is not measurable, but on a 100+ file vault the cold-load latency grows proportionally.
 *
 * The provider mounts once in the layout, giving one state. Every consumer reads the context through
 * `useLocalVault()`, whose signature is unchanged.
 */
const LocalVaultContext = createContext<LocalVaultValue | null>(null);

export function LocalVaultProvider({ children }: { children: ReactNode }) {
  const value = useLocalVaultInternal();
  return (
    <LocalVaultContext.Provider value={value}>
      <VaultDiffToaster />
      <TauriVaultWatchBridge />
      {children}
    </LocalVaultContext.Provider>
  );
}

/**
 * Access to local vault state and actions. Callable only inside `LocalVaultProvider`; outside it
 * (a plain render in a unit test, say) it throws. The silent fallback is deliberately refused — in an
 * app where the vault is the source of truth, stub state is more dangerous than an immediate throw.
 */
export function useLocalVault(): LocalVaultValue {
  const value = useContext(LocalVaultContext);
  if (value === null) {
    throw new Error(
      "useLocalVault must be called inside <LocalVaultProvider>. " +
        "Mount the provider in app/[locale]/layout.tsx (already done for " +
        "production paths). Tests rendering components that consume the " +
        "vault must wrap them in <LocalVaultProvider>.",
    );
  }
  return value;
}
