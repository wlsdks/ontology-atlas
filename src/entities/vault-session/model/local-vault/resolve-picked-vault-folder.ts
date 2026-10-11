/**
 * Redirects a picked project root to its `atlas/` map when that child directory holds Markdown.
 * Both are required: otherwise an unrelated `atlas/` module would open an empty vault.
 * `redirected` exists so the screen says the map was opened.
 */
import { PROJECT_VAULT_DIR } from '@/shared/lib/vault-folder/project-vault-dir';

export interface PickedVaultResolution {
  /** The folder to actually open. */
  rootPath: string;
  /** True when this differs from what the person picked, so the screen must say so. */
  redirected: boolean;
}

/** Names of the entries directly inside a candidate map folder, or `null` if it is not a directory. */
export type ReadChildNames = (rootPath: string) => Promise<readonly string[] | null>;



export async function resolvePickedVaultFolder(
  pickedRootPath: string,
  readChildNames: ReadChildNames,
): Promise<PickedVaultResolution> {
  const stay: PickedVaultResolution = { rootPath: pickedRootPath, redirected: false };
  const root = pickedRootPath.replace(/[/\\]+$/, '');
  if (!root) return stay;
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  const candidate = `${root}${separator}${PROJECT_VAULT_DIR}`;

  let names: readonly string[] | null = null;
  try {
    names = await readChildNames(candidate);
  } catch {
    // Unreadable or absent: not a redirect, and not an error either. The person picked a folder that
    // can be opened on its own terms, and that is what happens.
    return stay;
  }
  if (names === null) return stay;
  // Markdown is what makes it a map. `.md` at the top level is the cheapest true signal — a vault
  // always has some, and a source folder named `atlas` normally does not.
  const holdsMarkdown = names.some((name) => name.toLowerCase().endsWith('.md'));
  if (!holdsMarkdown) return stay;

  return { rootPath: candidate, redirected: true };
}
