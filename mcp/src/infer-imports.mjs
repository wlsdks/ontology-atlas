// R17 — infer_imports
//
// TS/JS file 들의 *relative import* 를 walk + regex parse → file-level
// dependency edges. analyze_repo_structure 의 suggestedRelations 가 *project
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
//   - resolves only *relative* imports (./ ../) → 실 파일. 외부 npm /
//     tsconfig path alias (@/) 는 *external* 로 분류 (resolution 안 함)
//   - 더 정교한 AST parsing 은 후속

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';

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

const SOURCE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
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
 *   moduleEdges: Array<{ from: string, to: string, count: number }>,
 * }}
 */
export function inferImports(rootPath, options = {}) {
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    throw new Error(`rootPath not a directory: ${rootPath}`);
  }
  const ignore = new Set([
    ...DEFAULT_IGNORE,
    ...(options.ignore ?? []).map(String),
  ]);
  const maxFiles = typeof options.maxFiles === 'number' ? options.maxFiles : 5000;
  const sourceFolders = options.sourceFolders ?? ['src', 'lib', 'app', 'packages'];

  // Resolve search roots — defined source folders that exist, plus rootPath
  // itself if no source folder exists (so simple repos still work).
  const roots = [];
  for (const f of sourceFolders) {
    const p = join(rootPath, f);
    if (existsSync(p) && statSync(p).isDirectory()) roots.push(p);
  }
  if (roots.length === 0) roots.push(rootPath);

  const files = [];
  for (const r of roots) walk(r, ignore, files, maxFiles);

  const edges = [];
  const externalImports = [];
  const unresolved = [];

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const dir = dirname(file);

    for (const match of content.matchAll(IMPORT_RE)) {
      const spec = match[1];
      classify(spec, file, dir, rootPath, edges, externalImports, unresolved);
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
      classify(spec, file, dir, rootPath, edges, externalImports, unresolved, 'side');
    }
  }

  // Module-level edge collapse — capability/feature folder is the
  // first segment under one of the source folders.
  const moduleCount = new Map();
  for (const e of edges) {
    const fm = moduleOf(e.from, sourceFolders);
    const tm = moduleOf(e.to, sourceFolders);
    if (!fm || !tm || fm === tm) continue;
    const key = `${fm} → ${tm}`;
    moduleCount.set(key, (moduleCount.get(key) ?? 0) + 1);
  }
  const moduleEdges = [...moduleCount.entries()].map(([key, count]) => {
    const [from, to] = key.split(' → ');
    return { from, to, count };
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
      st = statSync(p);
    } catch {
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

function classify(spec, file, dir, rootPath, edges, external, unresolved, kindOverride) {
  const kind = kindOverride ?? (spec.match(/^import\s*\(/) ? 'dynamic' : 'static');
  if (!spec) {
    unresolved.push({ from: relative(rootPath, file), spec, reason: 'empty' });
    return;
  }
  if (spec.startsWith('.') || isAbsolute(spec)) {
    const resolved = resolveRelativeImport(spec, dir);
    if (resolved && existsSync(resolved)) {
      edges.push({
        from: relative(rootPath, file),
        to: relative(rootPath, resolved),
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
  // R17 follow-up — `@/X` alias is the de-facto Next.js / FSD convention
  // for `src/X`. Resolve it *as internal* so feature→entity/shared edges
  // appear in moduleEdges instead of being lost in externalImports.
  if (spec.startsWith('@/')) {
    const aliasResolved = resolveAliasImport(spec, rootPath);
    if (aliasResolved) {
      edges.push({
        from: relative(rootPath, file),
        to: relative(rootPath, aliasResolved),
        kind,
      });
      return;
    }
    // alias detected but not resolvable — track separately so the user
    // sees what their tsconfig path is missing.
    unresolved.push({
      from: relative(rootPath, file),
      spec,
      reason: 'alias-not-found',
    });
    return;
  }
  external.push({ from: relative(rootPath, file), spec });
}

function resolveAliasImport(spec, rootPath) {
  // Strip the `@/` prefix.
  const subPath = spec.slice(2);
  // Try common src-root mappings in order. (We don't read tsconfig.json
  // — most projects use `@/*` → `src/*`. If a project uses something
  // exotic, the user can still see edges via direct relative imports.)
  for (const root of ['src', 'lib', 'app']) {
    const base = join(rootPath, root, subPath);
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
  }
  return null;
}

function resolveRelativeImport(spec, fromDir) {
  const base = resolve(fromDir, spec);
  // exact file
  if (existsSync(base) && statSync(base).isFile()) return base;
  // try extensions
  for (const ext of RESOLVE_EXT_ORDER) {
    const cand = base + ext;
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

function moduleOf(filePath, sourceFolders) {
  // filePath is relative to rootPath. Find first segment that's a source
  // folder, then take the next segment as the "module" id.
  const parts = filePath.split(/[\\/]/);
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (sourceFolders.includes(parts[i])) {
      // for FSD: src/features/auth/x.ts → module = features/auth
      // generic: src/api/x.ts → module = api
      // Heuristic: skip 'src/', take first sub-folder unless it's an FSD bucket
      const next = parts[i + 1];
      const fsdBuckets = new Set(['features', 'entities', 'widgets', 'views']);
      if (fsdBuckets.has(next) && parts[i + 2]) {
        return `${next}/${parts[i + 2]}`;
      }
      return next;
    }
  }
  return null;
}
