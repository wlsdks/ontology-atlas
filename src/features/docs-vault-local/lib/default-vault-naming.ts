/**
 * Picks a collision-free vault folder name under `~/Ontology Atlas/` for "just start" from the
 * existing names; filesystem access belongs to `@/shared/lib/tauri-vault-fs`.
 */

export const DEFAULT_VAULT_BASE_NAME = 'my-ontology';
/**
 * Not `~/Documents`: it is TCC-protected on macOS, so a first run would open a permission dialog.
 * Must match `default_vault_parent_dir` in `src-tauri/src/lib.rs`
 * (`just-start-vault-location.contract.test.ts`).
 */
export const DEFAULT_VAULT_PARENT_LABEL = '~/Ontology Atlas';

/** Appends `-2`, `-3`, … on collision, so an existing vault is never overwritten. */
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

/** For the success toast. */
export function buildDefaultVaultDisplayPath(dirName: string): string {
  return `${DEFAULT_VAULT_PARENT_LABEL}/${dirName}`;
}
