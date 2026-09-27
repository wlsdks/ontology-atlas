import { tauriVaultPathExists } from "@/shared/lib/tauri-vault-fs";

/**
 * The dogfood shortcut's vault paths, from `NEXT_PUBLIC_DOGFOOD_VAULT_PATHS` (comma-separated
 * absolute paths) at build time, for example
 * NEXT_PUBLIC_DOGFOOD_VAULT_PATHS=/Users/me/dev/ontology-atlas/docs/ontology. Never hardcode a path here, or a home directory and username
 * ship in the public bundle. Unset (the public build) means no shortcut.
 */
const RAW_PATHS = process.env.NEXT_PUBLIC_DOGFOOD_VAULT_PATHS ?? "";

export const DOGFOOD_VAULT_PATH_CANDIDATES: readonly string[] = RAW_PATHS.split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

/** Callers ask `hasDogfoodVaultPath()` first. */
export const DOGFOOD_VAULT_PATH: string = DOGFOOD_VAULT_PATH_CANDIDATES[0] ?? "";

/** `false` in a public build. */
export function hasDogfoodVaultPath(): boolean {
  return DOGFOOD_VAULT_PATH_CANDIDATES.length > 0;
}

export async function resolveDogfoodVaultPath(
  exists: (path: string) => Promise<boolean> = tauriVaultPathExists,
): Promise<string> {
  for (const path of DOGFOOD_VAULT_PATH_CANDIDATES) {
    try {
      if (await exists(path)) return path;
    } catch {
      // Keep the direct dogfood action usable even when a runtime probe fails.
    }
  }
  return DOGFOOD_VAULT_PATH;
}
