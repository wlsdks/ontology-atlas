/**
 * The map lives inside the project as `<project>/atlas`, so code and meaning are reviewed in the same diff. `atlas` is visible: `docs/` gets reorganised and a dot-folder is not read.
 */

// Defined in `shared` because `docs-vault-local` needs the same name from the same layer.
export { PROJECT_VAULT_DIR } from '@/shared/lib/vault-folder/project-vault-dir';

import { PROJECT_VAULT_DIR } from '@/shared/lib/vault-folder/project-vault-dir';

export interface ProjectVaultLocation {
  projectRoot: string;
  vaultRoot: string;
  displayPath: string;
}

/** Touches no disk; null for an empty path rather than an invented location. */
export function projectVaultLocation(projectRoot: string | null | undefined): ProjectVaultLocation | null {
  if (typeof projectRoot !== 'string') return null;
  // A trailing separator would produce `…/project//atlas`, which a person cannot match against
  // their shell.
  const root = projectRoot.trim().replace(/[/\\]+$/, '');
  if (!root) return null;
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  const vaultRoot = `${root}${separator}${PROJECT_VAULT_DIR}`;
  return { projectRoot: root, vaultRoot, displayPath: vaultRoot };
}

export function projectAlreadyHasVault(entryNames: readonly string[]): boolean {
  return entryNames.some((name) => name === PROJECT_VAULT_DIR);
}

/** A project genuinely named `atlas` is possible, so the caller offers the parent rather than refusing. */
export function pickedTheMapFolder(projectRoot: string | null | undefined): boolean {
  if (typeof projectRoot !== 'string') return false;
  const name = projectRoot.trim().replace(/[/\\]+$/, '').split(/[/\\]/).pop();
  return name === PROJECT_VAULT_DIR;
}
