import { VAULT_SOURCES_DIR } from '../local-manifest/walk-vault';

/**
 * The folders a source sits in below the sources folder, or null at its top. Two files may share
 * a name once copies keep their folders, so a list row needs this to tell them apart.
 */
export function sourceFolderOf(path: string): string | null {
  const prefix = `${VAULT_SOURCES_DIR}/`;
  const inside = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  const slash = inside.lastIndexOf('/');
  return slash > 0 ? inside.slice(0, slash).normalize('NFC') : null;
}
