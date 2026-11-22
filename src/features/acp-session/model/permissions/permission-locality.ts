import { projectRootForVault } from '../runtime-wiring/vault-mcp-server';

/** Every access still stops for an answer; this only says which situation it is, so the warning is not noise. */
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
  // A `..` segment means the written path and the path on disk may differ, and there is no filesystem here to resolve it;
  // an unresolvable target keeps the warning, the safe direction to be wrong in.
  if (/(?:^|[/\\])\.\.(?:[/\\]|$)/.test(target)) return 'elsewhere';
  // The opened folder counts as inside first: without a `<project>/atlas` layout there is no project root.
  if (within(vaultPath, target)) return 'inside-folder';
  const projectRoot = projectRootForVault(vaultPath);
  return projectRoot && within(projectRoot, target) ? 'inside-project' : 'elsewhere';
}
