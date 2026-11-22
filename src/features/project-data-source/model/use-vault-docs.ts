"use client";

import type { VaultDoc } from "@/entities/docs-vault";

import { useVaultManifest } from "./use-vault-manifest";

const NO_DOCS: readonly VaultDoc[] = [];

export function useVaultDocs(options?: { demand?: boolean }): readonly VaultDoc[] {
  return useVaultManifest(options)?.docs ?? NO_DOCS;
}
