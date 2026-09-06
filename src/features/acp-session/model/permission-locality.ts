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
/**
 * `inside-folder`: the path is in the folder the person opened Atlas on — a page, a node,
 * a source. `inside-project`: outside that folder but inside the project above it — the
 * code the map was built from. `elsewhere`: anything else, and anything unresolvable.
 * The first two share the neutral card; only the words differ, because "look at code in
 * your project" over a wiki page write (live turn, 2026-09-06) named the wrong situation.
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
   * ⚠️ **The chosen folder itself is the first thing that counts as inside** (2026-09-06). This
   * used to be measured only against the *project above* the vault, so a folder that is not one of
   * ours — someone's `~/notes`, or any vault outside a `<project>/atlas` layout — had no project
   * root, and every request was answered `elsewhere`. The card then headed a write to a file the
   * person had opened Atlas on with 「it wants to touch something outside this folder」, naming
   * the folder as outside itself. Whatever else is true, a path inside the open folder is inside it.
   */
  if (within(vaultPath, target)) return 'inside-folder';
  const projectRoot = projectRootForVault(vaultPath);
  // No project above this vault — beyond the folder itself, the old reading is the only true one.
  return projectRoot && within(projectRoot, target) ? 'inside-project' : 'elsewhere';
}
