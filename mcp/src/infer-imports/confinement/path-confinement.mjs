import { confinedSourceReadsEnabled, lstatSync, realpathSync, statSync } from './confined-source-fs.mjs';
import { dirname, join, relative, isAbsolute, sep } from 'node:path';

export function pathResolvesInsideRoot(rootPath, path) {
  try {
    return resolvedInside(realpathSync(rootPath), realpathSync(path));
  } catch {
    return false;
  }
}

function resolvedInside(realRoot, realPath) {
  const resolvedFromRoot = relative(realRoot, realPath);
  return !(
    resolvedFromRoot === '..' ||
    resolvedFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(resolvedFromRoot)
  );
}

export function isDirectoryInsideRoot(rootPath, path) {
  try {
    const stat = lstatSync(path);
    return !stat.isSymbolicLink() && stat.isDirectory() && pathResolvesInsideRoot(rootPath, path);
  } catch {
    return false;
  }
}

function kindOf(stat) {
  if (stat.isSymbolicLink()) return 'symlink';
  if (stat.isDirectory()) return 'directory';
  return stat.isFile() ? 'file' : 'other';
}

/**
 * The path questions one inference pass asks, each put to the disk at most
 * once: a path's kind through its last link (`stat`) and without it (`lstat`),
 * and whether its real location stays inside the root. A path under a parent
 * that is not a directory is absent without a probe, so a resolver trying C
 * candidates costs O(C) map lookups plus one disk call per distinct path whose
 * parent exists. Confined reads keep every probe, so a snapshot is asked the
 * same paths it always was and refuses the same ones.
 *
 * @param {string} rootPath
 */
export function createPathFacts(rootPath) {
  // Candidates are joined onto the root, so a prefix test tells a path below it;
  // any other path is simply probed.
  const rootPrefix = join(rootPath, sep);
  const parentShortcut = !confinedSourceReadsEnabled();
  const statKinds = new Map();
  const lstatKinds = new Map();
  const insideRoot = new Map();
  let realRoot;

  const underRoot = (path) =>
    path.length > rootPrefix.length && path.startsWith(rootPrefix) && !path.includes(`${sep}..`);
  const parentAbsent = (path) =>
    parentShortcut && underRoot(path) && statKind(dirname(path)) !== 'directory';
  const probe = (memo, path, read) => {
    let kind = memo.get(path);
    if (kind !== undefined) return kind;
    kind = null;
    if (!parentAbsent(path)) {
      try {
        kind = kindOf(read(path));
      } catch {
        kind = null;
      }
    }
    memo.set(path, kind);
    return kind;
  };
  /** @returns {'file'|'directory'|'other'|null} the kind behind every link, or null when nothing is there */
  const statKind = (path) => probe(statKinds, path, statSync);
  /** @returns {'file'|'directory'|'symlink'|'other'|null} */
  const lstatKind = (path) => probe(lstatKinds, path, lstatSync);
  const resolvesInsideRoot = (path) => {
    let answer = insideRoot.get(path);
    if (answer !== undefined) return answer;
    try {
      realRoot ??= realpathSync(rootPath);
      answer = resolvedInside(realRoot, realpathSync(path));
    } catch {
      answer = false;
    }
    insideRoot.set(path, answer);
    return answer;
  };
  return {
    statKind,
    lstatKind,
    exists: (path) => statKind(path) !== null,
    resolvesInsideRoot,
    /** A regular file, not a link, whose real location is inside the root. */
    isOwnFile: (path) => lstatKind(path) === 'file' && resolvesInsideRoot(path),
  };
}
