"use client";

import type { ReactNode } from "react";
import { useLocalVaultInternal } from "./use-local-vault";
import { VaultDiffToaster } from "./VaultDiffToaster";
import { TauriVaultWatchBridge } from "./TauriVaultWatchBridge";
import { LocalVaultContext } from "./local-vault-context";

export { useLocalVault } from "./local-vault-context";

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
