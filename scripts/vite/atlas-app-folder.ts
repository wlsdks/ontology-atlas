import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** What `public/` holds for the website alone; the installed app embeds and ships whatever stays. */
const WEBSITE_ONLY_ENTRIES = ['demo', 'gateway', 'og', 'og-image.png'];

/** Removes the website's files from the app folder once the bundle is written. */
export function atlasAppFolder(): Plugin {
  return {
    name: 'atlas-app-folder',
    apply: 'build',
    closeBundle() {
      const outDir = this.environment.config.build.outDir;
      for (const entry of WEBSITE_ONLY_ENTRIES) fs.rmSync(path.join(outDir, entry), { recursive: true, force: true });
    },
  };
}
