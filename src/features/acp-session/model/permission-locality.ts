import { projectRootForVault } from './vault-mcp-server';

/**
 * Is what the agent touches the person's own project, or somewhere else entirely? Every
 * access still stops for an answer; this only says which situation it is, so the warning is
 * not noise.
 */
/**
 * `inside-folder`: in the opened folder. `inside-project`: outside it but inside the project
 * above. `elsewhere`: anything else, or unresolvable. The first two share the neutral card
 * with different words.
 */
export type PermissionLocality = 'inside-folder' | 'inside-project' | 'elsewhere';

/** Boundary-aware containment: `/p/my-product-archive` is not inside `/p/my-product`, and equality counts. */
function within(root: string, target: string): boolean {
  const trimmed = root.replace(/[/\\]+$/, '');
  if (!trimmed) return false;
  return target === trimmed || target.startsWith(`${trimmed}/`) || target.startsWith(`${trimmed}\\`);
}

export function permissionLocality(
  vaultPath: string | null | undefined,
  filePath: string | null | undefined,
): PermissionLocality {
  if (typeof vaultPath !== 'string' || typeof filePath !== 'string') return 'elsewhere';
  const target = filePath.trim();
  if (!target) return 'elsewhere';
  /*
   * A `..` segment means the written path and the path on disk are not the same place, and this
   * function has no filesystem to resolve the difference against. Answering "inside" from the
   * prefix alone would let `<vault>/../../.ssh/id_rsa` wear the neutral card, so an unresolvable
   * target keeps the warning — the one direction it is safe to be wrong in.
   */
  if (/(?:^|[/\\])\.\.(?:[/\\]|$)/.test(target)) return 'elsewhere';
  /*
   * The opened folder itself counts as inside first; a folder without a `<project>/atlas`
   * layout has no project root, so everything else would read as `elsewhere`.
   */
  if (within(vaultPath, target)) return 'inside-folder';
  const projectRoot = projectRootForVault(vaultPath);
  // No project above this vault — beyond the folder itself, the old reading is the only true one.
  return projectRoot && within(projectRoot, target) ? 'inside-project' : 'elsewhere';
}
