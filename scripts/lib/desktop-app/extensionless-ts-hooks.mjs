// Module hooks that let plain Node load the TypeScript sources the e2e specs share. Playwright
// reads them as CommonJS, so they import each other without a file extension and name
// `__dirname`; Node's own loader accepts neither.
const RELATIVE = /^\.{1,2}\//;
const DIRNAME_PRELUDE =
  "import { fileURLToPath as __toPath } from 'node:url'; import { dirname as __dirnameOf } from 'node:path'; " +
  'const __filename = __toPath(import.meta.url); const __dirname = __dirnameOf(__filename);';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !RELATIVE.test(specifier)) throw error;
    for (const suffix of ['.ts', '/index.ts']) {
      try {
        return await nextResolve(`${specifier}${suffix}`, context);
      } catch {
        // try the next suffix
      }
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context);
  if (!url.endsWith('.ts') || loaded.source == null) return loaded;
  const source = loaded.source.toString();
  if (!/\b__dirname\b|\b__filename\b/.test(source)) return loaded;
  return { ...loaded, source: `${DIRNAME_PRELUDE}\n${source}` };
}
