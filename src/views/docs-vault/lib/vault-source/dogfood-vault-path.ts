import { tauriVaultPathExists } from "@/shared/lib/vault-folder/tauri-vault-fs";

/** Comma-separated absolute paths, set at build time; never hardcode one, or a home directory ships in the public bundle. */
const RAW_PATHS = process.env.NEXT_PUBLIC_DOGFOOD_VAULT_PATHS ?? "";

export const DOGFOOD_VAULT_PATH_CANDIDATES: readonly string[] = RAW_PATHS.split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

export const DOGFOOD_VAULT_PATH: string = DOGFOOD_VAULT_PATH_CANDIDATES[0] ?? "";

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
