/** Rules on vault-relative paths: a file's name, its ancestor folders, confinement to the vault and containment. */

export function eachAncestor(path: string, visit: (dir: string) => void): void {
  for (let at = path.lastIndexOf('/'); at > 0; at = path.lastIndexOf('/', at - 1)) visit(path.slice(0, at));
}

/** Relative, `/`-separated and inside the vault; the watcher's word is not trusted further. */
export function isConfinedRelativePath(path: string): boolean {
  if (!path || path.includes('\\') || path.includes('\0')) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** The nearest of `dir`'s ancestors (or `dir` itself) in `dirs`, else null. O(depth). */
export function withinAny(path: string, dirs: ReadonlySet<string>, inclusive: boolean): string | null {
  if (inclusive && dirs.has(path)) return path;
  let found: string | null = null;
  eachAncestor(path, (dir) => {
    if (found === null && dirs.has(dir)) found = dir;
  });
  return found;
}
