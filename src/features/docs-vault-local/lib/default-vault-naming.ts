/**
 * Pure functions for "just start" (desktop first run, Tauri runtime only) — picks the vault folder
 * name under `~/Ontology Atlas/<name>` and assembles the path string shown to the user.
 * Actual filesystem access (existence checks, creation) belongs to `@/shared/lib/tauri-vault-fs`;
 * this module takes that result (the list of existing names) and computes a collision-free name
 * purely, so it is testable in vitest with no FS mock.
 */

export const DEFAULT_VAULT_BASE_NAME = 'my-ontology';
/**
 * ⚠️ Not `~/Documents/...` (2026-08-25). Documents is TCC-protected on macOS, so a button promising
 * "no decisions, just begin" opened a system permission dialog as the very first thing a new person
 * saw. `$HOME` carries no such gate. Must stay in step with `default_vault_parent_dir` in
 * `src-tauri/src/lib.rs`; `just-start-vault-location.contract.test.ts` holds them together.
 */
export const DEFAULT_VAULT_PARENT_LABEL = '~/Ontology Atlas';

/**
 * Returns `baseName` unchanged when it is not in `existingNames`, otherwise the next
 * non-colliding name (`-2`, `-3`, …). The "a new vault every time" contract — an existing vault is
 * never overwritten.
 */
export function resolveUniqueVaultDirName(
  existingNames: readonly string[],
  baseName: string = DEFAULT_VAULT_BASE_NAME,
): string {
  if (!existingNames.includes(baseName)) return baseName;
  let suffix = 2;
  while (existingNames.includes(`${baseName}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseName}-${suffix}`;
}

/** A human-readable path string for the success toast and similar. */
export function buildDefaultVaultDisplayPath(dirName: string): string {
  return `${DEFAULT_VAULT_PARENT_LABEL}/${dirName}`;
}
