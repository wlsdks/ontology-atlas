// Names the code that makes the app's cached rows, so a build whose parser or derive code changed
// never reads rows an older build wrote. The name is a hash of every repository file
// `buildMdEntry`'s module loads, followed through relative and `@/` imports, plus the version of
// each package those files import. Any change to one of them changes the name; nothing is bumped
// by hand. Read by next.config.ts and vitest.config.ts.

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

/** The module whose `buildMdEntry` computes every stored row. */
export const ROW_PRODUCER_ENTRY = 'src/entities/docs-vault/lib/local-manifest/build-local-manifest.ts';

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\1/g;
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.json'];

function readAliases(root) {
  let paths = {};
  try {
    paths = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8')).compilerOptions?.paths ?? {};
  } catch {
    return [];
  }
  return Object.entries(paths)
    .filter(([pattern, [target] = []]) => pattern.endsWith('/*') && target?.endsWith('/*'))
    .map(([pattern, [target]]) => [pattern.slice(0, -1), posix.normalize(target.slice(0, -1))])
    .sort((a, b) => b[0].length - a[0].length);
}

function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function packageVersion(root, name) {
  try {
    return JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version ?? 'unknown';
  } catch {
    return 'not installed';
  }
}

/** Every repository file the entry loads, itself included, and every package they import. */
export function rowProducerClosure(root = process.cwd(), entry = ROW_PRODUCER_ENTRY) {
  const aliases = readAliases(root);
  const isFile = (path) => statSync(join(root, path), { throwIfNoEntry: false })?.isFile() === true;
  const files = new Set([entry]);
  const packages = new Map();
  const queue = [entry];
  while (queue.length > 0) {
    const from = queue.pop();
    const source = readFileSync(join(root, from), 'utf8');
    for (const match of source.matchAll(SPECIFIER)) {
      const specifier = match[2];
      let base = null;
      if (specifier.startsWith('.')) base = posix.join(posix.dirname(from), specifier);
      else if (specifier.startsWith('@/')) {
        const alias = aliases.find(([prefix]) => specifier.startsWith(prefix));
        if (alias) base = posix.join(alias[1], specifier.slice(alias[0].length));
      } else if (!specifier.startsWith('node:')) {
        const name = packageName(specifier);
        if (!packages.has(name)) packages.set(name, packageVersion(root, name));
        continue;
      }
      if (base === null) continue;
      const target = [base, ...EXTENSIONS.map((extension) => `${base}${extension}`), ...EXTENSIONS.map((extension) => posix.join(base, `index${extension}`))].find(isFile);
      if (target && !files.has(target)) {
        files.add(target);
        queue.push(target);
      }
    }
  }
  return {
    files: [...files].sort(),
    packages: [...packages].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  };
}

/** Sixteen hex characters naming the row-producing code as it is on disk now. */
export function rowProducerHash(root = process.cwd(), entry = ROW_PRODUCER_ENTRY) {
  const { files, packages } = rowProducerClosure(root, entry);
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(readFileSync(join(root, file)));
    hash.update('\0');
  }
  for (const [name, version] of packages) hash.update(`${name}@${version}\0`);
  return hash.digest('hex').slice(0, 16);
}
