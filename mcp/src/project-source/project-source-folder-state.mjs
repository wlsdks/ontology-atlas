import { createHash } from 'node:crypto';
import { lstatSync, readdirSync } from 'node:fs';
import { compareCodePoints } from '../compare-code-points.mjs';
import {
  SOURCE_INVENTORY_MAX_DEPTH,
  SOURCE_INVENTORY_VERSION,
  SOURCE_PRUNE_DIR_NAMES,
} from './project-source-inventory-limits.mjs';
import { isExcluded } from './project-source-vault-exclusion.mjs';

/**
 * A folder with no repository to ask: one walk that reads each file's size and modification
 * time and no file's bytes. A change that keeps both is not seen, and one that only touches
 * the time is; a repository answers exactly, so this is the fallback and not the rule.
 */
export function inspectFolderState(root, excluded) {
  const lines = [];
  let truncated = false;

  function walk(prefix, depth) {
    if (depth > SOURCE_INVENTORY_MAX_DEPTH) {
      truncated = true;
      return;
    }
    for (const child of readdirSync(prefix ? `${root}/${prefix}` : root, { withFileTypes: true })) {
      if (!child.isDirectory() && !child.isFile()) continue;
      const relative = prefix ? `${prefix}/${child.name}` : child.name;
      if (isExcluded(relative, excluded)) continue;
      if (child.isDirectory()) {
        if (!SOURCE_PRUNE_DIR_NAMES.has(child.name)) walk(relative, depth + 1);
        continue;
      }
      // A file removed since the listing is no file of this state.
      const metadata = lstatSync(`${root}/${relative}`, { throwIfNoEntry: false });
      if (!metadata?.isFile()) continue;
      lines.push(`${relative.normalize('NFC')}\0${metadata.size}\0${Math.trunc(metadata.mtimeMs)}\n`);
    }
  }
  walk('', 0);
  // A line begins with its path and a NUL, which sorts before any path character, so sorting
  // the lines sorts the paths.
  lines.sort(compareCodePoints);

  const hash = createHash('sha256');
  hash.update(`${SOURCE_INVENTORY_VERSION}\0`);
  hash.update(lines.join(''));
  return {
    fingerprint: `sha256:${hash.digest('hex')}`,
    truncated,
    files: lines.map((line) => line.slice(0, line.indexOf('\0'))),
  };
}
