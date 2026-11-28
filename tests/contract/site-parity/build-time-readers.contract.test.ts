import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The readers that open vault files and Git in Node live behind one entry, `src/views/build-time-readers.ts`.
 * A browser bundle that imports it works in a build, which drops what it does not use, and stops the dev server
 * on the first `node:` import, so nothing under `src/` may.
 */
describe('the build-time readers', () => {
  it('are imported by no file of the browser bundle', () => {
    const tracked = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const importers = tracked
      .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && path !== 'src/views/build-time-readers.ts' && existsSync(path))
      .filter((path) => /views\/build-time-readers['"]/.test(readFileSync(path, 'utf8')));
    expect(importers).toEqual([]);
  });
});
