"use client";

import { useMemo } from "react";
import { useDataSourceMode } from "@/entities/vault-session";
import { useLocalVault } from "@/entities/vault-session";
import { useStaticVaultSource } from "@/entities/vault-session";
import type { VaultManifest } from "@/entities/docs-vault";

/** Mode-aware manifest; the static one only through `useStaticVaultSource()`, or the sample choice is ignored. */
export function useVaultManifest(): VaultManifest | null {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const { manifest: staticManifest } = useStaticVaultSource();

  return useMemo(() => {
    if (mode === "static") return staticManifest;
    return vault.manifest ?? null;
  }, [mode, staticManifest, vault.manifest]);
}
