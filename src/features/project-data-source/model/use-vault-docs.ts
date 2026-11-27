"use client";

import type { VaultDoc } from "@/entities/docs-vault";

import { useVaultManifest } from "./use-vault-manifest";

const NO_DOCS: readonly VaultDoc[] = [];

export function useVaultDocs(): readonly VaultDoc[] {
  return useVaultManifest()?.docs ?? NO_DOCS;
}
