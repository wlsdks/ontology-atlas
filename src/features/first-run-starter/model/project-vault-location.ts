/**
 * The map lives inside the project, as `<project>/atlas`, so code and meaning travel and are
 * reviewed together in the same diff. `atlas` is visible: `docs/` gets reorganised and a
 * dot-folder is not read. A product name at a repository root is close to one-way.
 */

// Defined in `shared` because `docs-vault-local` needs the same name from the same layer.
// See `src/shared/lib/project-vault-dir.ts`.
export { PROJECT_VAULT_DIR } from '@/shared/lib/project-vault-dir';

import { PROJECT_VAULT_DIR } from '@/shared/lib/project-vault-dir';

export interface ProjectVaultLocation {
  /** Becomes the connected source. */
  projectRoot: string;
  /** Always `<projectRoot>/atlas`. */
  vaultRoot: string;
  /** Shown before anything is created. */
  displayPath: string;
}

/**
 * Computes where the map goes so the screen can state the path and wait for a yes; touches no
 * disk. Null for an empty path rather than an invented location.
 */
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

/**
 * Used to avoid offering to create what exists; takes the names directly under the project.
 */
export function projectAlreadyHasVault(entryNames: readonly string[]): boolean {
  return entryNames.some((name) => name === PROJECT_VAULT_DIR);
}

/**
 * True when the person picked a map folder instead of its project, which would propose
 * `…/atlas/atlas`. A project genuinely named `atlas` is possible, so the caller offers the
 * parent rather than refusing.
 */
export function pickedTheMapFolder(projectRoot: string | null | undefined): boolean {
  if (typeof projectRoot !== 'string') return false;
  const name = projectRoot.trim().replace(/[/\\]+$/, '').split(/[/\\]/).pop();
  return name === PROJECT_VAULT_DIR;
}
