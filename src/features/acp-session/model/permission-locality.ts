import { projectRootForVault } from './vault-mcp-server';

/**
 * Is what the agent wants to touch **the person's own project**, or somewhere else entirely?
 *
 * ⚠️ **Why this distinction became necessary** (measured in the installed app, 2026-08-25). The
 * permission card says 「it wants to touch something outside this folder」, which was informative
 * while vaults lived beside their code: outside the vault meant somewhere unrelated.
 *
 * Since maps moved to `<project>/atlas`, the product's own headline flow — *make a map from my
 * code* — makes the agent read the code, and the code is by construction outside the vault. So the
 * warning now fires on the exact thing the person just asked for, and reads as alarm rather than
 * information. A warning that cries wolf on the intended path teaches people to click through it,
 * which is precisely what a checkpoint must never teach.
 *
 * The fix is not to suppress the card — every access still stops for an answer. It is to say which
 * of the two situations this is, so the person spends their attention on the one that deserves it.
 */
export type PermissionLocality = 'inside-project' | 'elsewhere';

export function permissionLocality(
  vaultPath: string | null | undefined,
  filePath: string | null | undefined,
): PermissionLocality {
  if (typeof vaultPath !== 'string' || typeof filePath !== 'string') return 'elsewhere';
  const projectRoot = projectRootForVault(vaultPath);
  // No project above this vault — the old reading is the only true one.
  if (!projectRoot) return 'elsewhere';
  const target = filePath.trim();
  if (!target) return 'elsewhere';
  // Boundary-aware: `/p/my-product-archive` is not inside `/p/my-product`, and equality counts.
  const root = projectRoot.replace(/[/\\]+$/, '');
  if (target === root) return 'inside-project';
  return target.startsWith(`${root}/`) || target.startsWith(`${root}\\`)
    ? 'inside-project'
    : 'elsewhere';
}
