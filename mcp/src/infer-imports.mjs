// R17 — infer_imports
//
// TS/JS and Python files' static imports become observed file-level dependency
// edges. Go imports become typed package-directory evidence instead of invented
// file endpoints. Python and Go are parsed as bounded text and never executed.
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
//   - Python 은 root 또는 src/source layout package 의 import /
//     from ... import 만 보수적으로 읽으며 동적 import, namespace-package
//     추측, 의미 관계 자동 승격은 하지 않음
//   - Go 는 root module 내부 package import 만 directory evidence 로 읽고
//     vendor/testdata/underscore fixture tree 와 string/comment lookalike 를 제외
//   - 더 정교한 AST parsing 은 후속

import { readFileSync, readdirSync, statSync, lstatSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';

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
const MODULE_EDGE_EVIDENCE_LIMIT = 5;
const GO_IMPORT_TEXT_MAX_BYTES = 256 * 1024;
const GO_IMPORTS_PER_FILE_LIMIT = 256;
const GO_PACKAGE_EDGE_EVIDENCE_LIMIT = 5;
const GO_SOURCE_EXTENSION = '.go';
const WORKSPACE_DISCOVERY_MAX_ENTRIES = 10000;
const WORKSPACE_PACKAGE_LIMIT = 500;
const WORKSPACE_MANIFEST_MAX_BYTES = 256 * 1024;
const AUTOTOOLS_C_DISCOVERY_MAX_ENTRIES = 2000;
const AUTOTOOLS_C_SOURCE_FOLDERS = Object.freeze(['src', 'source', 'lib', 'app', 'internal']);
const WORKSPACE_PATTERN_LIMIT = 64;
const WORKSPACE_PATTERN_MAX_SEGMENTS = 24;
const WORKSPACE_PATTERN_MAX_GLOBSTARS = 2;
const WORKSPACE_PATTERN_MAX_WILDCARDS = 16;
const WORKSPACE_PATTERN_MATCH_STATE_LIMIT = 250000;

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
]);

const SUPPORT_ELEMENT_BUCKETS = new Set([
  'app',
  'apps',
  'domain',
  'domains',
  'helper',
  'helpers',
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
 *   edges: Array<{ from: string, to: string, kind: 'static'|'dynamic'|'require'|'reexport'|'side', sourceRole:'production'|'test'|'unknown', importUsage:'value'|'type_only'|'unknown' }>,
 *   externalImports: Array<{ from: string, spec: string }>,
 *   unresolved: Array<{ from: string, spec: string, reason: string }>,
 *   coverage: object,
 *   moduleEdges: Array<{ from: string, to: string, count: number, kindCounts: Record<string, number>, sourceRoleCounts:Record<string,number>, importUsageCounts:Record<string,number>, productValueCount:number, evidence: Array<{from:string,to:string,kind:string,sourceRole:string,importUsage:string}>, evidenceLimited: boolean }>,
 *   packageImportEvidence?: { contract: 'goPackageImports:v1', packageImports: Array<{fromFile:string,fromPackage:string,toPackage:string,importSpec:string,kind:string,sourceRole:string,importUsage:string}>, moduleEdges: object[] },
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
    fallback: ['src', 'source', 'lib', 'app', 'apps', 'packages'],
  });
  const workspaceDiscovery = Array.isArray(options.workspacePackages)
    ? { hasDeclaration: true, packages: options.workspacePackages }
    : options.workspacePackages ?? discoverDeclaredWorkspacePackages(rootPath, { ignore });
  const workspacePackages = Array.isArray(workspaceDiscovery?.packages)
    ? workspaceDiscovery.packages
    : [];
  // `apps`/`packages` are a legacy fallback for undeclared monorepos. Once a
  // repository declares its package roots, scanning those broad directories
  // would silently re-admit excluded workspace members.
  const scanSourceFolders =
    options.sourceFolders === undefined && workspaceDiscovery?.hasDeclaration
      ? sourceFolders.filter((folder) => !['apps', 'packages'].includes(folder))
      : sourceFolders;

  // Resolve search roots — defined source folders that exist, plus rootPath
  // itself if no source folder exists (so simple repos still work).
  const roots = [];
  let configuredRootExists = false;
  for (const f of scanSourceFolders) {
    const p = join(rootPath, f);
    if (!existsSync(p) || !statSync(p).isDirectory()) continue;
    configuredRootExists = true;
    if (ignore.has(f)) continue;
    roots.push(p);
  }
  if (workspaceDiscovery?.hasDeclaration) configuredRootExists = true;
  for (const workspacePackage of workspacePackages) {
    const packageRoot = join(rootPath, workspacePackage.path);
    if (!existsSync(packageRoot) || !statSync(packageRoot).isDirectory()) continue;
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
  );

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
          sourceFolders,
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
      // SIDE_IMPORT_RE matches a superset of IMPORT_RE in some cases —
      // dedup by checking we haven't already added this exact (from, to, spec).
      // Cheap heuristic: only count `import "X"` lines that AREN'T also
      // matched by `import ... from "X"`.
      const idx = match.index;
      // Quick context check: is the prior char an `m` of "from"? then skip.
      const window = content.slice(Math.max(0, idx - 10), idx + 2);
      if (/from\s*$/.test(window.replace(/\s+$/, ''))) continue;
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

  // Module-level edge collapse — capability/feature folder is the
  // first segment under one of the source folders.
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

/**
 * Project a bounded, path-focused static import neighborhood from one scan.
 * This is source evidence only: it does not claim runtime execution, affected
 * behavior, or an ontology relation. The cursor is stable for unchanged edge
 * evidence and never writes to the vault.
 */
export function buildImportImpactFocus(
  edges,
  {
    focusPath,
    direction = 'both',
    limit = 50,
    afterEdgeId = null,
  } = {},
) {
  if (typeof focusPath !== 'string' || focusPath.length === 0 || focusPath.trim() !== focusPath) {
    throw new Error('focusPath must be a nonblank repository-relative path without surrounding whitespace.');
  }
  const normalizedFocusPath = focusPath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    isAbsolute(focusPath) ||
    normalizedFocusPath === '..' ||
    normalizedFocusPath.startsWith('../') ||
    normalizedFocusPath.includes('/../')
  ) {
    throw new Error('focusPath must be a repository-relative path that stays inside the repository.');
  }
  if (!['incoming', 'outgoing', 'both'].includes(direction)) {
    throw new Error('direction must be one of: incoming, outgoing, both.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('limit must be an integer between 1 and 100.');
  }
  if (
    afterEdgeId !== null &&
    (typeof afterEdgeId !== 'string' || afterEdgeId.length === 0 || afterEdgeId.trim() !== afterEdgeId)
  ) {
    throw new Error('afterEdgeId must be null or a nonblank string without surrounding whitespace.');
  }

  const rows = Array.isArray(edges) ? edges : [];
  const incoming = rows.filter((edge) => edge?.to === normalizedFocusPath);
  const outgoing = rows.filter((edge) => edge?.from === normalizedFocusPath);
  const selected = rows
    .filter((edge) => {
      if (direction === 'incoming') return edge?.to === normalizedFocusPath;
      if (direction === 'outgoing') return edge?.from === normalizedFocusPath;
      return edge?.from === normalizedFocusPath || edge?.to === normalizedFocusPath;
    })
    .sort(compareFocusedImportEdges);
  const duplicateCounts = new Map();
  const identified = selected.map((edge) => {
    const basis = JSON.stringify([
      edge.from,
      edge.to,
      edge.kind,
      edge.sourceRole,
      edge.importUsage,
    ]);
    const duplicateIndex = duplicateCounts.get(basis) ?? 0;
    duplicateCounts.set(basis, duplicateIndex + 1);
    return {
      edgeId: `import-impact:${createHash('sha256')
        .update(`${basis}:${duplicateIndex}`)
        .digest('hex')
        .slice(0, 20)}`,
      ...edge,
    };
  });

  let start = 0;
  if (afterEdgeId !== null) {
    const previous = identified.findIndex((edge) => edge.edgeId === afterEdgeId);
    if (previous === -1) {
      throw new Error(
        `afterEdgeId was not found in the current focused import evidence: ${afterEdgeId}. ` +
        'Omit afterEdgeId to restart from the first current edge.',
      );
    }
    start = previous + 1;
  }
  const page = identified.slice(start, start + limit);
  const remaining = Math.max(0, identified.length - start - page.length);

  return {
    contract: 'importImpactFocus:v1',
    focusPath: normalizedFocusPath,
    direction,
    sourceQualification: 'observed_static_imports_not_runtime_or_semantic_impact',
    writeAllowed: false,
    summary: {
      incoming: incoming.length,
      outgoing: outgoing.length,
      selected: identified.length,
      returned: page.length,
      limited: remaining > 0,
    },
    edges: page,
    cursor: {
      afterEdgeId,
      total: identified.length,
      remaining,
      hasMore: remaining > 0,
      nextAfterEdgeId: page.at(-1)?.edgeId ?? null,
    },
    interpretation:
      'These are bounded supported static import receipts around the exact file path. ' +
      'An empty or partial result does not prove no impact; inspect symbols, tests, dynamic behavior, and ontology meaning separately before changing code or approving a semantic relation.',
  };
}

function compareFocusedImportEdges(a, b) {
  return JSON.stringify([
    a?.from ?? '',
    a?.to ?? '',
    a?.kind ?? '',
    a?.sourceRole ?? '',
    a?.importUsage ?? '',
  ]).localeCompare(JSON.stringify([
    b?.from ?? '',
    b?.to ?? '',
    b?.kind ?? '',
    b?.sourceRole ?? '',
    b?.importUsage ?? '',
  ]));
}

function importScanCoverage(rootPath) {
  const detectedUnsupportedLanguages = [
    ...(detectAutotoolsC(rootPath) ? ['c'] : []),
    ...(existsSync(join(rootPath, 'Cargo.toml')) ? ['rust'] : []),
  ];
  const limitations = [
    ...(detectedUnsupportedLanguages.includes('c')
      ? ['C include and build dependency graphs are not scanned; zero edges is not evidence that a C repository has no dependencies.']
      : []),
    'Rust use/mod and macro dependency graphs are not scanned; zero edges is not evidence that a Rust repository has no dependencies.',
    'Observed edges are bounded static source evidence, not runtime execution or semantic depends_on approval.',
  ];
  return {
    contract: 'importScanCoverage:v1',
    supportedLanguages: ['go', 'javascript', 'python', 'typescript'],
    supportedExtensions: [...SOURCE_EXT, GO_SOURCE_EXTENSION].sort(),
    detectedUnsupportedLanguages,
    allDetectedLanguagesSupported: detectedUnsupportedLanguages.length === 0,
    zeroEdgesMeaning: 'no_supported_static_import_edges_observed',
    limitations,
  };
}

function inferGoPackageImports(rootPath, ignore, maxFiles) {
  const rootModule = readRootGoModule(rootPath);
  if (!rootModule) return null;
  const receipt = {
    contract: 'goPackageImports:v1',
    modulePath: rootModule.modulePath,
    sourceQualification: 'observed_bounded_go_package_imports_not_runtime_or_semantic_impact',
    writeAllowed: false,
    filesScanned: 0,
    fileScanLimited: false,
    perFileByteLimit: GO_IMPORT_TEXT_MAX_BYTES,
    perFileImportLimit: GO_IMPORTS_PER_FILE_LIMIT,
    skipped: rootModule.skipped,
    limitations: [
      'External Go modules are not included in local package import evidence.',
      'Nested Go modules and go.work workspaces are not scanned.',
      'Observed imports are bounded static source evidence, not runtime execution or semantic depends_on approval.',
    ],
    packageImports: [],
    moduleEdges: [],
  };
  if (maxFiles <= 0) {
    receipt.fileScanLimited = true;
    return receipt;
  }

  const fileScan = listRootGoSourceFiles(rootPath, ignore, maxFiles);
  receipt.filesScanned = fileScan.files.length;
  receipt.fileScanLimited = fileScan.fileScanLimited;
  for (const file of fileScan.files) {
    const fromFile = relative(rootPath, file).replaceAll('\\', '/');
    let size;
    try {
      size = statSync(file).size;
    } catch {
      receipt.skipped.push({ file: fromFile, reason: 'go-import-skip: unreadable source file' });
      continue;
    }
    if (size > GO_IMPORT_TEXT_MAX_BYTES) {
      receipt.skipped.push({
        file: fromFile,
        reason: `go-import-skip: exceeds ${GO_IMPORT_TEXT_MAX_BYTES} byte limit`,
      });
      continue;
    }
    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      receipt.skipped.push({ file: fromFile, reason: 'go-import-skip: unreadable source file' });
      continue;
    }
    const fromPackage = goPackageDirectoryPath(rootPath, dirname(file));
    if (!fromPackage) continue;
    const parsed = parseGoImports(content);
    if (parsed.limited) {
      receipt.skipped.push({
        file: fromFile,
        reason: `go-import-skip: import limit ${GO_IMPORTS_PER_FILE_LIMIT} reached`,
      });
    }
    for (const parsedImport of parsed.imports) {
      const targetDirectory = resolveGoModuleLocalPackage(
        rootPath,
        rootModule.modulePath,
        parsedImport.importSpec,
      );
      if (!targetDirectory) continue;
      const toPackage = goPackageDirectoryPath(rootPath, targetDirectory);
      if (!toPackage || !directoryHasProductionGoSource(rootPath, targetDirectory)) continue;
      receipt.packageImports.push({
        fromFile,
        fromPackage,
        toPackage,
        importSpec: parsedImport.importSpec,
        kind: parsedImport.alias === '_' ? 'side' : 'static',
        sourceRole: goSourceRoleOf(fromFile),
        importUsage: 'value',
      });
    }
  }

  receipt.skipped.sort(compareGoSkippedFile);
  receipt.packageImports.sort(compareGoPackageImportEvidence);
  receipt.moduleEdges = collapseGoPackageImports(receipt.packageImports);
  return receipt;
}

function readRootGoModule(rootPath) {
  const goModPath = join(rootPath, 'go.mod');
  if (!existsSync(goModPath)) return null;
  try {
    const goModStat = lstatSync(goModPath);
    if (goModStat.isSymbolicLink() || !goModStat.isFile() || !pathResolvesInsideRoot(rootPath, goModPath)) {
      return null;
    }
    if (goModStat.size > GO_IMPORT_TEXT_MAX_BYTES) {
      return null;
    }
    const moduleLine = readFileSync(goModPath, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.replace(/\s*\/\/.*$/, ''))
      .find((line) => /^\s*module\s+\S+\s*$/.test(line));
    const modulePath = moduleLine?.trim().split(/\s+/)[1] ?? null;
    return isSafeGoModulePath(modulePath) ? { modulePath, skipped: [] } : null;
  } catch {
    return null;
  }
}

function isSafeGoModulePath(modulePath) {
  if (typeof modulePath !== 'string' || !modulePath || modulePath.startsWith('/') || modulePath.includes('\\')) {
    return false;
  }
  return modulePath.split('/').every((segment) => segment && segment !== '.' && segment !== '..' && !segment.includes('\0'));
}

function listRootGoSourceFiles(rootPath, ignore, maxFiles) {
  const files = [];
  const detectionLimit = maxFiles + 1;
  const visit = (directory) => {
    if (files.length >= detectionLimit) return;
    let entries;
    try {
      entries = readdirSync(directory).sort();
    } catch {
      return;
    }
    for (const entry of entries) {
      if (
        files.length >= detectionLimit ||
        ignore.has(entry) ||
        entry.startsWith('.') ||
        entry.startsWith('_') ||
        entry === 'vendor' ||
        entry === 'testdata'
      ) continue;
      const path = join(directory, entry);
      let pathStat;
      try {
        pathStat = lstatSync(path);
      } catch {
        continue;
      }
      if (pathStat.isSymbolicLink() || !pathResolvesInsideRoot(rootPath, path)) continue;
      if (pathStat.isDirectory()) {
        if (hasNestedGoModule(rootPath, path)) continue;
        visit(path);
      } else if (pathStat.isFile() && extname(entry) === GO_SOURCE_EXTENSION) {
        files.push(path);
      }
    }
  };
  visit(rootPath);
  return {
    files: files.slice(0, maxFiles),
    fileScanLimited: files.length > maxFiles,
  };
}

function parseGoImports(content) {
  const imports = [];
  let inGroup = false;
  for (const line of goCodeLines(content)) {
    if (inGroup) {
      if (/^\s*\)\s*$/.test(line)) {
        inGroup = false;
        continue;
      }
      const grouped = parseGoImportSpec(line);
      if (grouped && !appendGoImport(imports, grouped)) return { imports, limited: true };
      continue;
    }
    if (/^\s*import\s*\(\s*$/.test(line)) {
      inGroup = true;
      continue;
    }
    const single = line.match(/^\s*import\s+(.+)$/)?.[1];
    const parsed = single ? parseGoImportSpec(single) : null;
    if (parsed && !appendGoImport(imports, parsed)) return { imports, limited: true };
  }
  return { imports, limited: false };
}

function appendGoImport(imports, parsedImport) {
  if (imports.length >= GO_IMPORTS_PER_FILE_LIMIT) return false;
  imports.push(parsedImport);
  return true;
}

function parseGoImportSpec(value) {
  const match = value.match(/^\s*(?:([_A-Za-z][_A-Za-z0-9]*|\.)\s+)?(?:"([^"\\\r\n]+)"|`([^`\r\n]+)`)\s*$/);
  if (!match) return null;
  return { alias: match[1] ?? null, importSpec: match[2] ?? match[3] };
}

function goCodeLines(content) {
  const lines = [];
  let inBlockComment = false;
  let inRawString = false;
  for (const rawLine of content.split(/\r?\n/)) {
    let line = '';
    let startIndex = 0;
    if (inRawString) {
      const rawStringEnd = rawLine.indexOf('`');
      if (rawStringEnd === -1) {
        lines.push('');
        continue;
      }
      inRawString = false;
      line = '__raw_string__';
      startIndex = rawStringEnd + 1;
    }
    let quote = null;
    let escaped = false;
    for (let index = startIndex; index < rawLine.length; index += 1) {
      if (inBlockComment) {
        const end = rawLine.indexOf('*/', index);
        if (end === -1) {
          index = rawLine.length;
          break;
        }
        index = end + 1;
        inBlockComment = false;
        continue;
      }
      const pair = rawLine.slice(index, index + 2);
      const character = rawLine[index];
      if (!quote && pair === '//') break;
      if (!quote && pair === '/*') {
        inBlockComment = true;
        index += 1;
        continue;
      }
      if (!quote && character === '`') {
        const rawStringEnd = rawLine.indexOf('`', index + 1);
        if (rawStringEnd === -1) {
          inRawString = true;
          break;
        }
        line += rawLine.slice(index, rawStringEnd + 1);
        index = rawStringEnd;
        continue;
      }
      line += character;
      if (escaped) {
        escaped = false;
      } else if (quote && character === '\\') {
        escaped = true;
      } else if (quote && character === quote) {
        quote = null;
      } else if (!quote && ['"', '\''].includes(character)) {
        quote = character;
      }
    }
    lines.push(line);
  }
  return lines;
}

function resolveGoModuleLocalPackage(rootPath, modulePath, importSpec) {
  if (importSpec !== modulePath && !importSpec.startsWith(`${modulePath}/`)) return null;
  const suffix = importSpec === modulePath ? '' : importSpec.slice(modulePath.length + 1);
  const segments = suffix ? suffix.split('/') : [];
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  const targetDirectory = resolve(rootPath, ...segments);
  if (!isRealRootDirectory(rootPath, targetDirectory)) return null;
  if (hasNestedGoModule(rootPath, targetDirectory)) return null;
  return targetDirectory;
}

function goPackageDirectoryPath(rootPath, directory) {
  if (!isRealRootDirectory(rootPath, directory) || hasNestedGoModule(rootPath, directory)) return null;
  const directoryPath = relative(rootPath, directory).replaceAll('\\', '/');
  if (directoryPath === '') return '.';
  if (directoryPath === '..' || directoryPath.startsWith('../') || directoryPath.includes('/../')) return null;
  return directoryPath;
}

function isRealRootDirectory(rootPath, directory) {
  try {
    return lstatSync(directory).isDirectory() &&
      !lstatSync(directory).isSymbolicLink() &&
      pathResolvesInsideRoot(rootPath, directory);
  } catch {
    return false;
  }
}

function hasNestedGoModule(rootPath, directory) {
  const root = resolve(rootPath);
  let current = resolve(directory);
  while (current !== root) {
    const marker = join(current, 'go.mod');
    try {
      if (lstatSync(marker)) return true;
    } catch {
      // No module marker at this level.
    }
    const parent = dirname(current);
    if (parent === current) return true;
    current = parent;
  }
  return false;
}

function directoryHasProductionGoSource(rootPath, directory) {
  let entries;
  try {
    entries = readdirSync(directory).sort();
  } catch {
    return false;
  }
  return entries.some((entry) => {
    if (extname(entry) !== GO_SOURCE_EXTENSION || entry.endsWith('_test.go')) return false;
    const path = join(directory, entry);
    try {
      return lstatSync(path).isFile() &&
        !lstatSync(path).isSymbolicLink() &&
        pathResolvesInsideRoot(rootPath, path);
    } catch {
      return false;
    }
  });
}

function goSourceRoleOf(filePath) {
  return filePath.endsWith('_test.go') ? 'test' : 'production';
}

function collapseGoPackageImports(imports) {
  const buckets = new Map();
  for (const receipt of imports) {
    const key = `${receipt.fromPackage}\u0000${receipt.toPackage}`;
    const bucket = buckets.get(key) ?? {
      fromPackage: receipt.fromPackage,
      toPackage: receipt.toPackage,
      count: 0,
      kindCounts: new Map(),
      sourceRoleCounts: zeroCounts(IMPORT_SOURCE_ROLE_VALUES),
      importUsageCounts: zeroCounts(IMPORT_USAGE_VALUES),
      productValueCount: 0,
      evidence: [],
    };
    bucket.count += 1;
    bucket.kindCounts.set(receipt.kind, (bucket.kindCounts.get(receipt.kind) ?? 0) + 1);
    bucket.sourceRoleCounts[receipt.sourceRole] += 1;
    bucket.importUsageCounts[receipt.importUsage] += 1;
    if (receipt.sourceRole === 'production' && receipt.importUsage === 'value') {
      bucket.productValueCount += 1;
    }
    bucket.evidence.push(receipt);
    bucket.evidence.sort(compareGoPackageImportEvidence);
    bucket.evidence.splice(GO_PACKAGE_EDGE_EVIDENCE_LIMIT);
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => ({
      fromPackage: bucket.fromPackage,
      toPackage: bucket.toPackage,
      count: bucket.count,
      kindCounts: Object.fromEntries([...bucket.kindCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
      sourceRoleCounts: bucket.sourceRoleCounts,
      importUsageCounts: bucket.importUsageCounts,
      productValueCount: bucket.productValueCount,
      evidence: bucket.evidence,
      evidenceLimited: bucket.count > bucket.evidence.length,
    }))
    .sort((a, b) =>
      b.count - a.count ||
      a.fromPackage.localeCompare(b.fromPackage) ||
      a.toPackage.localeCompare(b.toPackage),
    );
}

function compareGoPackageImportEvidence(a, b) {
  const priority = (row) => row.sourceRole === 'production' && row.importUsage === 'value' ? 0 : 1;
  return priority(a) - priority(b) ||
    a.fromFile.localeCompare(b.fromFile) ||
    a.toPackage.localeCompare(b.toPackage) ||
    a.importSpec.localeCompare(b.importSpec) ||
    a.kind.localeCompare(b.kind);
}

function compareGoSkippedFile(a, b) {
  return a.file.localeCompare(b.file) || a.reason.localeCompare(b.reason);
}

function detectAutotoolsC(rootPath) {
  const hasAutotoolsManifest = ['configure.ac', 'configure.in', 'Makefile.am'].some(
    (manifest) => {
      const path = join(rootPath, manifest);
      try {
        const pathStat = lstatSync(path);
        return !pathStat.isSymbolicLink() &&
          pathStat.isFile() &&
          pathResolvesInsideRoot(rootPath, path);
      } catch {
        return false;
      }
    },
  );
  if (!hasAutotoolsManifest) return false;

  let entriesSeen = 0;
  const visitedDirectories = new Set();
  const visit = (directory, depth, descend) => {
    if (depth > 3 || entriesSeen >= AUTOTOOLS_C_DISCOVERY_MAX_ENTRIES) return false;
    let realDirectory;
    try {
      realDirectory = realpathSync(directory);
      if (visitedDirectories.has(realDirectory)) return false;
      visitedDirectories.add(realDirectory);
    } catch {
      return false;
    }
    let entries;
    try {
      entries = readdirSync(directory).sort();
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (entriesSeen >= AUTOTOOLS_C_DISCOVERY_MAX_ENTRIES) return false;
      entriesSeen += 1;
      if (DEFAULT_IGNORE.has(entry) || entry.startsWith('.')) continue;
      const path = join(directory, entry);
      let pathStat;
      try {
        pathStat = lstatSync(path);
        if (pathStat.isSymbolicLink() || !pathResolvesInsideRoot(rootPath, path)) continue;
      } catch {
        continue;
      }
      if (pathStat.isDirectory() && descend) {
        if (visit(path, depth + 1, true)) return true;
      } else if (pathStat.isFile() && /\.(?:c|h)$/i.test(entry)) {
        return true;
      }
    }
    return false;
  };

  if (visit(rootPath, 0, false)) return true;
  for (const folder of AUTOTOOLS_C_SOURCE_FOLDERS) {
    const sourceRoot = join(rootPath, folder);
    try {
      if (lstatSync(sourceRoot).isDirectory() && visit(sourceRoot, 0, true)) return true;
    } catch {
      // Continue with the remaining conventional source roots.
    }
  }
  return false;
}

/**
 * Read repository-declared Node workspace layouts as bounded implementation
 * evidence. This is deliberately not business meaning: package names and
 * workspace manifests only decide which source roots/import aliases are safe
 * to inspect.
 *
 * @param {string} rootPath
 * @param {{ ignore?: Set<string> }} [options]
 * @returns {{ hasDeclaration: boolean, packages: Array<{ path: string, name: string|null, slug: string }>, skipped: Array<{ path: string, reason: string }> }}
 */
export function discoverDeclaredWorkspacePackages(rootPath, options = {}) {
  const ignore = options.ignore instanceof Set ? options.ignore : DEFAULT_IGNORE;
  const declarations = readWorkspaceDeclarations(rootPath);
  if (declarations.patterns.length === 0) {
    return {
      hasDeclaration: declarations.hasDeclaration,
      packages: [],
      skipped: declarations.skipped,
    };
  }

  const includedPatterns = declarations.patterns.filter((row) => !row.exclude);
  const excludedPatterns = declarations.patterns.filter((row) => row.exclude);
  const candidates = enumeratePackageDirectories(rootPath, ignore, declarations.skipped);
  for (const declaration of includedPatterns) {
    const literalPackage = readDeclaredLiteralWorkspacePackage(
      rootPath,
      declaration,
      ignore,
      declarations.skipped,
    );
    if (!literalPackage || candidates.some((candidate) => candidate.path === literalPackage.path)) {
      continue;
    }
    candidates.push(literalPackage);
  }
  const packages = [];
  const matchedPatterns = new Set();
  const matchBudget = { remaining: WORKSPACE_PATTERN_MATCH_STATE_LIMIT, exhausted: false };

  candidateLoop:
  for (const candidate of candidates) {
    const matchingIncludes = [];
    for (const declaration of includedPatterns) {
      if (workspacePatternMatches(declaration.pattern, candidate.path, matchBudget)) {
        matchingIncludes.push(declaration);
      }
      if (matchBudget.exhausted) break candidateLoop;
    }
    if (matchingIncludes.length === 0) continue;
    for (const match of matchingIncludes) matchedPatterns.add(match.key);
    let excluded = false;
    for (const declaration of excludedPatterns) {
      if (workspacePatternMatches(declaration.pattern, candidate.path, matchBudget)) {
        excluded = true;
      }
      if (matchBudget.exhausted) break candidateLoop;
      if (excluded) break;
    }
    if (excluded) {
      declarations.skipped.push({ path: candidate.path, reason: 'workspace-declaration-excluded' });
      continue;
    }
    packages.push(candidate);
  }

  if (matchBudget.exhausted) {
    declarations.skipped.push({
      path: '.',
      reason: `workspace-declaration-match-limit: reached ${WORKSPACE_PATTERN_MATCH_STATE_LIMIT} pattern states`,
    });
  }

  for (const declaration of includedPatterns) {
    if (matchedPatterns.has(declaration.key)) continue;
    declarations.skipped.push({
      path: declaration.source,
      reason: `workspace-declaration-no-package-match: ${declaration.pattern}`,
    });
  }

  packages.sort((a, b) => a.path.localeCompare(b.path));
  const omitted = Math.max(0, packages.length - WORKSPACE_PACKAGE_LIMIT);
  if (omitted > 0) {
    declarations.skipped.push({
      path: '.',
      reason: `workspace-declaration-package-limit: omitted ${omitted} declared package roots`,
    });
  }
  return {
    hasDeclaration: true,
    packages: assignWorkspacePackageSlugs(packages.slice(0, WORKSPACE_PACKAGE_LIMIT)),
    skipped: dedupeWorkspaceSkipped(declarations.skipped),
  };
}

function readWorkspaceDeclarations(rootPath) {
  const patterns = [];
  const skipped = [];
  let hasDeclaration = false;
  const pnpmWorkspacePath = join(rootPath, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWorkspacePath)) {
    hasDeclaration = true;
    const parsed = readPnpmWorkspacePatterns(rootPath, pnpmWorkspacePath, skipped);
    for (const pattern of parsed) {
      patterns.push({
        pattern,
        exclude: pattern.startsWith('!'),
        source: 'pnpm-workspace.yaml',
        key: `pnpm-workspace.yaml:${pattern}`,
      });
    }
  }

  const packagePath = join(rootPath, 'package.json');
  if (existsSync(packagePath)) {
    const parsed = readNodeWorkspacePatterns(rootPath, packagePath, skipped);
    if (parsed !== null) hasDeclaration = true;
    for (const pattern of parsed ?? []) {
      patterns.push({
        pattern,
        exclude: pattern.startsWith('!'),
        source: 'package.json#workspaces',
        key: `package.json#workspaces:${pattern}`,
      });
    }
  }

  if (patterns.length > WORKSPACE_PATTERN_LIMIT) {
    skipped.push({
      path: '.',
      reason: `workspace-declaration-pattern-limit: omitted ${patterns.length - WORKSPACE_PATTERN_LIMIT} patterns`,
    });
    // A later declaration can be an exclusion. Once the manifest exceeds the
    // bounded declaration budget, selecting from a prefix could re-admit a
    // package that an omitted exclusion would have removed. Keep declaration
    // discovery fail-closed instead.
    return { hasDeclaration, patterns: [], skipped };
  }
  const normalized = [];
  for (const declaration of patterns) {
    const normalizedPattern = normalizeWorkspacePattern(declaration.pattern, declaration.source, skipped);
    if (!normalizedPattern) continue;
    normalized.push({
      ...declaration,
      pattern: normalizedPattern.pattern,
      exclude: normalizedPattern.exclude,
    });
  }
  return { hasDeclaration, patterns: normalized, skipped };
}

function readPnpmWorkspacePatterns(rootPath, workspacePath, skipped) {
  const source = relative(rootPath, workspacePath);
  let text;
  try {
    const size = statSync(workspacePath).size;
    if (size > WORKSPACE_MANIFEST_MAX_BYTES) {
      skipped.push({ path: source, reason: `workspace-declaration-skip: exceeds ${WORKSPACE_MANIFEST_MAX_BYTES} byte limit` });
      return [];
    }
    text = readFileSync(workspacePath, 'utf-8');
  } catch (error) {
    skipped.push({ path: source, reason: `workspace-declaration-skip: ${error.message}` });
    return [];
  }

  const patterns = [];
  let inPackages = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^packages:\s*(?:#.*)?$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    if (/^\S[^:]*:\s*(?:#.*)?$/.test(line)) break;
    const match = line.match(/^\s*-\s*(.*?)\s*(?:#.*)?$/);
    if (!match) continue;
    const value = unquoteWorkspaceScalar(match[1]);
    if (value) patterns.push(value);
  }
  if (patterns.length === 0) {
    skipped.push({ path: source, reason: 'workspace-declaration-skip: no static packages entries' });
  }
  return patterns;
}

function readNodeWorkspacePatterns(rootPath, packagePath, skipped) {
  let manifest;
  try {
    const size = statSync(packagePath).size;
    if (size > WORKSPACE_MANIFEST_MAX_BYTES) {
      skipped.push({ path: relative(rootPath, packagePath), reason: `workspace-declaration-skip: exceeds ${WORKSPACE_MANIFEST_MAX_BYTES} byte limit` });
      return null;
    }
    manifest = JSON.parse(readFileSync(packagePath, 'utf-8'));
  } catch {
    return null;
  }
  if (!Object.hasOwn(manifest, 'workspaces')) return null;
  const value = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : Array.isArray(manifest.workspaces?.packages)
      ? manifest.workspaces.packages
      : null;
  if (!value || !value.every((pattern) => typeof pattern === 'string')) {
    skipped.push({ path: 'package.json', reason: 'workspace-declaration-skip: workspaces must be a static string array' });
    return [];
  }
  return value;
}

function normalizeWorkspacePattern(value, source, skipped) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const exclude = raw.startsWith('!');
  const body = (exclude ? raw.slice(1) : raw).replace(/\\/g, '/');
  if (!body || body.startsWith('/') || /^[A-Za-z]:\//.test(body)) {
    skipped.push({ path: source, reason: `workspace-declaration-skip: invalid absolute pattern ${JSON.stringify(value)}` });
    return null;
  }
  const segments = body.split('/');
  if (segments.some((segment) => segment === '..' || segment.includes('\0'))) {
    skipped.push({ path: source, reason: `workspace-declaration-skip: unsafe pattern ${JSON.stringify(value)}` });
    return null;
  }
  const normalizedSegments = segments.filter((segment) => segment && segment !== '.');
  if (normalizedSegments.length > WORKSPACE_PATTERN_MAX_SEGMENTS) {
    skipped.push({
      path: source,
      reason: `workspace-declaration-skip: segment limit ${WORKSPACE_PATTERN_MAX_SEGMENTS} exceeded`,
    });
    return null;
  }
  const globstarCount = normalizedSegments.filter((segment) => segment === '**').length;
  if (globstarCount > WORKSPACE_PATTERN_MAX_GLOBSTARS) {
    skipped.push({
      path: source,
      reason: `workspace-declaration-skip: globstar limit ${WORKSPACE_PATTERN_MAX_GLOBSTARS} exceeded`,
    });
    return null;
  }
  const wildcardCount = normalizedSegments.reduce(
    (count, segment) => count + [...segment].filter((character) => character === '*').length,
    0,
  );
  if (wildcardCount > WORKSPACE_PATTERN_MAX_WILDCARDS) {
    skipped.push({
      path: source,
      reason: `workspace-declaration-skip: wildcard limit ${WORKSPACE_PATTERN_MAX_WILDCARDS} exceeded`,
    });
    return null;
  }
  return { exclude, pattern: normalizedSegments.join('/') || '.' };
}

function unquoteWorkspaceScalar(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"')))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function enumeratePackageDirectories(rootPath, ignore, skipped) {
  const candidates = [];
  let entriesSeen = 0;
  let stopped = false;

  function visit(directory) {
    if (stopped) return;
    const manifestPath = join(directory, 'package.json');
    if (existsSync(manifestPath) && statSync(manifestPath).isFile()) {
      const path = relative(rootPath, directory) || '.';
      candidates.push({ path, name: readWorkspacePackageName(manifestPath) });
    }
    let entries;
    try {
      entries = readdirSync(directory).sort();
    } catch (error) {
      skipped.push({ path: relative(rootPath, directory) || '.', reason: `workspace-discovery-skip: ${error.message}` });
      return;
    }
    for (const entry of entries) {
      if (stopped) return;
      entriesSeen += 1;
      if (entriesSeen > WORKSPACE_DISCOVERY_MAX_ENTRIES) {
        stopped = true;
        skipped.push({ path: relative(rootPath, directory) || '.', reason: `workspace-discovery-entry-limit: reached ${WORKSPACE_DISCOVERY_MAX_ENTRIES}` });
        return;
      }
      if (ignore.has(entry) || entry.startsWith('.')) continue;
      const fullPath = join(directory, entry);
      let stat;
      try {
        stat = lstatSync(fullPath);
      } catch (error) {
        skipped.push({ path: relative(rootPath, fullPath), reason: `workspace-discovery-skip: ${error.message}` });
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(fullPath);
    }
  }

  visit(rootPath);
  return candidates;
}

function readDeclaredLiteralWorkspacePackage(rootPath, declaration, ignore, skipped) {
  if (declaration.pattern.includes('*')) return null;
  const segments = declaration.pattern === '.' ? [] : declaration.pattern.split('/');
  if (segments.some((segment) => ignore.has(segment))) {
    skipped.push({
      path: declaration.source,
      reason: `workspace-declaration-ignored: ${declaration.pattern}`,
    });
    return null;
  }
  const packageRoot = declaration.pattern === '.' ? rootPath : join(rootPath, declaration.pattern);
  let stat;
  try {
    stat = lstatSync(packageRoot);
  } catch {
    return null;
  }
  if (stat.isSymbolicLink()) {
    skipped.push({ path: declaration.pattern, reason: 'workspace-declaration-skip: symbolic package root' });
    return null;
  }
  if (!stat.isDirectory() || !existsSync(join(packageRoot, 'package.json'))) return null;
  try {
    if (!pathResolvesInsideRoot(rootPath, packageRoot)) {
      skipped.push({ path: declaration.pattern, reason: 'workspace-declaration-skip: package root resolves outside repository' });
      return null;
    }
  } catch (error) {
    skipped.push({ path: declaration.pattern, reason: `workspace-declaration-skip: ${error.message}` });
    return null;
  }
  return {
    path: declaration.pattern,
    name: readWorkspacePackageName(join(packageRoot, 'package.json')),
  };
}

function readWorkspacePackageName(packagePath) {
  try {
    const manifest = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return typeof manifest.name === 'string' && manifest.name.trim() === manifest.name
      ? manifest.name
      : null;
  } catch {
    return null;
  }
}

function assignWorkspacePackageSlugs(packages) {
  const baseSlugs = packages.map((workspacePackage) => ({
    ...workspacePackage,
    baseSlug: workspacePackageBaseSlug(workspacePackage),
  }));
  const counts = new Map();
  for (const workspacePackage of baseSlugs) {
    counts.set(workspacePackage.baseSlug, (counts.get(workspacePackage.baseSlug) ?? 0) + 1);
  }
  return baseSlugs.map((workspacePackage) => ({
    path: workspacePackage.path,
    name: workspacePackage.name,
    slug: (counts.get(workspacePackage.baseSlug) ?? 0) === 1
      ? workspacePackage.baseSlug
      : workspacePathSlug(workspacePackage.path),
  }));
}

function workspacePackageBaseSlug(workspacePackage) {
  const name = workspacePackage.name?.replace(/^@[^/]+\//, '') || basename(workspacePackage.path);
  return workspacePathSlug(name) || 'workspace-package';
}

function workspacePathSlug(value) {
  return value
    .replace(/\\/g, '/')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function workspacePatternMatches(pattern, candidatePath, budget) {
  const patternSegments = pattern === '.' ? [] : pattern.split('/');
  const pathSegments = candidatePath === '.' ? [] : candidatePath.split('/');
  let states = closeWorkspaceGlobStates(new Set([0]), patternSegments);
  for (const pathSegment of pathSegments) {
    const next = new Set();
    for (const patternIndex of states) {
      if (!consumeWorkspacePatternBudget(budget)) return false;
      const segment = patternSegments[patternIndex];
      if (segment === '**') {
        next.add(patternIndex);
      } else if (segment && workspaceSegmentMatches(segment, pathSegment)) {
        next.add(patternIndex + 1);
      }
    }
    states = closeWorkspaceGlobStates(next, patternSegments);
    if (states.size === 0) return false;
  }
  return closeWorkspaceGlobStates(states, patternSegments).has(patternSegments.length);
}

function closeWorkspaceGlobStates(states, patternSegments) {
  const closed = new Set(states);
  for (let index = 0; index < patternSegments.length; index += 1) {
    if (patternSegments[index] === '**' && closed.has(index)) {
      closed.add(index + 1);
    }
  }
  return closed;
}

function consumeWorkspacePatternBudget(budget) {
  if (!budget) return true;
  if (budget.remaining <= 0) {
    budget.exhausted = true;
    return false;
  }
  budget.remaining -= 1;
  return true;
}

function workspaceSegmentMatches(pattern, value) {
  if (!pattern.includes('*')) return pattern === value;
  const fragments = pattern.split('*');
  let cursor = 0;
  let sawFragment = false;
  let finalFragmentEnd = 0;
  for (const fragment of fragments) {
    if (!fragment) continue;
    const found = value.indexOf(fragment, cursor);
    if (found === -1) return false;
    if (!sawFragment && !pattern.startsWith('*') && found !== 0) return false;
    sawFragment = true;
    cursor = found + fragment.length;
    finalFragmentEnd = cursor;
  }
  return pattern.endsWith('*') || (!sawFragment ? value.length === 0 : finalFragmentEnd === value.length);
}

function dedupeWorkspaceSkipped(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.path}\u0000${row.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  let typeCheckingIndent = null;
  for (const logicalLine of pythonLogicalLines(content)) {
    const line = logicalLine.text;
    if (!line) continue;
    if (typeCheckingIndent !== null && logicalLine.indent <= typeCheckingIndent) {
      typeCheckingIndent = null;
    }
    if (/^if\s+\(?(?:typing\.)?TYPE_CHECKING\)?\s*:/.test(line)) {
      typeCheckingIndent = logicalLine.indent;
      continue;
    }
    const importUsage =
      typeCheckingIndent !== null && logicalLine.indent > typeCheckingIndent
        ? 'type_only'
        : 'value';
    const fromMatch = line.match(
      /^from\s+([A-Za-z_][\w.]*|\.+[\w.]*)\s+import\s+(.+)$/,
    );
    if (fromMatch) {
      imports.push({
        module: fromMatch[1],
        names: pythonImportedNames(fromMatch[2]),
        importUsage,
      });
      continue;
    }
    const importMatch = line.match(/^import\s+(.+)$/);
    if (!importMatch) continue;
    for (const item of importMatch[1].split(',')) {
      const moduleName = item.trim().split(/\s+as\s+/i)[0]?.trim();
      if (moduleName) imports.push({ module: moduleName, names: [], importUsage });
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
  let bufferIndent = 0;
  let parenthesisDepth = 0;
  let tripleQuote = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const code = stripPythonStringsAndComment(rawLine, {
      get tripleQuote() { return tripleQuote; },
      set tripleQuote(value) { tripleQuote = value; },
    });
    const continued = /\\\s*$/.test(code);
    const fragment = code.replace(/\\\s*$/, '').trim();
    if (fragment) {
      if (!buffer) bufferIndent = rawLine.match(/^[\t ]*/)?.[0].length ?? 0;
      buffer = buffer ? `${buffer} ${fragment}` : fragment;
    }
    parenthesisDepth += [...code].reduce(
      (depth, character) =>
        character === '(' ? depth + 1 : character === ')' ? depth - 1 : depth,
      0,
    );
    if (!tripleQuote && parenthesisDepth <= 0 && !continued) {
      if (buffer) lines.push({ text: buffer, indent: bufferIndent });
      buffer = '';
      bufferIndent = 0;
      parenthesisDepth = 0;
    }
  }
  if (!tripleQuote && buffer) lines.push({ text: buffer, indent: bufferIndent });
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
  sourceFolders,
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
  const baseTarget = resolvePythonModule(moduleSpec, rootPath, sourceFolders);
  const targets = pythonImport.names.length > 0
    ? pythonImport.names
        .map(
          (name) =>
            resolvePythonModule(`${moduleSpec}.${name}`, rootPath, sourceFolders) ?? baseTarget,
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
          sourceRole: sourceRoleOf(relative(rootPath, file)),
          importUsage: pythonImport.importUsage ?? 'unknown',
        });
      }
    }
    return;
  }
  const topLevel = moduleSpec.split('.')[0];
  if (resolvePythonModule(topLevel, rootPath, sourceFolders)) {
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

function resolvePythonModule(spec, rootPath, sourceFolders = []) {
  if (!spec || spec.startsWith('.')) return null;
  const sourceRoots = new Set(
    sourceFolders
      .map((folder) => folder.split(/[\\/]/).filter(Boolean)[0])
      .filter(Boolean),
  );
  for (const searchRoot of [rootPath, ...[...sourceRoots].map((folder) => join(rootPath, folder))]) {
    const base = join(searchRoot, ...spec.split('.'));
    const file = `${base}.py`;
    if (
      existsSync(file) &&
      !lstatSync(file).isSymbolicLink() &&
      lstatSync(file).isFile() &&
      pathResolvesInsideRoot(rootPath, file)
    ) return file;
    const packageEntry = join(base, '__init__.py');
    if (
      existsSync(packageEntry) &&
      !lstatSync(packageEntry).isSymbolicLink() &&
      lstatSync(packageEntry).isFile() &&
      pathResolvesInsideRoot(rootPath, packageEntry)
    ) {
      return packageEntry;
    }
  }
  return null;
}

function pathResolvesInsideRoot(rootPath, path) {
  try {
    const resolvedFromRoot = relative(realpathSync(rootPath), realpathSync(path));
    return !(
      resolvedFromRoot === '..' ||
      resolvedFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(resolvedFromRoot)
    );
  } catch {
    return false;
  }
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

function importUsageOf(rawMatch) {
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

function sourceRoleOf(filePath) {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase();
  const segments = normalized.split('/');
  if (segments.some((segment) => ['test', 'tests', '__tests__'].includes(segment))) {
    return 'test';
  }
  const fileName = segments.at(-1) ?? '';
  const stem = fileName.replace(/\.(?:[cm]?[jt]sx?|py)$/i, '');
  if (/\.(?:test|spec)$/.test(stem) || /^test_.+/.test(stem) || /.+_test$/.test(stem)) {
    return 'test';
  }
  return 'production';
}

function zeroCounts(values) {
  return Object.fromEntries(values.map((value) => [value, 0]));
}

function compareImportEvidence(a, b) {
  const priority = (row) =>
    row.sourceRole === 'production' && row.importUsage === 'value' ? 0 : 1;
  return priority(a) - priority(b) ||
    a.from.localeCompare(b.from) ||
    a.to.localeCompare(b.to) ||
    a.kind.localeCompare(b.kind);
}

function classify(spec, file, dir, rootPath, edges, external, unresolved, kindOverride, pathAliases = [], ignore = DEFAULT_IGNORE, importUsage = 'value', workspacePackages = []) {
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
    // The package was already admitted by its declared path. A malformed
    // manifest simply cannot provide an import entrypoint, so leave it as an
    // external import instead of guessing a semantic relationship.
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

function moduleOf(filePath, sourceFolders, rootPath, workspacePackages = []) {
  // filePath is relative to rootPath. Find first segment that's a source
  // folder, then take the next segment as the "module" id.
  //
  // R+ — slug parity with analyze_repo_structure. The analyzer emits
  // folder-prefixed ontology slugs (`capabilities/X`, `elements/<flat-name>`)
  // so import evidence can be reconciled against analyzer concepts.
  //
  // 슬러그는 평평한 식별자다 (2026-08-01 판정 — docs/DECISIONS.md). 종전의
  // `elements/src/entities/foo` path-style 은 폐기 — analyze 와 같은 규칙으로
  // 이름만 슬러그에 싣고, basename 이 레이어를 넘어 겹칠 때만 레이어 단수형
  // 접미로 가른다 (같은 rootPath 를 보므로 두 도구의 판정이 일치한다).
  const parts = filePath.split(/[\\/]/);
  if (!SOURCE_EXT.has(extname(parts.at(-1) ?? ''))) return null;
  const workspacePackage = workspacePackageForFile(filePath, workspacePackages);
  if (workspacePackage) return `elements/${workspacePackage.slug}`;
  if (
    parts.length >= 3 &&
    sourceFolderStartsAt(parts[0], sourceFolders) &&
    existsSync(join(rootPath, parts[0], parts[1], '__init__.py'))
  ) {
    // `src/<python-package>/...` layout. Treat the first module inside the
    // package exactly like a root Python package so cross-file imports do not
    // collapse to one `capabilities/<package>` self-edge.
    const modulePart = parts[2];
    const rawName = modulePart === '__init__.py'
      ? parts[1]
      : stripSourceExtension(modulePart);
    const flatName = rawName
      .replace(/_/g, '-')
      .replace(/[^A-Za-z0-9-]/g, '')
      .toLowerCase();
    return flatName ? `elements/${flatName}` : null;
  }
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
    if (sourceFolderStartsAt(parts[i], sourceFolders)) {
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
        return `capabilities/${ontologySourceName(parts[i + 2])}`;
      }
      // element 류 bucket — analyze 와 같은 flat + 충돌 시 레이어 접미 규칙.
      const elementBuckets = ['entities', 'widgets', 'views'];
      if (elementBuckets.includes(next) && parts[i + 2]) {
        const name = ontologySourceName(parts[i + 2]);
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
        return `capabilities/${ontologySourceName(parts[i + 2])}`;
      }
      if (isSupportElementBucket(next) && parts[i + 2]) {
        // 파일의 basename 이 role 이름 — `src/storage/json-store.js` →
        // `elements/json-store`. 위치는 evidence 가 나른다.
        return `elements/${ontologySourceName(parts[parts.length - 1])}`;
      }
      if (SOURCE_EXT.has(extname(next))) {
        const flatName = ontologySourceName(next);
        return flatName ? `elements/${flatName}` : null;
      }
      // A conventional `lib/` tree is a library implementation boundary, not
      // a business feature namespace. Keep its static edges useful for code
      // review while leaving capability meaning to bounded product evidence.
      if (parts[i] === 'lib') {
        const flatName = ontologySourceName(next);
        return flatName ? `elements/${flatName}` : null;
      }
      // Generic fallback — sourceFolder 다음 첫 segment 가 module.
      return `capabilities/${next}`;
    }
  }
  return null;
}

function workspacePackageForFile(filePath, workspacePackages) {
  return [...workspacePackages]
    .filter((workspacePackage) =>
      filePath === workspacePackage.path || filePath.startsWith(`${workspacePackage.path}/`),
    )
    .sort((a, b) => b.path.length - a.path.length || a.path.localeCompare(b.path))[0] ?? null;
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

function sourceFolderStartsAt(segment, sourceFolders) {
  return sourceFolders.some(
    (folder) => folder.split(/[\\/]/).filter(Boolean)[0] === segment,
  );
}

function stripSourceExtension(segment) {
  for (const ext of SOURCE_EXT) {
    if (segment.endsWith(ext)) return segment.slice(0, -ext.length);
  }
  return segment;
}

function ontologySourceName(segment) {
  return stripSourceExtension(segment)
    .replace(/\.(?:test|spec)$/i, '')
    .replace(/[_\s.]+/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '')
    .toLowerCase();
}
