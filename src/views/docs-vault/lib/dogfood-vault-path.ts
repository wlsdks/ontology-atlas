import { tauriVaultPathExists } from "@/shared/lib/tauri-vault-fs";

export const DOGFOOD_VAULT_PATH =
  "/Users/jinan/side-project/ontology-atlas/docs/ontology";

export const DOGFOOD_VAULT_PATH_CANDIDATES = [
  DOGFOOD_VAULT_PATH,
  "/Users/jinan/side-project/oh-my-ontology/docs/ontology",
] as const;

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
