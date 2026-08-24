/**
 * When someone picks their **project** instead of their map, find the map inside it.
 *
 * ⚠️ **A hole the 2026-08-24 "map lives inside the project" decision opened.** While vaults lived
 * outside every project there was only one folder worth picking. Putting the map at
 * `<project>/atlas` made two folders plausible — the project root and the map — and "open a folder"
 * still took whatever was handed to it. So a person who built a map with the door and then, out of
 * habit, picked their project root got their **whole source tree read as a vault**.
 *
 * Measured on the installed app (2026-08-25): pointing the vault at a project root found the
 * concepts inside its `atlas/` folder, because the reader walks subdirectories. So the map is not
 * invisible — the damage is quieter and worse. Every other `.md` carrying frontmatter anywhere in
 * the repository joins it, and **the vault root becomes the project root**, so later writes and the
 * `.ontology-atlas/` records land beside the source instead of inside the map folder.
 *
 * The rule is deliberately narrow. Redirecting is only right when the picked folder is a project
 * *carrying* a map, so both halves must be true:
 *
 * 1. it has a child directory named `atlas`, and
 * 2. that child actually holds Markdown — a real map, not an empty folder or a source directory that
 *    happens to share the name.
 *
 * Without (2) a project with an unrelated `atlas/` module would silently open an empty vault, which
 * is a worse failure than the one this fixes: the person would see nothing and have no idea why.
 *
 * **It is never silent.** `redirected` exists so the screen can say the map inside the project was
 * opened. Quietly opening a different folder from the one a person chose is how a product teaches
 * people that it does not do what they asked, even when the substitution is the helpful one.
 */
import { PROJECT_VAULT_DIR } from '@/shared/lib/project-vault-dir';

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
