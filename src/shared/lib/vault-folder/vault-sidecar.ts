/**
 * The vault's sidecar folder `<vault>/.ontology-atlas/`, where Atlas keeps local runtime state that is
 * not part of the ontology: agent activity, the LLM transfer ledger, private project roots and the
 * attached MCP connectors.
 */

/** The folder name. Also matched by this repository's root `.gitignore`. */
export const VAULT_SIDECAR_DIR = '.ontology-atlas';

/**
 * The sidecar's own `.gitignore`, written once when the folder is created. A personal vault is usually
 * its own repository, where this repository's root rule does not apply, so without it the first
 * `git add .` commits the agent activity log and the connectors file.
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
