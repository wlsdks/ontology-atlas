"use client";

import { useMemo } from "react";
import { useDataSourceMode } from "@/entities/vault-session";
import { useLocalVault } from "@/entities/vault-session";
import { useStaticVaultSource } from "@/entities/vault-session";
import type { VaultManifest } from "@/entities/docs-vault";

/**
 * Mode-aware vault manifest — `local` (the user's disk) against `static` (the bundled sample
 * vault), the precedence `useProjects` and `useVaultDocs` already follow.
 *
 * `useVaultDocs` reads its docs from here so that the two cannot describe different folders.
 * They did: the project page counted Library sources straight off `useLocalVault()` beside wiki
 * pages off `useVaultDocs()`, so every surface without a folder open — the web, and any loaded
 * sample — reported no sources whatever the sample held.
 *
 * The static manifest must come from `useStaticVaultSource()`; importing the dogfood manifest
 * directly makes the reader's "view the example business" choice silently ignored here alone.
 */
export function useVaultManifest(): VaultManifest | null {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const { manifest: staticManifest } = useStaticVaultSource();

  return useMemo(() => {
    if (mode === "static") return staticManifest;
    return vault.manifest ?? null;
  }, [mode, staticManifest, vault.manifest]);
}
