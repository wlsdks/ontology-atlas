import { lstatSync, realpathSync } from '../confined-source-fs.mjs';
import { relative, isAbsolute, sep } from 'node:path';

export function pathResolvesInsideRoot(rootPath, path) {
  try {
    const resolvedFromRoot = relative(realpathSync(rootPath), realpathSync(path));
    return !(
      resolvedFromRoot === '..' ||
      resolvedFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(resolvedFromRoot)
    );
  } catch {
    return false;
  }
}

export function isDirectoryInsideRoot(rootPath, path) {
  try {
    const stat = lstatSync(path);
    return !stat.isSymbolicLink() && stat.isDirectory() && pathResolvesInsideRoot(rootPath, path);
  } catch {
    return false;
  }
}
