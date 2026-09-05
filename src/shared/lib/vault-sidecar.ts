/**
 * The vault's sidecar folder — `<vault>/.ontology-atlas/`, where Atlas keeps the local runtime
 * state that is **not** part of the ontology: agent activity, the LLM transfer ledger, private
 * project roots, and the external MCP connectors a person has attached.
 *
 * Two callers needed the same two facts (the folder's name, and that it carries its own
 * `.gitignore`), and two copies of a rule like that is how one of them quietly stops applying it.
 */

/** The folder name. Also matched by this repository's root `.gitignore`. */
export const VAULT_SIDECAR_DIR = '.ontology-atlas';

/**
 * The sidecar's own `.gitignore`, written once when the folder is created.
 *
 * The repository root's ignore rule covers **this** checkout. Somebody's own vault is a different
 * folder, usually its own Git repository, and nothing there knows about us — so the folder carries
 * the rule with it. Without this, the first `git add .` in a personal vault commits an agent
 * activity log and, since the connectors file lives here too, the shape of somebody's tooling.
 */
const SIDECAR_IGNORE_FILE = '.gitignore';
const SIDECAR_IGNORE_CONTENT = '# Ontology Atlas local runtime state — not for commit.\n*\n';

/** The File System Access API signals absence by error name, not by returning null. */
export function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError',
  );
}

/**
 * Put the ignore rule in place if it is not already there. **An existing file is left alone** — the
 * person may have written their own rules into it, and overwriting them to assert ours would be a
 * silent edit of a file we do not own.
 */
export async function ensureSidecarIgnore(
  directory: FileSystemDirectoryHandle,
): Promise<void> {
  try {
    await directory.getFileHandle(SIDECAR_IGNORE_FILE);
    return;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
  const file = await directory.getFileHandle(SIDECAR_IGNORE_FILE, { create: true });
  const writable = await file.createWritable();
  await writable.write(SIDECAR_IGNORE_CONTENT);
  await writable.close();
}
