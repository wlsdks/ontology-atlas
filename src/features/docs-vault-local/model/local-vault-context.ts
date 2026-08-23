"use client";

import { createContext, useContext } from "react";
import type { useLocalVaultInternal } from "./use-local-vault";

export type LocalVaultValue = ReturnType<typeof useLocalVaultInternal>;

export const LocalVaultContext = createContext<LocalVaultValue | null>(null);

/**
 * Reads the single mounted vault state. A silent fallback would turn the vault's
 * source-of-truth contract into stub data, so calls outside the provider fail.
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
