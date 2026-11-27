import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/** Deletes each folder (relative to `cwd`) so the next build or dev start finds no cache. */
export function deleteCacheDirs(cacheDirs, cwd) {
  for (const dir of cacheDirs) rmSync(resolve(cwd, dir), { recursive: true, force: true });
}
