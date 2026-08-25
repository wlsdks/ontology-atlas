/**
 * Where the map lives when someone points Atlas at a codebase.
 *
 * ⚠️ **Inside the project, not beside it** (owner, 2026-08-24). The product shipped two answers at
 * once: the app's "just start" put vaults outside any project,
 * while the CLI's `init` and this repository's own vault sit **inside** the repository
 * (`docs/ontology`). Only one of those keeps the product's central promise.
 *
 * Outside, a colleague clones the repository and gets the code without the map — the meaning stayed
 * on one laptop. A change to the code lands in a pull request while the change to its meaning does
 * not, so the map quietly rots and nobody can see it happening. Inside, the two travel together and
 * are reviewed in the same diff, which is what "Git is the source of truth and people judge meaning
 * in plain files" actually requires.
 *
 * **The name is `atlas`, and it is visible.** Owner: *"docs is used so much I think it would just
 * get deleted."* That is the right read — `docs/` is a crowded folder people reorganise, and a map
 * swept away in a docs tidy-up is worse than one nobody found. A dot-folder was rejected for the
 * opposite reason: what is hidden does not get read, and this product's whole argument is that a
 * person opens these files.
 *
 * Recorded cost: a product name at a repository root is close to one-way. If Atlas is ever renamed,
 * that folder is already sitting in other people's repositories.
 */

// One definition, in `shared`, because the open path in `docs-vault-local` needs the same name and
// sits in the same layer. See `src/shared/lib/project-vault-dir.ts`.
export { PROJECT_VAULT_DIR } from '@/shared/lib/project-vault-dir';

import { PROJECT_VAULT_DIR } from '@/shared/lib/project-vault-dir';

export interface ProjectVaultLocation {
  /** The project the person chose — this becomes the connected source. */
  projectRoot: string;
  /** Where the map will live. Always `<projectRoot>/atlas`. */
  vaultRoot: string;
  /** What the screen shows before anything is created, so the person sees the real path first. */
  displayPath: string;
}

/**
 * Works out where the map goes, and **describes it before it exists**.
 *
 * Creating a folder inside somebody's repository is a write, so the screen states the exact path and
 * waits for a yes. This function only computes; it touches no disk.
 *
 * Returns `null` for an empty or whitespace path rather than inventing a location — a caller with no
 * chosen project has nothing to describe, and a fabricated path is how a confirmation stops being a
 * confirmation.
 */
export function projectVaultLocation(projectRoot: string | null | undefined): ProjectVaultLocation | null {
  if (typeof projectRoot !== 'string') return null;
  // A trailing separator would produce `…/project//atlas`, which is the same folder with a name a
  // person cannot match against what their shell prints.
  const root = projectRoot.trim().replace(/[/\\]+$/, '');
  if (!root) return null;
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  const vaultRoot = `${root}${separator}${PROJECT_VAULT_DIR}`;
  return { projectRoot: root, vaultRoot, displayPath: vaultRoot };
}

/**
 * Is this project already carrying a map?
 *
 * Used to keep the door from offering to create what is already there. The caller passes the names
 * directly under the project, which it already has from listing the folder.
 */
export function projectAlreadyHasVault(entryNames: readonly string[]): boolean {
  return entryNames.some((name) => name === PROJECT_VAULT_DIR);
}

/**
 * Did the person hand us a map folder instead of the project it sits in?
 *
 * ⚠️ Measured on the installed app, 2026-08-25: picking an existing `atlas` folder as "the project"
 * produced `…/atlas/atlas` on screen and offered to create it. Nothing crashes, but the proposal is
 * nonsense, and a product that proposes nonsense with a straight face is one people stop reading —
 * which is fatal for a confirmation whose whole job is to be read.
 *
 * The check is the folder's own name, the same fact `PROJECT_VAULT_DIR` already defines. It cannot
 * know whether some unrelated project is genuinely named `atlas`, so the caller says so and offers
 * the parent rather than refusing outright; the person still decides.
 */
export function pickedTheMapFolder(projectRoot: string | null | undefined): boolean {
  if (typeof projectRoot !== 'string') return false;
  const name = projectRoot.trim().replace(/[/\\]+$/, '').split(/[/\\]/).pop();
  return name === PROJECT_VAULT_DIR;
}
