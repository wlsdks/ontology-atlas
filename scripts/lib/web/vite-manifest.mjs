/**
 * Reads the manifest `vite build --manifest` writes: for each source file or split chunk, the file the build
 * made of it, what it imports statically (`imports`) and what it loads on demand (`dynamicImports`).
 */

export function entryKeys(manifest) {
  const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry);
  if (entries.length === 0) throw new Error('the manifest names no entry chunk');
  return entries;
}

/** The chunks of one route module, whole or split by the router plugin (`topology.tsx?tsr-split=component`). */
export function routeKeys(manifest, routeSource) {
  const keys = Object.keys(manifest).filter((key) => key.startsWith(routeSource));
  if (keys.length === 0) throw new Error(`the manifest holds no chunk of ${routeSource}`);
  return keys;
}

/**
 * The script files reachable from `startKeys`, each once, a chunk after what it imports. With `dynamic` a chunk
 * another screen loads later counts too (what must be bundled for the route); without it only what loads first.
 */
export function scriptFilesFrom(manifest, startKeys, { dynamic = false } = {}) {
  const files = [];
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`the manifest names ${key}, which it does not hold`);
    for (const imported of chunk.imports ?? []) visit(imported);
    if (dynamic) for (const imported of chunk.dynamicImports ?? []) visit(imported);
    if (chunk.file.endsWith('.js') && !files.includes(chunk.file)) files.push(chunk.file);
  };
  for (const key of startKeys) visit(key);
  return files;
}
