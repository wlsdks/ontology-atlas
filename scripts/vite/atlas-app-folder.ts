import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

import { isWebsiteOnlyFile } from '../lib/web/website-only-files.mjs';

/** Removes the website's files, and the repository's own, from the app folder once the bundle is written. */
export function atlasAppFolder(): Plugin {
  return {
    name: 'atlas-app-folder',
    apply: 'build',
    closeBundle() {
      const removeUnused = (directory: string, prefix: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const relativePath = `${prefix}${entry.name}`;
          const absolutePath = path.join(directory, entry.name);
          if (isWebsiteOnlyFile(relativePath)) fs.rmSync(absolutePath, { recursive: true, force: true });
          else if (entry.isDirectory()) removeUnused(absolutePath, `${relativePath}/`);
        }
      };
      removeUnused(this.environment.config.build.outDir, '');
    },
  };
}
