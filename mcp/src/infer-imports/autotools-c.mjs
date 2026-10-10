import { readdirSync, lstatSync, realpathSync } from '../confined-source-fs.mjs';
import { join } from 'node:path';
import { pathResolvesInsideRoot } from './path-confinement.mjs';
import { DEFAULT_IGNORE } from './source-files.mjs';

const AUTOTOOLS_C_DISCOVERY_MAX_ENTRIES = 2000;
const AUTOTOOLS_C_SOURCE_FOLDERS = Object.freeze(['src', 'source', 'lib', 'app', 'internal']);

export function detectAutotoolsC(rootPath) {
  const hasAutotoolsManifest = ['configure.ac', 'configure.in', 'Makefile.am'].some(
    (manifest) => {
      const path = join(rootPath, manifest);
      try {
        const pathStat = lstatSync(path);
        return !pathStat.isSymbolicLink() &&
          pathStat.isFile() &&
          pathResolvesInsideRoot(rootPath, path);
      } catch {
        return false;
      }
    },
  );
  if (!hasAutotoolsManifest) return false;

  let entriesSeen = 0;
  const visitedDirectories = new Set();
  const visit = (directory, depth, descend) => {
    if (depth > 3 || entriesSeen >= AUTOTOOLS_C_DISCOVERY_MAX_ENTRIES) return false;
    let realDirectory;
    try {
      realDirectory = realpathSync(directory);
      if (visitedDirectories.has(realDirectory)) return false;
      visitedDirectories.add(realDirectory);
    } catch {
      return false;
    }
    let entries;
    try {
      entries = readdirSync(directory).sort();
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (entriesSeen >= AUTOTOOLS_C_DISCOVERY_MAX_ENTRIES) return false;
      entriesSeen += 1;
      if (DEFAULT_IGNORE.has(entry) || entry.startsWith('.')) continue;
      const path = join(directory, entry);
      let pathStat;
      try {
        pathStat = lstatSync(path);
        if (pathStat.isSymbolicLink() || !pathResolvesInsideRoot(rootPath, path)) continue;
      } catch {
        continue;
      }
      if (pathStat.isDirectory() && descend) {
        if (visit(path, depth + 1, true)) return true;
      } else if (pathStat.isFile() && /\.(?:c|h)$/i.test(entry)) {
        return true;
      }
    }
    return false;
  };

  if (visit(rootPath, 0, false)) return true;
  for (const folder of AUTOTOOLS_C_SOURCE_FOLDERS) {
    const sourceRoot = join(rootPath, folder);
    try {
      if (lstatSync(sourceRoot).isDirectory() && visit(sourceRoot, 0, true)) return true;
    } catch {
      // Continue with the remaining conventional source roots.
    }
  }
  return false;
}
