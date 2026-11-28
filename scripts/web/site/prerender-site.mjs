#!/usr/bin/env node
// Writes the website's pages into the site folder the client build produced:
//   node scripts/web/site/prerender-site.mjs [--site=<folder>]
// The folder defaults to the site folder (`scripts/lib/web/built-folders.mjs`), which `vite build --mode site` writes. For each address the
// router holds it renders the page with React's own prerender (`write-site.tsx`), then adds the icons, the
// sitemap, robots and llms files. The client build must already be there: the pages link its files.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import { SITE_FOLDER } from '../../lib/web/built-folders.mjs';
import { readSiteAssets } from './read-site-assets.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export async function prerenderSite(siteFolder) {
  // React's development build checks keys, owners and props on every element, which this run never needs; the pages are
  // what the production build would render. Set before Vite reads it and before React is loaded.
  process.env.NODE_ENV ??= 'production';
  const server = await createServer({
    root: repository,
    configFile: join(repository, 'vite.config.ts'),
    // The mode the website's client build ran in, so the config answers as it did there.
    mode: 'site',
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    const { writeSite } = await server.ssrLoadModule('/scripts/web/site/write-site.tsx');
    const files = await writeSite({ root: repository, assets: readSiteAssets(siteFolder) });
    for (const file of files) {
      const target = join(siteFolder, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.text);
    }
    // The three icons the pages name in `<head>` sit beside the routes in `app/`.
    for (const icon of ['favicon.ico', 'icon.png', 'apple-icon.png']) copyFileSync(join(repository, 'app', icon), join(siteFolder, icon));
    rmSync(join(siteFolder, '.vite'), { recursive: true, force: true });
    return files.length;
  } finally {
    await server.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = process.argv.find((argument) => argument.startsWith('--site='));
  const siteFolder = resolve(flag ? flag.slice('--site='.length) : join(repository, SITE_FOLDER));
  const count = await prerenderSite(siteFolder);
  console.log(`[prerender-site] wrote ${count} files into ${siteFolder}`);
}
