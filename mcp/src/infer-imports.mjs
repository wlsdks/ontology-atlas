// infer_imports: static imports of TS/JS, Python and bounded Rust files become
// observed file-level dependency edges; Go imports become package-directory
// evidence. Non-JS languages are parsed as bounded text, never executed.
// Results are returned only: nothing enters the vault until an agent reviews
// them and calls add_relation. Regex-based (static, dynamic, re-export, type-only
// and side-effect imports); relative imports, tsconfig paths and common `@/*`
// aliases resolve to files, an unresolved alias is `alias-not-found`, and npm
// packages are `externalImports`. Python reads root or src-layout packages only;
// Go reads in-module imports, skipping vendor, testdata and `_` trees.

import {
  readFileSync,
  statSync,
  existsSync,
  withConfinedSourceReads,
  confinedSourceReadsEnabled,
} from './confined-source-fs.mjs';
import { join, dirname, relative, extname } from 'node:path';
import { detectAutotoolsC } from './infer-imports/autotools-c.mjs';
import { GO_SOURCE_EXTENSION, inferGoPackageImports } from './infer-imports/go-imports.mjs';
import { moduleOf } from './infer-imports/module-grouping.mjs';
import { isDirectoryInsideRoot } from './infer-imports/path-confinement.mjs';
import {
  discoverRootPythonPackages,
  parsePythonImports,
  classifyPythonImport,
} from './infer-imports/python-imports.mjs';
import {
  RUST_IMPORT_TEXT_MAX_BYTES,
  classifyRustDependencies,
  readRootRustPackageName,
} from './infer-imports/rust-imports.mjs';
import {
  DEFAULT_IGNORE,
  RUST_SOURCE_EXTENSION,
  SOURCE_EXT,
  walk,
} from './infer-imports/source-files.mjs';
import {
  IMPORT_RE,
  SIDE_IMPORT_RE,
  importKindOf,
  importUsageOf,
  classify,
  readTsconfigPathAliases,
} from './infer-imports/typescript-imports.mjs';
import { discoverDeclaredWorkspacePackages } from './infer-imports/workspace-packages.mjs';
import { zeroCounts } from './infer-imports/zero-counts.mjs';

const IGNORE_ARRAY_MAX_ITEMS = 200;
const SOURCE_FOLDER_ARRAY_MAX_ITEMS = 50;
const MODULE_EDGE_EVIDENCE_LIMIT = 5;
const SOURCE_IMPORT_TEXT_MAX_BYTES = 2 * 1024 * 1024;

export const IMPORT_EDGE_KIND_VALUES = Object.freeze([
  'static',
  'dynamic',
  'require',
  'reexport',
  'side',
]);

export const IMPORT_SOURCE_ROLE_VALUES = Object.freeze([
  'production',
  'test',
  'unknown',
]);

export const IMPORT_USAGE_VALUES = Object.freeze([
  'value',
  'type_only',
  'unknown',
]);

export const IMPORT_UNRESOLVED_REASON_VALUES = Object.freeze([
  'empty',
  'relative-not-found',
  'alias-not-found',
  'unsupported-static-form',
  'file-too-large',
]);

/**
 * Bounded repository walk (`maxFiles`), O(bytes) import parsing and fs probes
 * per import. IMPORT_RE stops at import/export keywords; Maps aggregate edges.
 *
 * @param {string} rootPath — repo root (must exist)
 * @param {{ sourceFolders?: string[], ignore?: string[], maxFiles?: number }} options
 * @returns {{
 *   rootPath: string,
 *   filesScanned: number,
 *   edges: Array<{ from: string, to: string, kind: 'static'|'dynamic'|'require'|'reexport'|'side', sourceRole:'production'|'test'|'unknown', importUsage:'value'|'type_only'|'unknown' }>,
 *   externalImports: Array<{ from: string, spec: string }>,
 *   unresolved: Array<{ from: string, spec: string, reason: string }>,
 *   coverage: object,
 *   moduleEdges: Array<{ from: string, to: string, count: number, kindCounts: Record<string, number>, sourceRoleCounts:Record<string,number>, importUsageCounts:Record<string,number>, productValueCount:number, evidence: Array<{from:string,to:string,kind:string,sourceRole:string,importUsage:string}>, evidenceLimited: boolean }>,
 *   packageImportEvidence?: { contract: 'goPackageImports:v1', packageImports: Array<{fromFile:string,fromPackage:string,toPackage:string,importSpec:string,kind:string,sourceRole:string,importUsage:string}>, moduleEdges: object[] },
 * }}
 */
export function inferImports(rootPath, options = {}) {
  if (confinedSourceReadsEnabled() && options.workspacePackages !== undefined) throw new Error('Confined reads do not accept a workspace override.');
  return withConfinedSourceReads(rootPath, () => inferImportsWithinRoot(rootPath, options));
}

function inferImportsWithinRoot(rootPath, options = {}) {
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
    fallback: ['src', 'source', 'lib', 'app', 'apps', 'packages'],
  });
  const workspaceDiscovery = Array.isArray(options.workspacePackages)
    ? { hasDeclaration: true, packages: options.workspacePackages }
    : options.workspacePackages ?? discoverDeclaredWorkspacePackages(rootPath, { ignore });
  const workspacePackages = Array.isArray(workspaceDiscovery?.packages)
    ? workspaceDiscovery.packages
    : [];
  // `apps`/`packages` are a fallback for undeclared monorepos only; once package
  // roots are declared, scanning them would re-admit excluded workspace members.
  const scanSourceFolders =
    options.sourceFolders === undefined && workspaceDiscovery?.hasDeclaration
      ? sourceFolders.filter((folder) => !['apps', 'packages'].includes(folder))
      : sourceFolders;

  // Existing source folders, or rootPath itself when none exists.
  const roots = [];
  let configuredRootExists = false;
  for (const f of scanSourceFolders) {
    const p = join(rootPath, f);
    if (!isDirectoryInsideRoot(rootPath, p)) continue;
    configuredRootExists = true;
    if (ignore.has(f)) continue;
    roots.push(p);
  }
  if (workspaceDiscovery?.hasDeclaration) configuredRootExists = true;
  for (const workspacePackage of confinedSourceReadsEnabled() ? [] : workspacePackages) {
    const packageRoot = join(rootPath, workspacePackage.path);
    if (!isDirectoryInsideRoot(rootPath, packageRoot)) continue;
    roots.push(packageRoot);
  }
  const uniqueRoots = pruneNestedRoots(roots, rootPath);
  if (roots.length === 0 && !configuredRootExists) {
    const pythonPackageRoots = discoverRootPythonPackages(rootPath, ignore);
    uniqueRoots.push(...(pythonPackageRoots.length > 0 ? pythonPackageRoots : [rootPath]));
  }

  const files = [];
  for (const r of uniqueRoots) walk(r, ignore, files, maxFiles);
  const goPackageImports = inferGoPackageImports(
    rootPath,
    ignore,
    Math.max(0, maxFiles - files.length),
    confinedSourceReadsEnabled() ? sourceFolders : null,
    { sourceRoles: IMPORT_SOURCE_ROLE_VALUES, usages: IMPORT_USAGE_VALUES },
  );

  const edges = [];
  const pythonEdgeKeys = new Set();
  const externalImports = [];
  const unresolved = [];
  const pathAliases = readTsconfigPathAliases(rootPath);
  const rustPackageName = files.some((file) => extname(file) === RUST_SOURCE_EXTENSION)
    ? readRootRustPackageName(rootPath)
    : null;

  for (const file of files) {
    const maxBytes = extname(file) === RUST_SOURCE_EXTENSION ? RUST_IMPORT_TEXT_MAX_BYTES : SOURCE_IMPORT_TEXT_MAX_BYTES;
    try {
      if (statSync(file).size > maxBytes) {
        unresolved.push({
          from: relative(rootPath, file).replaceAll('\\', '/'),
          spec: '<source-text>',
          reason: 'file-too-large',
        });
        continue;
      }
    } catch {
      continue;
    }
    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const dir = dirname(file);

    if (extname(file) === RUST_SOURCE_EXTENSION) {
      classifyRustDependencies(
        content,
        file,
        rootPath,
        edges,
        externalImports,
        unresolved,
        ignore,
        rustPackageName,
      );
      continue;
    }

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
          sourceFolders,
          pythonEdgeKeys,
        );
      }
      continue;
    }

    for (const match of content.matchAll(IMPORT_RE)) {
      const spec = match[1];
      classify(
        spec,
        file,
        dir,
        rootPath,
        edges,
        externalImports,
        unresolved,
        importKindOf(match[0]),
          pathAliases,
          ignore,
          importUsageOf(match[0]),
          workspacePackages,
        );
    }
    for (const match of content.matchAll(SIDE_IMPORT_RE)) {
      const window = content.slice(Math.max(0, match.index - 10), match.index + 2);
      const countedByImportRe = /from\s*$/.test(window.replace(/\s+$/, ''));
      if (countedByImportRe) continue;
      const spec = match[1];
      classify(
        spec,
        file,
        dir,
        rootPath,
        edges,
        externalImports,
        unresolved,
        'side',
        pathAliases,
        ignore,
        'value',
        workspacePackages,
      );
    }
  }

  const moduleCount = new Map();
  for (const e of edges) {
    const fm = moduleOf(e.from, sourceFolders, rootPath, workspacePackages);
    const tm = moduleOf(e.to, sourceFolders, rootPath, workspacePackages);
    if (!fm || !tm || fm === tm) continue;
    const key = `${fm} → ${tm}`;
    const bucket = moduleCount.get(key) ?? {
      count: 0,
      kindCounts: new Map(),
      sourceRoleCounts: zeroCounts(IMPORT_SOURCE_ROLE_VALUES),
      importUsageCounts: zeroCounts(IMPORT_USAGE_VALUES),
      productValueCount: 0,
      evidence: [],
    };
    bucket.count += 1;
    bucket.kindCounts.set(e.kind, (bucket.kindCounts.get(e.kind) ?? 0) + 1);
    bucket.sourceRoleCounts[e.sourceRole] += 1;
    bucket.importUsageCounts[e.importUsage] += 1;
    if (e.sourceRole === 'production' && e.importUsage === 'value') {
      bucket.productValueCount += 1;
    }
    bucket.evidence.push({
      from: e.from,
      to: e.to,
      kind: e.kind,
      sourceRole: e.sourceRole,
      importUsage: e.importUsage,
    });
    bucket.evidence.sort(compareImportEvidence);
    bucket.evidence.splice(MODULE_EDGE_EVIDENCE_LIMIT);
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
      sourceRoleCounts: bucket.sourceRoleCounts,
      importUsageCounts: bucket.importUsageCounts,
      productValueCount: bucket.productValueCount,
      evidence: bucket.evidence,
      evidenceLimited: bucket.count > bucket.evidence.length,
    };
  });
  moduleEdges.sort((a, b) => b.count - a.count);

  return {
    rootPath,
    filesScanned: files.length + (goPackageImports?.filesScanned ?? 0),
    coverage: importScanCoverage(rootPath),
    edges,
    externalImports,
    unresolved,
    moduleEdges,
    ...(goPackageImports ? { packageImportEvidence: goPackageImports } : {}),
  };
}

function importScanCoverage(rootPath) {
  const detectedUnsupportedLanguages = [
    ...(detectAutotoolsC(rootPath) ? ['c'] : []),
  ];
  const limitations = [
    ...(detectedUnsupportedLanguages.includes('c')
      ? ['C include and build dependency graphs are not scanned; zero edges is not evidence that a C repository has no dependencies.']
      : []),
    'Rust evidence covers deterministic use paths, file-backed mod declarations, and exact literal path/include forms; macro expansion, cfg evaluation, and symbol resolution are not inferred.',
    'Observed edges are bounded static source evidence, not runtime execution or semantic depends_on approval.',
  ];
  return {
    contract: 'importScanCoverage:v1',
    supportedLanguages: ['go', 'javascript', 'python', 'rust', 'typescript'],
    supportedExtensions: [...SOURCE_EXT, GO_SOURCE_EXTENSION].sort(),
    detectedUnsupportedLanguages,
    allDetectedLanguagesSupported: detectedUnsupportedLanguages.length === 0,
    zeroEdgesMeaning: 'no_supported_static_import_edges_observed',
    limitations,
  };
}

function pruneNestedRoots(roots, rootPath) {
  const byRelativePath = [...new Set(roots.map((root) => relative(rootPath, root) || '.'))]
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  const retained = [];
  for (const candidate of byRelativePath) {
    if (retained.some((parent) => parent === '.' || candidate === parent || candidate.startsWith(`${parent}/`))) continue;
    retained.push(candidate);
  }
  return retained.map((path) => (path === '.' ? rootPath : join(rootPath, path)));
}

function compareImportEvidence(a, b) {
  const priority = (row) =>
    row.sourceRole === 'production' && row.importUsage === 'value' ? 0 : 1;
  return priority(a) - priority(b) ||
    a.from.localeCompare(b.from) ||
    a.to.localeCompare(b.to) ||
    a.kind.localeCompare(b.kind);
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
