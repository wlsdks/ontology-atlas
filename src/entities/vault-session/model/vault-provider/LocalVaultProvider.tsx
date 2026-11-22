"use client";

import type { ReactNode } from "react";
import { useLocalVaultInternal } from "../local-vault/use-local-vault";
import { VaultDiffToaster } from "./VaultDiffToaster";
import { TauriVaultWatchBridge } from "./TauriVaultWatchBridge";
import { TauriVaultIndexBridge } from "./TauriVaultIndexBridge";
import { LocalVaultContext } from "./local-vault-context";

export { useLocalVault } from "./local-vault-context";

export function LocalVaultProvider({ children }: { children: ReactNode }) {
  const value = useLocalVaultInternal();
  return (
    <LocalVaultContext.Provider value={value}>
      <VaultDiffToaster />
      <TauriVaultWatchBridge />
      <TauriVaultIndexBridge />
      {children}
    </LocalVaultContext.Provider>
  );
}
