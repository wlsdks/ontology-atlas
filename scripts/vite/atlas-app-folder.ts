import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

import { isWebsiteOnlyEntry } from '../lib/web/website-only-files.mjs';

/** Removes the website's files from the app folder once the bundle is written. */
export function atlasAppFolder(): Plugin {
  return {
    name: 'atlas-app-folder',
    apply: 'build',
    closeBundle() {
      const outDir = this.environment.config.build.outDir;
      for (const entry of fs.readdirSync(outDir)) {
        if (isWebsiteOnlyEntry(entry)) fs.rmSync(path.join(outDir, entry), { recursive: true, force: true });
      }
    },
  };
}
