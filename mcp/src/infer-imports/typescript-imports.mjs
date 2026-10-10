import { readFileSync, statSync, existsSync } from '../confined-source-fs.mjs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathResolvesInsideRoot } from './path-confinement.mjs';
import { DEFAULT_IGNORE, isIgnoredPath } from './source-files.mjs';
import { sourceRoleOf } from './source-role.mjs';

const RESOLVE_EXT_ORDER = [
  '.ts',
  '.tsx',
  '.mts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.cts',
];

// import ... from "X", import("X"), require("X"), export ... from "X"
const IMPORT_CLAUSE = String.raw`(?!\s)(?:(?!\b(?:import|export)\b)[\s\S])*?\S`;
export const IMPORT_RE = new RegExp(
  String.raw`(?:\bimport\s+${IMPORT_CLAUSE}\s+from\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bexport\s+${IMPORT_CLAUSE}\s+from\s+)['"]([^'"]+)['"]`,
  'g',
);
export const SIDE_IMPORT_RE = /\bimport\s+['"]([^'"]+)['"]/g;

export function importKindOf(rawMatch) {
  const trimmed = rawMatch.trimStart();
  if (trimmed.startsWith('import(') || trimmed.startsWith('import (')) return 'dynamic';
  if (trimmed.startsWith('require')) return 'require';
  if (trimmed.startsWith('export')) return 'reexport';
  return 'static';
}

export function importUsageOf(rawMatch) {
  const trimmed = rawMatch.trimStart();
  if (/^(?:import|export)\s+type\b/.test(trimmed)) return 'type_only';
  const clause = trimmed.match(/^(?:import|export)\s*\{([\s\S]*?)\}\s*from\b/)?.[1];
  if (clause) {
    const bindings = clause.split(',').map((binding) => binding.trim()).filter(Boolean);
    if (bindings.length > 0 && bindings.every((binding) => /^type\b/.test(binding))) {
      return 'type_only';
    }
  }
  return 'value';
}

export function classify(spec, file, dir, rootPath, edges, external, unresolved, kindOverride, pathAliases = [], ignore = DEFAULT_IGNORE, importUsage = 'value', workspacePackages = []) {
  const kind = kindOverride ?? 'static';
  if (!spec) {
    unresolved.push({ from: relative(rootPath, file), spec, reason: 'empty' });
    return;
  }
  if (spec.startsWith('.') || isAbsolute(spec)) {
    const resolved = resolveRelativeImport(spec, dir);
    if (resolved && existsSync(resolved)) {
      const resolvedRelative = relative(rootPath, resolved);
      if (isIgnoredPath(resolvedRelative, ignore)) return;
      edges.push({
        from: relative(rootPath, file),
        to: resolvedRelative,
        kind,
        sourceRole: sourceRoleOf(relative(rootPath, file)),
        importUsage,
      });
    } else {
      unresolved.push({
        from: relative(rootPath, file),
        spec,
        reason: 'relative-not-found',
      });
    }
    return;
  }
  const workspaceResolved = resolveWorkspacePackageImport(spec, rootPath, workspacePackages);
  if (workspaceResolved.matched) {
    if (workspaceResolved.path) {
      const resolvedRelative = relative(rootPath, workspaceResolved.path);
      if (isIgnoredPath(resolvedRelative, ignore)) return;
      edges.push({
        from: relative(rootPath, file),
        to: resolvedRelative,
        kind,
        sourceRole: sourceRoleOf(relative(rootPath, file)),
        importUsage,
      });
    } else if (workspaceResolved.denied) {
      unresolved.push({
        from: relative(rootPath, file),
        spec,
        reason: 'alias-not-found',
      });
    } else {
      external.push({ from: relative(rootPath, file), spec });
    }
    return;
  }
  const aliasResolved = resolveAliasImport(spec, rootPath, pathAliases);
  if (aliasResolved.matched) {
    if (aliasResolved.path) {
      const resolvedRelative = relative(rootPath, aliasResolved.path);
      if (isIgnoredPath(resolvedRelative, ignore)) return;
      edges.push({
        from: relative(rootPath, file),
        to: resolvedRelative,
        kind,
        sourceRole: sourceRoleOf(relative(rootPath, file)),
        importUsage,
      });
      return;
    }
    unresolved.push({
      from: relative(rootPath, file),
      spec,
      reason: 'alias-not-found',
    });
    return;
  }
  external.push({ from: relative(rootPath, file), spec });
}

function resolveWorkspacePackageImport(spec, rootPath, workspacePackages = []) {
  const matchingPackage = [...workspacePackages]
    .filter((workspacePackage) =>
      workspacePackage.name &&
      (spec === workspacePackage.name || spec.startsWith(`${workspacePackage.name}/`)),
    )
    .sort((a, b) => b.name.length - a.name.length || a.path.localeCompare(b.path))[0];
  if (!matchingPackage) return { matched: false, path: null, denied: false };

  const packageRoot = join(rootPath, matchingPackage.path);
  if (!pathResolvesInsideRoot(rootPath, packageRoot)) {
    return { matched: true, path: null, denied: true };
  }
  const subpath = spec.slice(matchingPackage.name.length).replace(/^\//, '');
  const candidates = subpath
    ? [
        ...workspaceEntryCandidates(packageRoot, subpath),
        resolve(packageRoot, subpath),
        resolve(packageRoot, 'src', subpath),
        resolve(packageRoot, 'source', subpath),
        resolve(packageRoot, 'lib', subpath),
      ]
    : workspaceEntryCandidates(packageRoot);
  let denied = false;
  for (const candidate of candidates) {
    const resolved = resolveImportCandidate(candidate);
    if (!resolved) continue;
    if (
      pathResolvesInsideRoot(rootPath, resolved) &&
      pathResolvesInsideRoot(packageRoot, resolved)
    ) {
      return { matched: true, path: resolved, denied: false };
    }
    denied = true;
  }
  return { matched: true, path: null, denied };
}

function workspaceEntryCandidates(packageRoot, subpath = '') {
  const candidates = [];
  try {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8'));
    if (!subpath) {
      for (const field of ['source', 'module', 'main', 'types']) {
        if (typeof manifest[field] === 'string') candidates.push(resolve(packageRoot, manifest[field]));
      }
    }
    for (const entry of workspaceExportEntries(manifest.exports, subpath)) {
      candidates.push(resolve(packageRoot, entry));
    }
  } catch {
    // A malformed manifest offers no entrypoint: keep it external rather than guess.
  }
  if (!subpath) {
    candidates.push(
      resolve(packageRoot, 'src', 'index'),
      resolve(packageRoot, 'source', 'index'),
      resolve(packageRoot, 'lib', 'index'),
      resolve(packageRoot, 'index'),
    );
  }
  return [...new Set(candidates)];
}

function workspaceExportEntries(exports, subpath) {
  if (typeof exports === 'string') return subpath ? [] : [exports];
  if (!exports || typeof exports !== 'object' || Array.isArray(exports)) return [];
  const target = subpath
    ? exports[`./${subpath}`]
    : Object.hasOwn(exports, '.')
      ? exports['.']
      : exports;
  return collectWorkspaceExportStrings(target);
}

function collectWorkspaceExportStrings(value, entries = []) {
  if (typeof value === 'string') {
    entries.push(value);
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const nested of Object.values(value)) collectWorkspaceExportStrings(nested, entries);
  }
  return entries;
}

function resolveAliasImport(spec, rootPath, pathAliases = []) {
  for (const alias of pathAliases) {
    const mapped = resolveTsconfigPathAlias(spec, rootPath, alias);
    if (!mapped.matched) continue;
    if (mapped.path) return mapped;
    return { matched: true, path: null };
  }

  // `@/X` is the Next.js / FSD convention for `src/X`: resolve it as internal so
  // the edge lands in moduleEdges, not externalImports.
  if (!spec.startsWith('@/')) {
    return { matched: false, path: null };
  }

  const subPath = spec.slice(2);
  // Fallback for repositories without tsconfig paths.
  for (const root of ['src', 'lib', 'app']) {
    const base = join(rootPath, root, subPath);
    const resolved = resolveImportCandidate(base);
    if (resolved) return { matched: true, path: resolved };
  }
  return { matched: true, path: null };
}

export function readTsconfigPathAliases(rootPath) {
  const tsconfigPath = join(rootPath, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) return [];
  let parsed;
  try {
    parsed = parseTsconfigJson(readFileSync(tsconfigPath, 'utf-8'));
  } catch {
    return [];
  }
  const baseUrl = optionalTsconfigBaseUrl(parsed?.compilerOptions?.baseUrl);
  const paths = parsed?.compilerOptions?.paths;
  if (!paths || typeof paths !== 'object' || Array.isArray(paths)) return [];

  const aliases = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    if (typeof pattern !== 'string' || !Array.isArray(targets)) continue;
    const starIndex = pattern.indexOf('*');
    aliases.push({
      pattern,
      prefix: starIndex >= 0 ? pattern.slice(0, starIndex) : pattern,
      suffix: starIndex >= 0 ? pattern.slice(starIndex + 1) : '',
      wildcard: starIndex >= 0,
      targets: targets.filter((target) => typeof target === 'string'),
      baseUrl,
    });
  }
  aliases.sort(
    (a, b) => b.prefix.length - a.prefix.length || a.pattern.localeCompare(b.pattern),
  );
  return aliases;
}

function resolveTsconfigPathAlias(spec, rootPath, alias) {
  if (!alias.wildcard && spec !== alias.pattern) return { matched: false, path: null };
  if (alias.wildcard && (!spec.startsWith(alias.prefix) || !spec.endsWith(alias.suffix))) {
    return { matched: false, path: null };
  }

  const wildcardValue = alias.wildcard
    ? spec.slice(
        alias.prefix.length,
        alias.suffix ? spec.length - alias.suffix.length : undefined,
      )
    : '';
  for (const target of alias.targets) {
    const mapped = target.includes('*') ? target.replace('*', wildcardValue) : target;
    const base = resolve(rootPath, alias.baseUrl, mapped);
    const resolved = resolveImportCandidate(base);
    if (resolved) return { matched: true, path: resolved };
  }
  return { matched: true, path: null };
}

function resolveImportCandidate(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of RESOLVE_EXT_ORDER) {
    const cand = base + ext;
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of RESOLVE_EXT_ORDER) {
      const cand = join(base, 'index' + ext);
      if (existsSync(cand) && statSync(cand).isFile()) return cand;
    }
  }
  return null;
}

function optionalTsconfigBaseUrl(value) {
  return typeof value === 'string' && value.trim() === value ? value : '.';
}

function stripJsonComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function parseTsconfigJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(stripJsonComments(text));
  }
}

function resolveRelativeImport(spec, fromDir) {
  const base = resolve(fromDir, spec);
  if (existsSync(base) && statSync(base).isFile()) return base;
  // NodeNext TypeScript writes runtime `.js` specifiers in `.ts` source: resolve the
  // source sibling before declaring drift.
  const sourceBase = /\.(?:mjs|cjs|js|jsx)$/i.test(base)
    ? base.replace(/\.(?:mjs|cjs|js|jsx)$/i, '')
    : base;
  for (const ext of RESOLVE_EXT_ORDER) {
    const cand = sourceBase + ext;
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of RESOLVE_EXT_ORDER) {
      const cand = join(base, 'index' + ext);
      if (existsSync(cand) && statSync(cand).isFile()) return cand;
    }
  }
  return null;
}
