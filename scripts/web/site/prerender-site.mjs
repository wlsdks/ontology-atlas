#!/usr/bin/env node
// Writes the website's pages into the site folder the client build produced:
//   node scripts/web/site/prerender-site.mjs [--site=<folder>]
// The folder defaults to ATLAS_SITE_FOLDER, else the one `vite build --mode site` writes. For each address the
// router holds it renders the page with React's own prerender (`write-site.tsx`), then adds the icons, the
// sitemap, robots and llms files. The client build must already be there: the pages link its files.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_SITE_FOLDER = 'src-tauri/target/site-vite';

/** The stylesheets, entry script and first imports of the client build's `index.html`, from Vite's manifest. */
export function readSiteAssets(siteFolder) {
  const manifest = JSON.parse(readFileSync(join(siteFolder, '.vite', 'manifest.json'), 'utf8'));
  const entry = manifest['index.html'];
  if (!entry?.isEntry) throw new Error(`${siteFolder}/.vite/manifest.json has no index.html entry; run vite build --mode site first`);
  const stylesheets = new Set();
  const preloadedModules = new Set();
  const visit = (chunk) => {
    for (const css of chunk.css ?? []) stylesheets.add(`/${css}`);
    for (const key of chunk.imports ?? []) {
      const imported = manifest[key];
      if (imported && !preloadedModules.has(`/${imported.file}`)) {
        preloadedModules.add(`/${imported.file}`);
        visit(imported);
      }
    }
  };
  visit(entry);
  return { stylesheets: [...stylesheets], entryScript: `/${entry.file}`, preloadedModules: [...preloadedModules] };
}

export async function prerenderSite(siteFolder) {
  const server = await createServer({
    root: repository,
    configFile: join(repository, 'vite.config.ts'),
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
  const siteFolder = resolve(flag ? flag.slice('--site='.length) : (process.env.ATLAS_SITE_FOLDER ?? join(repository, DEFAULT_SITE_FOLDER)));
  const count = await prerenderSite(siteFolder);
  console.log(`[prerender-site] wrote ${count} files into ${siteFolder}`);
}
