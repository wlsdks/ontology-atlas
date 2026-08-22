import { tauriVaultPathExists } from "@/shared/lib/tauri-vault-fs";

/**
 * The vault path the developer dogfood shortcut opens — **it comes from build configuration.**
 *
 * **Why it moved from a constant to configuration** (full sweep, 2026-07-29). Two of the
 * maintainer's home paths used to be hardcoded in the source, and those strings **shipped verbatim
 * in the public bundle** (verified live: `/Users/<name>/side-project/…` inside
 * `…/_next/static/chunks/…js`). The condition for drawing them on screen
 * (`shouldShowDogfoodVaultHint`) is narrow enough that an ordinary visitor never saw them, but
 * anyone opening the bundle simply reads them — a macOS username and directory structure ship
 * together.
 *
 * It was also **dead code for 100% of users**: that path exists only on the maintainer's machine,
 * so it resolves for nobody else.
 *
 * **How to configure it.** At build time, list absolute paths in
 * `NEXT_PUBLIC_DOGFOOD_VAULT_PATHS`, comma-separated:
 *
 *     NEXT_PUBLIC_DOGFOOD_VAULT_PATHS=/Users/me/dev/ontology-atlas/docs/ontology
 *
 * Unset it is **empty** — which is the public build's case, and the shortcut quietly does not
 * exist (see `hasDogfoodVaultPath` below). Doing nothing is more honest than pretending to open a
 * path that is not there.
 */
const RAW_PATHS = process.env.NEXT_PUBLIC_DOGFOOD_VAULT_PATHS ?? "";

export const DOGFOOD_VAULT_PATH_CANDIDATES: readonly string[] = RAW_PATHS.split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

/** The first candidate, or an empty string. Callers ask `hasDogfoodVaultPath()` first. */
export const DOGFOOD_VAULT_PATH: string = DOGFOOD_VAULT_PATH_CANDIDATES[0] ?? "";

/** Whether this build has a dogfood path configured. `false` in a public build. */
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
