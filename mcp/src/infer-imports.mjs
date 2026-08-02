// R17 — infer_imports
//
// TS/JS and Python files' static imports become observed file-level dependency
// edges. Python is parsed as bounded text and never imported or executed.
// analyze_repo_structure 의 suggestedRelations 가 *project
// contains capability* 한 줄이라면, 이건 진짜 *capability A depends_on
// capability B* edge 의 source.
//
// 단일 source of truth 보존:
//   - 결과는 return only — vault frontmatter 안 건드림
//   - agent 가 검토 후 *명시 add_relation* 만 vault 진입
//
// 한계 (의도적 minimal):
//   - regex 기반 — TypeScript / JS 의 95% case (top-level static import)
//     cover. dynamic import / re-export / type-only 도 같은 regex 로 잡힘
//   - resolves relative imports, tsconfig paths, and fallback common @/* aliases
//     → real files. unresolved aliases surface as alias-not-found instead of
//     external npm.
//     외부 npm import 는 externalImports 로 별도 분류.
//   - Python 은 import / from ... import 만 보수적으로 읽으며 동적 import,
//     namespace-package 추측, 의미 관계 자동 승격은 하지 않음
//   - 더 정교한 AST parsing 은 후속

import { readFileSync, readdirSync, statSync, lstatSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute, extname } from 'node:path';

const DEFAULT_IGNORE = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  '.next',
  '.expo',
  '.turbo',
  '.cache',
  'coverage',
]);
const IGNORE_ARRAY_MAX_ITEMS = 200;
const SOURCE_FOLDER_ARRAY_MAX_ITEMS = 50;

const SOURCE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.py',
]);

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

export const IMPORT_EDGE_KIND_VALUES = Object.freeze([
  'static',
  'dynamic',
  'require',
  'reexport',
  'side',
]);

export const IMPORT_UNRESOLVED_REASON_VALUES = Object.freeze([
  'empty',
  'relative-not-found',
  'alias-not-found',
]);

const SUPPORT_ELEMENT_BUCKETS = new Set([
  'app',
  'apps',
  'domain',
  'domains',
  'integration',
  'integrations',
  'infra',
  'infrastructure',
  'lib',
  'libs',
  'report',
  'reports',
  'shared',
  'storage',
  'store',
  'stores',
  'util',
  'utils',
]);

// matches: import ... from "X", import("X"), require("X"), export ... from "X"
const IMPORT_RE =
  /(?:\bimport\s+(?:[\s\S]*?)\s+from\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bexport\s+(?:[\s\S]*?)\s+from\s+)['"]([^'"]+)['"]/g;
// also bare `import "X"` (side-effect import) — separate to avoid bloat
const SIDE_IMPORT_RE = /\bimport\s+['"]([^'"]+)['"]/g;

/**
 * Walk a code repo and infer file-level import edges.
 *
 * @param {string} rootPath — repo root (must exist)
 * @param {{ sourceFolders?: string[], ignore?: string[], maxFiles?: number }} options
 * @returns {{
 *   rootPath: string,
 *   filesScanned: number,
 *   edges: Array<{ from: string, to: string, kind: 'static'|'dynamic'|'require'|'reexport'|'side' }>,
 *   externalImports: Array<{ from: string, spec: string }>,
 *   unresolved: Array<{ from: string, spec: string, reason: string }>,
 *   moduleEdges: Array<{ from: string, to: string, count: number, kindCounts: Record<string, number> }>,
 * }}
 */
export function inferImports(rootPath, options = {}) {
  validateRootPath(rootPath);
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    throw new Error(`rootPath not a directory: ${rootPath}`);
  }
  const ignore = new Set([
    ...DEFAULT_IGNORE,
    ...optionalStringArray(options.ignore, 'ignore', { max: IGNORE_ARRAY_MAX_ITEMS }),
  ]);
  const maxFiles = optionalPositiveInteger(options.maxFiles, 'maxFiles', { max: 50000 }) ?? 5000;
  const sourceFolders = optionalStringArray(options.sourceFolders, 'sourceFolders', {
    max: SOURCE_FOLDER_ARRAY_MAX_ITEMS,
    fallback: ['src', 'lib', 'app', 'apps', 'packages'],
  });

  // Resolve search roots — defined source folders that exist, plus rootPath
  // itself if no source folder exists (so simple repos still work).
  const roots = [];
  let configuredRootExists = false;
  for (const f of sourceFolders) {
    const p = join(rootPath, f);
    if (!existsSync(p) || !statSync(p).isDirectory()) continue;
    configuredRootExists = true;
    if (ignore.has(f)) continue;
    roots.push(p);
  }
  if (roots.length === 0 && !configuredRootExists) {
    const pythonPackageRoots = discoverRootPythonPackages(rootPath, ignore);
    roots.push(...(pythonPackageRoots.length > 0 ? pythonPackageRoots : [rootPath]));
  }

  const files = [];
  for (const r of roots) walk(r, ignore, files, maxFiles);

  const edges = [];
  const externalImports = [];
  const unresolved = [];
  const pathAliases = readTsconfigPathAliases(rootPath);

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const dir = dirname(file);

    if (extname(file) === '.py') {
      for (const pythonImport of parsePythonImports(content)) {
        classifyPythonImport(
          pythonImport,
          file,
          rootPath,
          edges,
          externalImports,
          unresolved,
          ignore,
        );
      }
      continue;
    }

    for (const match of content.matchAll(IMPORT_RE)) {
      const spec = match[1];
      classify(spec, file, dir, rootPath, edges, externalImports, unresolved, importKindOf(match[0]), pathAliases, ignore);
    }
    for (const match of content.matchAll(SIDE_IMPORT_RE)) {
      // SIDE_IMPORT_RE matches a superset of IMPORT_RE in some cases —
      // dedup by checking we haven't already added this exact (from, to, spec).
      // Cheap heuristic: only count `import "X"` lines that AREN'T also
      // matched by `import ... from "X"`.
      const idx = match.index;
      // Quick context check: is the prior char an `m` of "from"? then skip.
      const window = content.slice(Math.max(0, idx - 10), idx + 2);
      if (/from\s*$/.test(window.replace(/\s+$/, ''))) continue;
      const spec = match[1];
      classify(spec, file, dir, rootPath, edges, externalImports, unresolved, 'side', pathAliases, ignore);
    }
  }

  // Module-level edge collapse — capability/feature folder is the
  // first segment under one of the source folders.
  const moduleCount = new Map();
  for (const e of edges) {
    const fm = moduleOf(e.from, sourceFolders, rootPath);
    const tm = moduleOf(e.to, sourceFolders, rootPath);
    if (!fm || !tm || fm === tm) continue;
    const key = `${fm} → ${tm}`;
    const bucket = moduleCount.get(key) ?? {
      count: 0,
      kindCounts: new Map(),
    };
    bucket.count += 1;
    bucket.kindCounts.set(e.kind, (bucket.kindCounts.get(e.kind) ?? 0) + 1);
    moduleCount.set(key, bucket);
  }
  const moduleEdges = [...moduleCount.entries()].map(([key, bucket]) => {
    const [from, to] = key.split(' → ');
    return {
      from,
      to,
      count: bucket.count,
      kindCounts: Object.fromEntries(
        [...bucket.kindCounts.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
    };
  });
  moduleEdges.sort((a, b) => b.count - a.count);

  return {
    rootPath,
    filesScanned: files.length,
    edges,
    externalImports,
    unresolved,
    moduleEdges,
  };
}

function discoverRootPythonPackages(rootPath, ignore) {
  let entries;
  try {
    entries = readdirSync(rootPath).sort();
  } catch {
    return [];
  }
  return entries
    .filter(
      (entry) =>
        !ignore.has(entry) &&
        !['test', 'tests'].includes(entry.toLowerCase()) &&
        !entry.startsWith('.'),
    )
    .map((entry) => join(rootPath, entry))
    .filter((path) => {
      try {
        return !lstatSync(path).isSymbolicLink() &&
          lstatSync(path).isDirectory() &&
          existsSync(join(path, '__init__.py')) &&
          !lstatSync(join(path, '__init__.py')).isSymbolicLink();
      } catch {
        return false;
      }
    });
}

function parsePythonImports(content) {
  const imports = [];
  for (const rawLine of pythonLogicalLines(content)) {
    const line = rawLine.trim();
    if (!line) continue;
    const fromMatch = line.match(
      /^from\s+([A-Za-z_][\w.]*|\.+[\w.]*)\s+import\s+(.+)$/,
    );
    if (fromMatch) {
      imports.push({
        module: fromMatch[1],
        names: pythonImportedNames(fromMatch[2]),
      });
      continue;
    }
    const importMatch = line.match(/^import\s+(.+)$/);
    if (!importMatch) continue;
    for (const item of importMatch[1].split(',')) {
      const moduleName = item.trim().split(/\s+as\s+/i)[0]?.trim();
      if (moduleName) imports.push({ module: moduleName, names: [] });
    }
  }
  return imports;
}

function pythonImportedNames(value) {
  return value
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((item) => item.trim().split(/\s+as\s+/i)[0]?.trim())
    .filter((item) => item && item !== '*');
}

function pythonLogicalLines(content) {
  const lines = [];
  let buffer = '';
  let parenthesisDepth = 0;
  let tripleQuote = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const code = stripPythonStringsAndComment(rawLine, {
      get tripleQuote() { return tripleQuote; },
      set tripleQuote(value) { tripleQuote = value; },
    });
    const continued = /\\\s*$/.test(code);
    const fragment = code.replace(/\\\s*$/, '').trim();
    if (fragment) buffer = buffer ? `${buffer} ${fragment}` : fragment;
    parenthesisDepth += [...code].reduce(
      (depth, character) =>
        character === '(' ? depth + 1 : character === ')' ? depth - 1 : depth,
      0,
    );
    if (!tripleQuote && parenthesisDepth <= 0 && !continued) {
      if (buffer) lines.push(buffer);
      buffer = '';
      parenthesisDepth = 0;
    }
  }
  if (!tripleQuote && buffer) lines.push(buffer);
  return lines;
}

function stripPythonStringsAndComment(line, state) {
  let result = '';
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    if (state.tripleQuote) {
      const closingIndex = line.indexOf(state.tripleQuote, index);
      if (closingIndex < 0) return result;
      index = closingIndex + state.tripleQuote.length - 1;
      state.tripleQuote = null;
      continue;
    }
    const triple = line.slice(index, index + 3);
    if (!quote && (triple === '"""' || triple === "'''")) {
      state.tripleQuote = triple;
      index += 2;
      continue;
    }
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (!quote && character === '#') break;
    if (!quote) result += character;
  }
  return result;
}

function classifyPythonImport(
  pythonImport,
  file,
  rootPath,
  edges,
  external,
  unresolved,
  ignore,
) {
  const moduleSpec = resolvePythonRelativeModule(
    pythonImport.module,
    file,
    rootPath,
  );
  if (!moduleSpec) {
    unresolved.push({
      from: relative(rootPath, file),
      spec: pythonImport.module,
      reason: 'relative-not-found',
    });
    return;
  }
  const baseTarget = resolvePythonModule(moduleSpec, rootPath);
  const targets = pythonImport.names.length > 0
    ? pythonImport.names
        .map(
          (name) =>
            resolvePythonModule(`${moduleSpec}.${name}`, rootPath) ?? baseTarget,
        )
        .filter(Boolean)
    : baseTarget
      ? [baseTarget]
      : [];
  if (targets.length > 0) {
    for (const target of targets) {
      const targetPath = relative(rootPath, target);
      if (isIgnoredPath(targetPath, ignore)) continue;
      if (
        !edges.some(
          (edge) =>
            edge.from === relative(rootPath, file) &&
            edge.to === targetPath &&
            edge.kind === 'static',
        )
      ) {
        edges.push({
          from: relative(rootPath, file),
          to: targetPath,
          kind: 'static',
        });
      }
    }
    return;
  }
  const topLevel = moduleSpec.split('.')[0];
  if (resolvePythonModule(topLevel, rootPath)) {
    unresolved.push({
      from: relative(rootPath, file),
      spec: pythonImport.module,
      reason: 'alias-not-found',
    });
  } else {
    external.push({ from: relative(rootPath, file), spec: pythonImport.module });
  }
}

function resolvePythonRelativeModule(spec, file, rootPath) {
  if (!spec.startsWith('.')) return spec;
  const leadingDots = spec.match(/^\.+/)?.[0].length ?? 0;
  const suffix = spec.slice(leadingDots);
  const fromParts = relative(rootPath, dirname(file)).split(/[\\/]/).filter(Boolean);
  const keep = fromParts.length - Math.max(0, leadingDots - 1);
  if (keep < 0) return null;
  return [...fromParts.slice(0, keep), ...suffix.split('.').filter(Boolean)].join('.');
}

function resolvePythonModule(spec, rootPath) {
  if (!spec || spec.startsWith('.')) return null;
  const base = join(rootPath, ...spec.split('.'));
  const file = `${base}.py`;
  if (
    existsSync(file) &&
    !lstatSync(file).isSymbolicLink() &&
    lstatSync(file).isFile()
  ) return file;
  const packageEntry = join(base, '__init__.py');
  if (
    existsSync(packageEntry) &&
    !lstatSync(packageEntry).isSymbolicLink() &&
    lstatSync(packageEntry).isFile()
  ) {
    return packageEntry;
  }
  return null;
}

/**
 * Enumerate repo source files (absolute paths) reusing the same walker +
 * ignore set as import inference — so callers (e.g. validate_vault's reconcile
 * suggestion) skip node_modules / .git / dist / dotfiles and stay bounded.
 *
 * @param {string} rootPath
 * @param {number} [maxFiles=4000]
 * @returns {string[]} absolute source-file paths
 */
export function listSourceFiles(rootPath, maxFiles = 4000) {
  const out = [];
  walk(rootPath, DEFAULT_IGNORE, out, maxFiles);
  return out;
}

function walk(dir, ignore, out, maxFiles) {
  if (out.length >= maxFiles) return;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (ignore.has(name)) continue;
    if (name.startsWith('.') && name !== '.') continue;
    const p = join(dir, name);
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      continue;
    }
    if (st.isDirectory()) {
      walk(p, ignore, out, maxFiles);
      if (out.length >= maxFiles) return;
    } else if (st.isFile()) {
      const dot = name.lastIndexOf('.');
      if (dot < 0) continue;
      const ext = name.slice(dot);
      if (SOURCE_EXT.has(ext)) {
        out.push(p);
        if (out.length >= maxFiles) return;
      }
    }
  }
}

function importKindOf(rawMatch) {
  const trimmed = rawMatch.trimStart();
  if (trimmed.startsWith('import(') || trimmed.startsWith('import (')) return 'dynamic';
  if (trimmed.startsWith('require')) return 'require';
  if (trimmed.startsWith('export')) return 'reexport';
  return 'static';
}

function classify(spec, file, dir, rootPath, edges, external, unresolved, kindOverride, pathAliases = [], ignore = DEFAULT_IGNORE) {
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
  const aliasResolved = resolveAliasImport(spec, rootPath, pathAliases);
  if (aliasResolved.matched) {
    if (aliasResolved.path) {
      const resolvedRelative = relative(rootPath, aliasResolved.path);
      if (isIgnoredPath(resolvedRelative, ignore)) return;
      edges.push({
        from: relative(rootPath, file),
        to: resolvedRelative,
        kind,
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

function isIgnoredPath(filePath, ignore) {
  return filePath.split(/[\\/]/).some((segment) => ignore.has(segment));
}

function resolveAliasImport(spec, rootPath, pathAliases = []) {
  for (const alias of pathAliases) {
    const mapped = resolveTsconfigPathAlias(spec, rootPath, alias);
    if (!mapped.matched) continue;
    if (mapped.path) return mapped;
    return { matched: true, path: null };
  }

  // R17 follow-up — `@/X` alias is the de-facto Next.js / FSD convention
  // for `src/X`. Resolve it *as internal* so feature→entity/shared edges
  // appear in moduleEdges instead of being lost in externalImports.
  if (!spec.startsWith('@/')) {
    return { matched: false, path: null };
  }

  // Strip the `@/` prefix.
  const subPath = spec.slice(2);
  // Fallback for repos without tsconfig paths. Most Next.js/FSD projects use
  // `@/*` with one of these roots.
  for (const root of ['src', 'lib', 'app']) {
    const base = join(rootPath, root, subPath);
    const resolved = resolveImportCandidate(base);
    if (resolved) return { matched: true, path: resolved };
  }
  return { matched: true, path: null };
}

function readTsconfigPathAliases(rootPath) {
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
  // exact file
  if (existsSync(base) && statSync(base).isFile()) return base;
  // NodeNext/ESM TypeScript commonly writes runtime `.js` specifiers in
  // `.ts` source. Resolve the source sibling before declaring drift.
  const sourceBase = /\.(?:mjs|cjs|js|jsx)$/i.test(base)
    ? base.replace(/\.(?:mjs|cjs|js|jsx)$/i, '')
    : base;
  // try extensions
  for (const ext of RESOLVE_EXT_ORDER) {
    const cand = sourceBase + ext;
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  // try base/index.* (folder)
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of RESOLVE_EXT_ORDER) {
      const cand = join(base, 'index' + ext);
      if (existsSync(cand) && statSync(cand).isFile()) return cand;
    }
  }
  return null;
}

function moduleOf(filePath, sourceFolders, rootPath) {
  // filePath is relative to rootPath. Find first segment that's a source
  // folder, then take the next segment as the "module" id.
  //
  // R+ — slug parity with analyze_repo_structure. The analyzer emits
  // folder-prefixed ontology slugs (`capabilities/X`, `elements/<flat-name>`)
  // so import-derived edges can be applied directly after bootstrap.
  //
  // 슬러그는 평평한 식별자다 (2026-08-01 판정 — docs/DECISIONS.md). 종전의
  // `elements/src/entities/foo` path-style 은 폐기 — analyze 와 같은 규칙으로
  // 이름만 슬러그에 싣고, basename 이 레이어를 넘어 겹칠 때만 레이어 단수형
  // 접미로 가른다 (같은 rootPath 를 보므로 두 도구의 판정이 일치한다).
  const parts = filePath.split(/[\\/]/);
  if (
    parts.length >= 2 &&
    existsSync(join(rootPath, parts[0], '__init__.py'))
  ) {
    const modulePart = parts[1];
    const rawName = modulePart === '__init__.py'
      ? parts[0]
      : stripSourceExtension(modulePart);
    const flatName = rawName
      .replace(/_/g, '-')
      .replace(/[^A-Za-z0-9-]/g, '')
      .toLowerCase();
    return flatName ? `elements/${flatName}` : null;
  }
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (i !== 0) continue;
    if (sourceFolders.includes(parts[i])) {
      const next = parts[i + 1];
      if (
        (parts[i] === 'apps' || parts[i] === 'packages') &&
        existsSync(join(rootPath, parts[i], next, 'package.json'))
      ) {
        // analyze 는 apps → packages 순서로 훑으며 두 번째 충돌자에만 폴더
        // 접두를 붙인다 — 같은 규칙: apps 가 bare 이름을 갖는다.
        const collidesWithApps =
          parts[i] === 'packages' &&
          existsSync(join(rootPath, 'apps', next, 'package.json'));
        return `elements/${collidesWithApps ? `packages-${next}` : next}`;
      }
      // capability 류 bucket — analyze 가 inner name 만 slug 으로 쓰므로
      // capabilities/ 아래에 둔다.
      const capabilityBuckets = new Set(['features']);
      if (capabilityBuckets.has(next) && parts[i + 2]) {
        return `capabilities/${stripSourceExtension(parts[i + 2])}`;
      }
      // element 류 bucket — analyze 와 같은 flat + 충돌 시 레이어 접미 규칙.
      const elementBuckets = ['entities', 'widgets', 'views'];
      if (elementBuckets.includes(next) && parts[i + 2]) {
        const name = stripSourceExtension(parts[i + 2]);
        const collides =
          elementBuckets.filter((bucket) =>
            existsSync(join(rootPath, parts[i], bucket, name)),
          ).length > 1;
        const layerSingular = next.replace(/ies$/, 'y').replace(/s$/, '');
        return `elements/${collides ? `${name}-${layerSingular}` : name}`;
      }
      // Single-file layered repos are common in small apps:
      //   src/features/check-in.js   -> user-facing capability
      //   src/domain/habit.js        -> implementation element
      //   src/storage/json-store.js  -> implementation element
      //
      // Treating every depth-1 folder as a capability produces noisy ontology
      // nodes like `capabilities/domain` and `capabilities/storage`. Keep
      // feature files as capabilities, but classify support layers by their
      // role so bootstrap lands a more useful graph on a clean vault.
      if (next === 'features' && parts[i + 2]) {
        return `capabilities/${stripSourceExtension(parts[i + 2])}`;
      }
      if (isSupportElementBucket(next) && parts[i + 2]) {
        // 파일의 basename 이 role 이름 — `src/storage/json-store.js` →
        // `elements/json-store`. 위치는 evidence 가 나른다.
        return `elements/${stripSourceExtension(parts[parts.length - 1])}`;
      }
      // Generic fallback — sourceFolder 다음 첫 segment 가 module.
      return `capabilities/${next}`;
    }
  }
  return null;
}

function validateRootPath(rootPath) {
  if (typeof rootPath !== 'string' || !rootPath.trim()) {
    throw new Error('rootPath must be a non-empty string.');
  }
  if (rootPath.trim() !== rootPath) {
    throw new Error('rootPath must not have leading or trailing whitespace.');
  }
  if (rootPath.includes('\0')) {
    throw new Error('rootPath must not contain a null byte.');
  }
}

function optionalPositiveInteger(value, name, options = {}) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}.`);
  }
  return value;
}

function optionalStringArray(value, name, options = {}) {
  if (value === undefined) return options.fallback ?? [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${name} must be an array of strings.`);
  }
  if (options.max !== undefined && value.length > options.max) {
    throw new Error(`${name} must contain at most ${options.max} items.`);
  }
  return value.map((item) => {
    const trimmed = item.trim();
    if (!trimmed) {
      throw new Error(`${name} items must be non-empty strings.`);
    }
    if (trimmed !== item) {
      throw new Error(`${name} items must not have leading or trailing whitespace.`);
    }
    if (trimmed.includes('\0')) {
      throw new Error(`${name} items must not contain a null byte.`);
    }
    return trimmed;
  });
}

function isSupportElementBucket(segment) {
  return SUPPORT_ELEMENT_BUCKETS.has(segment);
}

function stripSourceExtension(segment) {
  for (const ext of SOURCE_EXT) {
    if (segment.endsWith(ext)) return segment.slice(0, -ext.length);
  }
  return segment;
}
