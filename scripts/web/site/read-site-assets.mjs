import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES_FOLDER = 'src/app/routes';

/**
 * The manifest key of the chunk a route's screen is split into, from the route's id. An id that ends in a slash
 * is the folder's index route; any other is its own file, or the folder's layout file (`route.tsx`).
 */
function routeChunkKeys(routeId) {
  const path = routeId.replace(/^\//, '');
  if (!path) return [];
  const files = routeId.endsWith('/') ? [`${path}index`] : [path, `${path}/route`];
  return files.map((file) => `${ROUTES_FOLDER}/${file}.tsx?tsr-split=component`);
}

/**
 * What a page links, from the client build's manifest: the files every page needs (the entry's stylesheets, script
 * and first imports), and `forRoutes`, which adds the stylesheets and scripts of the chunks a page's routes load.
 * A page written without its route's stylesheet would paint unstyled until its script fetched the chunk, so the
 * prerender names them in `<head>` and the browser, which renders the same head, finds them already there.
 */
export function readSiteAssets(siteFolder) {
  const manifest = JSON.parse(readFileSync(join(siteFolder, '.vite', 'manifest.json'), 'utf8'));
  const entry = manifest['index.html'];
  const cleanup = manifest['src/app/old-folder-cleanup.ts'];
  if (!entry?.isEntry || !cleanup?.isEntry) throw new Error(`${siteFolder}/.vite/manifest.json lacks an entry; run vite build --mode site first`);

  /** The stylesheets and scripts of a chunk and of every chunk it imports, each once, in import order. */
  const closureOf = (keys) => {
    const stylesheets = new Set();
    const scripts = new Set();
    const seen = new Set();
    const visit = (key) => {
      const chunk = manifest[key];
      if (!chunk || seen.has(key)) return;
      seen.add(key);
      for (const css of chunk.css ?? []) stylesheets.add(`/${css}`);
      for (const imported of chunk.imports ?? []) {
        const file = manifest[imported]?.file;
        if (file) scripts.add(`/${file}`);
        visit(imported);
      }
    };
    for (const key of keys) visit(key);
    return { stylesheets, scripts };
  };

  const base = closureOf(['index.html']);
  const baseAssets = {
    stylesheets: [...base.stylesheets],
    entryScript: `/${entry.file}`,
    preloadedModules: [...base.scripts],
    oldFolderCleanupScript: `/${cleanup.file}`,
  };

  return {
    ...baseAssets,
    /** The page's assets: the base, then what its routes' chunks bring that the base does not. */
    forRoutes(routeIds) {
      const keys = routeIds.flatMap(routeChunkKeys).filter((key) => manifest[key]);
      const routes = closureOf(keys);
      const scripts = new Set(baseAssets.preloadedModules);
      for (const key of keys) scripts.add(`/${manifest[key].file}`);
      for (const script of routes.scripts) scripts.add(script);
      return {
        ...baseAssets,
        stylesheets: [...new Set([...baseAssets.stylesheets, ...routes.stylesheets])],
        preloadedModules: [...scripts],
      };
    },
  };
}
